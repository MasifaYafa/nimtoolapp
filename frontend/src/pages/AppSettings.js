import React, { useEffect, useState } from 'react';
import { api, apiUtils } from '../services/api';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './AppSettings.css';

const VIEWS = {
  HOME: 'home',
  MONITORING: 'monitoring',
  USERS: 'users',
};

export default function AppSettings() {
  // view routing
  const [view, setView] = useState(VIEWS.HOME);

  // common ui state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // settings
  const [settings, setSettings] = useState({
    ping_interval: 5,
    snmp_timeout: 10,
    alert_threshold: 3,
    retry_attempts: 3,
  });

  // users
  const [users, setUsers] = useState([]);

  // new user form
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: '',
    profile: { phone: '', department: '' },
  });

  // load
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        api.request('/app_settings/settings/'),
        api.request('/app_settings/users/'),
      ]);
      if (settingsRes) setSettings(settingsRes);
      if (usersRes) setUsers(usersRes);
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  // helpers
  const showMessage = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 4000);
  };

  const onSettingsChange = (key, val) =>
    setSettings((p) => ({ ...p, [key]: parseInt(val || 0, 10) }));

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const res = await api.request('/app_settings/settings/1/', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res);
      showMessage('Settings saved successfully!');
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSNMP = async () => {
    setLoading(true);
    try {
      const res = await api.request('/app_settings/settings/test_snmp/', {
        method: 'POST',
      });
      if (res?.success) {
        showMessage(`SNMP test successful! Response time: ${res.response_time}ms`);
      } else {
        showMessage(res?.message || 'SNMP test failed', 'error');
      }
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const onNewUserChange = (path, value) => {
    if (path.includes('.')) {
      const [parent, child] = path.split('.');
      setNewUser((p) => ({ ...p, [parent]: { ...p[parent], [child]: value } }));
    } else {
      setNewUser((p) => ({ ...p, [path]: value }));
    }
  };

  const handleAddUser = async () => {
    if (newUser.password !== newUser.confirm_password) {
      showMessage('Passwords do not match', 'error');
      return;
    }
    if ((newUser.password || '').length < 8) {
      showMessage('Password must be at least 8 characters', 'error');
      return;
    }

    setLoading(true);
    try {
      const created = await api.request('/app_settings/users/', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setUsers((u) => [...u, created]);
      setShowAddUser(false);
      setNewUser({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        confirm_password: '',
        profile: { phone: '', department: '' },
      });
      showMessage('User created successfully!');
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    setLoading(true);
    try {
      await api.request(`/app_settings/users/${id}/`, { method: 'DELETE' });
      setUsers((u) => u.filter((x) => x.id !== id));
      showMessage('User deleted successfully!');
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  // header
  const BackBtn =
    view !== VIEWS.HOME ? (
      <button className="btn btn-secondary" onClick={() => setView(VIEWS.HOME)}>
        <i className="bi bi-arrow-left-short" />
        Back
      </button>
    ) : null;

  return (
    <div className="app-settings-container">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div>
            <h2>App Settings</h2>
            <p>Configure monitoring settings and manage users</p>
          </div>
          <div className="breadcrumbs">{BackBtn}</div>
        </div>

        {/* Alerts */}
        {error && <div className="alert alert-error"><i className="bi bi-exclamation-triangle" /> {error}</div>}
        {success && <div className="alert alert-success"><i className="bi bi-check-circle" /> {success}</div>}

        {/* Loading */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-box">
              <i className="bi bi-arrow-repeat spin" /> Loading…
            </div>
          </div>
        )}

        {/* VIEWS */}
        {view === VIEWS.HOME && (
          <div className="cards-grid">
            <button className="tile-card" onClick={() => setView(VIEWS.Monitoring || VIEWS.MONITORING)}>
              <div className="tile-icon"><i className="bi bi-speedometer2" /></div>
              <div className="tile-body">
                <h3>Monitoring Settings</h3>
                <p>Intervals, timeouts and alert thresholds for network monitoring.</p>
              </div>
              <div className="tile-chevron"><i className="bi bi-chevron-right" /></div>
            </button>

            <button className="tile-card" onClick={() => setView(VIEWS.USERS)}>
              <div className="tile-icon"><i className="bi bi-people" /></div>
              <div className="tile-body">
                <h3>User Management</h3>
                <p>Create, remove and manage user access and profiles.</p>
              </div>
              <div className="tile-chevron"><i className="bi bi-chevron-right" /></div>
            </button>
          </div>
        )}

        {view === VIEWS.MONITORING && (
          <div className="card">
            <div className="card-head">
              <h3><i className="bi bi-speedometer2" /> Monitoring Settings</h3>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Ping Interval (seconds)</label>
                <input
                  type="number"
                  className="form-input"
                  min="1" max="300"
                  value={settings.ping_interval ?? ''}
                  onChange={(e) => onSettingsChange('ping_interval', e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>SNMP Timeout (seconds)</label>
                <input
                  type="number"
                  className="form-input"
                  min="1" max="60"
                  value={settings.snmp_timeout ?? ''}
                  onChange={(e) => onSettingsChange('snmp_timeout', e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Alert Threshold (failed checks)</label>
                <input
                  type="number"
                  className="form-input"
                  min="1" max="10"
                  value={settings.alert_threshold ?? ''}
                  onChange={(e) => onSettingsChange('alert_threshold', e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Retry Attempts</label>
                <input
                  type="number"
                  className="form-input"
                  min="1" max="5"
                  value={settings.retry_attempts ?? ''}
                  onChange={(e) => onSettingsChange('retry_attempts', e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-info" onClick={handleTestSNMP} disabled={loading}>
                <i className="bi bi-activity" /> Test SNMP Connection
              </button>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={loading}>
                <i className="bi bi-save" /> Save Settings
              </button>
            </div>
          </div>
        )}

        {view === VIEWS.USERS && (
          <div className="card">
            <div className="card-head card-head-row">
              <h3><i className="bi bi-people" /> User Management</h3>
              <button className="btn btn-success" onClick={() => setShowAddUser((s) => !s)} disabled={loading}>
                <i className="bi bi-person-plus" /> {showAddUser ? 'Cancel' : 'Add User'}
              </button>
            </div>

            {showAddUser && (
              <div className="subcard">
                <h4><i className="bi bi-person-plus" /> Add New User</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Username</label>
                    <input className="form-input" value={newUser.username}
                      onChange={(e) => onNewUserChange('username', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" className="form-input" value={newUser.email}
                      onChange={(e) => onNewUserChange('email', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>First Name</label>
                    <input className="form-input" value={newUser.first_name}
                      onChange={(e) => onNewUserChange('first_name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input className="form-input" value={newUser.last_name}
                      onChange={(e) => onNewUserChange('last_name', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input className="form-input" value={newUser.profile.phone}
                      onChange={(e) => onNewUserChange('profile.phone', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input className="form-input" value={newUser.profile.department}
                      onChange={(e) => onNewUserChange('profile.department', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" className="form-input" value={newUser.password}
                      onChange={(e) => onNewUserChange('password', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input type="password" className="form-input" value={newUser.confirm_password}
                      onChange={(e) => onNewUserChange('confirm_password', e.target.value)} />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-success" onClick={handleAddUser} disabled={loading}>
                    <i className="bi bi-check2-circle" /> Create User
                  </button>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || '-'}</td>
                      <td>{u.profile?.department || '-'}</td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-secondary'}`}>
                          <i className={`bi ${u.is_active ? 'bi-check-circle' : 'bi-dash-circle'}`} />
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteUser(u.id)}
                          disabled={loading}
                        >
                          <i className="bi bi-trash" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!users || users.length === 0) && (
                    <tr><td colSpan="6" style={{ color: '#9aa3b2' }}>No users.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
