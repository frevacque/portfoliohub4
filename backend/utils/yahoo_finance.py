import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Cache for exchange rates (to avoid too many API calls)
_exchange_rate_cache = {}
_cache_timestamp = None
CACHE_DURATION = 300  # 5 minutes

class YahooFinanceService:
    """Service for fetching data from Yahoo Finance"""
    
    @staticmethod
    def get_exchange_rate(from_currency: str, to_currency: str = 'EUR') -> float:
        """
        Get exchange rate from one currency to another.
        Returns the rate to multiply by to convert from_currency to to_currency.
        Example: get_exchange_rate('USD', 'EUR') returns ~0.92 (1 USD = 0.92 EUR)
        """
        global _exchange_rate_cache, _cache_timestamp
        
        # Same currency = no conversion needed
        if from_currency.upper() == to_currency.upper():
            return 1.0
        
        cache_key = f"{from_currency.upper()}{to_currency.upper()}"
        
        # Check cache
        now = datetime.now()
        if _cache_timestamp and (now - _cache_timestamp).seconds < CACHE_DURATION:
            if cache_key in _exchange_rate_cache:
                return _exchange_rate_cache[cache_key]
        
        try:
            # Yahoo Finance format for forex: USDEUR=X
            symbol = f"{from_currency.upper()}{to_currency.upper()}=X"
            ticker = yf.Ticker(symbol)
            data = ticker.history(period='1d')
            
            if data.empty:
                logger.warning(f"No exchange rate data for {symbol}, using 1.0")
                return 1.0
            
            rate = float(data['Close'].iloc[-1])
            
            # Update cache
            _exchange_rate_cache[cache_key] = rate
            _cache_timestamp = now
            
            logger.info(f"Exchange rate {from_currency}->{to_currency}: {rate}")
            return rate
            
        except Exception as e:
            logger.error(f"Error fetching exchange rate {from_currency}->{to_currency}: {str(e)}")
            return 1.0
    
    @staticmethod
    def convert_to_eur(amount: float, from_currency: str) -> float:
        """Convert an amount from any currency to EUR"""
        if from_currency.upper() == 'EUR':
            return amount
        rate = YahooFinanceService.get_exchange_rate(from_currency, 'EUR')
        return amount * rate
    
    @staticmethod
    def get_current_price(symbol: str) -> Optional[float]:
        """Get current price for a symbol"""
        try:
            ticker = yf.Ticker(symbol)
            data = ticker.history(period='1d')
            if data.empty:
                return None
            return float(data['Close'].iloc[-1])
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {str(e)}")
            return None
    
    @staticmethod
    def get_ticker_info(symbol: str) -> Optional[Dict]:
        """Get ticker information"""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            return {
                'symbol': symbol,
                'name': info.get('longName', info.get('shortName', symbol)),
                'price': info.get('currentPrice', info.get('regularMarketPrice', 0)),
                'change': info.get('regularMarketChange', 0),
                'change_percent': info.get('regularMarketChangePercent', 0),
                'volume': info.get('volume', 0)
            }
        except Exception as e:
            logger.error(f"Error fetching info for {symbol}: {str(e)}")
            return None
    
    @staticmethod
    def get_historical_data(symbol: str, period: str = '1y') -> Optional[pd.DataFrame]:
        """Get historical data for a symbol"""
        try:
            ticker = yf.Ticker(symbol)
            data = ticker.history(period=period)
            return data
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {str(e)}")
            return None
    
    @staticmethod
    def calculate_returns(prices: pd.Series) -> pd.Series:
        """Calculate returns from prices"""
        return prices.pct_change().dropna()
    
    @staticmethod
    def calculate_volatility(returns: pd.Series, annualize: bool = True) -> float:
        """Calculate volatility (standard deviation of returns)"""
        vol = returns.std()
        if annualize:
            # Annualize based on trading days
            vol = vol * np.sqrt(252)
        return float(vol * 100)  # Convert to percentage
    
    @staticmethod
    def calculate_beta(asset_returns: pd.Series, market_returns: pd.Series) -> float:
        """Calculate beta relative to market"""
        try:
            # Align the series
            aligned = pd.DataFrame({
                'asset': asset_returns,
                'market': market_returns
            }).dropna()
            
            if len(aligned) < 2:
                return 1.0
            
            covariance = aligned['asset'].cov(aligned['market'])
            market_variance = aligned['market'].var()
            
            if market_variance == 0:
                return 1.0
            
            beta = covariance / market_variance
            return float(beta)
        except Exception as e:
            logger.error(f"Error calculating beta: {str(e)}")
            return 1.0
    
    @staticmethod
    def calculate_correlation(returns1: pd.Series, returns2: pd.Series) -> float:
        """Calculate correlation between two return series"""
        try:
            aligned = pd.DataFrame({
                'r1': returns1,
                'r2': returns2
            }).dropna()
            
            if len(aligned) < 2:
                return 0.0
            
            correlation = aligned['r1'].corr(aligned['r2'])
            return float(correlation)
        except Exception as e:
            logger.error(f"Error calculating correlation: {str(e)}")
            return 0.0
    
    @staticmethod
    def calculate_sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.02) -> float:
        """Calculate Sharpe ratio"""
        try:
            excess_returns = returns - (risk_free_rate / 252)  # Daily risk-free rate
            sharpe = excess_returns.mean() / returns.std()
            return float(sharpe * np.sqrt(252))  # Annualize
        except Exception as e:
            logger.error(f"Error calculating Sharpe ratio: {str(e)}")
            return 0.0
    
    @staticmethod
    def get_market_data(symbol: str = '^GSPC', period: str = '1y') -> Optional[pd.Series]:
        """Get market index data (default S&P 500)"""
        try:
            ticker = yf.Ticker(symbol)
            data = ticker.history(period=period)
            return data['Close']
        except Exception as e:
            logger.error(f"Error fetching market data: {str(e)}")
            return None
    
    @staticmethod
    def get_daily_change(symbol: str) -> Optional[Dict]:
        """Get daily price change for a symbol"""
        try:
            ticker = yf.Ticker(symbol)
            data = ticker.history(period='2d')
            if data.empty or len(data) < 2:
                # Try with info if history fails
                info = ticker.info
                return {
                    'current_price': info.get('currentPrice', info.get('regularMarketPrice', 0)),
                    'price_change': info.get('regularMarketChange', 0),
                    'change_percent': info.get('regularMarketChangePercent', 0)
                }
            
            current_price = float(data['Close'].iloc[-1])
            previous_price = float(data['Close'].iloc[-2])
            price_change = current_price - previous_price
            change_percent = (price_change / previous_price * 100) if previous_price > 0 else 0
            
            return {
                'current_price': current_price,
                'previous_price': previous_price,
                'price_change': price_change,
                'change_percent': change_percent
            }
        except Exception as e:
            logger.error(f"Error fetching daily change for {symbol}: {str(e)}")
            return None
    
    @staticmethod
    def search_ticker(query: str) -> List[Dict]:
        """Search for tickers (basic implementation)"""
        # Note: yfinance doesn't have a built-in search, so this is a simplified version
        # In production, you might want to use a proper search API
        try:
            ticker = yf.Ticker(query.upper())
            info = ticker.info
            if info:
                return [{
                    'symbol': query.upper(),
                    'name': info.get('longName', info.get('shortName', query)),
                    'type': info.get('quoteType', 'unknown')
                }]
        except:
            pass
        return []
