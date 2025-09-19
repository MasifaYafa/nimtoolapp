import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Alerts from './pages/Alerts';
import Topology from './pages/Topology';
import Configuration from './pages/Configuration';
import Troubleshoot from './pages/Troubleshoot';
import Reports from './pages/Reports';
import AppSettings from './pages/AppSettings'; // ✅ renamed import
import Header from './components/common/Header';

import './styles/globals.css';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in when app starts
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading NIM-Tool...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="App">
        <Header onLogout={handleLogout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard onLogout={handleLogout} />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/topology" element={<Topology />} />
            <Route path="/configuration" element={<Configuration />} />
            <Route path="/troubleshoot" element={<Troubleshoot />} />
            <Route path="/reports" element={<Reports />} />
            {/* ✅ Your requested update */}
            <Route path="/settings" element={<AppSettings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
