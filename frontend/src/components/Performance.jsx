import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, RefreshCw } from 'lucide-react';
import { portfolioAPI, storage } from '../api';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Performance = () => {
  const [period, setPeriod] = useState('ytd');
  const [portfolioPerf, setPortfolioPerf] = useState(null);
  const [positionsPerf, setPositionsPerf] = useState([]);
  const [positions, setPositions] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [indexComparison, setIndexComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = storage.getUserId();

  const periods = [
    { value: 'all', label: 'Tout' },
    { value: 'ytd', label: 'YTD' },
    { value: '1y', label: '1 An' },
    { value: '6m', label: '6 Mois' },
    { value: '3m', label: '3 Mois' },
    { value: '1m', label: '1 Mois' }
  ];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const fetchData = async () => {
    try {
      // Get positions
      const positionsData = await portfolioAPI.getPositions(userId);
      setPositions(positionsData);

      // Get portfolio performance
      const portfolioPerfData = await axios.get(`${API}/analytics/performance?user_id=${userId}&period=${period}`);
      setPortfolioPerf(portfolioPerfData.data);

      // Get index comparison for YTD
      if (period === 'ytd' || period === '1y') {
        const comparisonData = await axios.get(`${API}/analytics/compare-index?user_id=${userId}&period=${period}`);
        setIndexComparison(comparisonData.data);
      }

      // Get performance for each position
      const perfPromises = positionsData.map(pos =>
        axios.get(`${API}/analytics/performance?user_id=${userId}&period=${period}&symbol=${pos.symbol}`)
      );
      const perfResults = await Promise.all(perfPromises);
      setPositionsPerf(perfResults.map(r => r.data));

    } catch (error) {
      console.error('Error fetching performance data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>Chargement des données de performance...</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="display-md" style={{ marginBottom: '8px' }}>Performance</h1>
          <p className="body-md" style={{ color: 'var(--text-muted)' }}>Analysez la performance de votre portefeuille</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', flexWrap: 'wrap' }}>
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              style={{
                flex: '1',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                background: period === p.value ? 'var(--accent-primary)' : 'transparent',
                color: period === p.value ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontSize: '15px',
                minWidth: '80px'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Performance Summary */}
      {portfolioPerf && portfolioPerf.data && portfolioPerf.data.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 className="h2" style={{ marginBottom: '8px' }}>Performance du Portefeuille</h2>
              <p className="body-sm" style={{ color: 'var(--text-muted)' }}>
                {period === 'ytd' ? 'Depuis le 1er janvier' : period === 'all' ? 'Depuis le début' : `Derniers ${periods.find(p => p.value === period)?.label}`}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '700', 
                color: portfolioPerf.total_return_percent >= 0 ? 'var(--success)' : 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {portfolioPerf.total_return_percent >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                {formatPercent(portfolioPerf.total_return_percent)}
              </div>
              <div style={{ fontSize: '18px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {formatCurrency(portfolioPerf.total_return)}
              </div>
            </div>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={portfolioPerf.data}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(218, 255, 1)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="rgb(218, 255, 1)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="rgb(161, 161, 170)"
                tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
              />
              <YAxis 
                stroke="rgb(161, 161, 170)"
                tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
                tickFormatter={(value) => `${(value/1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'rgb(26, 28, 30)', 
                  border: '1px solid rgb(63, 63, 63)',
                  borderRadius: '8px',
                  color: 'rgb(255, 255, 255)'
                }}
                formatter={(value) => [formatCurrency(value), 'Valeur']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="rgb(218, 255, 1)" 
                strokeWidth={2}
                fill="url(#colorValue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Index Comparison */}
      {indexComparison && indexComparison.data && indexComparison.data.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <h2 className="h2" style={{ marginBottom: '24px' }}>Comparaison avec le S&P 500</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={indexComparison.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="rgb(161, 161, 170)"
                tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
              />
              <YAxis 
                stroke="rgb(161, 161, 170)"
                tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'rgb(26, 28, 30)', 
                  border: '1px solid rgb(63, 63, 63)',
                  borderRadius: '8px',
                  color: 'rgb(255, 255, 255)'
                }}
                formatter={(value) => `${value.toFixed(2)}%`}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="portfolio_percent" 
                stroke="rgb(218, 255, 1)" 
                strokeWidth={2}
                name="Votre Portefeuille"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="index_percent" 
                stroke="rgb(59, 130, 246)" 
                strokeWidth={2}
                name="S&P 500"
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Individual Positions Performance */}
      <div className="card">
        <h2 className="h2" style={{ marginBottom: '24px' }}>Performance par Position</h2>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '16px',
          marginBottom: '32px'
        }}>
          {positionsPerf.map((perf, idx) => {
            const position = positions[idx];
            if (!perf || !perf.data || perf.data.length === 0) return null;

            return (
              <div 
                key={position.symbol}
                className="card"
                style={{
                  cursor: 'pointer',
                  background: selectedPosition === position.symbol ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
                  border: selectedPosition === position.symbol ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedPosition(selectedPosition === position.symbol ? null : position.symbol)}
              >
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    {position.symbol}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{position.name}</div>
                </div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: perf.total_return_percent >= 0 ? 'var(--success)' : 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {perf.total_return_percent >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                  {formatPercent(perf.total_return_percent)}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {formatCurrency(perf.total_return)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Position Chart */}
        {selectedPosition && (() => {
          const perf = positionsPerf.find(p => p.symbol === selectedPosition);
          if (!perf || !perf.data || perf.data.length === 0) return null;

          return (
            <div>
              <h3 className="h3" style={{ marginBottom: '16px' }}>Graphique - {selectedPosition}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={perf.data}>
                  <defs>
                    <linearGradient id={`color${selectedPosition}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={perf.total_return_percent >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={perf.total_return_percent >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgb(161, 161, 170)"
                    tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="rgb(161, 161, 170)"
                    tick={{ fill: 'rgb(161, 161, 170)', fontSize: 12 }}
                    tickFormatter={(value) => `${(value/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgb(26, 28, 30)', 
                      border: '1px solid rgb(63, 63, 63)',
                      borderRadius: '8px',
                      color: 'rgb(255, 255, 255)'
                    }}
                    formatter={(value) => [formatCurrency(value), 'Valeur']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={perf.total_return_percent >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'} 
                    strokeWidth={2}
                    fill={`url(#color${selectedPosition})`} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </div>

      {positions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '18px', marginBottom: '16px' }}>
            Aucune position dans votre portefeuille
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Ajoutez des positions pour voir leur performance
          </p>
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

export default Performance;
