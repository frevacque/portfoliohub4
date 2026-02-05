# 🖥️ Installation de PortfolioHub sur Mac

Guide complet pour installer et utiliser PortfolioHub en local sur votre Mac.

---

## 📋 Prérequis à installer

### 1. Homebrew (gestionnaire de paquets Mac)
Ouvrez le **Terminal** et collez cette commande :
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Python 3.11+
```bash
brew install python@3.11
```

### 3. Node.js 18+
```bash
brew install node@18
```

### 4. MongoDB
```bash
brew tap mongodb/brew
brew install mongodb-community
```

### 5. Yarn (gestionnaire de paquets JavaScript)
```bash
npm install -g yarn
```

---

## 📥 Téléchargement du projet

### Option A : Télécharger depuis Emergent
1. Sur Emergent, cliquez sur **"Download Code"** (icône de téléchargement)
2. Décompressez le fichier ZIP
3. Déplacez le dossier où vous voulez (ex: `~/Documents/PortfolioHub`)

### Option B : Si vous avez Git
```bash
cd ~/Documents
git clone <votre-repo> PortfolioHub
```

---

## ⚙️ Configuration

### 1. Ouvrez le Terminal et allez dans le dossier du projet
```bash
cd ~/Documents/PortfolioHub
```

### 2. Configurez le Backend
```bash
cd backend

# Créez un environnement virtuel Python
python3 -m venv venv
source venv/bin/activate

# Installez les dépendances
pip install -r requirements.txt
```

### 3. Créez le fichier de configuration backend
Créez un fichier `backend/.env` avec ce contenu :
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=portfoliohub
```

### 4. Configurez le Frontend
```bash
cd ../frontend

# Installez les dépendances
yarn install
```

### 5. Créez le fichier de configuration frontend
Créez un fichier `frontend/.env` avec ce contenu :
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## 🚀 Démarrage de l'application

### Méthode Simple : Script automatique
Depuis le dossier principal du projet :
```bash
chmod +x start_local.sh
./start_local.sh
```

### Méthode Manuelle (3 terminaux)

**Terminal 1 - MongoDB :**
```bash
brew services start mongodb-community
```

**Terminal 2 - Backend :**
```bash
cd ~/Documents/PortfolioHub/backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 3 - Frontend :**
```bash
cd ~/Documents/PortfolioHub/frontend
yarn start
```

---

## 🌐 Accès à l'application

Une fois tout démarré, ouvrez votre navigateur :
- **Application** : http://localhost:3000
- **API Backend** : http://localhost:8001/api

---

## 🛑 Arrêt de l'application

### Avec le script :
Appuyez sur `Ctrl+C` dans le terminal

### Manuellement :
1. Fermez les terminaux du backend et frontend
2. Pour arrêter MongoDB :
```bash
brew services stop mongodb-community
```

---

## 🔄 Utilisation quotidienne

Chaque fois que vous voulez utiliser l'application :

```bash
cd ~/Documents/PortfolioHub
./start_local.sh
```

Puis ouvrez http://localhost:3000 dans votre navigateur.

---

## 🐛 Résolution de problèmes

### "Command not found: python3"
```bash
brew install python@3.11
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "MongoDB connection failed"
```bash
brew services restart mongodb-community
```

### "Port 3000 already in use"
```bash
lsof -ti:3000 | xargs kill -9
```

### "Port 8001 already in use"
```bash
lsof -ti:8001 | xargs kill -9
```

---

## 💾 Sauvegarde de vos données

Vos données sont stockées dans MongoDB. Pour les sauvegarder :

```bash
# Exporter
mongodump --db portfoliohub --out ~/Documents/backup_portfolio

# Restaurer
mongorestore --db portfoliohub ~/Documents/backup_portfolio/portfoliohub
```

---

## ✅ Checklist d'installation

- [ ] Homebrew installé
- [ ] Python 3.11+ installé
- [ ] Node.js 18+ installé
- [ ] MongoDB installé
- [ ] Yarn installé
- [ ] Projet téléchargé
- [ ] Dépendances backend installées
- [ ] Dépendances frontend installées
- [ ] Fichiers .env créés
- [ ] Application démarrée avec succès

---

## 📞 Support

Si vous rencontrez des problèmes, les erreurs les plus courantes sont liées à :
1. MongoDB qui n'est pas démarré
2. Les ports 3000 ou 8001 déjà utilisés
3. Les dépendances pas installées correctement

Vérifiez chaque étape de l'installation dans l'ordre.
