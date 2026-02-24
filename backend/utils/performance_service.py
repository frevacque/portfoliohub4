import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from .yahoo_finance import YahooFinanceService
import logging

logger = logging.getLogger(__name__)

class PerformanceService:
    """Service for calculating portfolio and position performance"""
    
    def __init__(self):
        self.yf_service = YahooFinanceService()
    
    def calculate_portfolio_performance(
        self, 
        positions: List[Dict], 
        period: str = 'all'
    ) -> Dict:
        """
        Calculate portfolio performance over time
        period: 'all', 'ytd', '1m', '3m', '6m', '1y'
        
        IMPORTANT: This method handles mixed asset types (stocks, ETFs, crypto)
        with different trading schedules by using forward-fill alignment.
        """
        try:
            if not positions:
                return {'data': [], 'total_return': 0, 'total_return_percent': 0}
            
            # Determine date range
            end_date = datetime.now()
            if period == 'ytd':
                start_date = datetime(end_date.year, 1, 1)
            elif period == '1m':
                start_date = end_date - timedelta(days=30)
            elif period == '3m':
                start_date = end_date - timedelta(days=90)
            elif period == '6m':
                start_date = end_date - timedelta(days=180)
            elif period == '1y':
                start_date = end_date - timedelta(days=365)
            else:  # 'all'
                # Use earliest purchase date
                purchase_dates = [p.get('purchase_date', datetime.now()) for p in positions]
                start_date = min(purchase_dates) if purchase_dates else end_date - timedelta(days=365)
            
            # Collect historical data for all positions into separate series
            position_series = {}
            
            for position in positions:
                symbol = position['symbol']
                hist_data = self.yf_service.get_historical_data(symbol, period='2y')
                
                if hist_data is None or hist_data.empty:
                    logger.warning(f"No historical data for {symbol}, skipping")
                    continue
                
                # Make dates timezone naive for comparison
                if hist_data.index.tz is not None:
                    hist_data.index = hist_data.index.tz_localize(None)
                
                # Filter by date range
                hist_data = hist_data[hist_data.index >= start_date]
                
                if hist_data.empty:
                    logger.warning(f"No data for {symbol} in the selected period")
                    continue
                
                # Calculate position value over time (price * quantity)
                quantity = position['quantity']
                position_values = hist_data['Close'] * quantity
                position_series[symbol] = position_values
            
            if not position_series:
                return {'data': [], 'total_return': 0, 'total_return_percent': 0}
            
            # Create a DataFrame with all position values
            # This aligns all series to a common date index automatically
            df = pd.DataFrame(position_series)
            
            # Sort by date
            df = df.sort_index()
            
            # Forward-fill missing values (handles crypto vs stock trading days mismatch)
            # This ensures that if BTC has data for Saturday but AAPL doesn't,
            # AAPL's Friday close value is carried forward to Saturday
            df = df.ffill()
            
            # Also backward-fill for the first few days if some positions started later
            df = df.bfill()
            
            # Drop any remaining rows with NaN (edge cases)
            df = df.dropna()
            
            if df.empty:
                return {'data': [], 'total_return': 0, 'total_return_percent': 0}
            
            # Calculate total portfolio value per day
            df['total_value'] = df.sum(axis=1)
            
            # Calculate performance metrics
            initial_value = df['total_value'].iloc[0]
            
            if initial_value <= 0:
                return {'data': [], 'total_return': 0, 'total_return_percent': 0}
            
            performance_data = []
            for date, row in df.iterrows():
                value = row['total_value']
                change_percent = ((value - initial_value) / initial_value * 100)
                
                performance_data.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'value': round(value, 2),
                    'change_percent': round(change_percent, 2)
                })
            
            # Calculate total return
            final_value = df['total_value'].iloc[-1]
            total_return = final_value - initial_value
            total_return_percent = ((final_value - initial_value) / initial_value * 100)
            
            return {
                'data': performance_data,
                'total_return': round(total_return, 2),
                'total_return_percent': round(total_return_percent, 2)
            }
            
        except Exception as e:
            logger.error(f"Error calculating portfolio performance: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {'data': [], 'total_return': 0, 'total_return_percent': 0}
    
    def calculate_position_performance(
        self, 
        symbol: str, 
        quantity: float,
        purchase_price: float,
        purchase_date: datetime,
        period: str = 'all'
    ) -> Dict:
        """Calculate performance for a single position"""
        try:
            # Determine date range
            end_date = datetime.now()
            if period == 'ytd':
                start_date = datetime(end_date.year, 1, 1)
            elif period == '1m':
                start_date = end_date - timedelta(days=30)
            elif period == '3m':
                start_date = end_date - timedelta(days=90)
            elif period == '6m':
                start_date = end_date - timedelta(days=180)
            elif period == '1y':
                start_date = end_date - timedelta(days=365)
            else:  # 'all'
                start_date = purchase_date
            
            # Use purchase date if it's more recent
            start_date = max(start_date, purchase_date)
            
            # Get historical data
            hist_data = self.yf_service.get_historical_data(symbol, period='2y')
            
            if hist_data is None or hist_data.empty:
                return {'data': [], 'total_return': 0, 'total_return_percent': 0}
            
            # Filter by date range - make dates timezone naive for comparison
            hist_data.index = hist_data.index.tz_localize(None)
            hist_data = hist_data[hist_data.index >= start_date]
            
            # Calculate performance
            performance_data = []
            initial_value = purchase_price * quantity
            
            for date, row in hist_data.iterrows():
                current_price = row['Close']
                current_value = current_price * quantity
                change_percent = ((current_value - initial_value) / initial_value * 100) if initial_value > 0 else 0
                
                performance_data.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'value': round(current_value, 2),
                    'change_percent': round(change_percent, 2)
                })
            
            if performance_data:
                final_value = performance_data[-1]['value']
                total_return = final_value - initial_value
                total_return_percent = ((final_value - initial_value) / initial_value * 100) if initial_value > 0 else 0
            else:
                total_return = 0
                total_return_percent = 0
            
            return {
                'data': performance_data,
                'total_return': round(total_return, 2),
                'total_return_percent': round(total_return_percent, 2)
            }
            
        except Exception as e:
            logger.error(f"Error calculating position performance for {symbol}: {str(e)}")
            return {'data': [], 'total_return': 0, 'total_return_percent': 0}
    
    def compare_with_index(
        self,
        portfolio_performance: List[Dict],
        index_symbol: str = '^GSPC'
    ) -> Dict:
        """
        Compare portfolio performance with market index.
        
        IMPORTANT: This method handles the case where portfolio may have data
        for days the index doesn't trade (e.g., crypto positions on weekends).
        We align on index trading days for accurate comparison.
        """
        try:
            if not portfolio_performance:
                return {'data': []}
            
            # Get index data
            start_date = datetime.strptime(portfolio_performance[0]['date'], '%Y-%m-%d')
            end_date = datetime.strptime(portfolio_performance[-1]['date'], '%Y-%m-%d')
            
            hist_data = self.yf_service.get_historical_data(index_symbol, period='2y')
            
            if hist_data is None or hist_data.empty:
                logger.warning(f"No historical data for index {index_symbol}")
                return {'data': []}
            
            # Filter by date range - make dates timezone naive for comparison
            if hist_data.index.tz is not None:
                hist_data.index = hist_data.index.tz_localize(None)
            hist_data = hist_data[(hist_data.index >= start_date) & (hist_data.index <= end_date)]
            
            if hist_data.empty:
                return {'data': []}
            
            # Normalize index to percentage change
            initial_price = hist_data['Close'].iloc[0]
            if initial_price <= 0:
                return {'data': []}
            
            # Create a lookup dict from portfolio performance
            portfolio_lookup = {p['date']: p['change_percent'] for p in portfolio_performance}
            
            comparison_data = []
            last_portfolio_percent = 0  # Track last known portfolio value for interpolation
            
            for date, row in hist_data.iterrows():
                date_str = date.strftime('%Y-%m-%d')
                price = row['Close']
                index_change_percent = ((price - initial_price) / initial_price * 100)
                
                # Get portfolio performance for this date
                # If the exact date doesn't exist (e.g., index trades but portfolio data missing),
                # try to find the nearest previous date
                if date_str in portfolio_lookup:
                    portfolio_percent = portfolio_lookup[date_str]
                    last_portfolio_percent = portfolio_percent
                else:
                    # Use last known portfolio percentage (forward-fill approach)
                    portfolio_percent = last_portfolio_percent
                
                comparison_data.append({
                    'date': date_str,
                    'portfolio_percent': round(portfolio_percent, 2),
                    'index_percent': round(index_change_percent, 2)
                })
            
            return {'data': comparison_data}
            
        except Exception as e:
            logger.error(f"Error comparing with index: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {'data': []}
