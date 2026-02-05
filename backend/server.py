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
from models_portfolio import PortfolioCreate, Portfolio
from utils.yahoo_finance import YahooFinanceService
from utils.portfolio_analytics import PortfolioAnalytics
from utils.performance_service import PerformanceService
from utils.sector_analysis import SectorAnalysisService
from utils.alert_manager import AlertManager

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
sector_service = SectorAnalysisService()
alert_manager = AlertManager()

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
async def get_positions(user_id: str, portfolio_id: Optional[str] = None):
    # Build query based on portfolio_id
    query = {"user_id": user_id}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    
    positions = await db.positions.find(query).to_list(1000)
    
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
    
    # Get portfolio_id - use provided one or get the default portfolio
    portfolio_id = position_data.portfolio_id
    if not portfolio_id:
        # Find or create default portfolio
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if not default_portfolio:
            # Get first portfolio or create one
            first_portfolio = await db.portfolios.find_one({"user_id": user_id})
            if first_portfolio:
                portfolio_id = first_portfolio['id']
            else:
                # Create default portfolio
                new_portfolio = Portfolio(
                    user_id=user_id,
                    name="Portefeuille Principal",
                    description="Mon portefeuille par défaut",
                    is_default=True
                )
                await db.portfolios.insert_one(new_portfolio.dict())
                portfolio_id = new_portfolio.id
        else:
            portfolio_id = default_portfolio['id']
    
    # Create position
    position = Position(
        user_id=user_id,
        portfolio_id=portfolio_id,
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

# Performance endpoints
@api_router.get("/analytics/performance")
async def get_performance(user_id: str, period: str = 'all', symbol: Optional[str] = None):
    """
    Get performance data for portfolio or specific position
    period: 'all', 'ytd', '1m', '3m', '6m', '1y'
    """
    if symbol:
        # Get position data
        position = await db.positions.find_one({"user_id": user_id, "symbol": symbol})
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")
        
        perf_data = performance_service.calculate_position_performance(
            symbol=position['symbol'],
            quantity=position['quantity'],
            purchase_price=position['avg_price'],
            purchase_date=position.get('purchase_date', datetime.utcnow()),
            period=period
        )
        
        return {
            'symbol': symbol,
            'period': period,
            **perf_data
        }
    else:
        # Get portfolio performance
        positions = await db.positions.find({"user_id": user_id}).to_list(1000)
        
        if not positions:
            return {
                'symbol': None,
                'period': period,
                'data': [],
                'total_return': 0,
                'total_return_percent': 0
            }
        
        # Enrich positions with current prices
        enriched_positions = []
        for pos in positions:
            current_price = yf_service.get_current_price(pos['symbol'])
            if current_price:
                enriched_positions.append({
                    'symbol': pos['symbol'],
                    'quantity': pos['quantity'],
                    'avg_price': pos['avg_price'],
                    'purchase_date': pos.get('purchase_date', datetime.utcnow())
                })
        
        perf_data = performance_service.calculate_portfolio_performance(
            enriched_positions,
            period=period
        )
        
        return {
            'symbol': None,
            'period': period,
            **perf_data
        }

@api_router.get("/analytics/compare-index")
async def compare_with_index(user_id: str, period: str = 'ytd', index: str = '^GSPC'):
    """Compare portfolio performance with market index"""
    # Get portfolio performance
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    if not positions:
        return {'data': []}
    
    enriched_positions = []
    for pos in positions:
        enriched_positions.append({
            'symbol': pos['symbol'],
            'quantity': pos['quantity'],
            'avg_price': pos['avg_price'],
            'purchase_date': pos.get('purchase_date', datetime.utcnow())
        })
    
    perf_data = performance_service.calculate_portfolio_performance(enriched_positions, period=period)
    comparison = performance_service.compare_with_index(perf_data['data'], index)
    
    return comparison

# Sector analysis
@api_router.get("/analytics/sector-distribution")
async def get_sector_distribution(user_id: str):
    """Get sector distribution of portfolio"""
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    if not positions:
        return []
    
    # Enrich with current prices
    enriched_positions = []
    for pos in positions:
        current_price = yf_service.get_current_price(pos['symbol'])
        if current_price:
            total_value = pos['quantity'] * current_price
            enriched_positions.append({
                'symbol': pos['symbol'],
                'type': pos['type'],
                'total_value': total_value
            })
    
    distribution = sector_service.calculate_sector_distribution(enriched_positions)
    return distribution

# Dividends endpoints
@api_router.get("/dividends")
async def get_dividends(user_id: str):
    dividends = await db.dividends.find({"user_id": user_id}).sort("date", -1).to_list(1000)
    return dividends

@api_router.post("/dividends")
async def add_dividend(dividend_data: DividendCreate, user_id: str):
    # Get position
    position = await db.positions.find_one({"id": dividend_data.position_id, "user_id": user_id})
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    dividend = Dividend(
        user_id=user_id,
        position_id=dividend_data.position_id,
        symbol=position['symbol'],
        amount=dividend_data.amount,
        date=dividend_data.date,
        notes=dividend_data.notes
    )
    
    await db.dividends.insert_one(dividend.dict())
    return dividend

@api_router.delete("/dividends/{dividend_id}")
async def delete_dividend(dividend_id: str, user_id: str):
    result = await db.dividends.delete_one({"id": dividend_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dividend not found")
    return {"message": "Dividend deleted successfully"}

# Alerts endpoints
@api_router.get("/alerts")
async def get_alerts(user_id: str):
    alerts = await db.alerts.find({"user_id": user_id}).to_list(1000)
    return alerts

@api_router.post("/alerts")
async def create_alert(alert_data: AlertCreate, user_id: str):
    alert = Alert(
        user_id=user_id,
        symbol=alert_data.symbol.upper(),
        alert_type=alert_data.alert_type,
        target_value=alert_data.target_value,
        notes=alert_data.notes
    )
    
    await db.alerts.insert_one(alert.dict())
    return alert

@api_router.put("/alerts/{alert_id}")
async def update_alert(alert_id: str, user_id: str, is_active: bool):
    result = await db.alerts.update_one(
        {"id": alert_id, "user_id": user_id},
        {"$set": {"is_active": is_active}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert updated successfully"}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, user_id: str):
    result = await db.alerts.delete_one({"id": alert_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert deleted successfully"}

# Goals endpoints
@api_router.get("/goals")
async def get_goals(user_id: str):
    goals = await db.goals.find({"user_id": user_id}).to_list(1000)
    return goals

@api_router.post("/goals")
async def create_goal(goal_data: GoalCreate, user_id: str):
    goal = Goal(
        user_id=user_id,
        title=goal_data.title,
        target_amount=goal_data.target_amount,
        target_date=goal_data.target_date,
        description=goal_data.description
    )
    
    await db.goals.insert_one(goal.dict())
    return goal

@api_router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, user_id: str, is_completed: bool):
    result = await db.goals.update_one(
        {"id": goal_id, "user_id": user_id},
        {"$set": {"is_completed": is_completed}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal updated successfully"}

@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user_id: str):
    result = await db.goals.delete_one({"id": goal_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal deleted successfully"}

# Notes endpoints
@api_router.get("/notes/{position_id}")
async def get_notes(position_id: str, user_id: str):
    notes = await db.notes.find({"position_id": position_id, "user_id": user_id}).to_list(1000)
    return notes

@api_router.post("/notes")
async def create_note(note_data: NoteCreate, user_id: str):
    note = Note(
        user_id=user_id,
        position_id=note_data.position_id,
        content=note_data.content
    )
    
    await db.notes.insert_one(note.dict())
    return note

@api_router.put("/notes/{note_id}")
async def update_note(note_id: str, user_id: str, content: str):
    result = await db.notes.update_one(
        {"id": note_id, "user_id": user_id},
        {"$set": {"content": content, "updated_at": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note updated successfully"}

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user_id: str):
    result = await db.notes.delete_one({"id": note_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

# Budget endpoints
@api_router.get("/budget")
async def get_budget(user_id: str):
    budget = await db.budgets.find_one({"user_id": user_id})
    return budget

@api_router.post("/budget")
async def create_or_update_budget(budget_data: BudgetCreate, user_id: str):
    # Check if budget exists
    existing = await db.budgets.find_one({"user_id": user_id})
    
    if existing:
        # Update existing
        await db.budgets.update_one(
            {"user_id": user_id},
            {"$set": budget_data.dict()}
        )
        return await db.budgets.find_one({"user_id": user_id})
    else:
        # Create new
        budget = Budget(
            user_id=user_id,
            monthly_amount=budget_data.monthly_amount,
            start_date=budget_data.start_date
        )
        await db.budgets.insert_one(budget.dict())
        return budget

# CSV Import endpoint
@api_router.post("/import/csv")
async def import_csv(user_id: str, positions: List[dict]):
    """Import positions from CSV data"""
    imported_count = 0
    errors = []
    
    # Get or create default portfolio
    default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
    if not default_portfolio:
        first_portfolio = await db.portfolios.find_one({"user_id": user_id})
        if first_portfolio:
            portfolio_id = first_portfolio['id']
        else:
            new_portfolio = Portfolio(
                user_id=user_id,
                name="Portefeuille Principal",
                description="Mon portefeuille par défaut",
                is_default=True
            )
            await db.portfolios.insert_one(new_portfolio.dict())
            portfolio_id = new_portfolio.id
    else:
        portfolio_id = default_portfolio['id']
    
    for pos_data in positions:
        try:
            symbol = pos_data.get('symbol', '').upper()
            if not symbol:
                continue
            
            # Try to get ticker info (validate symbol)
            ticker_info = yf_service.get_ticker_info(symbol)
            name = ticker_info['name'] if ticker_info else symbol
            
            # Create position
            position = Position(
                user_id=user_id,
                portfolio_id=portfolio_id,
                symbol=symbol,
                name=name,
                type=pos_data.get('type', 'stock'),
                quantity=float(pos_data.get('quantity', 0)),
                avg_price=float(pos_data.get('avg_price', 0)),
                purchase_date=datetime.fromisoformat(pos_data.get('purchase_date', datetime.utcnow().isoformat()))
            )
            
            await db.positions.insert_one(position.dict())
            imported_count += 1
            
        except Exception as e:
            errors.append(f"Erreur pour {pos_data.get('symbol', 'inconnu')}: {str(e)}")
    
    return {
        "imported": imported_count,
        "errors": errors,
        "message": f"{imported_count} positions importées avec succès"
    }

# Portfolio Management endpoints (Multi-portfolio)
@api_router.get("/portfolios")
async def get_portfolios(user_id: str):
    """Get all portfolios for a user"""
    portfolios = await db.portfolios.find({"user_id": user_id}).to_list(100)
    
    # If no portfolios exist, create a default one
    if not portfolios:
        default_portfolio = Portfolio(
            user_id=user_id,
            name="Portefeuille Principal",
            description="Mon portefeuille par défaut",
            is_default=True
        )
        await db.portfolios.insert_one(default_portfolio.dict())
        portfolios = [default_portfolio.dict()]
    
    # Clean MongoDB _id
    clean_portfolios = []
    for p in portfolios:
        clean_p = {k: v for k, v in p.items() if k != '_id'}
        if 'created_at' in clean_p and hasattr(clean_p['created_at'], 'isoformat'):
            clean_p['created_at'] = clean_p['created_at'].isoformat()
        clean_portfolios.append(clean_p)
    
    return clean_portfolios

@api_router.post("/portfolios")
async def create_portfolio(portfolio_data: PortfolioCreate, user_id: str):
    """Create a new portfolio"""
    portfolio = Portfolio(
        user_id=user_id,
        name=portfolio_data.name,
        description=portfolio_data.description,
        is_default=False
    )
    
    await db.portfolios.insert_one(portfolio.dict())
    
    return {
        "id": portfolio.id,
        "user_id": portfolio.user_id,
        "name": portfolio.name,
        "description": portfolio.description,
        "created_at": portfolio.created_at.isoformat(),
        "is_default": portfolio.is_default
    }

@api_router.put("/portfolios/{portfolio_id}")
async def update_portfolio(portfolio_id: str, portfolio_data: PortfolioCreate, user_id: str):
    """Update an existing portfolio"""
    result = await db.portfolios.update_one(
        {"id": portfolio_id, "user_id": user_id},
        {"$set": {"name": portfolio_data.name, "description": portfolio_data.description}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Portefeuille non trouvé")
    return {"message": "Portefeuille mis à jour avec succès"}

@api_router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: str, user_id: str):
    """Delete a portfolio and all its positions"""
    # Check if it's the only portfolio
    portfolios = await db.portfolios.find({"user_id": user_id}).to_list(100)
    if len(portfolios) <= 1:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le dernier portefeuille")
    
    # Check if this is the default portfolio
    portfolio = await db.portfolios.find_one({"id": portfolio_id, "user_id": user_id})
    if portfolio and portfolio.get("is_default"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer le portefeuille par défaut")
    
    # Delete all positions in this portfolio
    await db.positions.delete_many({"portfolio_id": portfolio_id, "user_id": user_id})
    
    # Delete all transactions in this portfolio
    await db.transactions.delete_many({"portfolio_id": portfolio_id, "user_id": user_id})
    
    # Delete the portfolio
    result = await db.portfolios.delete_one({"id": portfolio_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Portefeuille non trouvé")
    
    return {"message": "Portefeuille supprimé avec succès"}

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