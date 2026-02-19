import pandas as pd
import numpy as np
from typing import List, Dict, Tuple
from datetime import datetime, timedelta
from .yahoo_finance import YahooFinanceService
import logging

logger = logging.getLogger(__name__)

class PortfolioAnalytics:
    """Analytics for portfolio calculations"""
    
    def __init__(self):
        self.yf_service = YahooFinanceService()
    
    def calculate_portfolio_volatility(self, positions: List[Dict], period: str = '1y') -> Dict[str, float]:
        """Calculate portfolio volatility (historical annualized)"""
        try:
            # Get historical data for all positions
            weights = []
            returns_data = []
            
            total_value = sum(p['total_value'] for p in positions)
            
            for position in positions:
                hist_data = self.yf_service.get_historical_data(position['symbol'], period)
                if hist_data is not None and not hist_data.empty:
                    returns = self.yf_service.calculate_returns(hist_data['Close'])
                    weight = position['total_value'] / total_value
                    weights.append(weight)
                    returns_data.append(returns)
            
            if not returns_data:
                return {'historical': 0.0, 'realized': 0.0}
            
            # Combine returns weighted by position size
            portfolio_returns = pd.Series(0, index=returns_data[0].index)
            for weight, returns in zip(weights, returns_data):
                aligned_returns = returns.reindex(portfolio_returns.index, fill_value=0)
                portfolio_returns += weight * aligned_returns
            
            # Calculate historical volatility (annualized)
            historical_vol = self.yf_service.calculate_volatility(portfolio_returns, annualize=True)
            
            return {
                'historical': round(historical_vol, 2),
                'realized': 0.0  # Will be calculated separately with actual holding period
            }
        except Exception as e:
            logger.error(f"Error calculating portfolio volatility: {str(e)}")
            return {'historical': 0.0, 'realized': 0.0}
    
    def calculate_realized_volatility(self, positions: List[Dict]) -> float:
        """Calculate the realized volatility since the user started holding each position"""
        try:
            if not positions:
                return 0.0
            
            weights = []
            returns_data = []
            total_value = sum(p.get('total_value', 0) for p in positions)
            
            if total_value == 0:
                return 0.0
            
            for position in positions:
                # Get purchase date from position
                purchase_date = position.get('purchase_date')
                if purchase_date:
                    if isinstance(purchase_date, str):
                        purchase_date = datetime.fromisoformat(purchase_date.replace('Z', '+00:00'))
                    
                    # Calculate days since purchase
                    days_held = (datetime.utcnow() - purchase_date.replace(tzinfo=None)).days
                    if days_held < 2:
                        continue  # Need at least 2 days of data
                    
                    # Get historical data since purchase date
                    period = f'{days_held}d'
                    hist_data = self.yf_service.get_historical_data(position['symbol'], period)
                    
                    if hist_data is not None and len(hist_data) >= 2:
                        returns = self.yf_service.calculate_returns(hist_data['Close'])
                        weight = position.get('total_value', 0) / total_value
                        weights.append(weight)
                        returns_data.append(returns)
            
            if not returns_data:
                return 0.0
            
            # Find common date range
            min_length = min(len(r) for r in returns_data)
            if min_length < 2:
                return 0.0
            
            # Combine weighted returns
            combined_returns = pd.Series(0.0, index=range(min_length))
            for weight, returns in zip(weights, returns_data):
                # Take last min_length returns
                recent_returns = returns.tail(min_length).reset_index(drop=True)
                combined_returns += weight * recent_returns
            
            # Calculate annualized volatility
            realized_vol = float(combined_returns.std() * np.sqrt(252) * 100)
            
            return round(realized_vol, 2)
        except Exception as e:
            logger.error(f"Error calculating realized volatility: {str(e)}")
            return 0.0
    
    def calculate_sharpe_ratio_custom(self, positions: List[Dict], risk_free_rate: float = 3.0) -> float:
        """Calculate Sharpe ratio with custom risk-free rate"""
        try:
            if not positions:
                return 0.0
            
            # Calculate portfolio return
            total_value = sum(p.get('total_value', 0) for p in positions)
            total_invested = sum(p.get('invested', 0) for p in positions)
            
            if total_invested == 0:
                return 0.0
            
            portfolio_return = ((total_value - total_invested) / total_invested) * 100
            
            # Get portfolio volatility
            volatility = self.calculate_portfolio_volatility(positions)
            historical_vol = volatility.get('historical', 0)
            
            if historical_vol == 0:
                return 0.0
            
            # Sharpe = (Return - Risk Free Rate) / Volatility
            sharpe = (portfolio_return - risk_free_rate) / historical_vol
            
            return round(sharpe, 2)
        except Exception as e:
            logger.error(f"Error calculating Sharpe ratio: {str(e)}")
            return 0.0
    
    def calculate_portfolio_beta(self, positions: List[Dict], period: str = '1y', market_index: str = '^GSPC') -> float:
        """Calculate portfolio beta"""
        try:
            # Get market data
            market_data = self.yf_service.get_market_data(market_index, period)
            if market_data is None or market_data.empty:
                logger.warning(f"No market data available for beta calculation (index: {market_index})")
                return 1.0
            
            # Make timezone naive
            if market_data.index.tz is not None:
                market_data.index = market_data.index.tz_localize(None)
            
            market_returns = self.yf_service.calculate_returns(market_data)
            
            # Calculate weighted portfolio returns
            weights = []
            returns_data = []
            total_value = sum(p['total_value'] for p in positions)
            
            for position in positions:
                hist_data = self.yf_service.get_historical_data(position['symbol'], period)
                if hist_data is not None and not hist_data.empty:
                    # Make timezone naive
                    if hist_data.index.tz is not None:
                        hist_data.index = hist_data.index.tz_localize(None)
                    
                    returns = self.yf_service.calculate_returns(hist_data['Close'])
                    weight = position['total_value'] / total_value
                    weights.append(weight)
                    returns_data.append(returns)
            
            if not returns_data:
                logger.warning("No returns data for beta calculation")
                return 1.0
            
            # Combine returns using common index
            common_index = market_returns.index
            portfolio_returns = pd.Series(0, index=common_index)
            
            for weight, returns in zip(weights, returns_data):
                aligned_returns = returns.reindex(common_index, fill_value=0)
                portfolio_returns += weight * aligned_returns
            
            beta = self.yf_service.calculate_beta(portfolio_returns, market_returns)
            logger.info(f"Calculated portfolio beta: {beta} (vs {market_index})")
            return round(beta, 2)
        except Exception as e:
            logger.error(f"Error calculating portfolio beta: {str(e)}")
            return 1.0
    
    def calculate_position_beta(self, symbol: str, period: str = '1y', market_index: str = '^GSPC') -> float:
        """Calculate beta for a single position against the specified market index"""
        try:
            # Get market data using the user's benchmark
            market_data = self.yf_service.get_market_data(market_index, period)
            if market_data is None or market_data.empty:
                logger.warning(f"No market data for beta calculation of {symbol} against {market_index}")
                return 1.0
            
            # Make timezone naive
            if market_data.index.tz is not None:
                market_data.index = market_data.index.tz_localize(None)
            
            market_returns = self.yf_service.calculate_returns(market_data)
            
            # Get position data
            hist_data = self.yf_service.get_historical_data(symbol, period)
            if hist_data is None or hist_data.empty:
                logger.warning(f"No historical data for {symbol}")
                return 1.0
            
            # Make timezone naive
            if hist_data.index.tz is not None:
                hist_data.index = hist_data.index.tz_localize(None)
            
            position_returns = self.yf_service.calculate_returns(hist_data['Close'])
            beta = self.yf_service.calculate_beta(position_returns, market_returns)
            
            logger.info(f"Calculated beta for {symbol} vs {market_index}: {beta}")
            return round(beta, 2)
        except Exception as e:
            logger.error(f"Error calculating position beta for {symbol}: {str(e)}")
            return 1.0
    
    def calculate_position_volatility(self, symbol: str, period: str = '1y') -> float:
        """Calculate volatility for a single position"""
        try:
            hist_data = self.yf_service.get_historical_data(symbol, period)
            if hist_data is None or hist_data.empty:
                return 0.0
            
            returns = self.yf_service.calculate_returns(hist_data['Close'])
            volatility = self.yf_service.calculate_volatility(returns, annualize=True)
            return round(volatility, 2)
        except Exception as e:
            logger.error(f"Error calculating position volatility for {symbol}: {str(e)}")
            return 0.0
    
    def calculate_correlation_matrix(self, symbols: List[str], period: str = '1y') -> List[Dict]:
        """Calculate correlation matrix between positions"""
        try:
            correlations = []
            returns_dict = {}
            
            # Get returns for all symbols
            for symbol in symbols:
                hist_data = self.yf_service.get_historical_data(symbol, period)
                if hist_data is not None and not hist_data.empty:
                    returns_dict[symbol] = self.yf_service.calculate_returns(hist_data['Close'])
            
            # Calculate pairwise correlations
            symbols_with_data = list(returns_dict.keys())
            for i, symbol1 in enumerate(symbols_with_data):
                for symbol2 in symbols_with_data[i+1:]:
                    corr = self.yf_service.calculate_correlation(
                        returns_dict[symbol1],
                        returns_dict[symbol2]
                    )
                    correlations.append({
                        'symbol1': symbol1,
                        'symbol2': symbol2,
                        'correlation': round(corr, 2)
                    })
            
            return correlations
        except Exception as e:
            logger.error(f"Error calculating correlation matrix: {str(e)}")
            return []
    
    def calculate_sharpe_ratio(self, positions: List[Dict], period: str = '1y') -> float:
        """Calculate portfolio Sharpe ratio"""
        try:
            # Calculate weighted portfolio returns
            weights = []
            returns_data = []
            total_value = sum(p['total_value'] for p in positions)
            
            for position in positions:
                hist_data = self.yf_service.get_historical_data(position['symbol'], period)
                if hist_data is not None and not hist_data.empty:
                    returns = self.yf_service.calculate_returns(hist_data['Close'])
                    weight = position['total_value'] / total_value
                    weights.append(weight)
                    returns_data.append(returns)
            
            if not returns_data:
                return 0.0
            
            # Combine returns
            portfolio_returns = pd.Series(0, index=returns_data[0].index)
            for weight, returns in zip(weights, returns_data):
                aligned_returns = returns.reindex(portfolio_returns.index, fill_value=0)
                portfolio_returns += weight * aligned_returns
            
            sharpe = self.yf_service.calculate_sharpe_ratio(portfolio_returns)
            return round(sharpe, 2)
        except Exception as e:
            logger.error(f"Error calculating Sharpe ratio: {str(e)}")
            return 0.0
    
    def generate_recommendations(self, positions: List[Dict], portfolio_metrics: Dict) -> List[Dict]:
        """Generate portfolio recommendations"""
        recommendations = []
        
        try:
            total_value = sum(p['total_value'] for p in positions)
            
            # Check for concentration
            for position in positions:
                weight = (position['total_value'] / total_value) * 100
                if weight > 40:
                    recommendations.append({
                        'type': 'warning',
                        'title': 'Concentration élevée',
                        'description': f"{position['symbol']} représente {weight:.1f}% de votre portefeuille. Considérez diversifier davantage.",
                        'priority': 'high'
                    })
            
            # Check for high volatility
            for position in positions:
                if position.get('volatility', 0) > 50:
                    recommendations.append({
                        'type': 'info',
                        'title': 'Volatilité élevée',
                        'description': f"{position['symbol']} a une volatilité de {position['volatility']:.1f}%. Surveillez cette position de près.",
                        'priority': 'medium'
                    })
            
            # Check portfolio beta
            beta = portfolio_metrics.get('beta', 1.0)
            if 0.9 <= beta <= 1.3:
                recommendations.append({
                    'type': 'success',
                    'title': 'Bonne exposition au marché',
                    'description': f"Votre bêta de portefeuille ({beta:.2f}) indique une exposition équilibrée au marché.",
                    'priority': 'low'
                })
            elif beta > 1.5:
                recommendations.append({
                    'type': 'warning',
                    'title': 'Exposition au marché élevée',
                    'description': f"Votre bêta ({beta:.2f}) est élevé. Votre portefeuille est plus volatil que le marché.",
                    'priority': 'high'
                })
            
            # Check Sharpe ratio
            sharpe = portfolio_metrics.get('sharpe_ratio', 0)
            if sharpe > 1.0:
                recommendations.append({
                    'type': 'success',
                    'title': 'Bon rendement ajusté au risque',
                    'description': f"Votre ratio de Sharpe ({sharpe:.2f}) indique un bon rendement pour le risque pris.",
                    'priority': 'low'
                })
            
        except Exception as e:
            logger.error(f"Error generating recommendations: {str(e)}")
        
        return recommendations
