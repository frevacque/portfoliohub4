#!/bin/bash

# Script de lancement PortfolioHub (macOS/Linux)
# Usage: ./start.sh

echo "🚀 Démarrage de PortfolioHub..."
echo ""

# Vérifier MongoDB
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB n'est pas en cours d'exécution"
    echo "Démarrage de MongoDB..."
    
    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start mongodb-community
    # Linux
    else
        sudo systemctl start mongod
    fi
    
    sleep 3
fi

echo "✅ MongoDB actif"
echo ""

# Démarrer le backend
echo "🔧 Démarrage du backend..."
cd "$(dirname "$0")/backend"
python3 -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Attendre que le backend soit prêt
sleep 5

# Démarrer le frontend
echo "🎨 Démarrage du frontend..."
cd ../frontend
npm start &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ Application lancée avec succès!"
echo ""
echo "📊 Accédez à l'application: http://localhost:3000"
echo ""
echo "Pour arrêter l'application:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "  ou appuyez sur Ctrl+C dans ce terminal"
echo ""

# Garder le script actif
wait $BACKEND_PID $FRONTEND_PID
