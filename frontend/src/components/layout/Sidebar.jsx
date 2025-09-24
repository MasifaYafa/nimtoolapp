import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({ onLogout }) {
  const items = [
    { to: '/dashboard',     label: 'Dashboard',     icon: 'bi-speedometer2' },
    { to: '/devices',       label: 'Devices',       icon: 'bi-hdd-network' },
    { to: '/alerts',        label: 'Alerts',        icon: 'bi-bell' },
    { to: '/topology',      label: 'Topology',      icon: 'bi-diagram-3' },
    { to: '/configuration', label: 'Configuration', icon: 'bi-sliders' },
    { to: '/troubleshoot',  label: 'Troubleshoot',  icon: 'bi-tools' },
    { to: '/reports',       label: 'Reports',       icon: 'bi-graph-up' },
    { to: '/settings',      label: 'Settings',      icon: 'bi-gear' },
  ];

  return (
    <aside className="nim-sidebar">
      <div className="nim-brand">
        <div className="nim-logo-dot" />
        <span className="nim-brand-text">NIM-Tool</span>
      </div>

      <nav className="nim-nav">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/dashboard'}
            className={({ isActive }) =>
              'nim-nav-item ' + (isActive ? 'active' : '')
            }
          >
            <i className={`bi ${it.icon} nim-nav-icon`} />
            <span className="nim-nav-label">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="nim-sidebar-bottom">
        <button className="nim-logout" onClick={onLogout}>
          <i className="bi bi-box-arrow-right" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
