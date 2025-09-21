// frontend/src/App.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Alerts from './pages/Alerts';
import Topology from './pages/Topology';
import Configuration from './pages/Configuration';
import Troubleshoot from './pages/Troubleshoot';
import Reports from './pages/Reports';
import AppSettings from './pages/AppSettings';
import Header from './components/common/Header';

import './styles/globals.css';
import './App.css';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // Align with api.js storage keys
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    setIsAuthenticated(Boolean(access && refresh));
    setBooting(false);
  }, []);

  const login = (tokens) => {
    // Allow either your Login page to call with tokens,
    // or rely on api.js having already saved them.
    if (tokens?.access) localStorage.setItem(ACCESS_KEY, tokens.access);
    if (tokens?.refresh) localStorage.setItem(REFRESH_KEY, tokens.refresh);
    setIsAuthenticated(true);
    // send to dashboard
    window.location.replace('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setIsAuthenticated(false);
    window.location.replace('/');
  };

  return useMemo(
    () => ({ isAuthenticated, booting, login, logout }),
    [isAuthenticated, booting]
  );
}

function ProtectedRoute({ authed, children }) {
  const location = useLocation();
  if (!authed) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  const auth = useAuthState();

  if (auth.booting) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading NIM-Tool...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {/* Hide header on the login page */}
      {window.location.pathname !== '/' && <Header onLogout={auth.logout} />}

      <main className="main-content">
        <Routes>
          {/* Landing page = Login */}
          <Route path="/" element={<Login onLogin={auth.login} />} />

          {/* Protected app routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Dashboard onLogout={auth.logout} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/devices"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Devices />
              </ProtectedRoute>
            }
          />

          <Route
            path="/alerts"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Alerts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/topology"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Topology />
              </ProtectedRoute>
            }
          />

          <Route
            path="/configuration"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Configuration />
              </ProtectedRoute>
            }
          />

          <Route
            path="/troubleshoot"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Troubleshoot />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <Reports />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute authed={auth.isAuthenticated}>
                <AppSettings />
              </ProtectedRoute>
            }
          />

          {/* Catch-all → Login */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
