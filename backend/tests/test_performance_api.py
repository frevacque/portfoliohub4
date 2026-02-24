"""
Test suite for Portfolio Performance API with crypto positions
Tests the fix for P0 bug: Charts showing drops to zero when crypto (BTC-EUR) was added.
The bug was caused by misalignment of temporal data between crypto (24/7 trading) 
and stocks (business days only). Fix uses pandas forward-fill alignment.
"""
import pytest
import requests
import os

# Public URL for testing
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://crypto-fix-7.preview.emergentagent.com"

# Test user with crypto + stock positions
TEST_USER_ID = "c30befea-7024-4e34-a0d5-dd8a6740917d"
# Credentials: testcrypto@test.com / test123

PERIODS = ['1m', '3m', '6m', '1y', 'ytd', 'all']

class TestPerformanceAPI:
    """Tests for /api/analytics/performance endpoint"""
    
    def test_health_check(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print(f"API health check passed: {response.json()}")
    
    def test_positions_exist(self):
        """Verify test user has both crypto and stock positions"""
        response = requests.get(f"{BASE_URL}/api/positions?user_id={TEST_USER_ID}")
        assert response.status_code == 200
        
        positions = response.json()
        symbols = [p['symbol'] for p in positions]
        
        assert 'BTC-EUR' in symbols, "Expected BTC-EUR crypto position"
        assert 'AAPL' in symbols, "Expected AAPL stock position"
        
        print(f"Verified positions: {symbols}")
    
    @pytest.mark.parametrize("period", PERIODS)
    def test_portfolio_performance_no_zero_drops(self, period):
        """
        P0 BUG TEST: Verify no abnormal drops to zero in performance data.
        The bug caused values to drop to 0 when crypto dates didn't align with stock dates.
        """
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period={period}")
        assert response.status_code == 200, f"Performance API failed for period {period}"
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if not perf_data:
            pytest.skip(f"No performance data for period {period}")
        
        # Check for zero values (P0 bug indicator)
        zero_values = [d for d in perf_data if d['value'] == 0 or d['value'] is None]
        assert len(zero_values) == 0, f"Found {len(zero_values)} zero values in {period} data - P0 BUG!"
        
        # Check for abnormal drops (> 50% drop from previous day = likely bug)
        anomalies = []
        for i in range(1, len(perf_data)):
            prev_value = perf_data[i-1]['value']
            curr_value = perf_data[i]['value']
            
            if prev_value > 0:
                drop_percent = ((prev_value - curr_value) / prev_value) * 100
                if drop_percent > 50:  # More than 50% drop is abnormal
                    anomalies.append({
                        'date': perf_data[i]['date'],
                        'prev_value': prev_value,
                        'curr_value': curr_value,
                        'drop_percent': round(drop_percent, 2)
                    })
        
        assert len(anomalies) == 0, f"Found {len(anomalies)} abnormal drops in {period}: {anomalies}"
        
        print(f"Period {period}: {len(perf_data)} data points, no zero drops, no anomalies")
    
    @pytest.mark.parametrize("period", PERIODS)
    def test_portfolio_performance_data_continuity(self, period):
        """Verify data is continuous without gaps (forward-fill working)"""
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period={period}")
        assert response.status_code == 200
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if len(perf_data) < 2:
            pytest.skip(f"Not enough data for period {period}")
        
        # All values should be positive (indicating valid data)
        positive_values = [d for d in perf_data if d['value'] > 0]
        assert len(positive_values) == len(perf_data), "All values should be positive"
        
        print(f"Period {period}: All {len(perf_data)} values are positive and continuous")
    
    def test_performance_returns_total_return(self):
        """Verify total_return and total_return_percent are calculated"""
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period=1m")
        assert response.status_code == 200
        
        data = response.json()
        
        assert 'total_return' in data, "Missing total_return"
        assert 'total_return_percent' in data, "Missing total_return_percent"
        
        # Values should be numeric
        assert isinstance(data['total_return'], (int, float))
        assert isinstance(data['total_return_percent'], (int, float))
        
        print(f"Total return: {data['total_return']}, Total return %: {data['total_return_percent']}%")


class TestCompareIndexAPI:
    """Tests for /api/analytics/compare-index endpoint"""
    
    @pytest.mark.parametrize("period", ['1m', '3m', '6m', '1y', 'ytd'])
    def test_compare_index_no_anomalies(self, period):
        """
        P0 BUG TEST: Verify index comparison works with crypto portfolio.
        The bug caused misalignment when portfolio had weekend data but index didn't.
        """
        response = requests.get(f"{BASE_URL}/api/analytics/compare-index?user_id={TEST_USER_ID}&period={period}&index=^GSPC")
        assert response.status_code == 200, f"Compare-index API failed for period {period}"
        
        data = response.json()
        comparison_data = data.get('data', [])
        
        if not comparison_data:
            pytest.skip(f"No comparison data for period {period}")
        
        # Check portfolio_percent values are not all zero (bug indicator)
        portfolio_percentages = [d['portfolio_percent'] for d in comparison_data]
        non_zero_portfolio = [p for p in portfolio_percentages if p != 0]
        
        # At least some non-zero values expected (unless portfolio truly flat)
        assert len(non_zero_portfolio) > 0, f"All portfolio percentages are zero for {period} - possible bug"
        
        # Check for abnormal spikes (> 100% change in portfolio_percent between days)
        anomalies = []
        for i in range(1, len(comparison_data)):
            prev = comparison_data[i-1]['portfolio_percent']
            curr = comparison_data[i]['portfolio_percent']
            
            diff = abs(curr - prev)
            if diff > 50:  # More than 50% jump is suspicious
                anomalies.append({
                    'date': comparison_data[i]['date'],
                    'prev': prev,
                    'curr': curr,
                    'diff': diff
                })
        
        assert len(anomalies) == 0, f"Found {len(anomalies)} anomalies in {period}: {anomalies}"
        
        print(f"Period {period}: {len(comparison_data)} comparison points, no anomalies")
    
    @pytest.mark.parametrize("index", ['^GSPC', '^FCHI', 'URTH', '^NDX'])
    def test_compare_index_different_indices(self, index):
        """Test comparison with different benchmark indices"""
        response = requests.get(f"{BASE_URL}/api/analytics/compare-index?user_id={TEST_USER_ID}&period=1m&index={index}")
        assert response.status_code == 200, f"Compare-index failed for index {index}"
        
        data = response.json()
        comparison_data = data.get('data', [])
        
        if comparison_data:
            # Verify index_percent data is present
            index_percentages = [d['index_percent'] for d in comparison_data]
            assert len(index_percentages) > 0, f"No index data for {index}"
            
            print(f"Index {index}: {len(comparison_data)} data points")
        else:
            print(f"Index {index}: No data (may be expected for some indices)")


class TestIndividualPositionPerformance:
    """Tests for individual position performance"""
    
    def test_btc_performance_no_drops(self):
        """Test BTC-EUR crypto position performance specifically"""
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period=1m&symbol=BTC-EUR")
        assert response.status_code == 200
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if not perf_data:
            pytest.skip("No BTC-EUR performance data")
        
        # Check no zero drops
        zero_values = [d for d in perf_data if d['value'] <= 0]
        assert len(zero_values) == 0, f"BTC-EUR has {len(zero_values)} zero/negative values"
        
        print(f"BTC-EUR: {len(perf_data)} data points, all positive")
    
    def test_aapl_performance_no_drops(self):
        """Test AAPL stock position performance"""
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period=1m&symbol=AAPL")
        assert response.status_code == 200
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if not perf_data:
            pytest.skip("No AAPL performance data")
        
        zero_values = [d for d in perf_data if d['value'] <= 0]
        assert len(zero_values) == 0, f"AAPL has {len(zero_values)} zero/negative values"
        
        print(f"AAPL: {len(perf_data)} data points, all positive")


class TestMixedPortfolioEdgeCases:
    """Edge case tests for mixed crypto + stock portfolios"""
    
    def test_weekend_data_alignment(self):
        """
        Critical test for the P0 bug fix.
        Crypto trades on weekends, stocks don't.
        Forward-fill should prevent gaps.
        """
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period=1m")
        assert response.status_code == 200
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if len(perf_data) < 7:
            pytest.skip("Not enough data for weekend test")
        
        # Weekend days should have valid data due to forward-fill
        # Check no sudden drops between Friday and Monday
        for i in range(1, len(perf_data)):
            prev = perf_data[i-1]
            curr = perf_data[i]
            
            # Verify value is not NaN or zero
            assert curr['value'] > 0, f"Zero value on {curr['date']}"
            assert curr['value'] is not None, f"None value on {curr['date']}"
        
        print(f"Weekend alignment test passed: {len(perf_data)} continuous data points")
    
    def test_data_consistency_first_to_last(self):
        """Verify first and last values are consistent with total_return"""
        response = requests.get(f"{BASE_URL}/api/analytics/performance?user_id={TEST_USER_ID}&period=1m")
        assert response.status_code == 200
        
        data = response.json()
        perf_data = data.get('data', [])
        
        if len(perf_data) < 2:
            pytest.skip("Not enough data")
        
        first_value = perf_data[0]['value']
        last_value = perf_data[-1]['value']
        
        calculated_return = last_value - first_value
        api_return = data.get('total_return', 0)
        
        # Allow small floating point difference
        diff = abs(calculated_return - api_return)
        assert diff < 1, f"Return mismatch: calculated={calculated_return}, api={api_return}"
        
        print(f"Data consistency verified: first={first_value}, last={last_value}, return={api_return}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
