import React, { useState } from 'react';
import { Download, Target } from 'lucide-react';
import { portfolioAPI, storage } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Tools = () => {
  const [activeTab, setActiveTab] = useState('export');
  const [simulation, setSimulation] = useState({ symbol: '', amount: '', result: null });
  const [loading, setLoading] = useState(false);

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      const positions = await portfolioAPI.getPositions(userId);
      const transactions = await axios.get(`${API}/transactions?user_id=${userId}`);

      let csv = 'Type,Symbole,Nom,Quantité,Prix Moyen,Valeur Actuelle,Gain/Perte,Bêta,Volatilité\n';
      positions.forEach(pos => {
        csv += `Position,${pos.symbol},${pos.name},${pos.quantity},${pos.avg_price},${pos.total_value},${pos.gain_loss},${pos.beta},${pos.volatility}\n`;
      });

      csv += '\n\nType,Symbole,Quantité,Prix,Total,Date\n';
      transactions.data.forEach(t => {
        csv += `${t.type},${t.symbol},${t.quantity},${t.price},${t.total},${new Date(t.date).toLocaleDateString('fr-FR')}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Erreur lors de l\'export');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulation = async () => {
    try {
      setLoading(true);
      
      // Get current portfolio value
      const positions = await portfolioAPI.getPositions(userId);
      const currentPortfolioValue = positions.reduce((sum, pos) => sum + (pos.total_value || 0), 0);
      
      // Get quote for the symbol
      const quote = await axios.get(`${API}/market/quote/${simulation.symbol}`);
      const currentPrice = quote.data.price;
      const quantity = parseFloat(simulation.amount) / currentPrice;
      const investmentAmount = parseFloat(simulation.amount);
      
      // Calculate new portfolio value and percentage
      const newPortfolioValue = currentPortfolioValue + investmentAmount;
      const percentageOfPortfolio = (investmentAmount / newPortfolioValue) * 100;

      setSimulation({
        ...simulation,
        result: {
          symbol: simulation.symbol,
          quantity: quantity.toFixed(4),
          currentPrice: currentPrice,
          totalInvested: investmentAmount,
          estimatedValue: investmentAmount,
          currentPortfolioValue: currentPortfolioValue,
          newPortfolioValue: newPortfolioValue,
          percentageOfPortfolio: percentageOfPortfolio
        }
      });
    } catch (error) {
      console.error('Error running simulation:', error);
      alert('Symbole invalide ou erreur');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { value: 'export', label: 'Export', icon: Download },
    { value: 'simulation', label: 'Simulation', icon: Target }
  ];

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="display-md" style={{ marginBottom: '8px' }}>Outils</h1>
        <p className="body-md" style={{ color: 'var(--text-muted)' }}>Export et simulations</p>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                flex: '1',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                background: activeTab === tab.value ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === tab.value ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontSize: '15px',
                minWidth: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'export' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Exporter mes données</h2>
          
          <div style={{ maxWidth: '400px' }}>
            <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ marginBottom: '16px' }}>
                <Download size={32} color="var(--accent-primary)" />
              </div>
              <h3 className="h3" style={{ marginBottom: '8px' }}>Export CSV</h3>
              <p className="body-sm" style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                Téléchargez toutes vos positions et transactions au format CSV
              </p>
              <button 
                className="btn-primary" 
                onClick={handleExportCSV}
                disabled={loading}
                style={{ width: '100%' }}
                data-testid="export-csv-btn"
              >
                <Download size={18} />
                {loading ? 'Export en cours...' : 'Exporter en CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'simulation' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Simulation d'Investissement</h2>
          
          <div style={{ maxWidth: '600px' }}>
            <p className="body-md" style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              Simulez un investissement pour voir combien d'actions vous pourriez acheter
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Symbole du titre
                </label>
                <input
                  type="text"
                  placeholder="Ex: AAPL, MSFT"
                  value={simulation.symbol}
                  onChange={(e) => setSimulation({ ...simulation, symbol: e.target.value.toUpperCase() })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Montant à investir (€)
                </label>
                <input
                  type="number"
                  placeholder="Ex: 1000"
                  value={simulation.amount}
                  onChange={(e) => setSimulation({ ...simulation, amount: e.target.value })}
                  className="input-field"
                />
              </div>

              <button 
                className="btn-primary" 
                onClick={handleSimulation}
                disabled={loading || !simulation.symbol || !simulation.amount}
              >
                <Target size={18} />
                Simuler
              </button>
            </div>

            {simulation.result && (
              <div style={{ marginTop: '32px', padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                <h3 className="h3" style={{ marginBottom: '16px' }}>Résultat de la simulation</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Titre:</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{simulation.result.symbol}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Prix actuel:</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatCurrency(simulation.result.currentPrice)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Quantité:</span>
                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{simulation.result.quantity} actions</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total investi:</span>
                    <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--text-primary)' }}>{formatCurrency(simulation.result.totalInvested)}</span>
                  </div>
                </div>

                {/* Portfolio Impact Section */}
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid var(--accent-primary)' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--accent-primary)', marginBottom: '16px' }}>
                    📊 Impact sur votre portefeuille
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Portefeuille actuel:</span>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formatCurrency(simulation.result.currentPortfolioValue)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Après investissement:</span>
                      <span style={{ fontWeight: '600', color: 'var(--success)' }}>{formatCurrency(simulation.result.newPortfolioValue)}</span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '16px', 
                      background: 'var(--accent-bg)', 
                      borderRadius: '8px',
                      marginTop: '8px'
                    }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>% du portefeuille:</span>
                      <span style={{ fontWeight: '700', fontSize: '20px', color: 'var(--accent-primary)' }}>
                        {simulation.result.percentageOfPortfolio.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
