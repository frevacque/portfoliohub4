from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from passlib.context import CryptContext
from models import (
    UserCreate, UserLogin, User, UserResponse,
    PositionCreate, Position, PositionWithMetrics,
    TransactionCreate, Transaction,
    PortfolioSummary, CorrelationItem, Recommendation,
    PerformanceResponse, DividendCreate, Dividend,
    AlertCreate, Alert, GoalCreate, Goal,
    NoteCreate, Note, BudgetCreate, Budget
)
from utils.yahoo_finance import YahooFinanceService
from utils.portfolio_analytics import PortfolioAnalytics
from utils.performance_service import PerformanceService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Services
yf_service = YahooFinanceService()
analytics_service = PortfolioAnalytics()
performance_service = PerformanceService()

# Create the main app without a prefix
app = FastAPI(title="PortfolioHub API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

async def get_user_by_email(email: str) -> Optional[dict]:
    return await db.users.find_one({"email": email})

async def get_current_user(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# Routes

@api_router.get("/")
async def root():
    return {"message": "PortfolioHub API is running"}

# Authentication
@api_router.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hash_password(user_data.password)
    )
    
    await db.users.insert_one(user.dict())
    
    return UserResponse(id=user.id, name=user.name, email=user.email)

@api_router.post("/auth/login", response_model=UserResponse)
async def login(credentials: UserLogin):
    user = await get_user_by_email(credentials.email)
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return UserResponse(id=user['id'], name=user['name'], email=user['email'])

# Positions
@api_router.get("/positions")
async def get_positions(user_id: str):
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    # Enrich with current market data and metrics
    enriched_positions = []
    for pos in positions:
        current_price = yf_service.get_current_price(pos['symbol'])
        if current_price is None:
            current_price = pos['avg_price']
        
        total_value = pos['quantity'] * current_price
        invested = pos['quantity'] * pos['avg_price']
        gain_loss = total_value - invested
        gain_loss_percent = (gain_loss / invested * 100) if invested > 0 else 0
        
        # Calculate metrics
        beta = analytics_service.calculate_position_beta(pos['symbol'])
        volatility = analytics_service.calculate_position_volatility(pos['symbol'])
        
        # Create clean position dict without MongoDB _id
        clean_pos = {k: v for k, v in pos.items() if k != '_id'}
        # Convert datetime objects to ISO strings
        if 'created_at' in clean_pos:
            clean_pos['created_at'] = clean_pos['created_at'].isoformat()
        if 'updated_at' in clean_pos:
            clean_pos['updated_at'] = clean_pos['updated_at'].isoformat()
        
        enriched_positions.append({
            **clean_pos,
            'current_price': round(current_price, 2),
            'total_value': round(total_value, 2),
            'invested': round(invested, 2),
            'gain_loss': round(gain_loss, 2),
            'gain_loss_percent': round(gain_loss_percent, 2),
            'weight': 0,  # Will be calculated in portfolio summary
            'beta': beta,
            'volatility': volatility,
            'last_update': datetime.utcnow().isoformat()
        })
    
    # Calculate weights
    total_portfolio_value = sum(p['total_value'] for p in enriched_positions)
    if total_portfolio_value > 0:
        for pos in enriched_positions:
            pos['weight'] = round((pos['total_value'] / total_portfolio_value) * 100, 2)
    
    return enriched_positions

@api_router.post("/positions")
async def add_position(position_data: PositionCreate, user_id: str):
    # Get ticker info to validate and get name
    ticker_info = yf_service.get_ticker_info(position_data.symbol)
    if not ticker_info:
        raise HTTPException(status_code=404, detail=f"Symbol {position_data.symbol} not found")
    
    # Use provided purchase_date or default to now
    purchase_date = position_data.purchase_date if position_data.purchase_date else datetime.utcnow()
    
    # Create position
    position = Position(
        user_id=user_id,
        symbol=position_data.symbol.upper(),
        name=ticker_info['name'],
        type=position_data.type,
        quantity=position_data.quantity,
        avg_price=position_data.avg_price,
        purchase_date=purchase_date
    )
    
    await db.positions.insert_one(position.dict())
    
    # Create transaction with same date
    transaction = Transaction(
        user_id=user_id,
        symbol=position_data.symbol.upper(),
        type="buy",
        quantity=position_data.quantity,
        price=position_data.avg_price,
        total=position_data.quantity * position_data.avg_price,
        date=purchase_date
    )
    
    await db.transactions.insert_one(transaction.dict())
    
    return position

@api_router.delete("/positions/{position_id}")
async def delete_position(position_id: str, user_id: str):
    result = await db.positions.delete_one({"id": position_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"message": "Position deleted successfully"}

# Portfolio Summary
@api_router.get("/portfolio/summary")
async def get_portfolio_summary(user_id: str):
    # Get all positions
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    if not positions:
        return PortfolioSummary(
            total_value=0,
            total_invested=0,
            total_gain_loss=0,
            gain_loss_percent=0,
            daily_change=0,
            daily_change_percent=0,
            volatility={'daily': 0, 'monthly': 0, 'historical': 0},
            beta=1.0,
            sharpe_ratio=0
        )
    
    # Calculate portfolio metrics
    total_value = 0
    total_invested = 0
    enriched_positions = []
    
    for pos in positions:
        current_price = yf_service.get_current_price(pos['symbol'])
        if current_price is None:
            current_price = pos['avg_price']
        
        position_value = pos['quantity'] * current_price
        position_invested = pos['quantity'] * pos['avg_price']
        
        total_value += position_value
        total_invested += position_invested
        
        enriched_positions.append({
            'symbol': pos['symbol'],
            'total_value': position_value,
            'invested': position_invested,
            'quantity': pos['quantity']
        })
    
    total_gain_loss = total_value - total_invested
    gain_loss_percent = (total_gain_loss / total_invested * 100) if total_invested > 0 else 0
    
    # Calculate volatility
    volatility = analytics_service.calculate_portfolio_volatility(enriched_positions)
    
    # Calculate beta
    beta = analytics_service.calculate_portfolio_beta(enriched_positions)
    
    # Calculate Sharpe ratio
    sharpe_ratio = analytics_service.calculate_sharpe_ratio(enriched_positions)
    
    # Calculate daily change (simplified - using average of all positions)
    daily_change = 0
    daily_change_percent = 0
    
    return PortfolioSummary(
        total_value=round(total_value, 2),
        total_invested=round(total_invested, 2),
        total_gain_loss=round(total_gain_loss, 2),
        gain_loss_percent=round(gain_loss_percent, 2),
        daily_change=round(daily_change, 2),
        daily_change_percent=round(daily_change_percent, 2),
        volatility=volatility,
        beta=beta,
        sharpe_ratio=sharpe_ratio
    )

# Analytics
@api_router.get("/analytics/correlation")
async def get_correlation_matrix(user_id: str):
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    if len(positions) < 2:
        return []
    
    symbols = [pos['symbol'] for pos in positions]
    correlations = analytics_service.calculate_correlation_matrix(symbols)
    
    return correlations

@api_router.get("/analytics/recommendations")
async def get_recommendations(user_id: str):
    # Get positions
    positions_data = await get_positions(user_id)
    
    # Get portfolio summary
    summary_data = await get_portfolio_summary(user_id)
    
    # Generate recommendations
    recommendations = analytics_service.generate_recommendations(
        positions_data,
        summary_data.dict()
    )
    
    return recommendations

# Transactions
@api_router.get("/transactions")
async def get_transactions(user_id: str):
    transactions = await db.transactions.find({"user_id": user_id}).sort("date", -1).to_list(1000)
    
    # Clean transactions to remove MongoDB _id and convert datetime
    clean_transactions = []
    for txn in transactions:
        clean_txn = {k: v for k, v in txn.items() if k != '_id'}
        # Convert datetime objects to ISO strings
        if 'date' in clean_txn:
            clean_txn['date'] = clean_txn['date'].isoformat()
        clean_transactions.append(clean_txn)
    
    return clean_transactions

# Market data
@api_router.get("/market/quote/{symbol}")
async def get_market_quote(symbol: str):
    quote = yf_service.get_ticker_info(symbol)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
    return quote

@api_router.get("/market/search")
async def search_market(q: str):
    results = yf_service.search_ticker(q)
    return results

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()