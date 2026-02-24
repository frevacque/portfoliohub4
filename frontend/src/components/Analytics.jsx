import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis } from 'recharts';
import { TrendingUp, PieChart as PieIcon, Target, Bell, FileText, RefreshCw, LineChart } from 'lucide-react';
import { portfolioAPI, storage } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ['#DAFF01', '#22C55E', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#10B981'];

// Benchmarks prédéfinis (same as Dashboard)
const PRESET_BENCHMARKS = [
  { value: '^FCHI', label: 'CAC 40' },
  { value: '^GSPC', label: 'S&P 500' },
  { value: 'URTH', label: 'MSCI World' },
  { value: '^STOXX50E', label: 'Euro Stoxx 50' },
  { value: '^NDX', label: 'Nasdaq 100' },
];

const Analytics = () => {
  const [sectorData, setSectorData] = useState([]);
  const [positions, setPositions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sectors');
  const [benchmarkIndex, setBenchmarkIndex] = useState('^GSPC');

  const userId = storage.getUserId();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const fetchData = async () => {
    try {
      const [positionsData, sectorDistribution, alertsData, goalsData, settingsData] = await Promise.all([
        portfolioAPI.getPositions(userId),
        axios.get(`${API}/analytics/sector-distribution?user_id=${userId}`),
        axios.get(`${API}/alerts?user_id=${userId}`),
        axios.get(`${API}/goals?user_id=${userId}`),
        axios.get(`${API}/settings?user_id=${userId}`)
      ]);

      setPositions(positionsData);
      setSectorData(sectorDistribution.data);
      setAlerts(alertsData.data);
      setGoals(goalsData.data);
      setBenchmarkIndex(settingsData.data.benchmark_index || '^GSPC');
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>Chargement des analyses...</div>
      </div>
    );
  }

  // Prepare risk/return scatter data - filter out positions with invalid data
  const riskReturnData = positions
    .filter(pos => pos.volatility !== undefined && pos.volatility !== null && pos.volatility > 0)
    .map(pos => ({
      symbol: pos.symbol,
      volatility: pos.volatility || 0,
      return: pos.gain_loss_percent || 0,
      value: pos.total_value || 0
    }));

  // Calculate total portfolio value for percentage calculations
  const totalPortfolioValue = positions.reduce((sum, pos) => sum + (pos.total_value || 0), 0);

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 className="display-md" style={{ marginBottom: '8px' }}>Analyses Avancées</h1>
        <p className="body-md" style={{ color: 'var(--text-muted)' }}>Explorez en profondeur votre portefeuille</p>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', flexWrap: 'wrap' }}>
          {[
            { value: 'sectors', label: 'Secteurs', icon: PieIcon },
            { value: 'risk', label: 'Risque/Rendement', icon: Target }
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
                minWidth: '130px',
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

      {/* Sector Distribution */}
      {activeTab === 'sectors' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Répartition Sectorielle</h2>
          {sectorData.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ sector, percentage }) => `${sector}: ${percentage.toFixed(1)}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'var(--bg-secondary)', 
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)'
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {sectorData.map((sector, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: COLORS[idx % COLORS.length] }} />
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{sector.sector}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{sector.percentage.toFixed(1)}%</div>
                      <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{formatCurrency(sector.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px' }}>Aucune donnée sectorielle disponible</p>
          )}
        </div>
      )}

      {/* Risk/Return Analysis */}
      {activeTab === 'risk' && (
        <div className="card">
          <h2 className="h2" style={{ marginBottom: '24px' }}>Analyse Risque/Rendement</h2>
          {positions.length > 0 ? (
            <>
              <p className="body-sm" style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
                Ce graphique positionne chaque titre selon sa volatilité (risque) et son rendement. La taille des bulles représente la valeur de la position.
              </p>
              
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>Valeur Totale</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                    {formatCurrency(totalPortfolioValue)}
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>Nombre de Positions</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    {positions.length}
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>Rendement Moyen</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: positions.reduce((sum, p) => sum + (p.gain_loss_percent || 0), 0) / positions.length >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {(positions.reduce((sum, p) => sum + (p.gain_loss_percent || 0), 0) / positions.length).toFixed(2)}%
                  </div>
                </div>
              </div>

              {riskReturnData.length > 0 ? (
                <ResponsiveContainer width="100%" height={450}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis 
                      type="number" 
                      dataKey="volatility" 
                      name="Volatilité" 
                      unit="%" 
                      stroke="var(--text-muted)"
                      tick={{ fill: 'var(--text-muted)' }}
                      label={{ value: 'Volatilité (%)', position: 'insideBottom', offset: -10, fill: 'var(--text-secondary)' }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="return" 
                      name="Rendement" 
                      unit="%" 
                      stroke="var(--text-muted)"
                      tick={{ fill: 'var(--text-muted)' }}
                      label={{ value: 'Rendement (%)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }}
                    />
                    <ZAxis type="number" dataKey="value" range={[100, 1000]} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div style={{ 
                              background: 'rgb(26, 28, 30)', 
                              border: '1px solid rgb(63, 63, 63)',
                              borderRadius: '8px',
                              padding: '12px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                            }}>
                              <div style={{ 
                                fontSize: '16px', 
                                fontWeight: '700', 
                                color: 'rgb(218, 255, 1)', 
                                marginBottom: '8px',
                                borderBottom: '1px solid rgb(63, 63, 63)',
                                paddingBottom: '8px'
                              }}>
                                {data.symbol}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ color: 'rgb(255, 255, 255)', fontSize: '13px' }}>
                                  <span style={{ color: 'rgb(161, 161, 170)' }}>Rendement: </span>
                                  <span style={{ color: data.return >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)', fontWeight: '600' }}>
                                    {data.return >= 0 ? '+' : ''}{data.return.toFixed(2)}%
                                  </span>
                                </div>
                                <div style={{ color: 'rgb(255, 255, 255)', fontSize: '13px' }}>
                                  <span style={{ color: 'rgb(161, 161, 170)' }}>Volatilité: </span>
                                  <span style={{ fontWeight: '600' }}>{data.volatility.toFixed(2)}%</span>
                                </div>
                                <div style={{ color: 'rgb(255, 255, 255)', fontSize: '13px' }}>
                                  <span style={{ color: 'rgb(161, 161, 170)' }}>Valeur: </span>
                                  <span style={{ fontWeight: '600' }}>{formatCurrency(data.value)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="Positions" data={riskReturnData} fill="var(--accent-primary)">
                      {riskReturnData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.return >= 0 ? 'var(--success)' : 'var(--danger)'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  Les données de volatilité sont en cours de calcul. Veuillez patienter ou rafraîchir la page.
                </p>
              )}

              {/* Position Details Table */}
              <div style={{ marginTop: '32px' }}>
                <h3 className="h3" style={{ marginBottom: '16px' }}>Détail par Position</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                        <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600' }}>Symbole</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600' }}>Valeur</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600' }}>% Portefeuille</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600' }}>Rendement</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600' }}>Volatilité</th>
                        <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <span>Beta</span>
                            <span style={{ fontSize: '10px', color: 'var(--accent-primary)', background: 'var(--accent-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                              vs {PRESET_BENCHMARKS.find(b => b.value === benchmarkIndex)?.label || benchmarkIndex}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{pos.symbol}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-primary)' }}>{formatCurrency(pos.total_value || 0)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--accent-primary)', fontWeight: '600' }}>
                            {totalPortfolioValue > 0 ? ((pos.total_value / totalPortfolioValue) * 100).toFixed(1) : 0}%
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: (pos.gain_loss_percent || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                            {(pos.gain_loss_percent || 0) >= 0 ? '+' : ''}{(pos.gain_loss_percent || 0).toFixed(2)}%
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{(pos.volatility || 0).toFixed(1)}%</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{(pos.beta || 1).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px' }}>Ajoutez des positions pour voir l'analyse risque/rendement</p>
          )}
        </div>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 className="h2">Alertes de Prix</h2>
            <button className="btn-primary" style={{ padding: '12px 24px' }}>
              <Bell size={18} />
              Créer une alerte
            </button>
          </div>
          {alerts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {alerts.map(alert => (
                <div key={alert.id} style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {alert.symbol} - {alert.alert_type === 'price_above' ? 'Prix au-dessus' : alert.alert_type === 'price_below' ? 'Prix en-dessous' : 'Volatilité élevée'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      Cible: {formatCurrency(alert.target_value)}
                    </div>
                  </div>
                  <span className={`badge ${alert.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {alert.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px' }}>
              Aucune alerte configurée. Créez des alertes pour être notifié des mouvements importants.
            </p>
          )}
        </div>
      )}

      {/* Goals */}
      {activeTab === 'goals' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 className="h2">Objectifs Financiers</h2>
            <button className="btn-primary" style={{ padding: '12px 24px' }}>
              <TrendingUp size={18} />
              Nouvel objectif
            </button>
          </div>
          {goals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {goals.map(goal => {
                const progress = 0; // Would calculate actual progress
                return (
                  <div key={goal.id} style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {goal.title}
                        </div>
                        {goal.description && (
                          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{goal.description}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                          {formatCurrency(goal.target_amount)}
                        </div>
                      </div>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px' }}>
              Aucun objectif défini. Fixez-vous des objectifs financiers pour rester motivé!
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default Analytics;
