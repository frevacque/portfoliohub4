#!/usr/bin/env python3
"""
Comprehensive Backend API Tests for PortfolioHub
Tests all endpoints with real Yahoo Finance data integration
"""

import requests
import json
import time
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://crypto-fix-7.preview.emergentagent.com/api"
TEST_USER = {
    "name": "Jean Dupont",
    "email": "jean.dupont@example.com",
    "password": "SecurePassword123!"
}

# Test positions with real symbols
TEST_POSITIONS = [
    {
        "symbol": "AAPL",
        "type": "stock",
        "quantity": 10,
        "avg_price": 150.0
    },
    {
        "symbol": "MSFT", 
        "type": "stock",
        "quantity": 5,
        "avg_price": 300.0
    },
    {
        "symbol": "BTC-USD",
        "type": "crypto",
        "quantity": 0.1,
        "avg_price": 40000.0
    }
]

class PortfolioHubTester:
    def __init__(self):
        self.user_id = None
        self.position_ids = []
        self.session = requests.Session()
        self.test_results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
    def log_result(self, test_name: str, success: bool, message: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if message:
            print(f"   {message}")
        
        if success:
            self.test_results["passed"] += 1
        else:
            self.test_results["failed"] += 1
            self.test_results["errors"].append(f"{test_name}: {message}")
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None) -> tuple:
        """Make HTTP request and return response and success status"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, params=params)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, params=params)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, params=params)
            else:
                return None, False, f"Unsupported method: {method}"
            
            return response, True, ""
        except Exception as e:
            return None, False, str(e)
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        print("\n=== Testing Root Endpoint ===")
        
        response, success, error = self.make_request("GET", "/")
        
        if not success:
            self.log_result("Root endpoint connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                data = response.json()
                if "message" in data:
                    self.log_result("Root endpoint", True, f"Message: {data['message']}")
                    return True
                else:
                    self.log_result("Root endpoint", False, "No message in response")
                    return False
            except:
                self.log_result("Root endpoint", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Root endpoint", False, f"Status: {response.status_code}")
            return False
    
    def test_user_registration(self):
        """Test user registration"""
        print("\n=== Testing User Registration ===")
        
        response, success, error = self.make_request("POST", "/auth/register", TEST_USER)
        
        if not success:
            self.log_result("User registration connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                data = response.json()
                if "id" in data and "email" in data:
                    self.user_id = data["id"]
                    self.log_result("User registration", True, f"User ID: {self.user_id}")
                    return True
                else:
                    self.log_result("User registration", False, "Missing user data in response")
                    return False
            except:
                self.log_result("User registration", False, "Invalid JSON response")
                return False
        elif response.status_code == 400:
            # User might already exist, try login
            self.log_result("User registration", True, "User already exists (expected)")
            return True
        else:
            self.log_result("User registration", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_user_login(self):
        """Test user login"""
        print("\n=== Testing User Login ===")
        
        login_data = {
            "email": TEST_USER["email"],
            "password": TEST_USER["password"]
        }
        
        response, success, error = self.make_request("POST", "/auth/login", login_data)
        
        if not success:
            self.log_result("User login connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                data = response.json()
                if "id" in data:
                    self.user_id = data["id"]
                    self.log_result("User login", True, f"User ID: {self.user_id}")
                    return True
                else:
                    self.log_result("User login", False, "Missing user ID in response")
                    return False
            except:
                self.log_result("User login", False, "Invalid JSON response")
                return False
        else:
            self.log_result("User login", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_add_positions(self):
        """Test adding positions"""
        print("\n=== Testing Add Positions ===")
        
        if not self.user_id:
            self.log_result("Add positions", False, "No user ID available")
            return False
        
        for i, position in enumerate(TEST_POSITIONS):
            response, success, error = self.make_request(
                "POST", 
                "/positions", 
                position, 
                {"user_id": self.user_id}
            )
            
            if not success:
                self.log_result(f"Add position {position['symbol']}", False, f"Connection error: {error}")
                continue
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "id" in data and "symbol" in data:
                        self.position_ids.append(data["id"])
                        self.log_result(
                            f"Add position {position['symbol']}", 
                            True, 
                            f"Position ID: {data['id']}, Name: {data.get('name', 'N/A')}"
                        )
                    else:
                        self.log_result(f"Add position {position['symbol']}", False, "Missing position data")
                except:
                    self.log_result(f"Add position {position['symbol']}", False, "Invalid JSON response")
            else:
                self.log_result(
                    f"Add position {position['symbol']}", 
                    False, 
                    f"Status: {response.status_code}, Response: {response.text}"
                )
        
        return len(self.position_ids) > 0
    
    def test_get_positions(self):
        """Test getting positions with metrics"""
        print("\n=== Testing Get Positions ===")
        
        if not self.user_id:
            self.log_result("Get positions", False, "No user ID available")
            return False
        
        response, success, error = self.make_request(
            "GET", 
            "/positions", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Get positions connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                positions = response.json()
                if isinstance(positions, list):
                    self.log_result("Get positions", True, f"Retrieved {len(positions)} positions")
                    
                    # Verify metrics are calculated
                    for pos in positions:
                        symbol = pos.get('symbol', 'Unknown')
                        has_metrics = all(key in pos for key in [
                            'current_price', 'total_value', 'gain_loss', 
                            'beta', 'volatility'
                        ])
                        
                        if has_metrics:
                            self.log_result(
                                f"Position metrics {symbol}", 
                                True, 
                                f"Price: ${pos['current_price']}, Beta: {pos['beta']}, Vol: {pos['volatility']}%"
                            )
                        else:
                            self.log_result(f"Position metrics {symbol}", False, "Missing metrics")
                    
                    return True
                else:
                    self.log_result("Get positions", False, "Response is not a list")
                    return False
            except Exception as e:
                self.log_result("Get positions", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Get positions", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_portfolio_summary(self):
        """Test portfolio summary with metrics"""
        print("\n=== Testing Portfolio Summary ===")
        
        if not self.user_id:
            self.log_result("Portfolio summary", False, "No user ID available")
            return False
        
        response, success, error = self.make_request(
            "GET", 
            "/portfolio/summary", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Portfolio summary connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                summary = response.json()
                required_fields = [
                    'total_value', 'total_invested', 'total_gain_loss', 
                    'volatility', 'beta', 'sharpe_ratio'
                ]
                
                missing_fields = [field for field in required_fields if field not in summary]
                
                if not missing_fields:
                    self.log_result(
                        "Portfolio summary", 
                        True, 
                        f"Value: ${summary['total_value']}, Beta: {summary['beta']}, Sharpe: {summary['sharpe_ratio']}"
                    )
                    
                    # Check volatility structure
                    volatility = summary.get('volatility', {})
                    if isinstance(volatility, dict) and all(key in volatility for key in ['daily', 'monthly', 'historical']):
                        self.log_result(
                            "Portfolio volatility", 
                            True, 
                            f"Daily: {volatility['daily']}%, Monthly: {volatility['monthly']}%, Historical: {volatility['historical']}%"
                        )
                    else:
                        self.log_result("Portfolio volatility", False, "Invalid volatility structure")
                    
                    return True
                else:
                    self.log_result("Portfolio summary", False, f"Missing fields: {missing_fields}")
                    return False
            except Exception as e:
                self.log_result("Portfolio summary", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Portfolio summary", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_correlation_matrix(self):
        """Test correlation matrix"""
        print("\n=== Testing Correlation Matrix ===")
        
        if not self.user_id:
            self.log_result("Correlation matrix", False, "No user ID available")
            return False
        
        response, success, error = self.make_request(
            "GET", 
            "/analytics/correlation", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Correlation matrix connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                correlations = response.json()
                if isinstance(correlations, list):
                    self.log_result("Correlation matrix", True, f"Retrieved {len(correlations)} correlations")
                    
                    # Verify correlation structure
                    for corr in correlations:
                        if all(key in corr for key in ['symbol1', 'symbol2', 'correlation']):
                            self.log_result(
                                f"Correlation {corr['symbol1']}-{corr['symbol2']}", 
                                True, 
                                f"Correlation: {corr['correlation']}"
                            )
                        else:
                            self.log_result("Correlation structure", False, "Invalid correlation format")
                    
                    return True
                else:
                    self.log_result("Correlation matrix", False, "Response is not a list")
                    return False
            except Exception as e:
                self.log_result("Correlation matrix", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Correlation matrix", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_recommendations(self):
        """Test portfolio recommendations"""
        print("\n=== Testing Recommendations ===")
        
        if not self.user_id:
            self.log_result("Recommendations", False, "No user ID available")
            return False
        
        response, success, error = self.make_request(
            "GET", 
            "/analytics/recommendations", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Recommendations connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                recommendations = response.json()
                if isinstance(recommendations, list):
                    self.log_result("Recommendations", True, f"Retrieved {len(recommendations)} recommendations")
                    
                    # Verify recommendation structure
                    for rec in recommendations:
                        if all(key in rec for key in ['type', 'title', 'description', 'priority']):
                            self.log_result(
                                f"Recommendation {rec['type']}", 
                                True, 
                                f"{rec['title']} - {rec['priority']} priority"
                            )
                        else:
                            self.log_result("Recommendation structure", False, "Invalid recommendation format")
                    
                    return True
                else:
                    self.log_result("Recommendations", False, "Response is not a list")
                    return False
            except Exception as e:
                self.log_result("Recommendations", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Recommendations", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_transactions(self):
        """Test transaction history"""
        print("\n=== Testing Transactions ===")
        
        if not self.user_id:
            self.log_result("Transactions", False, "No user ID available")
            return False
        
        response, success, error = self.make_request(
            "GET", 
            "/transactions", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Transactions connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                transactions = response.json()
                if isinstance(transactions, list):
                    self.log_result("Transactions", True, f"Retrieved {len(transactions)} transactions")
                    
                    # Verify transaction structure
                    for txn in transactions:
                        if all(key in txn for key in ['symbol', 'type', 'quantity', 'price', 'total']):
                            self.log_result(
                                f"Transaction {txn['symbol']}", 
                                True, 
                                f"{txn['type']} {txn['quantity']} @ ${txn['price']}"
                            )
                        else:
                            self.log_result("Transaction structure", False, "Invalid transaction format")
                    
                    return True
                else:
                    self.log_result("Transactions", False, "Response is not a list")
                    return False
            except Exception as e:
                self.log_result("Transactions", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Transactions", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_market_quote(self):
        """Test market data endpoint"""
        print("\n=== Testing Market Quote ===")
        
        response, success, error = self.make_request("GET", "/market/quote/AAPL")
        
        if not success:
            self.log_result("Market quote connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                quote = response.json()
                if all(key in quote for key in ['symbol', 'name', 'price']):
                    self.log_result(
                        "Market quote AAPL", 
                        True, 
                        f"{quote['name']}: ${quote['price']}"
                    )
                    return True
                else:
                    self.log_result("Market quote", False, "Missing quote data")
                    return False
            except Exception as e:
                self.log_result("Market quote", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Market quote", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def test_delete_position(self):
        """Test deleting a position"""
        print("\n=== Testing Delete Position ===")
        
        if not self.user_id or not self.position_ids:
            self.log_result("Delete position", False, "No user ID or position IDs available")
            return False
        
        # Delete the first position
        position_id = self.position_ids[0]
        response, success, error = self.make_request(
            "DELETE", 
            f"/positions/{position_id}", 
            params={"user_id": self.user_id}
        )
        
        if not success:
            self.log_result("Delete position connection", False, f"Connection error: {error}")
            return False
        
        if response.status_code == 200:
            try:
                result = response.json()
                if "message" in result:
                    self.log_result("Delete position", True, result["message"])
                    return True
                else:
                    self.log_result("Delete position", False, "No message in response")
                    return False
            except Exception as e:
                self.log_result("Delete position", False, f"JSON parsing error: {str(e)}")
                return False
        else:
            self.log_result("Delete position", False, f"Status: {response.status_code}, Response: {response.text}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting PortfolioHub Backend API Tests")
        print(f"🎯 Testing against: {BASE_URL}")
        
        # Test sequence
        tests = [
            self.test_root_endpoint,
            self.test_user_registration,
            self.test_user_login,
            self.test_add_positions,
            self.test_get_positions,
            self.test_portfolio_summary,
            self.test_correlation_matrix,
            self.test_recommendations,
            self.test_transactions,
            self.test_market_quote,
            self.test_delete_position
        ]
        
        for test in tests:
            try:
                test()
                time.sleep(1)  # Small delay between tests
            except Exception as e:
                self.log_result(test.__name__, False, f"Test exception: {str(e)}")
        
        # Print summary
        print("\n" + "="*50)
        print("📊 TEST SUMMARY")
        print("="*50)
        print(f"✅ Passed: {self.test_results['passed']}")
        print(f"❌ Failed: {self.test_results['failed']}")
        
        if self.test_results['errors']:
            print("\n🔍 FAILED TESTS:")
            for error in self.test_results['errors']:
                print(f"   • {error}")
        
        success_rate = (self.test_results['passed'] / (self.test_results['passed'] + self.test_results['failed'])) * 100
        print(f"\n📈 Success Rate: {success_rate:.1f}%")
        
        return self.test_results['failed'] == 0

if __name__ == "__main__":
    tester = PortfolioHubTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed! Backend is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the details above.")