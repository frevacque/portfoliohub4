import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, PieChart, LineChart, BarChart3, Bell, Target, Wrench, History, LogOut, Briefcase, Wallet } from 'lucide-react';

const Navbar = ({ user, onLogout }) => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: TrendingUp },
    { path: '/portfolio', label: 'Positions', icon: PieChart },
    { path: '/portfolios', label: 'Portefeuilles', icon: Briefcase },
    { path: '/cash', label: 'Cash', icon: Wallet },
    { path: '/performance', label: 'Performance', icon: LineChart },
    { path: '/analytics', label: 'Analyses', icon: BarChart3 },
    { path: '/alerts', label: 'Alertes', icon: Bell },
    { path: '/goals', label: 'Objectifs', icon: Target },
    { path: '/tools', label: 'Outils', icon: Wrench },
    { path: '/history', label: 'Historique', icon: History },
  ];

  return (
    <nav style={{
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-subtle)',
      padding: '16px 0',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '48px' }}>
          <Link to="/dashboard" style={{
            fontSize: '24px',
            fontWeight: '700',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <TrendingUp size={28} color="var(--accent-primary)" />
            PortfolioHub
          </Link>

          <div style={{ display: 'flex', gap: '8px' }}>
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  color: location.pathname === item.path ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: location.pathname === item.path ? 'var(--accent-bg)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {user?.name || 'User'}
          </span>
          <button
            onClick={onLogout}
            className="btn-ghost"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
