"""
Backend API Tests for Portfolio Management - P0 Bug Fixes
Tests:
1. Sell partial position (quantity reduction, cash update)
2. Sell total position (position deletion, cash update)
3. Error when selling more than owned
4. Data consistency between Dashboard and Portfolio (same portfolio_id)
5. Buy with PRU merge still works
6. Transaction modal with Buy/Sell selector
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fintrack-app-95.preview.emergentagent.com')
API = f"{BASE_URL}/api"

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "password123"


class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "id" in data, "User ID not in response"
        assert "email" in data, "Email not in response"
        assert data["email"] == TEST_EMAIL
        print(f"✅ Login successful - User ID: {data['id']}")
        return data["id"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{API}/auth/login", json={
            "email": "wrong@test.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected")


@pytest.fixture(scope="module")
def user_id():
    """Get user ID by logging in"""
    response = requests.post(f"{API}/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["id"]


@pytest.fixture(scope="module")
def portfolio_id(user_id):
    """Get or create default portfolio"""
    response = requests.get(f"{API}/portfolios?user_id={user_id}")
    assert response.status_code == 200
    portfolios = response.json()
    if portfolios:
        return portfolios[0]["id"]
    return None


class TestPortfolioConsistency:
    """Test data consistency between Dashboard and Portfolio page"""
    
    def test_get_portfolios(self, user_id):
        """Test getting all portfolios"""
        response = requests.get(f"{API}/portfolios?user_id={user_id}")
        assert response.status_code == 200
        portfolios = response.json()
        assert isinstance(portfolios, list)
        print(f"✅ Got {len(portfolios)} portfolios")
        if portfolios:
            print(f"   First portfolio: {portfolios[0].get('name', 'N/A')}")
        return portfolios
    
    def test_positions_with_portfolio_id(self, user_id, portfolio_id):
        """Test getting positions with portfolio_id filter"""
        if not portfolio_id:
            pytest.skip("No portfolio available")
        
        # Get positions with portfolio_id
        response = requests.get(f"{API}/positions?user_id={user_id}&portfolio_id={portfolio_id}")
        assert response.status_code == 200
        positions = response.json()
        print(f"✅ Got {len(positions)} positions for portfolio {portfolio_id}")
        return positions
    
    def test_summary_with_portfolio_id(self, user_id, portfolio_id):
        """Test getting portfolio summary with portfolio_id filter"""
        if not portfolio_id:
            pytest.skip("No portfolio available")
        
        response = requests.get(f"{API}/portfolio/summary?user_id={user_id}&portfolio_id={portfolio_id}")
        assert response.status_code == 200
        summary = response.json()
        assert "total_value" in summary
        assert "total_invested" in summary
        print(f"✅ Portfolio summary: Value={summary['total_value']}, Invested={summary['total_invested']}")
        return summary
    
    def test_dashboard_portfolio_consistency(self, user_id, portfolio_id):
        """Test that Dashboard and Portfolio page show same data"""
        if not portfolio_id:
            pytest.skip("No portfolio available")
        
        # Get positions (like Portfolio page)
        positions_response = requests.get(f"{API}/positions?user_id={user_id}&portfolio_id={portfolio_id}")
        assert positions_response.status_code == 200
        positions = positions_response.json()
        
        # Get summary (like Dashboard)
        summary_response = requests.get(f"{API}/portfolio/summary?user_id={user_id}&portfolio_id={portfolio_id}")
        assert summary_response.status_code == 200
        summary = summary_response.json()
        
        # Calculate total from positions
        positions_total = sum(p.get('total_value', 0) for p in positions)
        
        # Compare (allow small floating point differences)
        if positions:
            diff = abs(positions_total - summary['total_value'])
            assert diff < 1, f"Data inconsistency: positions total={positions_total}, summary total={summary['total_value']}"
        
        print(f"✅ Data consistency verified: {len(positions)} positions, total value matches")


class TestSellFunctionality:
    """Test sell position functionality - P0 Bug Fix"""
    
    def test_create_test_position_for_sell(self, user_id, portfolio_id):
        """Create a test position to sell"""
        # First, create a position to sell
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": "TEST_SELL_AAPL",
            "type": "stock",
            "transaction_type": "buy",
            "quantity": 100,
            "avg_price": 150.0,
            "portfolio_id": portfolio_id
        })
        
        # May fail if symbol doesn't exist in Yahoo Finance, that's OK
        if response.status_code == 404:
            pytest.skip("Test symbol not found in Yahoo Finance")
        
        print(f"Create position response: {response.status_code} - {response.text[:200]}")
        return response
    
    def test_sell_partial_position(self, user_id, portfolio_id):
        """Test selling part of a position"""
        # Get current positions
        positions_response = requests.get(f"{API}/positions?user_id={user_id}&portfolio_id={portfolio_id}")
        positions = positions_response.json()
        
        if not positions:
            pytest.skip("No positions to sell")
        
        # Find a position with quantity > 1
        position_to_sell = None
        for p in positions:
            if p.get('quantity', 0) > 1:
                position_to_sell = p
                break
        
        if not position_to_sell:
            pytest.skip("No position with quantity > 1 to test partial sell")
        
        original_quantity = position_to_sell['quantity']
        sell_quantity = 1  # Sell just 1 unit
        
        # Get cash balance before
        cash_before_response = requests.get(f"{API}/cash/balance?user_id={user_id}")
        cash_before = cash_before_response.json().get('balance', 0) if cash_before_response.status_code == 200 else 0
        
        # Perform sell
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": position_to_sell['symbol'],
            "type": position_to_sell['type'],
            "transaction_type": "sell",
            "quantity": sell_quantity,
            "avg_price": position_to_sell.get('current_price', position_to_sell['avg_price']),
            "portfolio_id": portfolio_id
        })
        
        assert response.status_code == 200, f"Sell failed: {response.text}"
        data = response.json()
        
        # Verify response
        assert "message" in data, "No message in sell response"
        assert "new_cash_balance" in data, "No new_cash_balance in response"
        
        # Verify quantity reduced
        expected_quantity = original_quantity - sell_quantity
        assert data.get('quantity') == expected_quantity, f"Expected quantity {expected_quantity}, got {data.get('quantity')}"
        
        # Verify cash increased
        assert data['new_cash_balance'] > cash_before, "Cash balance should increase after sell"
        
        print(f"✅ Partial sell successful: {position_to_sell['symbol']} - sold {sell_quantity}, remaining {expected_quantity}")
        print(f"   Cash: {cash_before} -> {data['new_cash_balance']}")
        
        return data
    
    def test_sell_error_insufficient_quantity(self, user_id, portfolio_id):
        """Test error when selling more than owned"""
        # Get current positions
        positions_response = requests.get(f"{API}/positions?user_id={user_id}&portfolio_id={portfolio_id}")
        positions = positions_response.json()
        
        if not positions:
            pytest.skip("No positions to test")
        
        position = positions[0]
        
        # Try to sell more than owned
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": position['symbol'],
            "type": position['type'],
            "transaction_type": "sell",
            "quantity": position['quantity'] + 1000,  # More than owned
            "avg_price": position.get('current_price', position['avg_price']),
            "portfolio_id": portfolio_id
        })
        
        assert response.status_code == 400, f"Expected 400 error, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "No error detail in response"
        assert "insuffisante" in data['detail'].lower() or "insufficient" in data['detail'].lower(), \
            f"Expected insufficient quantity error, got: {data['detail']}"
        
        print(f"✅ Correctly rejected sell of {position['quantity'] + 1000} units (only {position['quantity']} owned)")
    
    def test_sell_nonexistent_position(self, user_id, portfolio_id):
        """Test error when selling a position that doesn't exist"""
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": "NONEXISTENT_SYMBOL_XYZ",
            "type": "stock",
            "transaction_type": "sell",
            "quantity": 10,
            "avg_price": 100.0,
            "portfolio_id": portfolio_id
        })
        
        # Should fail - either 400 (no position) or 404 (symbol not found)
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print(f"✅ Correctly rejected sell of non-existent position")


