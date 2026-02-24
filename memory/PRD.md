# PortfolioHub - Product Requirements Document

## Overview
Application de gestion de portefeuille financier permettant de suivre et analyser des investissements en actions, ETF et cryptomonnaies.

## Core Features

### 1. Gestion Multi-Portefeuilles
- Création et gestion de plusieurs portefeuilles
- Sélection du portefeuille actif
- Données cohérentes entre Dashboard et page Positions

### 2. Types d'Actifs Supportés
- **Actions** (stock) - Badge vert "Action"
- **ETF** (etf) - Badge jaune "ETF" - *Ajouté le 12/02/2026*
- **Cryptomonnaies** (crypto) - Badge bleu "Crypto"

### 3. Transactions
- **Achat** : Création de position ou fusion avec position existante (calcul PRU pondéré)
- **Vente** : Réduction de quantité ou suppression complète de position
  - Mise à jour automatique du solde cash
  - Création automatique d'une transaction cash

### 4. Analytics & Métriques
- Performance globale du portefeuille
- Volatilité (historique et réalisée)
- Bêta du portefeuille
- Ratio de Sharpe avec RFR personnalisable
- Matrice de corrélation entre positions

### 5. Système d'Alertes
- Alertes de prix (au-dessus/en-dessous d'un seuil)
- Notifications pop-up sur le Dashboard
- Acquittement des alertes

### 6. Gestion Cash
- Suivi du solde espèces
- Historique des transactions cash
- Mise à jour automatique lors des ventes

## Technical Stack
- **Frontend**: React, TailwindCSS, Shadcn UI, Recharts
- **Backend**: FastAPI, Pydantic, Motor (async MongoDB)
- **Database**: MongoDB
- **Data Source**: Yahoo Finance (yfinance)

## What's Been Implemented

### Session 25/02/2026
1. ✅ **Correction Bug P0 - Graphiques de performance avec crypto**
   - **Problème**: L'ajout de cryptomonnaies (ex: BTC-EUR) cassait les graphiques de performance, provoquant des chutes brutales à zéro
   - **Cause**: Mauvais alignement temporel entre crypto (trading 24/7) et actions (jours ouvrés uniquement)
   - **Solution**: Utilisation de pandas DataFrame avec forward-fill pour aligner correctement les séries temporelles
   - **Fichier modifié**: `/app/backend/utils/performance_service.py`
   - **Tests**: 24 tests passent, validation complète sur toutes les périodes (1m, 3m, 6m, 1y, ytd, all)

2. ✅ **Portefeuilles Complètement Indépendants**
   - **Demande**: Chaque portefeuille doit être totalement indépendant avec ses propres versements de capital, comptes cash et calculs de performance
   - **Modifications**:
     - API `/api/capital` : ajout du paramètre `portfolio_id` pour les versements
     - API `/api/cash-accounts` : ajout du paramètre `portfolio_id` pour les comptes cash
     - API `/api/portfolio/summary` : calcul de performance basé sur le capital du portefeuille spécifique
   - **Frontend**: Positions.jsx passe `portfolioId` aux modals de gestion cash et capital
   - **Nettoyage**: Suppression des anciennes données sans `portfolio_id`
   - **Tests**: 13 tests d'isolation backend passent + validation frontend

### Session 12/02/2026
1. ✅ **Correction Bug P0 - Incohérence des données**
   - Dashboard et page Positions utilisent maintenant le même `portfolio_id` actif
   - Affichage du nom du portefeuille actif dans les deux pages

2. ✅ **Correction Bug P0 - Fonctionnalité de Vente**
   - Modal de transaction avec sélecteur Achat/Vente
   - Vente partielle (réduction quantité, PRU conservé)
   - Vente totale (suppression position)
   - Validation quantité (erreur si vente > quantité détenue)
   - Mise à jour automatique du solde cash
   - Création automatique de transaction cash

3. ✅ **Ajout Support ETF**
   - Nouveau type d'actif "ETF" dans le sélecteur
   - Badge distinctif jaune/orange pour les ETF
   - Aide contextuelle avec exemples (SPY, QQQ, VTI, IWDA.AS)

## Upcoming Tasks (P1)
- **Historique des modifications** : Journal de toutes les transactions par actif
- **Rappels de rééquilibrage** : Suggestions basées sur allocations cibles

## Future Tasks (P2)
- Watchlist (surveillance de titres hors portefeuille)
- Rapports PDF exportables
- Optimisation fiscale (calcul plus/moins-values)

## Known Issues
- Chargement lent des pages (~10s) dû aux appels Yahoo Finance synchrones
  - Suggestion: Implémenter du caching ou des appels asynchrones

## Test Credentials
- **Email**: testcrypto@test.com
- **Password**: test123
- **User ID**: c30befea-7024-4e34-a0d5-dd8a6740917d
- **Positions**: BTC-EUR (0.1 unités), AAPL (10 unités)

## API Endpoints Clés
- `POST /api/positions` - Achat/Vente de positions
- `GET /api/positions?portfolio_id=X` - Liste positions filtrées
- `GET /api/portfolio/summary?portfolio_id=X` - Résumé portefeuille filtré
- `GET/POST /api/cash/transaction` - Gestion cash
- `GET/POST /api/alerts` - Gestion alertes

## Database Collections
- `users` - Comptes utilisateurs
- `portfolios` - Portefeuilles
- `positions` - Positions (symbol, quantity, avg_price, type)
- `transactions` - Historique transactions
- `cash_transactions` - Transactions cash
- `cash_balances` - Soldes cash
- `alerts` - Alertes de prix
- `user_settings` - Paramètres (RFR, etc.)
