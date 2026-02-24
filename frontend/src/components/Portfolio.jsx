import React, { useState, useEffect } from 'react';
import { Plus, Search, TrendingUp, TrendingDown, X, Trash2, Calendar, Briefcase, StickyNote, Save, Merge, Wallet, DollarSign, History } from 'lucide-react';
import { portfolioAPI, analyticsAPI, storage, portfoliosAPI } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Devises disponibles
const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dollar US' },
  { code: 'GBP', symbol: '£', label: 'Livre Sterling' },
  { code: 'CHF', symbol: 'CHF', label: 'Franc Suisse' },
];

const Portfolio = () => {
  const [positions, setPositions] = useState([]);
  const [correlations, setCorrelations] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [linkToCash, setLinkToCash] = useState(false);
  const [selectedCashCurrency, setSelectedCashCurrency] = useState('EUR');
  const [capitalData, setCapitalData] = useState({ net_capital: 0, total_deposits: 0, total_withdrawals: 0, contributions: [] });
  const [showCapitalModal, setShowCapitalModal] = useState(false);
  const [formData, setFormData] = useState({
    symbol: '',
    type: 'stock',
    transaction_type: 'buy', // 'buy' or 'sell'
    quantity: '',
    avg_price: '',
    purchase_date: new Date().toISOString().split('T')[0]
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const fetchData = async () => {
    try {
      // Get portfolios first
      const portfoliosData = await portfoliosAPI.getAll(userId);
      setPortfolios(portfoliosData);
      
      // Get active portfolio from localStorage or use first one
      const activePortfolioId = storage.getActivePortfolioId();
      let currentPortfolio = portfoliosData.find(p => p.id === activePortfolioId);
      if (!currentPortfolio && portfoliosData.length > 0) {
        currentPortfolio = portfoliosData[0];
        storage.setActivePortfolioId(currentPortfolio.id);
      }
      setActivePortfolio(currentPortfolio);
      
      // Get positions, correlations, cash accounts and capital for the active portfolio
      const portfolioIdParam = currentPortfolio?.id ? `&portfolio_id=${currentPortfolio.id}` : '';
      const [positionsData, correlationsData, cashData, capitalResponse] = await Promise.all([
        portfolioAPI.getPositions(userId, currentPortfolio?.id),
        analyticsAPI.getCorrelation(userId),
        axios.get(`${API}/cash-accounts?user_id=${userId}${portfolioIdParam}`),
        axios.get(`${API}/capital?user_id=${userId}${portfolioIdParam}`)
      ]);
      setPositions(positionsData);
      setCorrelations(correlationsData);
      setCashAccounts(cashData.data || []);
      setCapitalData(capitalResponse.data);
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddPosition = async () => {
    if (!formData.symbol || !formData.quantity || !formData.avg_price) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await axios.post(`${API}/positions?user_id=${userId}`, {
        symbol: formData.symbol.toUpperCase(),
        type: formData.type,
        transaction_type: formData.transaction_type,
        quantity: parseFloat(formData.quantity),
        avg_price: parseFloat(formData.avg_price),
        purchase_date: new Date(formData.purchase_date).toISOString(),
        portfolio_id: activePortfolio?.id || null,
        link_to_cash: linkToCash,
        cash_currency: linkToCash ? selectedCashCurrency : null
      });

      // Refresh data
      await fetchData();

      // Show success message if it's a merge or sell
      if (response.data.message) {
        setSuccessMessage(response.data.message);
        setTimeout(() => setSuccessMessage(''), 5000);
      }

      setShowAddModal(false);
      setFormData({ 
        symbol: '', 
        type: 'stock', 
        transaction_type: 'buy',
        quantity: '', 
        avg_price: '',
        purchase_date: new Date().toISOString().split('T')[0]
      });
      setLinkToCash(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'opération');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePosition = async (positionId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette position ?')) {
      return;
    }

    try {
      await portfolioAPI.deletePosition(userId, positionId);
      await fetchData();
    } catch (error) {
      console.error('Error deleting position:', error);
    }
  };

  // Notes functions - Simple single note per position
  const openNotesModal = async (position) => {
    setSelectedPosition(position);
    setShowNotesModal(true);
    setNoteSaved(false);
    try {
      const response = await axios.get(`${API}/position-note/${position.id}?user_id=${userId}`);
      setNoteContent(response.data.content || '');
    } catch (error) {
      console.error('Error fetching note:', error);
      setNoteContent('');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedPosition) return;
    setNoteSaving(true);
    try {
      await axios.put(`${API}/position-note/${selectedPosition.id}?user_id=${userId}&content=${encodeURIComponent(noteContent)}`);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedPosition) return;
    try {
      await axios.delete(`${API}/position-note/${selectedPosition.id}?user_id=${userId}`);
      setNoteContent('');
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  // Merge duplicate positions
  const handleMergeDuplicates = async () => {
    setMerging(true);
    setSuccessMessage('');
    try {
      const response = await axios.post(`${API}/positions/merge-duplicates?user_id=${userId}`);
      if (response.data.merged > 0) {
        setSuccessMessage(`✅ ${response.data.merged} positions fusionnées avec succès !`);
        await fetchData(); // Refresh data
      } else {
        setSuccessMessage('✅ Aucun doublon trouvé, vos positions sont déjà consolidées.');
      }
      // Clear message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error merging duplicates:', error);
      setError('Erreur lors de la fusion des doublons');
    } finally {
      setMerging(false);
    }
  };

  // Check if there are duplicate symbols
  const hasDuplicates = () => {
    const symbols = positions.map(p => p.symbol);
    return symbols.length !== new Set(symbols).size;
  };

  const filteredPositions = positions.filter(pos =>
    pos.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pos.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Success Message */}
      {successMessage && (
        <div style={{
          padding: '16px',
          marginBottom: '24px',
          background: 'var(--success-bg)',
          border: '1px solid var(--success)',
          borderRadius: '12px',
          color: 'var(--success)',
          fontWeight: '600'
        }}>
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="display-md" style={{ marginBottom: '8px' }}>Mes Positions</h1>
          <p className="body-md" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={16} />
            {activePortfolio ? activePortfolio.name : 'Chargement...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {hasDuplicates() && (
            <button 
              className="btn-secondary" 
              onClick={handleMergeDuplicates} 
              disabled={merging}
              style={{ 
                background: 'var(--warning-bg)', 
                borderColor: 'var(--warning)',
                color: 'var(--warning)'
              }}
              data-testid="merge-duplicates-btn"
            >
              <Merge size={20} />
              {merging ? 'Fusion...' : 'Fusionner les doublons'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAddModal(true)} data-testid="add-position-btn">
            <Plus size={20} />
            Ajouter une position
          </button>
        </div>
      </div>

      {/* Cash Accounts Section */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={22} color="var(--accent-primary)" />
            <h3 className="h3">Soldes Cash</h3>
          </div>
          <button 
            className="btn-secondary" 
            onClick={() => setShowCashModal(true)}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <Plus size={16} />
            Gérer
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {cashAccounts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Aucun compte cash configuré
            </div>
          ) : (
            cashAccounts.map(account => {
              const currency = CURRENCIES.find(c => c.code === account.currency);
              return (
                <div 
                  key={account.currency}
                  style={{ 
                    padding: '16px 24px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '12px',
                    minWidth: '150px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {currency?.label || account.currency}
                  </div>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: '700', 
                    color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)' 
                  }}>
                    {account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency?.symbol || account.currency}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Capital (Versements) Section */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={22} color="var(--accent-primary)" />
            <h3 className="h3">Cumul des Versements</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn-primary" 
              onClick={() => setShowCapitalModal('deposit')}
              style={{ padding: '8px 16px', fontSize: '13px' }}
              data-testid="capital-deposit-btn"
            >
              <Plus size={16} />
              Ajout
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setShowCapitalModal('withdrawal')}
              style={{ padding: '8px 16px', fontSize: '13px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
              data-testid="capital-withdrawal-btn"
            >
              <TrendingDown size={16} />
              Retrait
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ 
            padding: '16px 24px',
            background: 'var(--bg-tertiary)',
            borderRadius: '12px',
            textAlign: 'center',
            minWidth: '180px'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Capital Net Investi
            </div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              color: 'var(--accent-primary)'
            }}>
              {formatCurrency(capitalData.net_capital)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Base de calcul performance
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Versements</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--success)' }}>
                +{formatCurrency(capitalData.total_deposits)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Retraits</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--danger)' }}>
                -{formatCurrency(capitalData.total_withdrawals)}
              </div>
            </div>
          </div>
          
          {capitalData.contributions && capitalData.contributions.length > 0 && (
            <button
              onClick={() => setShowCapitalModal('history')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '13px',
                textDecoration: 'underline'
              }}
            >
              Voir l'historique ({capitalData.contributions.length})
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {positions.length > 0 && (
        <div style={{ marginBottom: '24px', position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Rechercher un titre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '52px' }}
          />
        </div>
      )}

      {/* Positions Grid */}
      {filteredPositions.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '24px',
          marginBottom: '48px'
        }}>
          {filteredPositions.map(position => (
            <div key={position.id} className="card" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => openNotesModal(position)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-bg)';
                    e.currentTarget.style.color = 'var(--accent-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                  title="Notes"
                >
                  <StickyNote size={16} />
                </button>
                <button
                  onClick={() => handleDeletePosition(position.id)}
                  style={{
                    background: 'var(--danger-bg)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    color: 'var(--danger)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--danger)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--danger-bg)';
                    e.currentTarget.style.color = 'var(--danger)';
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    {position.symbol}
                  </div>
                  <span className={`badge ${position.type === 'etf' ? 'badge-warning' : 'badge-info'}`}>
                    {position.type === 'stock' ? 'Action' : position.type === 'etf' ? 'ETF' : 'Crypto'}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{position.name}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {formatCurrency(position.total_value)}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  {position.quantity} × {formatCurrency(position.current_price)}
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px',
                background: position.gain_loss_percent >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Gain/Perte</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: position.gain_loss_percent >= 0 ? 'var(--success)' : 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {position.gain_loss_percent >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    {formatPercent(position.gain_loss_percent)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Montant</div>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: position.gain_loss_percent >= 0 ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {formatCurrency(position.gain_loss)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Bêta</div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{position.beta.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Volatilité</div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{position.volatility.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: '48px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '18px', marginBottom: '16px' }}>
            {searchTerm ? 'Aucune position trouvée' : 'Aucune position dans votre portefeuille'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
            Commencez par ajouter votre première position
          </p>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={20} />
            Ajouter une position
          </button>
        </div>
      )}

      {/* Correlation Matrix */}
      {correlations.length > 0 && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Matrice de Corrélation</h2>
          <p className="body-sm" style={{ marginBottom: '24px' }}>Analyse des corrélations entre vos différentes positions</p>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: '14px' }}>Titre 1</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: '14px' }}>Titre 2</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: '14px' }}>Corrélation</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--border-primary)', color: 'var(--text-muted)', fontSize: '14px' }}>Interprétation</th>
                </tr>
              </thead>
              <tbody>
                {correlations.map((corr, idx) => {
                  let interpretation = '';
                  let color = '';
                  const value = corr.correlation;
                  
                  // Corrélations positives
                  if (value >= 0.80) {
                    interpretation = 'Très forte corrélation positive';
                    color = 'var(--danger)';
                  } else if (value >= 0.50) {
                    interpretation = 'Forte corrélation positive';
                    color = 'var(--warning)';
                  } else if (value >= 0.30) {
                    interpretation = 'Corrélation modérée positive';
                    color = 'var(--info)';
                  } else if (value >= 0.10) {
                    interpretation = 'Faible corrélation positive';
                    color = 'var(--text-secondary)';
                  } else if (value >= 0) {
                    interpretation = 'Corrélation quasi nulle — excellente diversification';
                    color = 'var(--success)';
                  }
                  // Corrélations négatives
                  else if (value >= -0.10) {
                    interpretation = 'Légère corrélation négative';
                    color = 'var(--success)';
                  } else if (value >= -0.30) {
                    interpretation = 'Faible corrélation négative';
                    color = 'var(--success)';
                  } else if (value >= -0.50) {
                    interpretation = 'Corrélation modérée négative';
                    color = 'rgb(34, 197, 94)';
                  } else if (value >= -0.80) {
                    interpretation = 'Forte corrélation négative';
                    color = 'rgb(16, 185, 129)';
                  } else {
                    interpretation = 'Très forte corrélation négative';
                    color = 'rgb(6, 182, 212)';
                  }

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{corr.symbol1}</td>
                      <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{corr.symbol2}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-tertiary)',
                          padding: '4px 12px',
                          borderRadius: '6px'
                        }}>
                          {corr.correlation.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ color, fontWeight: '500' }}>{interpretation}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Position Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
          overflow: 'auto'
        }}>
          <div className="card" style={{
            maxWidth: '420px',
            width: '100%',
            position: 'relative',
            padding: '20px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <button
              onClick={() => {
                setShowAddModal(false);
                setError('');
              }}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <h2 className="h3" style={{ marginBottom: '16px' }}>Nouvelle Transaction</h2>

            {error && (
              <div style={{
                padding: '10px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger)',
                borderRadius: '6px',
                marginBottom: '16px',
                color: 'var(--danger)',
                fontSize: '13px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Transaction Type - Buy/Sell */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Type de transaction
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'buy' })}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: `2px solid ${formData.transaction_type === 'buy' ? 'var(--success)' : 'var(--border-primary)'}`,
                      borderRadius: '8px',
                      background: formData.transaction_type === 'buy' ? 'var(--success-bg)' : 'transparent',
                      color: formData.transaction_type === 'buy' ? 'var(--success)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    <TrendingUp size={18} />
                    ACHAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'sell' })}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: `2px solid ${formData.transaction_type === 'sell' ? 'var(--danger)' : 'var(--border-primary)'}`,
                      borderRadius: '8px',
                      background: formData.transaction_type === 'sell' ? 'var(--danger-bg)' : 'transparent',
                      color: formData.transaction_type === 'sell' ? 'var(--danger)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    <TrendingDown size={18} />
                    VENTE
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Type d'actif</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input-field"
                  style={{ padding: '10px 12px', fontSize: '14px' }}
                >
                  <option value="stock">Action</option>
                  <option value="etf">ETF</option>
                  <option value="crypto">Cryptomonnaie</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Symbole
                </label>
                {(formData.type === 'stock' || formData.type === 'etf') && (
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-muted)', 
                    marginBottom: '8px',
                    padding: '8px 10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '6px',
                    lineHeight: '1.5'
                  }}>
                    <strong style={{ color: 'var(--accent-primary)' }}>Place de cotation :</strong>{' '}
                    <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>.PA</code> Paris,{' '}
                    <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>.AS</code> Amsterdam,{' '}
                    <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>.DE</code> Francfort<br/>
                    <span style={{ color: 'var(--text-muted)' }}>Ex: AIR.PA, CW8.PA, IWDA.AS • US: AAPL, SPY (sans suffixe)</span>
                  </div>
                )}
                {formData.type === 'crypto' && (
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-muted)', 
                    marginBottom: '8px',
                    padding: '8px 10px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '6px'
                  }}>
                    Format : <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>SYMBOL-USD</code> (ex: BTC-USD, ETH-USD)
                  </div>
                )}
                <input
                  type="text"
                  placeholder={formData.type === 'crypto' ? 'Ex: BTC-USD' : 'Ex: AAPL, AIR.PA'}
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  className="input-field"
                  style={{ padding: '10px 12px', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Quantité</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="10"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="input-field"
                    style={{ padding: '10px 12px', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                    Prix unitaire (€)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="150.50"
                    value={formData.avg_price}
                    onChange={(e) => setFormData({ ...formData, avg_price: e.target.value })}
                    className="input-field"
                    style={{ padding: '10px 12px', fontSize: '14px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} />
                  {formData.transaction_type === 'buy' ? "Date d'achat" : "Date de vente"}
                </label>
                <input
                  type="date"
                  value={formData.purchase_date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  className="input-field"
                  style={{ padding: '10px 12px', fontSize: '14px' }}
                />
              </div>

              {/* Link to Cash option */}
              <div style={{ 
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: linkToCash ? '2px solid var(--accent-primary)' : '1px solid var(--border-primary)'
              }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={linkToCash}
                    onChange={(e) => setLinkToCash(e.target.checked)}
                    style={{ 
                      width: '18px', 
                      height: '18px',
                      accentColor: 'var(--accent-primary)',
                      cursor: 'pointer'
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wallet size={14} />
                      Lier au solde cash
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {formData.transaction_type === 'buy' 
                        ? 'Le montant sera déduit de votre solde cash' 
                        : 'Le montant sera ajouté à votre solde cash'}
                    </div>
                  </div>
                </label>
                
                {linkToCash && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Devise:</span>
                    <select
                      value={selectedCashCurrency}
                      onChange={(e) => setSelectedCashCurrency(e.target.value)}
                      className="input-field"
                      style={{ padding: '6px 10px', fontSize: '13px', flex: 1 }}
                    >
                      {CURRENCIES.map(curr => (
                        <option key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.label}
                        </option>
                      ))}
                    </select>
                    {cashAccounts.find(a => a.currency === selectedCashCurrency) && (
                      <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '600' }}>
                        Solde: {cashAccounts.find(a => a.currency === selectedCashCurrency)?.balance.toFixed(2)} {selectedCashCurrency}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Transaction amount preview */}
              {formData.quantity && formData.avg_price && (
                <div style={{ 
                  padding: '10px 12px',
                  background: formData.transaction_type === 'buy' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Montant total:
                  </span>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: '700', 
                    color: formData.transaction_type === 'buy' ? 'var(--danger)' : 'var(--success)'
                  }}>
                    {formData.transaction_type === 'buy' ? '-' : '+'}{(parseFloat(formData.quantity) * parseFloat(formData.avg_price)).toFixed(2)} €
                  </span>
                </div>
              )}

              <button 
                className={formData.transaction_type === 'buy' ? 'btn-primary' : 'btn-secondary'}
                onClick={handleAddPosition} 
                style={{ 
                  width: '100%', 
                  marginTop: '4px',
                  padding: '12px',
                  fontSize: '14px',
                  background: formData.transaction_type === 'sell' ? 'var(--danger)' : undefined,
                  borderColor: formData.transaction_type === 'sell' ? 'var(--danger)' : undefined
                }}
                disabled={submitting}
              >
                {submitting ? 'En cours...' : (
                  <>
                    {formData.transaction_type === 'buy' ? <Plus size={18} /> : <TrendingDown size={18} />}
                    {formData.transaction_type === 'buy' ? 'Acheter' : 'Vendre'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedPosition && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div className="card" style={{
            maxWidth: '500px',
            width: '100%',
            position: 'relative',
            padding: '24px'
          }}>
            <button
              onClick={() => {
                setShowNotesModal(false);
                setSelectedPosition(null);
                setNoteContent('');
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <StickyNote size={24} color="var(--accent-primary)" />
              <div>
                <h2 className="h3">Notes - {selectedPosition.symbol}</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedPosition.name}</p>
              </div>
            </div>

            {/* Simple textarea notepad */}
            <textarea
              placeholder="Écrivez vos notes ici (analyse, stratégie, rappels...)"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="input-field"
              rows={8}
              style={{ 
                resize: 'vertical', 
                marginBottom: '16px',
                minHeight: '150px',
                fontSize: '14px',
                lineHeight: '1.6'
              }}
            />

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-primary" 
                onClick={handleSaveNote}
                disabled={noteSaving}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {noteSaving ? (
                  <>Sauvegarde...</>
                ) : noteSaved ? (
                  <>✓ Sauvegardé</>
                ) : (
                  <><Save size={18} /> Sauvegarder</>
                )}
              </button>
              
              {noteContent && (
                <button 
                  className="btn-secondary" 
                  onClick={handleDeleteNote}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '8px',
                    color: 'var(--danger)',
                    borderColor: 'var(--danger)'
                  }}
                >
                  <Trash2 size={18} /> Effacer
                </button>
              )}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
              Vos notes sont privées et liées à cette position
            </p>
          </div>
        </div>
      )}

      {/* Cash Management Modal */}
      {showCashModal && (
        <CashManagementModal 
          cashAccounts={cashAccounts}
          setCashAccounts={setCashAccounts}
          userId={userId}
          portfolioId={activePortfolio?.id}
          onClose={() => setShowCashModal(false)}
        />
      )}

      {/* Capital Modal */}
      {showCapitalModal && (
        <CapitalModal 
          mode={showCapitalModal}
          capitalData={capitalData}
          setCapitalData={setCapitalData}
          userId={userId}
          portfolioId={activePortfolio?.id}
          onClose={() => setShowCapitalModal(false)}
          fetchData={fetchData}
        />
      )}
    </div>
  );
};

// Cash Management Modal Component
const CashManagementModal = ({ cashAccounts, setCashAccounts, userId, portfolioId, onClose }) => {
  const [newCurrency, setNewCurrency] = useState('USD');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState(null);
  const [loading, setLoading] = useState(false);

  const portfolioIdParam = portfolioId ? `&portfolio_id=${portfolioId}` : '';

  const handleAddAccount = async () => {
    if (cashAccounts.find(a => a.currency === newCurrency)) {
      alert('Ce compte existe déjà');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/cash-accounts?user_id=${userId}&currency=${newCurrency}${portfolioIdParam}`);
      const response = await axios.get(`${API}/cash-accounts?user_id=${userId}${portfolioIdParam}`);
      setCashAccounts(response.data);
    } catch (error) {
      console.error('Error adding account:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBalance = async (currency) => {
    if (!editAmount) return;
    setLoading(true);
    try {
      await axios.put(`${API}/cash-accounts/${currency}?user_id=${userId}&amount=${parseFloat(editAmount)}&operation=set${portfolioIdParam}`);
      const response = await axios.get(`${API}/cash-accounts?user_id=${userId}${portfolioIdParam}`);
      setCashAccounts(response.data);
      setEditCurrency(null);
      setEditAmount('');
    } catch (error) {
      console.error('Error updating balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (currency) => {
    if (!window.confirm(`Supprimer le compte ${currency} ?`)) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/cash-accounts/${currency}?user_id=${userId}${portfolioIdParam}`);
      const response = await axios.get(`${API}/cash-accounts?user_id=${userId}${portfolioIdParam}`);
      setCashAccounts(response.data);
    } catch (error) {
      console.error('Error deleting account:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%', position: 'relative', padding: '24px' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Wallet size={24} color="var(--accent-primary)" />
          <h2 className="h3">Gestion des Comptes Cash</h2>
        </div>

        {/* Existing Accounts */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Comptes existants
          </h4>
          
          {cashAccounts.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center' }}>
              Aucun compte configuré
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cashAccounts.map(account => {
                const currency = CURRENCIES.find(c => c.code === account.currency);
                const isEditing = editCurrency === account.currency;
                
                return (
                  <div 
                    key={account.currency}
                    style={{ 
                      padding: '16px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        background: 'var(--accent-bg)', 
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: '700',
                        color: 'var(--accent-primary)'
                      }}>
                        {currency?.symbol || account.currency}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {currency?.label || account.currency}
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <input
                              type="number"
                              step="any"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="Nouveau solde"
                              className="input-field"
                              style={{ padding: '6px 10px', fontSize: '13px', width: '120px' }}
                            />
                            <button
                              onClick={() => handleUpdateBalance(account.currency)}
                              disabled={loading}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--success)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              OK
                            </button>
                            <button
                              onClick={() => { setEditCurrency(null); setEditAmount(''); }}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-muted)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ 
                            fontSize: '18px', 
                            fontWeight: '700', 
                            color: account.balance >= 0 ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {currency?.symbol}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => { setEditCurrency(account.currency); setEditAmount(account.balance.toString()); }}
                          style={{
                            padding: '8px',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Modifier"
                        >
                          <DollarSign size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account.currency)}
                          disabled={loading}
                          style={{
                            padding: '8px',
                            background: 'var(--danger-bg)',
                            color: 'var(--danger)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add New Account */}
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Ajouter un compte
          </h4>
          <div style={{ display: 'flex', gap: '12px' }}>
            <select
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              className="input-field"
              style={{ flex: 1, padding: '10px 12px' }}
            >
              {CURRENCIES.filter(c => !cashAccounts.find(a => a.currency === c.code)).map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddAccount}
              disabled={loading || cashAccounts.length >= CURRENCIES.length}
              className="btn-primary"
              style={{ padding: '10px 20px' }}
            >
              <Plus size={18} />
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Capital Modal Component
const CapitalModal = ({ mode, capitalData, setCapitalData, userId, onClose, fetchData }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddCapital = async (type) => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Veuillez entrer un montant valide');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/capital?user_id=${userId}&type=${type}&amount=${parseFloat(amount)}&description=${encodeURIComponent(description)}`);
      await fetchData();
      setAmount('');
      setDescription('');
      if (mode !== 'history') onClose();
    } catch (error) {
      console.error('Error adding capital:', error);
      alert('Erreur lors de l\'ajout');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContribution = async (id) => {
    if (!window.confirm('Supprimer cette opération ?')) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/capital/${id}?user_id=${userId}`);
      await fetchData();
    } catch (error) {
      console.error('Error deleting contribution:', error);
    } finally {
      setLoading(false);
    }
  };

  const isHistory = mode === 'history';
  const isDeposit = mode === 'deposit';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%', position: 'relative', padding: '24px', maxHeight: '80vh', overflow: 'auto' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          {isHistory ? (
            <History size={24} color="var(--accent-primary)" />
          ) : isDeposit ? (
            <TrendingUp size={24} color="var(--success)" />
          ) : (
            <TrendingDown size={24} color="var(--danger)" />
          )}
          <h2 className="h3">
            {isHistory ? 'Historique des Versements' : isDeposit ? 'Ajouter un Versement' : 'Enregistrer un Retrait'}
          </h2>
        </div>

        {!isHistory && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                Montant (€)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                style={{ fontSize: '18px', fontWeight: '600', textAlign: 'center' }}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                Description (optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex: Versement mensuel, Prime..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
              />
            </div>

            <button
              onClick={() => handleAddCapital(isDeposit ? 'deposit' : 'withdrawal')}
              disabled={loading || !amount}
              className={isDeposit ? 'btn-primary' : 'btn-secondary'}
              style={{ 
                width: '100%',
                background: isDeposit ? undefined : 'var(--danger)',
                borderColor: isDeposit ? undefined : 'var(--danger)'
              }}
            >
              {loading ? 'En cours...' : (isDeposit ? 'Ajouter le versement' : 'Enregistrer le retrait')}
            </button>
          </div>
        )}

        {/* History */}
        {(isHistory || capitalData.contributions?.length > 0) && (
          <div>
            {!isHistory && <div style={{ borderTop: '1px solid var(--border-primary)', marginTop: '20px', paddingTop: '20px' }}></div>}
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {isHistory ? '' : 'Dernières opérations'}
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: isHistory ? '400px' : '200px', overflow: 'auto' }}>
              {capitalData.contributions?.slice(0, isHistory ? 100 : 5).map(contrib => (
                <div 
                  key={contrib.id}
                  style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <div style={{ 
                      fontSize: '15px', 
                      fontWeight: '600', 
                      color: contrib.type === 'deposit' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {contrib.type === 'deposit' ? '+' : '-'}{contrib.amount.toLocaleString('fr-FR')} €
                    </div>
                    {contrib.description && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{contrib.description}</div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(contrib.date).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteContribution(contrib.id)}
                    disabled={loading}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              
              {(!capitalData.contributions || capitalData.contributions.length === 0) && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Aucune opération enregistrée
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
