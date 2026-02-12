import React, { useState, useEffect } from 'react';
import { Plus, Search, TrendingUp, TrendingDown, X, Trash2, Calendar, Briefcase, StickyNote, Save, Merge } from 'lucide-react';
import { portfolioAPI, analyticsAPI, storage, portfoliosAPI } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Portfolio = () => {
  const [positions, setPositions] = useState([]);
  const [correlations, setCorrelations] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [positionNotes, setPositionNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
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
      
      // Get positions for active portfolio
      const [positionsData, correlationsData] = await Promise.all([
        portfolioAPI.getPositions(userId, currentPortfolio?.id),
        analyticsAPI.getCorrelation(userId)
      ]);
      setPositions(positionsData);
      setCorrelations(correlationsData);
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
        portfolio_id: activePortfolio?.id || null
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

  // Notes functions
  const openNotesModal = async (position) => {
    setSelectedPosition(position);
    setShowNotesModal(true);
    try {
      const response = await axios.get(`${API}/notes/${position.id}?user_id=${userId}`);
      // Clean notes from MongoDB _id
      const cleanNotes = response.data.map(note => ({
        ...note,
        created_at: note.created_at ? new Date(note.created_at).toLocaleString('fr-FR') : 'Date inconnue'
      }));
      setPositionNotes(cleanNotes);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setPositionNotes([]);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    try {
      await axios.post(`${API}/notes?user_id=${userId}`, {
        position_id: selectedPosition.id,
        content: newNote
      });
      setNewNote('');
      // Refresh notes
      const response = await axios.get(`${API}/notes/${selectedPosition.id}?user_id=${userId}`);
      const cleanNotes = response.data.map(note => ({
        ...note,
        created_at: note.created_at ? new Date(note.created_at).toLocaleString('fr-FR') : 'Date inconnue'
      }));
      setPositionNotes(cleanNotes);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await axios.delete(`${API}/notes/${noteId}?user_id=${userId}`);
      setPositionNotes(positionNotes.filter(n => n.id !== noteId));
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
                  <span className="badge badge-info">
                    {position.type === 'stock' ? 'Action' : 'Crypto'}
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
                  if (corr.correlation > 0.7) {
                    interpretation = 'Forte corrélation';
                    color = 'var(--warning)';
                  } else if (corr.correlation > 0.4) {
                    interpretation = 'Corrélation modérée';
                    color = 'var(--info)';
                  } else {
                    interpretation = 'Faible corrélation';
                    color = 'var(--success)';
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
          padding: '24px'
        }}>
          <div className="card" style={{
            maxWidth: '500px',
            width: '100%',
            position: 'relative'
          }}>
            <button
              onClick={() => {
                setShowAddModal(false);
                setError('');
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '8px'
              }}
            >
              <X size={24} />
            </button>

            <h2 className="h2" style={{ marginBottom: '24px' }}>Nouvelle Transaction</h2>

            {error && (
              <div style={{
                padding: '12px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger)',
                borderRadius: '8px',
                marginBottom: '20px',
                color: 'var(--danger)',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Transaction Type - Buy/Sell */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Type de transaction
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'buy' })}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${formData.transaction_type === 'buy' ? 'var(--success)' : 'var(--border-primary)'}`,
                      borderRadius: '12px',
                      background: formData.transaction_type === 'buy' ? 'var(--success-bg)' : 'transparent',
                      color: formData.transaction_type === 'buy' ? 'var(--success)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: '600'
                    }}
                  >
                    <TrendingUp size={24} />
                    ACHAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'sell' })}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${formData.transaction_type === 'sell' ? 'var(--danger)' : 'var(--border-primary)'}`,
                      borderRadius: '12px',
                      background: formData.transaction_type === 'sell' ? 'var(--danger-bg)' : 'transparent',
                      color: formData.transaction_type === 'sell' ? 'var(--danger)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: '600'
                    }}
                  >
                    <TrendingDown size={24} />
                    VENTE
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>Type d'actif</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input-field"
                >
                  <option value="stock">Action</option>
                  <option value="crypto">Cryptomonnaie</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Symbole {formData.type === 'crypto' && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>(ex: BTC-USD, ETH-USD)</span>}
                </label>
                <input
                  type="text"
                  placeholder="Ex: AAPL, MSFT, BTC-USD"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>Quantité</label>
                <input
                  type="number"
                  step="any"
                  placeholder="Ex: 10"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  {formData.transaction_type === 'buy' ? "Prix d'achat unitaire" : "Prix de vente unitaire"}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Ex: 150.50"
                  value={formData.avg_price}
                  onChange={(e) => setFormData({ ...formData, avg_price: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} />
                  {formData.transaction_type === 'buy' ? "Date d'achat" : "Date de vente"}
                </label>
                <input
                  type="date"
                  value={formData.purchase_date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  className="input-field"
                />
              </div>

              <button 
                className={formData.transaction_type === 'buy' ? 'btn-primary' : 'btn-secondary'}
                onClick={handleAddPosition} 
                style={{ 
                  width: '100%', 
                  marginTop: '8px',
                  background: formData.transaction_type === 'sell' ? 'var(--danger)' : undefined,
                  borderColor: formData.transaction_type === 'sell' ? 'var(--danger)' : undefined
                }}
                disabled={submitting}
              >
                {submitting ? 'En cours...' : (
                  <>
                    {formData.transaction_type === 'buy' ? <Plus size={20} /> : <TrendingDown size={20} />}
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
          padding: '24px'
        }}>
          <div className="card" style={{
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => {
                setShowNotesModal(false);
                setSelectedPosition(null);
                setPositionNotes([]);
                setNewNote('');
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '8px'
              }}
            >
              <X size={24} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <StickyNote size={28} color="var(--accent-primary)" />
              <div>
                <h2 className="h2">Notes - {selectedPosition.symbol}</h2>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{selectedPosition.name}</p>
              </div>
            </div>

            {/* Add new note */}
            <div style={{ marginBottom: '24px' }}>
              <textarea
                placeholder="Ajouter une note (analyse, stratégie, rappel...)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="input-field"
                rows={3}
                style={{ resize: 'vertical', marginBottom: '12px' }}
              />
              <button 
                className="btn-primary" 
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                style={{ width: '100%' }}
              >
                <Save size={18} />
                Enregistrer la note
              </button>
            </div>

            {/* Notes list */}
            <div>
              <h3 className="h3" style={{ marginBottom: '16px' }}>Historique des notes</h3>
              {positionNotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  <StickyNote size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p>Aucune note pour cette position</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {positionNotes.map(note => (
                    <div 
                      key={note.id} 
                      style={{ 
                        padding: '16px', 
                        background: 'var(--bg-tertiary)', 
                        borderRadius: '12px',
                        position: 'relative'
                      }}
                    >
                      <button
                        onClick={() => handleDeleteNote(note.id)}
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
                        <Trash2 size={14} />
                      </button>
                      <p style={{ color: 'var(--text-primary)', marginBottom: '8px', paddingRight: '24px' }}>
                        {note.content}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {note.created_at}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Portfolio;
