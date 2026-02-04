# Contracts API - PortfolioHub

## Backend Architecture

### Technologies
- FastAPI (Python)
- yfinance pour données Yahoo Finance
- MongoDB pour stockage
- numpy/pandas pour calculs financiers

### Collections MongoDB
1. **users** - Utilisateurs
2. **positions** - Positions du portefeuille
3. **transactions** - Historique des transactions

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion

### Portfolio Management
- `GET /api/portfolio/summary` - Résumé du portefeuille (valeur totale, gains, métriques)
- `GET /api/positions` - Liste des positions
- `POST /api/positions` - Ajouter une position
- `PUT /api/positions/{id}` - Modifier une position
- `DELETE /api/positions/{id}` - Supprimer une position

### Market Data (Yahoo Finance)
- `GET /api/market/quote/{symbol}` - Prix actuel d'un titre
- `GET /api/market/search?q={query}` - Rechercher un titre

### Financial Calculations
- `GET /api/analytics/volatility` - Volatilité (journalière, mensuelle, historique)
- `GET /api/analytics/correlation` - Matrice de corrélation
- `GET /api/analytics/beta` - Bêta du portefeuille et des positions
- `GET /api/analytics/recommendations` - Recommandations

### Transactions
- `GET /api/transactions` - Historique des transactions
- `POST /api/transactions` - Ajouter une transaction

---

## Data Models

### User
```python
{
  "id": str,
  "name": str,
  "email": str,
  "password_hash": str,
  "created_at": datetime
}
```

### Position
```python
{
  "id": str,
  "user_id": str,
  "symbol": str,  # Ex: AAPL, BTC-USD
  "name": str,
  "type": str,  # "stock" ou "crypto"
  "quantity": float,
  "avg_price": float,
  "created_at": datetime,
  "updated_at": datetime
}
```

### Transaction
```python
{
  "id": str,
  "user_id": str,
  "symbol": str,
  "type": str,  # "buy" ou "sell"
  "quantity": float,
  "price": float,
  "total": float,
  "date": datetime
}
```

---

## Calculs Financiers

### 1. Volatilité
- **Journalière**: Écart-type des rendements quotidiens × √252
- **Mensuelle**: Écart-type des rendements mensuels × √12
- **Historique**: Écart-type des rendements depuis le début

### 2. Bêta
- Bêta = Covariance(rendement_position, rendement_marché) / Variance(rendement_marché)
- Marché de référence: S&P 500 (^GSPC)

### 3. Corrélation
- Corrélation de Pearson entre les rendements de deux titres

### 4. Ratio de Sharpe
- (Rendement moyen - Taux sans risque) / Écart-type des rendements
- Taux sans risque: 0.02 (2%)

### 5. Métriques du Portefeuille
- Valeur totale = Σ(quantity × current_price)
- Gain/Perte = Valeur actuelle - Investissement initial
- Poids = Valeur position / Valeur totale × 100

---

## Intégration Frontend ↔ Backend

### Mock Data à Remplacer
- `mockData.js` sera remplacé par des appels API réels
- Les composants utiliseront `axios` pour les appels API
- Gestion d'état avec useState/useEffect

### Flux de Données
1. **Login** → POST /api/auth/login → Stocker token
2. **Dashboard** → GET /api/portfolio/summary → Afficher métriques
3. **Ajouter Position** → POST /api/positions → Créer transaction → Rafraîchir données
4. **Visualisation** → GET /api/analytics/* → Afficher graphiques/métriques

---

## Notes d'Implémentation

### Backend
- yfinance télécharge les données historiques (1 an pour calculs)
- Cache des données de marché (5 min) pour optimiser les appels
- Validation des symboles via yfinance
- Gestion des erreurs API Yahoo Finance

### Frontend
- Supprimer mockData.js après intégration
- Ajouter loading states
- Gestion des erreurs API
- Token JWT pour authentification
