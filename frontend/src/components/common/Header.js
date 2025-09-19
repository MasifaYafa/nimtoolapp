// frontend/src/components/common/Header.js
import React from "react";
import { NavLink } from "react-router-dom";
import "./Header.css";

export default function Header({ onLogout }) {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: "📊", to: "/" },
    { id: "devices", label: "Devices", icon: "🖥️", to: "/devices" },
    { id: "alerts", label: "Alerts", icon: "🚨", to: "/alerts" },
    { id: "topology", label: "Topology", icon: "🔗", to: "/topology" },
    { id: "configuration", label: "Configuration", icon: "🔧", to: "/configuration" },
    { id: "troubleshoot", label: "Troubleshoot", icon: "🛠️", to: "/troubleshoot" },
    { id: "reports", label: "Reports", icon: "📈", to: "/reports" },
    { id: "settings", label: "Settings", icon: "⚙️", to: "/settings" },
  ];

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">NIM-Tool</h1>
          <nav className="main-nav">
            {items.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.to === "/"} // only exact-match for dashboard
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <div className="user-info">
            <span className="user-name">Admin User</span>
            <button className="btn btn-secondary logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