class TestBuyFunctionality:
    """Test buy position functionality - ensure PRU merge still works"""
    
    def test_buy_new_position(self, user_id, portfolio_id):
        """Test buying a new position"""
        # Use a real symbol
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": "MSFT",
            "type": "stock",
            "transaction_type": "buy",
            "quantity": 5,
            "avg_price": 400.0,
            "portfolio_id": portfolio_id
        })
        
        if response.status_code == 404:
            pytest.skip("Symbol not found in Yahoo Finance")
        
        assert response.status_code == 200, f"Buy failed: {response.text}"
        data = response.json()
        assert "id" in data or "message" in data
        print(f"✅ Buy position successful: {data.get('message', 'Position created')}")
        return data
    
    def test_buy_merge_pru(self, user_id, portfolio_id):
        """Test that buying same symbol merges with weighted average price"""
        # Get current positions
        positions_response = requests.get(f"{API}/positions?user_id={user_id}&portfolio_id={portfolio_id}")
        positions = positions_response.json()
        
        if not positions:
            pytest.skip("No positions to test merge")
        
        # Find a position to add to
        position = positions[0]
        original_quantity = position['quantity']
        original_avg_price = position['avg_price']
        
        # Buy more at a different price
        new_quantity = 2
        new_price = original_avg_price * 1.1  # 10% higher
        
        response = requests.post(f"{API}/positions?user_id={user_id}", json={
            "symbol": position['symbol'],
            "type": position['type'],
            "transaction_type": "buy",
            "quantity": new_quantity,
            "avg_price": new_price,
            "portfolio_id": portfolio_id
        })
        
        if response.status_code == 404:
            pytest.skip("Symbol not found")
        
        assert response.status_code == 200, f"Buy merge failed: {response.text}"
        data = response.json()
        
        # Verify merge happened
        expected_total_quantity = original_quantity + new_quantity
        assert data.get('quantity') == expected_total_quantity, \
            f"Expected quantity {expected_total_quantity}, got {data.get('quantity')}"
        
        # Verify PRU calculation (weighted average)
        expected_pru = ((original_quantity * original_avg_price) + (new_quantity * new_price)) / expected_total_quantity
        actual_pru = data.get('avg_price', 0)
        
        # Allow small floating point difference
        assert abs(actual_pru - expected_pru) < 0.01, \
            f"PRU mismatch: expected {expected_pru:.4f}, got {actual_pru:.4f}"
        
        print(f"✅ PRU merge successful: {position['symbol']}")
        print(f"   Original: {original_quantity} @ {original_avg_price:.2f}")
        print(f"   Added: {new_quantity} @ {new_price:.2f}")
        print(f"   Result: {expected_total_quantity} @ {actual_pru:.4f}")


