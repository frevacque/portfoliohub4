import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Target, BarChart3, AlertCircle, RefreshCw, Settings, Calendar, Percent, X, Bell, CheckCircle, Briefcase, LineChart } from 'lucide-react';
import { portfolioAPI, analyticsAPI, storage, portfoliosAPI } from '../api';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Benchmarks prédéfinis
const PRESET_BENCHMARKS = [
  { value: '^FCHI', label: 'CAC 40', description: 'France' },
  { value: '^GSPC', label: 'S&P 500', description: 'USA' },
  { value: 'URTH', label: 'MSCI World', description: 'Global' },
  { value: '^STOXX50E', label: 'Euro Stoxx 50', description: 'Europe' },
  { value: '^NDX', label: 'Nasdaq 100', description: 'USA Tech' },
];

const Dashboard = () => {
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [riskFreeRate, setRiskFreeRate] = useState(3.0);
  const [tempRFR, setTempRFR] = useState(3.0);
  const [benchmarkIndex, setBenchmarkIndex] = useState('^GSPC');
  const [tempBenchmark, setTempBenchmark] = useState('^GSPC');
  const [customBenchmark, setCustomBenchmark] = useState('');
  const [activePortfolio, setActivePortfolio] = useState(null);

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const fetchData = async () => {
    try {
      // Get portfolios first to determine active portfolio
      const portfoliosData = await portfoliosAPI.getAll(userId);
      const activePortfolioId = storage.getActivePortfolioId();
      let currentPortfolio = portfoliosData.find(p => p.id === activePortfolioId);
      if (!currentPortfolio && portfoliosData.length > 0) {
        currentPortfolio = portfoliosData[0];
        storage.setActivePortfolioId(currentPortfolio.id);
      }
      setActivePortfolio(currentPortfolio);
      
      // Fetch data with the active portfolio_id
      const [portfolioData, positionsData, recommendationsData, settingsData] = await Promise.all([
        portfolioAPI.getSummary(userId, currentPortfolio?.id),
        portfolioAPI.getPositions(userId, currentPortfolio?.id),
        analyticsAPI.getRecommendations(userId),
        axios.get(`${API}/settings?user_id=${userId}`)
      ]);
      
      setPortfolio(portfolioData);
      
      // Sort positions by weight (descending) and take top 5
      const sortedPositions = [...positionsData].sort((a, b) => (b.weight || 0) - (a.weight || 0));
      setPositions(sortedPositions.slice(0, 5));
      
      setRecommendations(recommendationsData);
      setRiskFreeRate(settingsData.data.risk_free_rate || 3.0);
      setTempRFR(settingsData.data.risk_free_rate || 3.0);
      setBenchmarkIndex(settingsData.data.benchmark_index || '^GSPC');
      setTempBenchmark(settingsData.data.benchmark_index || '^GSPC');
      // Check if custom benchmark (not in presets)
      const isPreset = PRESET_BENCHMARKS.some(b => b.value === settingsData.data.benchmark_index);
      if (!isPreset && settingsData.data.benchmark_index) {
        setCustomBenchmark(settingsData.data.benchmark_index);
      }
      
      // Check alerts and get triggered ones
      await axios.get(`${API}/alerts/check?user_id=${userId}`);
      const alertsResponse = await axios.get(`${API}/alerts/triggered?user_id=${userId}`);
      setTriggeredAlerts(alertsResponse.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await axios.put(`${API}/alerts/${alertId}/acknowledge?user_id=${userId}`);
      setTriggeredAlerts(triggeredAlerts.filter(a => a.id !== alertId));
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleSaveSettings = async () => {
    try {
      const benchmarkToSave = customBenchmark || tempBenchmark;
      await axios.put(`${API}/settings?user_id=${userId}`, { 
        risk_free_rate: tempRFR,
        benchmark_index: benchmarkToSave
      });
      setRiskFreeRate(tempRFR);
      setBenchmarkIndex(benchmarkToSave);
      setShowSettingsModal(false);
      // Refresh to recalculate metrics
      handleRefresh();
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>Chargement...</div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
          Aucune donnée de portefeuille disponible
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Triggered Alerts Notification */}
      {triggeredAlerts.length > 0 && (
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'linear-gradient(135deg, var(--warning-bg) 0%, rgba(251, 191, 36, 0.1) 100%)',
          border: '2px solid var(--warning)',
          borderRadius: '16px',
          animation: 'pulse 2s infinite'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Bell size={24} color="var(--warning)" style={{ animation: 'shake 0.5s ease-in-out infinite' }} />
              <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--warning)' }}>
                {triggeredAlerts.length} Alerte{triggeredAlerts.length > 1 ? 's' : ''} Déclenchée{triggeredAlerts.length > 1 ? 's' : ''} !
              </span>
            </div>
            <Link to="/alerts" style={{ fontSize: '14px', color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '600' }}>
              Voir toutes →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {triggeredAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-secondary)',
                borderRadius: '10px'
              }}>
                <div>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)', marginRight: '12px' }}>{alert.symbol}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    {alert.alert_type === 'price_above' ? '↑' : '↓'} Cible {formatCurrency(alert.target_value)} atteinte à {formatCurrency(alert.triggered_price)}
                  </span>
                </div>
                <button
                  onClick={() => handleAcknowledgeAlert(alert.id)}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    background: 'var(--success)',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: '600',
                    fontSize: '13px'
                  }}
                >
                  <CheckCircle size={14} />
                  OK
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="display-md" style={{ marginBottom: '8px' }}>Tableau de bord</h1>
          <p className="body-md" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={16} />
            {activePortfolio ? activePortfolio.name : 'Chargement...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            data-testid="settings-btn"
          >
            <Settings size={18} />
            Paramètres
          </button>
          <button
            onClick={handleRefresh}
            className="btn-primary"
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Performance Globale - Nouveau bloc */}
      <div className="card" style={{ 
        marginBottom: '32px', 
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
        border: '2px solid var(--accent-primary)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--accent-primary)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <TrendingUp size={28} color="var(--accent-primary)" />
          <h2 className="h2">Performance Globale</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
          {/* Valeur Totale */}
          <div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Valeur Actuelle</div>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {formatCurrency(portfolio.total_value)}
            </div>
            {/* Décomposition Positions + Cash */}
            {(portfolio.positions_value > 0 || portfolio.cash_value > 0) && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {portfolio.positions_value > 0 && <span>Positions: {formatCurrency(portfolio.positions_value)}</span>}
                {portfolio.positions_value > 0 && portfolio.cash_value > 0 && <span> • </span>}
                {portfolio.cash_value > 0 && <span style={{ color: 'var(--accent-primary)' }}>Cash: {formatCurrency(portfolio.cash_value)}</span>}
              </div>
            )}
          </div>
          
          {/* Capital Versé (ou Montant Investi si pas de versements) */}
          <div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {portfolio.net_capital > 0 ? 'Capital Versé' : 'Capital Investi'}
            </div>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              {formatCurrency(portfolio.net_capital > 0 ? portfolio.net_capital : portfolio.total_invested)}
            </div>
          </div>
          
          {/* Gain/Perte Absolue basé sur le capital versé */}
          <div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Gain/Perte Total</div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: '700', 
              color: (portfolio.net_capital > 0 ? portfolio.capital_gain_loss : portfolio.total_gain_loss) >= 0 ? 'var(--success)' : 'var(--danger)' 
            }}>
              {(portfolio.net_capital > 0 ? portfolio.capital_gain_loss : portfolio.total_gain_loss) >= 0 ? '+' : ''}
              {formatCurrency(portfolio.net_capital > 0 ? portfolio.capital_gain_loss : portfolio.total_gain_loss)}
            </div>
          </div>
          
          {/* Performance % basée sur le capital versé */}
          <div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Performance</div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: '700', 
              color: (portfolio.net_capital > 0 ? portfolio.capital_performance_percent : portfolio.gain_loss_percent) >= 0 ? 'var(--success)' : 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {(portfolio.net_capital > 0 ? portfolio.capital_performance_percent : portfolio.gain_loss_percent) >= 0 ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
              {formatPercent(portfolio.net_capital > 0 ? portfolio.capital_performance_percent : portfolio.gain_loss_percent)}
            </div>
          </div>
        </div>

        {/* Période de détention */}
        {portfolio.holding_period_days > 0 && (
          <div style={{ 
            marginTop: '24px', 
            paddingTop: '24px', 
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Depuis {portfolio.holding_period_days} jours
              </span>
            </div>
            {portfolio.first_purchase_date && (
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                (première position le {new Date(portfolio.first_purchase_date).toLocaleDateString('fr-FR')})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Métriques principales */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Variation Journalière */}
        <div className="card">
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>Variation Journalière</div>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: portfolio.daily_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {portfolio.daily_change >= 0 ? '+' : ''}{formatCurrency(portfolio.daily_change)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="var(--text-muted)" />
            <span style={{
              color: portfolio.daily_change_percent >= 0 ? 'var(--success)' : 'var(--danger)',
              fontSize: '16px',
              fontWeight: '600'
            }}>
              {formatPercent(portfolio.daily_change_percent)}
            </span>
          </div>
        </div>

        {/* Beta */}
        <div className="card">
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Bêta du Portefeuille</span>
            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', background: 'var(--accent-bg)', padding: '2px 6px', borderRadius: '4px' }}>
              vs {PRESET_BENCHMARKS.find(b => b.value === benchmarkIndex)?.label || benchmarkIndex}
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>
            {portfolio.beta.toFixed(2)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={18} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {portfolio.beta > 1 ? 'Plus volatil que le marché' : portfolio.beta < 1 ? 'Moins volatil que le marché' : 'Neutre'}
            </span>
          </div>
        </div>

        {/* Sharpe Ratio avec RFR */}
        <div className="card">
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ratio de Sharpe</span>
            <span style={{ fontSize: '12px', color: 'var(--accent-primary)' }}>RFR: {riskFreeRate}%</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: portfolio.sharpe_ratio >= 1 ? 'var(--success)' : portfolio.sharpe_ratio >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
            {portfolio.sharpe_ratio.toFixed(2)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={18} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {portfolio.sharpe_ratio >= 1 ? 'Excellent' : portfolio.sharpe_ratio >= 0.5 ? 'Bon' : portfolio.sharpe_ratio >= 0 ? 'Acceptable' : 'À améliorer'}
            </span>
          </div>
        </div>
      </div>

      {/* Volatilité Section - Mise à jour */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <h2 className="h2" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={24} color="var(--accent-primary)" />
          Volatilité du Portefeuille
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          {/* Volatilité Historique */}
          <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Volatilité Historique (1 an)
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
              {(portfolio.volatility?.historical || 0).toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Basée sur les données historiques des titres
            </div>
          </div>
          
          {/* Volatilité Réalisée */}
          <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px solid var(--accent-primary)' }}>
            <div style={{ fontSize: '14px', color: 'var(--accent-primary)', marginBottom: '12px', fontWeight: '600' }}>
              Volatilité Réalisée (votre gestion)
            </div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '8px' }}>
              {(portfolio.volatility?.realized || 0).toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Calculée depuis vos dates d'achat réelles
            </div>
          </div>
        </div>
      </div>

      {/* Top Holdings */}
      {positions.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="h2" style={{ marginBottom: '24px' }}>Principales Positions</h2>
          <p className="body-sm" style={{ color: 'var(--text-muted)', marginBottom: '20px', marginTop: '-16px' }}>
            Triées par poids dans le portefeuille (du plus important au moins important)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {positions.map((position, index) => (
              <div key={position.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--bg-tertiary)',
                borderRadius: '12px',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                borderLeft: `4px solid ${index === 0 ? 'var(--accent-primary)' : 'transparent'}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-primary)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}>
                {/* Rank indicator */}
                <div style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  background: index === 0 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: index === 0 ? 'var(--bg-primary)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '14px',
                  marginRight: '16px',
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {position.symbol}
                    </span>
                    <span className={`badge ${position.type === 'etf' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '12px', padding: '4px 8px' }}>
                      {position.type === 'stock' ? 'Action' : position.type === 'etf' ? 'ETF' : 'Crypto'}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{position.name}</div>
                </div>
                
                {/* Weight - More prominent */}
                <div style={{ 
                  textAlign: 'center', 
                  marginRight: '24px',
                  padding: '8px 16px',
                  background: 'var(--accent-bg)',
                  borderRadius: '8px',
                  minWidth: '80px'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                    {position.weight.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Poids
                  </div>
                </div>
                
                <div style={{ textAlign: 'right', marginRight: '24px', minWidth: '100px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {formatCurrency(position.total_value)}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {position.quantity} unités
                  </div>
                </div>
                
                <div style={{ textAlign: 'right', minWidth: '80px' }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: position.gain_loss_percent >= 0 ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {formatPercent(position.gain_loss_percent)}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>P&L</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={24} color="var(--accent-primary)" />
            Recommandations
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recommendations.map((rec, idx) => (
              <div key={idx} style={{
                padding: '16px',
                background: rec.type === 'warning' ? 'var(--warning-bg)' : rec.type === 'success' ? 'var(--success-bg)' : 'var(--info-bg)',
                border: `1px solid ${rec.type === 'warning' ? 'var(--warning)' : rec.type === 'success' ? 'var(--success)' : 'var(--info)'}`,
                borderRadius: '12px'
              }}>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
                  {rec.title}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {rec.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {positions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '18px', marginBottom: '16px' }}>
            Aucune position dans votre portefeuille
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Ajoutez votre première position dans l'onglet Positions
          </p>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
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
          <div className="card" style={{ maxWidth: '480px', width: '100%', position: 'relative', padding: '24px', maxHeight: '90vh', overflow: 'auto' }}>
            <button
              onClick={() => setShowSettingsModal(false)}
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
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <Settings size={24} color="var(--accent-primary)" />
              <h2 className="h3">Paramètres du Dashboard</h2>
            </div>

            {/* Benchmark Section */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                <LineChart size={18} />
                Benchmark de référence
              </label>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Utilisé pour le calcul du Bêta et la comparaison de performance.
              </p>
              
              {/* Preset Benchmarks */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {PRESET_BENCHMARKS.map(benchmark => (
                  <button
                    key={benchmark.value}
                    onClick={() => {
                      setTempBenchmark(benchmark.value);
                      setCustomBenchmark('');
                    }}
                    style={{
                      padding: '8px 12px',
                      border: `2px solid ${tempBenchmark === benchmark.value && !customBenchmark ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      borderRadius: '8px',
                      background: tempBenchmark === benchmark.value && !customBenchmark ? 'var(--accent-bg)' : 'transparent',
                      color: tempBenchmark === benchmark.value && !customBenchmark ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>{benchmark.label}</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>{benchmark.description}</span>
                  </button>
                ))}
              </div>

              {/* Custom Benchmark */}
              <div style={{ 
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px'
              }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  Ou entrez un ticker personnalisé :
                </label>
                <input
                  type="text"
                  placeholder="Ex: ^IXIC, IWDA.AS, VTI..."
                  value={customBenchmark}
                  onChange={(e) => setCustomBenchmark(e.target.value.toUpperCase())}
                  className="input-field"
                  style={{ fontSize: '14px', padding: '10px 12px' }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Format Yahoo Finance : ^FCHI (CAC40), ^GSPC (S&P500), URTH (MSCI World)
                </p>
              </div>
              
              {/* Current benchmark display */}
              <div style={{ 
                marginTop: '12px', 
                padding: '8px 12px', 
                background: 'var(--bg-secondary)', 
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Benchmark actuel :</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-primary)' }}>
                  {PRESET_BENCHMARKS.find(b => b.value === benchmarkIndex)?.label || benchmarkIndex}
                </span>
              </div>
            </div>

            {/* Risk-Free Rate Section */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                <Percent size={18} />
                Taux Sans Risque (RFR)
              </label>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Utilisé pour le calcul du ratio de Sharpe.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={tempRFR}
                  onChange={(e) => setTempRFR(parseFloat(e.target.value) || 0)}
                  className="input-field"
                  style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: '600' }}
                />
                <Percent size={20} color="var(--text-muted)" />
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map(rate => (
                  <button
                    key={rate}
                    onClick={() => setTempRFR(rate)}
                    style={{
                      padding: '6px 14px',
                      border: `1px solid ${tempRFR === rate ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      borderRadius: '6px',
                      background: tempRFR === rate ? 'var(--accent-bg)' : 'transparent',
                      color: tempRFR === rate ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            <button 
              className="btn-primary" 
              onClick={handleSaveSettings}
              style={{ width: '100%' }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
