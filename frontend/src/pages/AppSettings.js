import React, { useState, useEffect } from 'react';
import { api, apiUtils } from '../services/api';
import './AppSettings.css';

const AppSettings = () => {
  // State management
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Settings state
  const [settings, setSettings] = useState({
    ping_interval: 5,
    snmp_timeout: 10,
    alert_threshold: 3,
    retry_attempts: 3
  });

  // Users state
  const [users, setUsers] = useState([]);

  // New user form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: '',
    profile: {
      phone: '',
      department: ''
    }
  });

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        api.request('/app_settings/settings/'),
        api.request('/app_settings/users/')
      ]);

      setSettings(settingsRes);
      setUsers(usersRes);
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (message, type = 'success') => {
    if (type === 'success') {
      setSuccess(message);
      setError('');
    } else {
      setError(message);
      setSuccess('');
    }

    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 5000);
  };

  const handleSettingsChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: parseInt(value) || 0
    }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const response = await api.request('/app_settings/settings/1/', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings(response);
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
      const response = await api.request('/app_settings/settings/test_snmp/', {
        method: 'POST'
      });

      if (response.success) {
        showMessage(`SNMP test successful! Response time: ${response.response_time}ms`);
      } else {
        showMessage(response.message, 'error');
      }
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNewUserChange = (path, value) => {
    if (path.includes('.')) {
      const [parent, child] = path.split('.');
      setNewUser(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setNewUser(prev => ({
        ...prev,
        [path]: value
      }));
    }
  };

  const handleAddUser = async () => {
    if (newUser.password !== newUser.confirm_password) {
      showMessage('Passwords do not match', 'error');
      return;
    }

    if (newUser.password.length < 8) {
      showMessage('Password must be at least 8 characters', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await api.request('/app_settings/users/', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });

      setUsers([...users, response]);
      setNewUser({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        confirm_password: '',
        profile: { phone: '', department: '' }
      });
      setShowAddUser(false);
      showMessage('User created successfully!');
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setLoading(true);
    try {
      await api.request(`/app_settings/users/${userId}/`, {
        method: 'DELETE'
      });

      setUsers(users.filter(user => user.id !== userId));
      showMessage('User deleted successfully!');
    } catch (err) {
      showMessage(apiUtils.handleError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-settings-container">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <h2>App Settings</h2>
          <p>Configure monitoring settings and manage users</p>
        </div>

        {/* Messages */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Loading Overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">Loading...</div>
          </div>
        )}

        {/* Content */}
        <div className="settings-content">

          {/* Monitoring Settings Section */}
          <div className="settings-section">
            <h3>Monitoring Settings</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Ping Interval (seconds)</label>
                <input
                  type="number"
                  value={settings.ping_interval || ''}
                  onChange={(e) => handleSettingsChange('ping_interval', e.target.value)}
                  className="form-input"
                  min="1"
                  max="300"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>SNMP Timeout (seconds)</label>
                <input
                  type="number"
                  value={settings.snmp_timeout || ''}
                  onChange={(e) => handleSettingsChange('snmp_timeout', e.target.value)}
                  className="form-input"
                  min="1"
                  max="60"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Alert Threshold (failed checks)</label>
                <input
                  type="number"
                  value={settings.alert_threshold || ''}
                  onChange={(e) => handleSettingsChange('alert_threshold', e.target.value)}
                  className="form-input"
                  min="1"
                  max="10"
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Retry Attempts</label>
                <input
                  type="number"
                  value={settings.retry_attempts || ''}
                  onChange={(e) => handleSettingsChange('retry_attempts', e.target.value)}
                  className="form-input"
                  min="1"
                  max="5"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-info"
                onClick={handleTestSNMP}
                disabled={loading}
              >
                Test SNMP Connection
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={loading}
              >
                Save Settings
              </button>
            </div>
          </div>

          {/* User Management Section */}
          <div className="settings-section">
            <div className="section-header">
              <h3>User Management</h3>
              <button
                className="btn btn-success"
                onClick={() => setShowAddUser(!showAddUser)}
                disabled={loading}
              >
                {showAddUser ? 'Cancel' : 'Add User'}
              </button>
            </div>

            {/* Add User Form */}
            {showAddUser && (
              <div className="add-user-form">
                <h4>Add New User</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => handleNewUserChange('username', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => handleNewUserChange('email', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={newUser.first_name}
                      onChange={(e) => handleNewUserChange('first_name', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={newUser.last_name}
                      onChange={(e) => handleNewUserChange('last_name', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="text"
                      value={newUser.profile.phone}
                      onChange={(e) => handleNewUserChange('profile.phone', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      value={newUser.profile.department}
                      onChange={(e) => handleNewUserChange('profile.department', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => handleNewUserChange('password', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      value={newUser.confirm_password}
                      onChange={(e) => handleNewUserChange('confirm_password', e.target.value)}
                      className="form-input"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-success"
                    onClick={handleAddUser}
                    disabled={loading}
                  >
                    Create User
                  </button>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="users-table">
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
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>{`${user.first_name} ${user.last_name}`.trim() || '-'}</td>
                      <td>{user.profile?.department || '-'}</td>
                      <td>
                        <span className={`status ${user.is_active ? 'active' : 'inactive'}`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppSettings;