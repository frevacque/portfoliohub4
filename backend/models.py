from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime
import uuid

# User Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserResponse(BaseModel):
    id: str
    name: str
    email: str

# Position Models
class PositionCreate(BaseModel):
    symbol: str
    type: str  # "stock" or "crypto"
    transaction_type: str = "buy"  # "buy" or "sell"
    quantity: float
    avg_price: float
    purchase_date: Optional[datetime] = None
    portfolio_id: Optional[str] = None

class Position(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    portfolio_id: Optional[str] = None  # Lié à un portefeuille spécifique
    symbol: str
    name: str
    type: str
    quantity: float
    avg_price: float
    purchase_date: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PositionWithMetrics(Position):
    current_price: float
    total_value: float
    invested: float
    gain_loss: float
    gain_loss_percent: float
    weight: float
    beta: float
    volatility: float
    last_update: str

# Transaction Models
class TransactionCreate(BaseModel):
    symbol: str
    type: str  # "buy" or "sell"
    quantity: float
    price: float

class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    type: str
    quantity: float
    price: float
    total: float
    date: datetime = Field(default_factory=datetime.utcnow)

# Portfolio Models
class PortfolioSummary(BaseModel):
    total_value: float
    total_invested: float
    total_gain_loss: float
    gain_loss_percent: float
    daily_change: float
    daily_change_percent: float
    volatility: dict
    beta: float
    sharpe_ratio: float

# Analytics Models
class CorrelationItem(BaseModel):
    symbol1: str
    symbol2: str
    correlation: float

class Recommendation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # "warning", "info", "success"
    title: str
    description: str
    priority: str  # "high", "medium", "low"

class MarketQuote(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    volume: int

# Performance Models
class PerformanceData(BaseModel):
    date: str
    value: float
    change_percent: float

class PerformanceResponse(BaseModel):
    symbol: Optional[str] = None
    period: str
    data: List[PerformanceData]
    total_return: float
    total_return_percent: float

# Dividend Models
class DividendCreate(BaseModel):
    position_id: str
    amount: float
    date: datetime
    notes: Optional[str] = None

class Dividend(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    position_id: str
    symbol: str
    amount: float
    date: datetime
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Alert Models
class AlertCreate(BaseModel):
    symbol: str
    alert_type: str  # "price_above", "price_below", "volatility_high"
    target_value: float
    notes: Optional[str] = None

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    alert_type: str  # "price_above", "price_below"
    target_value: float
    is_active: bool = True
    is_triggered: bool = False
    is_acknowledged: bool = False  # User has seen/dismissed the notification
    triggered_at: Optional[datetime] = None
    triggered_price: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Goal Models
class GoalCreate(BaseModel):
    title: str
    target_amount: float
    target_date: Optional[datetime] = None
    description: Optional[str] = None

class Goal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    target_amount: float
    target_date: Optional[datetime] = None
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_completed: bool = False

# Note Models
class NoteCreate(BaseModel):
    position_id: str
    content: str

class Note(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    position_id: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Budget Models
class BudgetCreate(BaseModel):
    monthly_amount: float
    start_date: datetime

class Budget(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    monthly_amount: float
    start_date: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Cash Models
class CashTransactionCreate(BaseModel):
    type: str  # "deposit" or "withdrawal"
    amount: float
    description: Optional[str] = None
    date: Optional[datetime] = None

class CashTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: str
    amount: float
    description: Optional[str] = None
    date: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CashBalance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    balance: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# User Settings Models
class UserSettingsUpdate(BaseModel):
    risk_free_rate: Optional[float] = None  # Taux sans risque en % (ex: 3.5 pour 3.5%)
    benchmark_index: Optional[str] = None  # Index de référence (ex: ^FCHI, ^GSPC, URTH)

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    risk_free_rate: float = 3.0  # Default 3% (typical for government bonds)
    benchmark_index: str = "^GSPC"  # Default S&P 500
    updated_at: datetime = Field(default_factory=datetime.utcnow)
