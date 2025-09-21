// frontend/src/pages/Login.js
import React, { useState } from 'react';
import { api, tokenManager } from '../services/api';
import './Login.css';

// Background image (place at: frontend/src/assets/login-bg.jpg)
import loginBg from '../assets/login-bg.jpg';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const BG_STYLE = {
    backgroundImage: `url(${loginBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.auth.login({
        username: formData.username.trim(),
        password: formData.password,
      });

      // Handle both shapes: { access, refresh } OR { tokens: { access, refresh } }
      const access = res?.access ?? res?.tokens?.access ?? null;
      const refresh = res?.refresh ?? res?.tokens?.refresh ?? null;

      if (!access || !refresh) {
        throw new Error('Login succeeded but tokens were not returned.');
      }

      // Persist and notify app
      tokenManager.setTokens(access, refresh);
      if (onLogin) onLogin({ access, refresh });
    } catch (err) {
      console.error('Login failed:', err);
      setError(
        err?.message || 'Login failed. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={BG_STYLE}>
      <div className="login-card">
        <div className="login-header">
          <h1>NIM-Tool</h1>
          <p>Network Infrastructure Management Tool</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="username" className="form-label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              className="form-input"
              placeholder="Enter your username"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="form-input"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>Use your admin credentials to login</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
