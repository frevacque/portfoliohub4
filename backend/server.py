from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
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
    NoteCreate, Note, BudgetCreate, Budget,
    CashTransactionCreate, CashTransaction, CashBalance,
    UserSettingsUpdate, UserSettings
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
    
    # Only get current positions (quantity > 0)
    query["quantity"] = {"$gt": 0}
    
    positions = await db.positions.find(query).to_list(1000)
    
    # Get user's benchmark setting
    user_settings = await db.user_settings.find_one({"user_id": user_id})
    benchmark_index = user_settings.get('benchmark_index', '^GSPC') if user_settings else '^GSPC'
    
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
        
        # Calculate metrics using user's benchmark
        beta = analytics_service.calculate_position_beta(pos['symbol'], market_index=benchmark_index)
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
        raise HTTPException(status_code=404, detail=f"Symbole {position_data.symbol} non trouvé")
    
    # Use provided purchase_date or default to now
    transaction_date = position_data.purchase_date if position_data.purchase_date else datetime.utcnow()
    
    # Get portfolio_id - use provided one or get the default portfolio
    portfolio_id = position_data.portfolio_id
    if not portfolio_id:
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
    
    symbol_upper = position_data.symbol.upper()
    quantity = position_data.quantity
    price = position_data.avg_price
    transaction_type = position_data.transaction_type or "buy"
    link_to_cash = position_data.link_to_cash
    cash_currency = position_data.cash_currency or "EUR"
    transaction_total = quantity * price
    
    # Check if position already exists for this symbol in this portfolio
    existing_position = await db.positions.find_one({
        "user_id": user_id,
        "portfolio_id": portfolio_id,
        "symbol": symbol_upper
    })
    
    if transaction_type == "sell":
        # SELL TRANSACTION
        if not existing_position:
            raise HTTPException(status_code=400, detail=f"Vous ne détenez pas de position sur {symbol_upper}")
        
        old_quantity = existing_position['quantity']
        
        if quantity > old_quantity:
            raise HTTPException(status_code=400, detail=f"Quantité insuffisante. Vous détenez {old_quantity} unités de {symbol_upper}")
        
        new_quantity = old_quantity - quantity
        sale_total = quantity * price
        
        # Create sell transaction with portfolio_id
        transaction = Transaction(
            user_id=user_id,
            symbol=symbol_upper,
            type="sell",
            quantity=quantity,
            price=price,
            total=sale_total,
            date=transaction_date
        )
        transaction_dict = transaction.dict()
        transaction_dict['portfolio_id'] = portfolio_id
        await db.transactions.insert_one(transaction_dict)
        
        new_balance = 0
        # Update cash balance only if linked (selling adds money)
        if link_to_cash:
            account = await db.cash_accounts.find_one({"user_id": user_id, "portfolio_id": portfolio_id, "currency": cash_currency})
            current_balance = account['balance'] if account else 0.0
            new_balance = current_balance + sale_total
            
            if account:
                await db.cash_accounts.update_one(
                    {"user_id": user_id, "portfolio_id": portfolio_id, "currency": cash_currency},
                    {"$set": {"balance": new_balance, "updated_at": datetime.utcnow()}}
                )
            else:
                await db.cash_accounts.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "portfolio_id": portfolio_id,
                    "currency": cash_currency,
                    "balance": new_balance,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
            
            # Create automatic cash transaction for the sale
            cash_transaction = CashTransaction(
                user_id=user_id,
                type="deposit",
                amount=sale_total,
                description=f"Vente {quantity} x {symbol_upper} à {price}€",
                date=transaction_date
            )
            cash_tx_dict = cash_transaction.dict()
            cash_tx_dict['currency'] = cash_currency
            cash_tx_dict['portfolio_id'] = portfolio_id
            await db.cash_transactions.insert_one(cash_tx_dict)
        
        cash_msg = f" +{round(sale_total, 2)} {cash_currency} ajoutés au solde cash." if link_to_cash else ""
        
        if new_quantity <= 0:
            # Position completely sold - delete it
            await db.positions.delete_one({"id": existing_position['id']})
            return {
                "id": existing_position['id'],
                "symbol": symbol_upper,
                "quantity": 0,
                "sale_total": round(sale_total, 2),
                "new_cash_balance": round(new_balance, 2) if link_to_cash else None,
                "currency": cash_currency if link_to_cash else None,
                "message": f"Position {symbol_upper} entièrement vendue ({quantity} unités à {price}€).{cash_msg}"
            }
        else:
            # Partial sell - update quantity (PRU stays the same)
            await db.positions.update_one(
                {"id": existing_position['id']},
                {
                    "$set": {
                        "quantity": new_quantity,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return {
                "id": existing_position['id'],
                "symbol": symbol_upper,
                "quantity": new_quantity,
                "avg_price": existing_position['avg_price'],
                "sale_total": round(sale_total, 2),
                "new_cash_balance": round(new_balance, 2) if link_to_cash else None,
                "currency": cash_currency if link_to_cash else None,
                "message": f"Vente partielle: {quantity} unités vendues à {price}€. Reste {new_quantity} unités.{cash_msg}"
            }
    else:
        # BUY TRANSACTION
        buy_total = quantity * price
        
        # Update cash balance if linked (buying subtracts money)
        new_balance = None
        cash_msg = ""
        if link_to_cash:
            account = await db.cash_accounts.find_one({"user_id": user_id, "portfolio_id": portfolio_id, "currency": cash_currency})
            current_balance = account['balance'] if account else 0.0
            new_balance = current_balance - buy_total
            
            if account:
                await db.cash_accounts.update_one(
                    {"user_id": user_id, "portfolio_id": portfolio_id, "currency": cash_currency},
                    {"$set": {"balance": new_balance, "updated_at": datetime.utcnow()}}
                )
            else:
                await db.cash_accounts.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "portfolio_id": portfolio_id,
                    "currency": cash_currency,
                    "balance": new_balance,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
            
            # Create automatic cash transaction for the purchase
            cash_transaction = CashTransaction(
                user_id=user_id,
                type="withdrawal",
                amount=buy_total,
                description=f"Achat {quantity} x {symbol_upper} à {price}€",
                date=transaction_date
            )
            cash_tx_dict = cash_transaction.dict()
            cash_tx_dict['currency'] = cash_currency
            cash_tx_dict['portfolio_id'] = portfolio_id
            await db.cash_transactions.insert_one(cash_tx_dict)
            cash_msg = f" -{round(buy_total, 2)} {cash_currency} déduits du solde cash."
        
        if existing_position:
            # Merge with existing position
            old_quantity = existing_position['quantity']
            old_price = existing_position['avg_price']
            
            total_quantity = old_quantity + quantity
            weighted_avg_price = ((old_quantity * old_price) + (quantity * price)) / total_quantity
            
            await db.positions.update_one(
                {"id": existing_position['id']},
                {
                    "$set": {
                        "quantity": total_quantity,
                        "avg_price": round(weighted_avg_price, 4),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Create buy transaction with portfolio_id
            transaction = Transaction(
                user_id=user_id,
                symbol=symbol_upper,
                type="buy",
                quantity=quantity,
                price=price,
                total=buy_total,
                date=transaction_date
            )
            transaction_dict = transaction.dict()
            transaction_dict['portfolio_id'] = portfolio_id
            await db.transactions.insert_one(transaction_dict)
            
            return {
                "id": existing_position['id'],
                "symbol": symbol_upper,
                "quantity": total_quantity,
                "avg_price": round(weighted_avg_price, 4),
                "new_cash_balance": round(new_balance, 2) if link_to_cash else None,
                "currency": cash_currency if link_to_cash else None,
                "message": f"Achat fusionné: {old_quantity} + {quantity} = {total_quantity} unités au PRU de {round(weighted_avg_price, 2)}€.{cash_msg}"
            }
        else:
            # Create new position
            position = Position(
                user_id=user_id,
                portfolio_id=portfolio_id,
                symbol=symbol_upper,
                name=ticker_info['name'],
                type=position_data.type,
                quantity=quantity,
                avg_price=price,
                purchase_date=transaction_date
            )
            
            await db.positions.insert_one(position.dict())
            
            # Create buy transaction with portfolio_id
            transaction = Transaction(
                user_id=user_id,
                symbol=symbol_upper,
                type="buy",
                quantity=quantity,
                price=price,
                total=buy_total,
                date=transaction_date
            )
            transaction_dict = transaction.dict()
            transaction_dict['portfolio_id'] = portfolio_id
            await db.transactions.insert_one(transaction_dict)
            
            return {
                "id": position.id,
                "symbol": symbol_upper,
                "quantity": quantity,
                "avg_price": price,
                "name": ticker_info['name'],
                "new_cash_balance": round(new_balance, 2) if link_to_cash else None,
                "currency": cash_currency if link_to_cash else None,
                "message": f"Nouvelle position créée: {quantity} unités de {symbol_upper} à {price}€.{cash_msg}"
            }

@api_router.delete("/positions/{position_id}")
async def delete_position(position_id: str, user_id: str):
    result = await db.positions.delete_one({"id": position_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"message": "Position deleted successfully"}

# Merge duplicate positions utility endpoint
@api_router.post("/positions/merge-duplicates")
async def merge_duplicate_positions(user_id: str):
    """Merge all duplicate positions (same symbol) into single positions with weighted average price"""
    positions = await db.positions.find({"user_id": user_id}).to_list(1000)
    
    if not positions:
        return {"message": "Aucune position trouvée", "merged": 0}
    
    # Group positions by (portfolio_id, symbol)
    position_groups = {}
    for pos in positions:
        key = (pos.get('portfolio_id', 'default'), pos['symbol'])
        if key not in position_groups:
            position_groups[key] = []
        position_groups[key].append(pos)
    
    merged_count = 0
    
    for key, group in position_groups.items():
        if len(group) > 1:
            # Multiple positions for same symbol - merge them
            total_quantity = sum(p['quantity'] for p in group)
            weighted_avg = sum(p['quantity'] * p['avg_price'] for p in group) / total_quantity
            
            # Keep the first position and update it
            main_position = group[0]
            await db.positions.update_one(
                {"id": main_position['id']},
                {
                    "$set": {
                        "quantity": total_quantity,
                        "avg_price": round(weighted_avg, 4),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Delete the other duplicate positions
            for pos in group[1:]:
                await db.positions.delete_one({"id": pos['id']})
                merged_count += 1
    
    return {
        "message": f"{merged_count} positions en doublon fusionnées",
        "merged": merged_count
    }

# Portfolio Summary
@api_router.get("/portfolio/summary")
async def get_portfolio_summary(user_id: str, portfolio_id: Optional[str] = None):
    # Build query based on portfolio_id
    query = {"user_id": user_id}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    
    # Only get current positions (quantity > 0)
    query["quantity"] = {"$gt": 0}
    
    # Get positions
    positions = await db.positions.find(query).to_list(1000)
    
    # Get user settings for RFR and benchmark
    user_settings = await db.user_settings.find_one({"user_id": user_id})
    risk_free_rate = user_settings.get('risk_free_rate', 3.0) if user_settings else 3.0
    benchmark_index = user_settings.get('benchmark_index', '^GSPC') if user_settings else '^GSPC'
    
    if not positions:
        # Still need to check for cash even if no positions
        cash_query = {"user_id": user_id}
        if portfolio_id:
            cash_query["portfolio_id"] = portfolio_id
        cash_accounts = await db.cash_accounts.find(cash_query).to_list(100)
        
        # Convert all cash to EUR
        total_cash_eur = 0.0
        cash_details = []
        for acc in cash_accounts:
            currency = acc.get('currency', 'EUR')
            balance = acc.get('balance', 0)
            if balance != 0:
                balance_in_eur = yf_service.convert_to_eur(balance, currency)
                total_cash_eur += balance_in_eur
                cash_details.append({
                    'currency': currency,
                    'balance': balance,
                    'balance_eur': round(balance_in_eur, 2)
                })
        
        # Get capital contributions
        capital_query = {"user_id": user_id}
        if portfolio_id:
            capital_query["portfolio_id"] = portfolio_id
        contributions = await db.capital_contributions.find(capital_query).to_list(1000)
        total_deposits = sum(c['amount'] for c in contributions if c['type'] == 'deposit')
        total_withdrawals = sum(c['amount'] for c in contributions if c['type'] == 'withdrawal')
        net_capital = total_deposits - total_withdrawals
        
        capital_gain_loss = total_cash_eur - net_capital if net_capital > 0 else 0
        capital_performance_percent = (capital_gain_loss / net_capital * 100) if net_capital > 0 else 0
        
        return {
            "total_value": round(total_cash_eur, 2),
            "positions_value": 0,
            "cash_value": round(total_cash_eur, 2),
            "cash_details": cash_details,
            "total_invested": 0,
            "total_gain_loss": 0,
            "gain_loss_percent": 0,
            "daily_change": 0,
            "daily_change_percent": 0,
            "volatility": {'historical': 0, 'realized': 0},
            "beta": 1.0,
            "sharpe_ratio": 0,
            "risk_free_rate": risk_free_rate,
            "benchmark_index": benchmark_index,
            "holding_period_days": 0,
            "first_purchase_date": None,
            "net_capital": round(net_capital, 2),
            "capital_gain_loss": round(capital_gain_loss, 2),
            "capital_performance_percent": round(capital_performance_percent, 2),
            "portfolio_id": portfolio_id
        }
    
    # Calculate portfolio metrics
    total_value = 0
    total_invested = 0
    enriched_positions = []
    earliest_purchase_date = None
    
    for pos in positions:
        current_price = yf_service.get_current_price(pos['symbol'])
        if current_price is None:
            current_price = pos['avg_price']
        
        position_value = pos['quantity'] * current_price
        position_invested = pos['quantity'] * pos['avg_price']
        
        total_value += position_value
        total_invested += position_invested
        
        # Track earliest purchase date
        purchase_date = pos.get('purchase_date')
        if purchase_date:
            if earliest_purchase_date is None or purchase_date < earliest_purchase_date:
                earliest_purchase_date = purchase_date
        
        enriched_positions.append({
            'symbol': pos['symbol'],
            'total_value': position_value,
            'invested': position_invested,
            'quantity': pos['quantity'],
            'purchase_date': pos.get('purchase_date')
        })
    
    total_gain_loss = total_value - total_invested
    gain_loss_percent = (total_gain_loss / total_invested * 100) if total_invested > 0 else 0
    
    # Calculate volatility (historical and realized)
    volatility = analytics_service.calculate_portfolio_volatility(enriched_positions)
    realized_volatility = analytics_service.calculate_realized_volatility(enriched_positions)
    volatility['realized'] = realized_volatility
    
    # Calculate beta using user's benchmark
    beta = analytics_service.calculate_portfolio_beta(enriched_positions, market_index=benchmark_index)
    
    # Calculate Sharpe ratio with user's RFR
    sharpe_ratio = analytics_service.calculate_sharpe_ratio_custom(enriched_positions, risk_free_rate)
    
    # Calculate daily change
    daily_change = 0
    daily_change_percent = 0
    for pos in positions:
        change = yf_service.get_daily_change(pos['symbol'])
        if change:
            position_value = pos['quantity'] * (change.get('current_price', pos['avg_price']))
            weight = position_value / total_value if total_value > 0 else 0
            daily_change += pos['quantity'] * change.get('price_change', 0)
            daily_change_percent += weight * change.get('change_percent', 0)
    
    # Calculate holding period
    holding_period_days = 0
    if earliest_purchase_date:
        if hasattr(earliest_purchase_date, 'replace'):
            earliest_purchase_date = earliest_purchase_date.replace(tzinfo=None)
        holding_period_days = (datetime.utcnow() - earliest_purchase_date).days
    
    # Get capital contributions for this specific portfolio
    capital_query = {"user_id": user_id}
    if portfolio_id:
        capital_query["portfolio_id"] = portfolio_id
    
    contributions = await db.capital_contributions.find(capital_query).to_list(1000)
    total_deposits = sum(c['amount'] for c in contributions if c['type'] == 'deposit')
    total_withdrawals = sum(c['amount'] for c in contributions if c['type'] == 'withdrawal')
    net_capital = total_deposits - total_withdrawals
    
    # Get cash accounts for this portfolio and convert all to EUR
    cash_query = {"user_id": user_id}
    if portfolio_id:
        cash_query["portfolio_id"] = portfolio_id
    
    cash_accounts = await db.cash_accounts.find(cash_query).to_list(100)
    
    # Convert all cash to EUR for accurate total
    total_cash_eur = 0.0
    cash_details = []
    for acc in cash_accounts:
        currency = acc.get('currency', 'EUR')
        balance = acc.get('balance', 0)
        if balance != 0:
            balance_in_eur = yf_service.convert_to_eur(balance, currency)
            total_cash_eur += balance_in_eur
            cash_details.append({
                'currency': currency,
                'balance': balance,
                'balance_eur': round(balance_in_eur, 2)
            })
    
    # Total value includes positions + cash (all in EUR)
    total_value_with_cash = total_value + total_cash_eur
    
    # Calculate performance based on capital contributions (using total value with cash)
    capital_gain_loss = total_value_with_cash - net_capital if net_capital > 0 else 0
    capital_performance_percent = (capital_gain_loss / net_capital * 100) if net_capital > 0 else 0
    
    return {
        "total_value": round(total_value_with_cash, 2),
        "positions_value": round(total_value, 2),
        "cash_value": round(total_cash_eur, 2),
        "cash_details": cash_details,
        "total_invested": round(total_invested, 2),
        "total_gain_loss": round(total_gain_loss, 2),
        "gain_loss_percent": round(gain_loss_percent, 2),
        "daily_change": round(daily_change, 2),
        "daily_change_percent": round(daily_change_percent, 2),
        "volatility": volatility,
        "beta": beta,
        "sharpe_ratio": sharpe_ratio,
        "risk_free_rate": risk_free_rate,
        "benchmark_index": benchmark_index,
        "holding_period_days": holding_period_days,
        "first_purchase_date": earliest_purchase_date.isoformat() if earliest_purchase_date else None,
        "net_capital": round(net_capital, 2),
        "capital_gain_loss": round(capital_gain_loss, 2),
        "capital_performance_percent": round(capital_performance_percent, 2),
        "portfolio_id": portfolio_id
    }

# Analytics
@api_router.get("/analytics/correlation")
async def get_correlation_matrix(user_id: str):
    # Only get positions with quantity > 0 (current positions, not sold ones)
    positions = await db.positions.find({
        "user_id": user_id,
        "quantity": {"$gt": 0}
    }).to_list(1000)
    
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
    
    # Generate recommendations (summary_data is already a dict)
    recommendations = analytics_service.generate_recommendations(
        positions_data,
        summary_data
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
        # Get portfolio performance - only current positions
        positions = await db.positions.find({
            "user_id": user_id,
            "quantity": {"$gt": 0}
        }).to_list(1000)
        
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
    # Get portfolio performance - only current positions
    positions = await db.positions.find({
        "user_id": user_id,
        "quantity": {"$gt": 0}
    }).to_list(1000)
    
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
    # Only current positions
    positions = await db.positions.find({
        "user_id": user_id,
        "quantity": {"$gt": 0}
    }).to_list(1000)
    
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
    alerts = await db.alerts.find({"user_id": user_id}).sort("created_at", -1).to_list(1000)
    
    # Clean MongoDB _id and convert dates
    clean_alerts = []
    for alert in alerts:
        clean_alert = {k: v for k, v in alert.items() if k != '_id'}
        if 'created_at' in clean_alert and hasattr(clean_alert['created_at'], 'isoformat'):
            clean_alert['created_at'] = clean_alert['created_at'].isoformat()
        if 'triggered_at' in clean_alert and clean_alert['triggered_at'] and hasattr(clean_alert['triggered_at'], 'isoformat'):
            clean_alert['triggered_at'] = clean_alert['triggered_at'].isoformat()
        clean_alerts.append(clean_alert)
    
    return clean_alerts

@api_router.get("/alerts/triggered")
async def get_triggered_alerts(user_id: str):
    """Get alerts that have been triggered but not yet acknowledged"""
    alerts = await db.alerts.find({
        "user_id": user_id,
        "is_triggered": True,
        "is_acknowledged": False
    }).to_list(1000)
    
    clean_alerts = []
    for alert in alerts:
        clean_alert = {k: v for k, v in alert.items() if k != '_id'}
        if 'created_at' in clean_alert and hasattr(clean_alert['created_at'], 'isoformat'):
            clean_alert['created_at'] = clean_alert['created_at'].isoformat()
        if 'triggered_at' in clean_alert and clean_alert['triggered_at'] and hasattr(clean_alert['triggered_at'], 'isoformat'):
            clean_alert['triggered_at'] = clean_alert['triggered_at'].isoformat()
        clean_alerts.append(clean_alert)
    
    return clean_alerts

@api_router.get("/alerts/check")
async def check_alerts(user_id: str):
    """Check all active alerts and trigger them if conditions are met"""
    alerts = await db.alerts.find({
        "user_id": user_id,
        "is_active": True,
        "is_triggered": False
    }).to_list(1000)
    
    triggered_alerts = []
    
    for alert in alerts:
        symbol = alert['symbol']
        current_price = yf_service.get_current_price(symbol)
        
        if current_price is None:
            continue
        
        should_trigger = False
        
        if alert['alert_type'] == 'price_above' and current_price >= alert['target_value']:
            should_trigger = True
        elif alert['alert_type'] == 'price_below' and current_price <= alert['target_value']:
            should_trigger = True
        
        if should_trigger:
            # Update alert as triggered
            await db.alerts.update_one(
                {"id": alert['id']},
                {
                    "$set": {
                        "is_triggered": True,
                        "triggered_at": datetime.utcnow(),
                        "triggered_price": current_price
                    }
                }
            )
            triggered_alerts.append({
                "id": alert['id'],
                "symbol": symbol,
                "alert_type": alert['alert_type'],
                "target_value": alert['target_value'],
                "current_price": current_price,
                "notes": alert.get('notes')
            })
    
    return {
        "checked": len(alerts),
        "triggered": len(triggered_alerts),
        "alerts": triggered_alerts
    }

@api_router.post("/alerts")
async def create_alert(alert_data: AlertCreate, user_id: str):
    # Validate symbol
    ticker_info = yf_service.get_ticker_info(alert_data.symbol)
    if not ticker_info:
        raise HTTPException(status_code=404, detail=f"Symbole {alert_data.symbol} non trouvé")
    
    current_price = yf_service.get_current_price(alert_data.symbol)
    
    alert = Alert(
        user_id=user_id,
        symbol=alert_data.symbol.upper(),
        alert_type=alert_data.alert_type,
        target_value=alert_data.target_value,
        notes=alert_data.notes
    )
    
    await db.alerts.insert_one(alert.dict())
    
    return {
        **alert.dict(),
        "current_price": current_price,
        "symbol_name": ticker_info['name']
    }

@api_router.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user_id: str):
    """Mark an alert as acknowledged (dismiss the notification)"""
    result = await db.alerts.update_one(
        {"id": alert_id, "user_id": user_id},
        {"$set": {"is_acknowledged": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    return {"message": "Alerte acquittée"}

@api_router.put("/alerts/{alert_id}/reactivate")
async def reactivate_alert(alert_id: str, user_id: str):
    """Reactivate an alert (reset triggered state)"""
    result = await db.alerts.update_one(
        {"id": alert_id, "user_id": user_id},
        {
            "$set": {
                "is_triggered": False,
                "is_acknowledged": False,
                "triggered_at": None,
                "triggered_price": None
            }
        }
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    return {"message": "Alerte réactivée"}

@api_router.put("/alerts/{alert_id}")
async def update_alert(alert_id: str, user_id: str, is_active: bool):
    result = await db.alerts.update_one(
        {"id": alert_id, "user_id": user_id},
        {"$set": {"is_active": is_active}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    return {"message": "Alerte mise à jour"}

@api_router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str, user_id: str):
    result = await db.alerts.delete_one({"id": alert_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    return {"message": "Alerte supprimée"}

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

# Notes endpoints - Simple single note per position
@api_router.get("/position-note/{position_id}")
async def get_position_note(position_id: str, user_id: str):
    """Get the single note for a position"""
    note = await db.position_notes.find_one({"position_id": position_id, "user_id": user_id})
    if note:
        return {"content": note.get("content", ""), "updated_at": note.get("updated_at")}
    return {"content": "", "updated_at": None}

@api_router.put("/position-note/{position_id}")
async def save_position_note(position_id: str, user_id: str, content: str = ""):
    """Save or update the note for a position (upsert)"""
    result = await db.position_notes.update_one(
        {"position_id": position_id, "user_id": user_id},
        {
            "$set": {
                "content": content,
                "updated_at": datetime.utcnow()
            },
            "$setOnInsert": {
                "position_id": position_id,
                "user_id": user_id,
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )
    return {"message": "Note sauvegardée", "content": content}

@api_router.delete("/position-note/{position_id}")
async def delete_position_note(position_id: str, user_id: str):
    """Delete the note for a position"""
    await db.position_notes.delete_one({"position_id": position_id, "user_id": user_id})
    return {"message": "Note supprimée"}

# Legacy Notes endpoints (keeping for backward compatibility)
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

# User Settings endpoints
@api_router.get("/settings")
async def get_user_settings(user_id: str):
    """Get user settings including risk-free rate and benchmark"""
    settings = await db.user_settings.find_one({"user_id": user_id})
    if not settings:
        # Create default settings
        default_settings = UserSettings(user_id=user_id)
        await db.user_settings.insert_one(default_settings.dict())
        return {
            "risk_free_rate": default_settings.risk_free_rate,
            "benchmark_index": default_settings.benchmark_index,
            "updated_at": default_settings.updated_at.isoformat()
        }
    
    return {
        "risk_free_rate": settings.get('risk_free_rate', 3.0),
        "benchmark_index": settings.get('benchmark_index', '^GSPC'),
        "updated_at": settings['updated_at'].isoformat() if hasattr(settings['updated_at'], 'isoformat') else settings['updated_at']
    }

@api_router.put("/settings")
async def update_user_settings(settings_data: UserSettingsUpdate, user_id: str):
    """Update user settings"""
    existing = await db.user_settings.find_one({"user_id": user_id})
    
    update_data = {"updated_at": datetime.utcnow()}
    if settings_data.risk_free_rate is not None:
        update_data["risk_free_rate"] = settings_data.risk_free_rate
    if settings_data.benchmark_index is not None:
        update_data["benchmark_index"] = settings_data.benchmark_index
    
    if existing:
        await db.user_settings.update_one(
            {"user_id": user_id},
            {"$set": update_data}
        )
    else:
        new_settings = UserSettings(
            user_id=user_id,
            risk_free_rate=settings_data.risk_free_rate or 3.0,
            benchmark_index=settings_data.benchmark_index or "^GSPC"
        )
        await db.user_settings.insert_one(new_settings.dict())
    
    return {
        "message": "Paramètres mis à jour", 
        "risk_free_rate": settings_data.risk_free_rate,
        "benchmark_index": settings_data.benchmark_index
    }

# Capital Contributions (Versements) endpoints - Now portfolio-specific
@api_router.get("/capital")
async def get_capital_summary(user_id: str, portfolio_id: Optional[str] = None):
    """Get total capital contributions (deposits - withdrawals) for a specific portfolio"""
    # Build query - portfolio_id is required for accurate data
    query = {"user_id": user_id}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    else:
        # Get default portfolio if not specified
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            query["portfolio_id"] = default_portfolio['id']
    
    contributions = await db.capital_contributions.find(query).sort("date", -1).to_list(1000)
    
    total_deposits = sum(c['amount'] for c in contributions if c['type'] == 'deposit')
    total_withdrawals = sum(c['amount'] for c in contributions if c['type'] == 'withdrawal')
    net_capital = total_deposits - total_withdrawals
    
    # Clean MongoDB _id from contributions
    clean_contributions = [{
        "id": c.get("id"),
        "type": c.get("type"),
        "amount": c.get("amount"),
        "description": c.get("description", ""),
        "date": c.get("date").isoformat() if hasattr(c.get("date"), 'isoformat') else c.get("date"),
        "portfolio_id": c.get("portfolio_id")
    } for c in contributions]
    
    return {
        "total_deposits": round(total_deposits, 2),
        "total_withdrawals": round(total_withdrawals, 2),
        "net_capital": round(net_capital, 2),
        "contributions": clean_contributions,
        "portfolio_id": query.get("portfolio_id")
    }

@api_router.post("/capital")
async def add_capital_contribution(user_id: str, type: str, amount: float, portfolio_id: Optional[str] = None, description: str = ""):
    """Add a capital contribution (deposit or withdrawal) for a specific portfolio"""
    if type not in ["deposit", "withdrawal"]:
        raise HTTPException(status_code=400, detail="Type doit être 'deposit' ou 'withdrawal'")
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    
    # Get portfolio_id if not provided
    if not portfolio_id:
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            portfolio_id = default_portfolio['id']
        else:
            first_portfolio = await db.portfolios.find_one({"user_id": user_id})
            if first_portfolio:
                portfolio_id = first_portfolio['id']
    
    contribution = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "portfolio_id": portfolio_id,
        "type": type,
        "amount": amount,
        "description": description,
        "date": datetime.utcnow(),
        "created_at": datetime.utcnow()
    }
    
    await db.capital_contributions.insert_one(contribution)
    
    # Recalculate totals for this portfolio
    contributions = await db.capital_contributions.find({"user_id": user_id, "portfolio_id": portfolio_id}).to_list(1000)
    total_deposits = sum(c['amount'] for c in contributions if c['type'] == 'deposit')
    total_withdrawals = sum(c['amount'] for c in contributions if c['type'] == 'withdrawal')
    net_capital = total_deposits - total_withdrawals
    
    return {
        "message": "Versement ajouté" if type == "deposit" else "Retrait ajouté",
        "id": contribution["id"],
        "portfolio_id": portfolio_id,
        "net_capital": round(net_capital, 2)
    }

@api_router.delete("/capital/{contribution_id}")
async def delete_capital_contribution(contribution_id: str, user_id: str):
    """Delete a capital contribution"""
    result = await db.capital_contributions.delete_one({"id": contribution_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contribution non trouvée")
    return {"message": "Contribution supprimée"}

# Cash Management endpoints - Multi-currency accounts (Now portfolio-specific)
@api_router.get("/cash-accounts")
async def get_cash_accounts(user_id: str, portfolio_id: Optional[str] = None):
    """Get all cash accounts with different currencies for a specific portfolio"""
    # Build query
    query = {"user_id": user_id}
    if portfolio_id:
        query["portfolio_id"] = portfolio_id
    else:
        # Get default portfolio if not specified
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            query["portfolio_id"] = default_portfolio['id']
    
    accounts = await db.cash_accounts.find(query).to_list(100)
    
    # If no accounts for this portfolio, create default EUR account
    if not accounts and query.get("portfolio_id"):
        default_account = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "portfolio_id": query["portfolio_id"],
            "currency": "EUR",
            "balance": 0.0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.cash_accounts.insert_one(default_account)
        accounts = [default_account]
    
    # Clean MongoDB _id
    return [{
        "id": acc.get("id"),
        "portfolio_id": acc.get("portfolio_id"),
        "currency": acc.get("currency"),
        "balance": acc.get("balance", 0.0),
        "updated_at": acc.get("updated_at").isoformat() if hasattr(acc.get("updated_at"), 'isoformat') else acc.get("updated_at")
    } for acc in accounts]

@api_router.post("/cash-accounts")
async def create_cash_account(user_id: str, currency: str = "EUR", portfolio_id: Optional[str] = None):
    """Create a new cash account for a specific currency and portfolio"""
    # Get portfolio_id if not provided
    if not portfolio_id:
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            portfolio_id = default_portfolio['id']
        else:
            first_portfolio = await db.portfolios.find_one({"user_id": user_id})
            if first_portfolio:
                portfolio_id = first_portfolio['id']
    
    # Check if account already exists for this currency and portfolio
    existing = await db.cash_accounts.find_one({"user_id": user_id, "portfolio_id": portfolio_id, "currency": currency})
    if existing:
        return {"message": "Compte déjà existant", "id": existing.get("id"), "currency": currency, "portfolio_id": portfolio_id}
    
    new_account = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "portfolio_id": portfolio_id,
        "currency": currency,
        "balance": 0.0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db.cash_accounts.insert_one(new_account)
    return {"message": "Compte créé", "id": new_account["id"], "currency": currency, "portfolio_id": portfolio_id}

@api_router.put("/cash-accounts/{currency}")
async def update_cash_account(currency: str, user_id: str, amount: float, operation: str = "set", portfolio_id: Optional[str] = None):
    """Update cash account balance. Operation: 'set', 'add', 'subtract'"""
    # Get portfolio_id if not provided
    if not portfolio_id:
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            portfolio_id = default_portfolio['id']
    
    account = await db.cash_accounts.find_one({"user_id": user_id, "portfolio_id": portfolio_id, "currency": currency})
    
    if not account:
        # Create account if doesn't exist
        account = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "currency": currency,
            "balance": 0.0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.cash_accounts.insert_one(account)
    
    current_balance = account.get("balance", 0.0)
    
    if operation == "set":
        new_balance = amount
    elif operation == "add":
        new_balance = current_balance + amount
    elif operation == "subtract":
        new_balance = current_balance - amount
    else:
        new_balance = amount
    
    await db.cash_accounts.update_one(
        {"user_id": user_id, "portfolio_id": portfolio_id, "currency": currency},
        {"$set": {"balance": new_balance, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Solde mis à jour", "currency": currency, "balance": new_balance, "portfolio_id": portfolio_id}

@api_router.delete("/cash-accounts/{currency}")
async def delete_cash_account(currency: str, user_id: str, portfolio_id: Optional[str] = None):
    """Delete a cash account"""
    # Get portfolio_id if not provided
    if not portfolio_id:
        default_portfolio = await db.portfolios.find_one({"user_id": user_id, "is_default": True})
        if default_portfolio:
            portfolio_id = default_portfolio['id']
    
    result = await db.cash_accounts.delete_one({"user_id": user_id, "portfolio_id": portfolio_id, "currency": currency})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compte non trouvé")
    return {"message": "Compte supprimé"}

# Legacy Cash endpoints (keeping for backward compatibility)
@api_router.get("/cash/balance")
async def get_cash_balance(user_id: str):
    """Get current cash balance"""
    balance = await db.cash_balances.find_one({"user_id": user_id})
    if not balance:
        # Create initial balance
        new_balance = CashBalance(user_id=user_id, balance=0.0)
        await db.cash_balances.insert_one(new_balance.dict())
        return {"balance": 0.0, "updated_at": new_balance.updated_at.isoformat()}
    
    return {
        "balance": balance['balance'],
        "updated_at": balance['updated_at'].isoformat() if hasattr(balance['updated_at'], 'isoformat') else balance['updated_at']
    }

@api_router.get("/cash/transactions")
async def get_cash_transactions(user_id: str):
    """Get cash transaction history"""
    transactions = await db.cash_transactions.find({"user_id": user_id}).sort("date", -1).to_list(1000)
    
    clean_transactions = []
    for t in transactions:
        clean_t = {k: v for k, v in t.items() if k != '_id'}
        if 'date' in clean_t and hasattr(clean_t['date'], 'isoformat'):
            clean_t['date'] = clean_t['date'].isoformat()
        if 'created_at' in clean_t and hasattr(clean_t['created_at'], 'isoformat'):
            clean_t['created_at'] = clean_t['created_at'].isoformat()
        clean_transactions.append(clean_t)
    
    return clean_transactions

@api_router.post("/cash/transaction")
async def add_cash_transaction(transaction_data: CashTransactionCreate, user_id: str):
    """Add a cash deposit or withdrawal"""
    # Validate type
    if transaction_data.type not in ['deposit', 'withdrawal']:
        raise HTTPException(status_code=400, detail="Type doit être 'deposit' ou 'withdrawal'")
    
    # Get current balance
    balance_doc = await db.cash_balances.find_one({"user_id": user_id})
    current_balance = balance_doc['balance'] if balance_doc else 0.0
    
    # Calculate new balance
    if transaction_data.type == 'deposit':
        new_balance = current_balance + transaction_data.amount
    else:
        new_balance = current_balance - transaction_data.amount
        if new_balance < 0:
            raise HTTPException(status_code=400, detail="Solde insuffisant pour ce retrait")
    
    # Create transaction
    transaction = CashTransaction(
        user_id=user_id,
        type=transaction_data.type,
        amount=transaction_data.amount,
        description=transaction_data.description,
        date=transaction_data.date or datetime.utcnow()
    )
    await db.cash_transactions.insert_one(transaction.dict())
    
    # Update balance
    if balance_doc:
        await db.cash_balances.update_one(
            {"user_id": user_id},
            {"$set": {"balance": new_balance, "updated_at": datetime.utcnow()}}
        )
    else:
        new_balance_doc = CashBalance(user_id=user_id, balance=new_balance)
        await db.cash_balances.insert_one(new_balance_doc.dict())
    
    return {
        "message": "Transaction enregistrée",
        "new_balance": new_balance,
        "transaction_id": transaction.id
    }

@api_router.delete("/cash/transaction/{transaction_id}")
async def delete_cash_transaction(transaction_id: str, user_id: str):
    """Delete a cash transaction and adjust balance"""
    # Find the transaction
    transaction = await db.cash_transactions.find_one({"id": transaction_id, "user_id": user_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction non trouvée")
    
    # Get current balance
    balance_doc = await db.cash_balances.find_one({"user_id": user_id})
    current_balance = balance_doc['balance'] if balance_doc else 0.0
    
    # Reverse the transaction
    if transaction['type'] == 'deposit':
        new_balance = current_balance - transaction['amount']
    else:
        new_balance = current_balance + transaction['amount']
    
    # Delete transaction
    await db.cash_transactions.delete_one({"id": transaction_id, "user_id": user_id})
    
    # Update balance
    await db.cash_balances.update_one(
        {"user_id": user_id},
        {"$set": {"balance": new_balance, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Transaction supprimée", "new_balance": new_balance}

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