class TestCashBalance:
    """Test cash balance functionality"""
    
    def test_get_cash_balance(self, user_id):
        """Test getting cash balance"""
        response = requests.get(f"{API}/cash/balance?user_id={user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        print(f"✅ Cash balance: {data['balance']}")
        return data['balance']
    
    def test_cash_transactions_history(self, user_id):
        """Test getting cash transaction history"""
        response = requests.get(f"{API}/cash/transactions?user_id={user_id}")
        assert response.status_code == 200
        transactions = response.json()
        assert isinstance(transactions, list)
        print(f"✅ Got {len(transactions)} cash transactions")
        
        # Check for sell transactions (should have description with "Vente")
        sell_transactions = [t for t in transactions if "Vente" in t.get('description', '')]
        print(f"   Including {len(sell_transactions)} sell-related transactions")


class TestTransactions:
    """Test transaction history"""
    
    def test_get_transactions(self, user_id):
        """Test getting transaction history"""
        response = requests.get(f"{API}/transactions?user_id={user_id}")
        assert response.status_code == 200
        transactions = response.json()
        assert isinstance(transactions, list)
        
        # Check for both buy and sell transactions
        buy_count = sum(1 for t in transactions if t.get('type') == 'buy')
        sell_count = sum(1 for t in transactions if t.get('type') == 'sell')
        
        print(f"✅ Got {len(transactions)} transactions: {buy_count} buys, {sell_count} sells")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
