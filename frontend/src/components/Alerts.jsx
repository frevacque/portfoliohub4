import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, X, TrendingUp, TrendingDown, RefreshCw, CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { storage } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [formData, setFormData] = useState({
    symbol: '',
    alert_type: 'price_above',
    target_value: '',
    notes: ''
  });
  const [error, setError] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const fetchAlerts = async () => {
    try {
      const response = await axios.get(`${API}/alerts?user_id=${userId}`);
      setAlerts(response.data);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleCheckAlerts = async () => {
    setChecking(true);
    try {
      const response = await axios.get(`${API}/alerts/check?user_id=${userId}`);
      if (response.data.triggered > 0) {
        alert(`${response.data.triggered} alerte(s) déclenchée(s) !`);
      }
      await fetchAlerts();
    } catch (error) {
      console.error('Error checking alerts:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleSymbolChange = async (symbol) => {
    setFormData({ ...formData, symbol: symbol.toUpperCase() });
    setCurrentPrice(null);
    
    if (symbol.length >= 2) {
      try {
        const response = await axios.get(`${API}/market/quote/${symbol.toUpperCase()}`);
        if (response.data && response.data.price) {
          setCurrentPrice(response.data.price);
        }
      } catch (error) {
        // Symbol not found yet
      }
    }
  };

  const handleCreateAlert = async () => {
    if (!formData.symbol || !formData.target_value) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setError('');
    try {
      await axios.post(`${API}/alerts?user_id=${userId}`, {
        symbol: formData.symbol,
        alert_type: formData.alert_type,
        target_value: parseFloat(formData.target_value),
        notes: formData.notes || null
      });
      
      setShowModal(false);
      setFormData({ symbol: '', alert_type: 'price_above', target_value: '', notes: '' });
      setCurrentPrice(null);
      await fetchAlerts();
    } catch (error) {
      setError(error.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const handleDeleteAlert = async (alertId) => {
    if (!window.confirm('Supprimer cette alerte ?')) return;
    try {
      await axios.delete(`${API}/alerts/${alertId}?user_id=${userId}`);
      await fetchAlerts();
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      await axios.put(`${API}/alerts/${alertId}/acknowledge?user_id=${userId}`);
      await fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const handleReactivate = async (alertId) => {
    try {
      await axios.put(`${API}/alerts/${alertId}/reactivate?user_id=${userId}`);
      await fetchAlerts();
    } catch (error) {
      console.error('Error reactivating alert:', error);
    }
  };

  // Separate alerts by status
  const activeAlerts = alerts.filter(a => a.is_active && !a.is_triggered);
  const triggeredAlerts = alerts.filter(a => a.is_triggered && !a.is_acknowledged);
  const acknowledgedAlerts = alerts.filter(a => a.is_acknowledged);

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="display-md" style={{ marginBottom: '8px' }}>Alertes de Prix</h1>
          <p className="body-md" style={{ color: 'var(--text-muted)' }}>Recevez des notifications quand vos seuils sont atteints</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn-secondary" 
            onClick={handleCheckAlerts}
            disabled={checking}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
            Vérifier maintenant
          </button>
          <button 
            className="btn-primary" 
            onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={20} />
            Nouvelle alerte
          </button>
        </div>
      </div>

      {/* Triggered Alerts - Most Important */}
      {triggeredAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: '32px', border: '2px solid var(--warning)', background: 'var(--warning-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <AlertTriangle size={28} color="var(--warning)" />
            <h2 className="h2" style={{ color: 'var(--warning)' }}>Alertes Déclenchées ({triggeredAlerts.length})</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {triggeredAlerts.map(alert => (
              <div key={alert.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                borderLeft: '4px solid var(--warning)'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{alert.symbol}</span>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '20px', 
                      fontSize: '12px', 
                      fontWeight: '600',
                      background: alert.alert_type === 'price_above' ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: alert.alert_type === 'price_above' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {alert.alert_type === 'price_above' ? '↑ Au-dessus' : '↓ En-dessous'}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    Cible: {formatCurrency(alert.target_value)} • Déclenché à: {formatCurrency(alert.triggered_price)}
                  </div>
                  {alert.notes && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                      {alert.notes}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      borderRadius: '8px',
                      background: 'var(--success)',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: '600'
                    }}
                  >
                    <CheckCircle size={16} />
                    OK, vu
                  </button>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    style={{
                      padding: '10px',
                      border: 'none',
                      borderRadius: '8px',
                      background: 'var(--danger-bg)',
                      color: 'var(--danger)',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Bell size={24} color="var(--accent-primary)" />
          <h2 className="h2">Alertes Actives ({activeAlerts.length})</h2>
        </div>
        
        {activeAlerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
            <Bell size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <p>Aucune alerte active</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Créez une alerte pour surveiller vos titres</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeAlerts.map(alert => (
              <div key={alert.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-tertiary)',
                borderRadius: '12px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{alert.symbol}</span>
                    {alert.alert_type === 'price_above' ? (
                      <TrendingUp size={18} color="var(--success)" />
                    ) : (
                      <TrendingDown size={18} color="var(--danger)" />
                    )}
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      {alert.alert_type === 'price_above' ? 'Alerte si ≥' : 'Alerte si ≤'} {formatCurrency(alert.target_value)}
                    </span>
                  </div>
                  {alert.notes && (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {alert.notes}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteAlert(alert.id)}
                  style={{
                    padding: '8px',
                    border: 'none',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acknowledged/Historical Alerts */}
      {acknowledgedAlerts.length > 0 && (
        <div className="card" style={{ opacity: 0.7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <CheckCircle size={24} color="var(--text-muted)" />
            <h2 className="h2" style={{ color: 'var(--text-muted)' }}>Alertes Passées ({acknowledgedAlerts.length})</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {acknowledgedAlerts.map(alert => (
              <div key={alert.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{alert.symbol}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {alert.alert_type === 'price_above' ? '↑' : '↓'} {formatCurrency(alert.target_value)}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    → {formatCurrency(alert.triggered_price)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleReactivate(alert.id)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RotateCcw size={12} />
                    Réactiver
                  </button>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    style={{
                      padding: '6px',
                      border: 'none',
                      borderRadius: '6px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Alert Modal */}
      {showModal && (
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
          <div className="card" style={{ maxWidth: '500px', width: '100%', position: 'relative' }}>
            <button
              onClick={() => {
                setShowModal(false);
                setError('');
                setCurrentPrice(null);
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
              <Bell size={28} color="var(--accent-primary)" />
              <h2 className="h2">Nouvelle Alerte</h2>
            </div>

            {error && (
              <div style={{ padding: '12px', marginBottom: '16px', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Symbole *
                </label>
                <input
                  type="text"
                  placeholder="Ex: AAPL, MSFT, SGO.PA"
                  value={formData.symbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  className="input-field"
                />
                {currentPrice && (
                  <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--accent-primary)' }}>
                    Prix actuel: {formatCurrency(currentPrice)}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Type d'alerte *
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setFormData({ ...formData, alert_type: 'price_above' })}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${formData.alert_type === 'price_above' ? 'var(--success)' : 'var(--border-primary)'}`,
                      borderRadius: '12px',
                      background: formData.alert_type === 'price_above' ? 'var(--success-bg)' : 'transparent',
                      color: formData.alert_type === 'price_above' ? 'var(--success)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <TrendingUp size={24} />
                    <span style={{ fontWeight: '600' }}>Prix au-dessus</span>
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, alert_type: 'price_below' })}
                    style={{
                      flex: 1,
                      padding: '16px',
                      border: `2px solid ${formData.alert_type === 'price_below' ? 'var(--danger)' : 'var(--border-primary)'}`,
                      borderRadius: '12px',
                      background: formData.alert_type === 'price_below' ? 'var(--danger-bg)' : 'transparent',
                      color: formData.alert_type === 'price_below' ? 'var(--danger)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <TrendingDown size={24} />
                    <span style={{ fontWeight: '600' }}>Prix en-dessous</span>
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Prix cible (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 150.00"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Notes (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Vendre si atteint"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input-field"
                />
              </div>

              <button 
                className="btn-primary" 
                onClick={handleCreateAlert}
                style={{ width: '100%', marginTop: '8px' }}
              >
                <Bell size={18} />
                Créer l'alerte
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Alerts;
