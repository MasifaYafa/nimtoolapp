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

// NEW: left sidebar layout (replaces the old Header)
import Sidebar from './components/layout/Sidebar';

// global CSS
import './styles/globals.css';
import './App.css';

// NEW: bootstrap icons (for sidebar)
import 'bootstrap-icons/font/bootstrap-icons.css';

// Canonical keys we will ALWAYS write
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

// Accept any of these when reading (normalizes to the canonical keys above)
const ACCESS_ALIASES = ['accessToken', 'access', 'nim_access'];
const REFRESH_ALIASES = ['refreshToken', 'refresh', 'nim_refresh'];

function readAny(keys) {
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function normalizeToCanonical() {
  const access = readAny(ACCESS_ALIASES);
  const refresh = readAny(REFRESH_ALIASES);
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  return { access, refresh };
}

function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const { access } = normalizeToCanonical();
    setIsAuthenticated(Boolean(access));
    setBooting(false);

    const onStorage = () => {
      const a = readAny(ACCESS_ALIASES);
      setIsAuthenticated(Boolean(a));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = (tokens) => {
    const access = tokens?.access || tokens?.accessToken || tokens?.token;
    const refresh = tokens?.refresh || tokens?.refreshToken;
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    setIsAuthenticated(Boolean(access));
    window.location.replace('/dashboard');
  };

  const logout = () => {
    [...ACCESS_ALIASES, ...REFRESH_ALIASES].forEach(k => localStorage.removeItem(k));
    setIsAuthenticated(false);
    window.location.replace('/');
  };

  return useMemo(() => ({ isAuthenticated, booting, login, logout }), [isAuthenticated, booting]);
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

  const showSidebar = auth.isAuthenticated && window.location.pathname !== '/';

  return (
    <BrowserRouter>
      {showSidebar && <Sidebar onLogout={auth.logout} />}

      {/* Content area sits next to the sidebar */}
      <div className={showSidebar ? 'nim-shell' : ''}>
        <main className="main-content">
          <Routes>
            {/* Login */}
            <Route path="/" element={<Login onLogin={auth.login} />} />

            {/* Protected routes */}
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

            {/* Default */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
