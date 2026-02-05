import React, { useState, useRef } from 'react';
import { Download, Upload, FileText, Calendar, DollarSign, Target, TrendingUp, X, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { portfolioAPI, storage } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Tools = () => {
  const [activeTab, setActiveTab] = useState('export');
  const [budget, setBudget] = useState(null);
  const [newBudget, setNewBudget] = useState({ monthly_amount: '', start_date: new Date().toISOString().split('T')[0] });
  const [simulation, setSimulation] = useState({ symbol: '', amount: '', result: null });
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      setLoading(true);
      const positions = await portfolioAPI.getPositions(userId);
      const transactions = await axios.get(`${API}/transactions?user_id=${userId}`);

      // Create CSV content
      let csv = 'Type,Symbole,Nom,Quantité,Prix Moyen,Valeur Actuelle,Gain/Perte,Bêta,Volatilité\n';
      positions.forEach(pos => {
        csv += `Position,${pos.symbol},${pos.name},${pos.quantity},${pos.avg_price},${pos.total_value},${pos.gain_loss},${pos.beta},${pos.volatility}\n`;
      });

      csv += '\n\nType,Symbole,Quantité,Prix,Total,Date\n';
      transactions.data.forEach(t => {
        csv += `${t.type},${t.symbol},${t.quantity},${t.price},${t.total},${new Date(t.date).toLocaleDateString('fr-FR')}\n`;
      });

      // Download
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

  // Create/Update Budget
  const handleSaveBudget = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API}/budget?user_id=${userId}`,
        {
          monthly_amount: parseFloat(newBudget.monthly_amount),
          start_date: new Date(newBudget.start_date).toISOString()
        }
      );
      setBudget(response.data);
      alert('Budget enregistré!');
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  // Run Simulation
  const handleSimulation = async () => {
    try {
      setLoading(true);
      // Get current price
      const quote = await axios.get(`${API}/market/quote/${simulation.symbol}`);
      const currentPrice = quote.data.price;
      const quantity = parseFloat(simulation.amount) / currentPrice;

      setSimulation({
        ...simulation,
        result: {
          symbol: simulation.symbol,
          quantity: quantity.toFixed(4),
          currentPrice: currentPrice,
          totalInvested: parseFloat(simulation.amount),
          estimatedValue: parseFloat(simulation.amount) // Same at purchase
        }
      });
    } catch (error) {
      console.error('Error running simulation:', error);
      alert('Symbole invalide ou erreur');
    } finally {
      setLoading(false);
    }
  };

  // Import CSV
  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      setImportResult(null);
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      const positions = [];
      let headers = [];
      let headerFound = false;
      
      lines.forEach((line, lineIndex) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        
        if (!headerFound) {
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('symbol') || lowerLine.includes('symbole')) {
            headers = values.map(h => h.toLowerCase());
            headerFound = true;
            return;
          }
        }
        
        if (headerFound && values.length >= 2) {
          const symbolIdx = headers.findIndex(h => h.includes('symbol') || h.includes('symbole'));
          const qtyIdx = headers.findIndex(h => h.includes('quant'));
          const priceIdx = headers.findIndex(h => h.includes('prix') || h.includes('price') || h.includes('pru'));
          
          if (symbolIdx >= 0 && qtyIdx >= 0 && priceIdx >= 0) {
            const symbol = values[symbolIdx];
            const quantity = values[qtyIdx];
            const avgPrice = values[priceIdx];
            
            if (symbol && quantity && avgPrice) {
              positions.push({
                symbol: symbol,
                quantity: quantity,
                avg_price: avgPrice,
                type: 'stock'
              });
            }
          }
        }
      });
      
      if (positions.length === 0) {
        setImportResult({
          success: false,
          message: 'Aucune position valide trouvée. Colonnes requises: Symbole, Quantité, Prix'
        });
        return;
      }
      
      // Send to API
      const response = await axios.post(`${API}/import/csv?user_id=${userId}`, positions);
      setImportResult({
        success: true,
        message: response.data.message,
        errors: response.data.errors
      });
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error importing CSV:', error);
      setImportResult({
        success: false,
        message: 'Erreur lors de l\'import: ' + (error.response?.data?.detail || error.message)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 className="display-md" style={{ marginBottom: '8px' }}>Outils</h1>
        <p className="body-md" style={{ color: 'var(--text-muted)' }}>Export, budget, et simulations</p>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', flexWrap: 'wrap' }}>
          {[
            { value: 'export', label: 'Export/Import', icon: Download },
            { value: 'budget', label: 'Budget', icon: DollarSign },
            { value: 'simulation', label: 'Simulation', icon: Target }
          ].map(tab => (
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

      {/* Export/Import Tab */}
      {activeTab === 'export' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Export & Import</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {/* Export */}
            <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ marginBottom: '16px' }}>
                <Download size={32} color="var(--accent-primary)" />
              </div>
              <h3 className="h3" style={{ marginBottom: '8px' }}>Exporter mes données</h3>
              <p className="body-sm" style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                Téléchargez toutes vos positions et transactions au format CSV
              </p>
              <button 
                className="btn-primary" 
                onClick={handleExportCSV}
                disabled={loading}
                style={{ width: '100%' }}
              >
                <Download size={18} />
                {loading ? 'Export en cours...' : 'Exporter en CSV'}
              </button>
            </div>

            {/* Import */}
            <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ marginBottom: '16px' }}>
                <Upload size={32} color="var(--accent-primary)" />
              </div>
              <h3 className="h3" style={{ marginBottom: '8px' }}>Importer des données</h3>
              <p className="body-sm" style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                Importez vos positions depuis un fichier CSV. Format requis: Symbole, Quantité, Prix
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                style={{ display: 'none' }}
              />
              <button 
                className="btn-secondary" 
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                style={{ width: '100%' }}
              >
                <Upload size={18} />
                {loading ? 'Import en cours...' : 'Importer un CSV'}
              </button>
              
              {importResult && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  borderRadius: '8px',
                  background: importResult.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: `1px solid ${importResult.success ? 'var(--success)' : 'var(--danger)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {importResult.success ? (
                      <CheckCircle size={18} color="var(--success)" />
                    ) : (
                      <AlertCircle size={18} color="var(--danger)" />
                    )}
                    <span style={{ color: importResult.success ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                      {importResult.success ? 'Import réussi' : 'Erreur'}
                    </span>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{importResult.message}</p>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <ul style={{ marginTop: '8px', paddingLeft: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Budget d'Investissement</h2>
          
          <div style={{ maxWidth: '600px' }}>
            <p className="body-md" style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              Définissez votre budget mensuel pour suivre vos investissements
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Montant mensuel (€)
                </label>
                <input
                  type="number"
                  placeholder="Ex: 500"
                  value={newBudget.monthly_amount}
                  onChange={(e) => setNewBudget({ ...newBudget, monthly_amount: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Date de début
                </label>
                <input
                  type="date"
                  value={newBudget.start_date}
                  onChange={(e) => setNewBudget({ ...newBudget, start_date: e.target.value })}
                  className="input-field"
                />
              </div>

              <button 
                className="btn-primary" 
                onClick={handleSaveBudget}
                disabled={loading || !newBudget.monthly_amount}
              >
                <DollarSign size={18} />
                Enregistrer le budget
              </button>
            </div>

            {budget && (
              <div style={{ marginTop: '32px', padding: '20px', background: 'var(--success-bg)', borderRadius: '12px', border: '1px solid var(--success)' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Budget actif
                </div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success)' }}>
                  {formatCurrency(budget.monthly_amount)} / mois
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulation Tab */}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
