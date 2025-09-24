// frontend/src/pages/Devices.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, tokenManager } from '../services/api';
import './Devices.css';

/* -------------------------------------------
   Bootstrap icon helpers for device types
-------------------------------------------- */
const TYPE_ICON_BY_NAME = [
  { match: /router|cpe|lte|modem/i, iconClass: 'bi-hdd-network' },
  { match: /switch/i,               iconClass: 'bi-diagram-3' },
  { match: /access\s*point|ap/i,    iconClass: 'bi-wifi' },
  { match: /firewall/i,             iconClass: 'bi-shield-lock' },
  { match: /server/i,               iconClass: 'bi-server' },
  { match: /printer/i,              iconClass: 'bi-printer' },
  { match: /ups/i,                  iconClass: 'bi-battery-charging' },
];
const iconClassForTypeName = (name = '') =>
  (TYPE_ICON_BY_NAME.find(({ match }) => match.test(name))?.iconClass) || 'bi-box';

const DEFAULT_TYPES = [
  { id: -1, name: 'Router',       iconClass: 'bi-hdd-network', isPlaceholder: true },
  { id: -2, name: 'Switch',       iconClass: 'bi-diagram-3',   isPlaceholder: true },
  { id: -3, name: 'Access Point', iconClass: 'bi-wifi',        isPlaceholder: true },
  { id: -4, name: 'Firewall',     iconClass: 'bi-shield-lock', isPlaceholder: true },
  { id: -5, name: 'Server',       iconClass: 'bi-server',      isPlaceholder: true },
  { id: -6, name: 'Printer',      iconClass: 'bi-printer',     isPlaceholder: true },
  { id: -7, name: 'UPS',          iconClass: 'bi-battery-charging', isPlaceholder: true },
];

/* ===========================================
   Component
=========================================== */
const Devices = () => {
  // Lists & meta
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]); // [{id,name,iconClass,isPlaceholder?}]
  const [typeById, setTypeById] = useState({});
  const [usingFallbackTypes, setUsingFallbackTypes] = useState(false);

  // Stats
  const [statistics, setStatistics] = useState({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    warning_devices: 0,
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [typesLoading, setTypesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [pingLoading, setPingLoading] = useState({});
  const [pingAllLoading, setPingAllLoading] = useState(false);

  // Form model
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ip_address: '',
    device_type: '',
    vendor: '',
    model: '',
    location: '',
    monitoring_enabled: true,
  });

  /* -------------------------------------------
     Helpers
  -------------------------------------------- */
  const authFetch = async (url, init = {}) => {
    const token =
      tokenManager.getAccess?.() ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token') ||
      '';
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };

  const normalizeTypes = (raw) => {
    const list = Array.isArray(raw) ? raw : raw?.results || [];
    return list
      .map((t) => {
        const id = Number(t.id ?? t.pk);
        const name = String(t.name ?? t.label ?? t.title ?? '').trim();
        if (!name || !Number.isFinite(id)) return null;
        return { id, name, iconClass: iconClassForTypeName(name) };
      })
      .filter(Boolean);
  };

  const buildTypeIndex = (arr) => {
    const m = {};
    arr.forEach((t) => (m[t.id] = t));
    return m;
  };

  /* -------------------------------------------
     Load device types (with silent fallback)
  -------------------------------------------- */
  const loadDeviceTypes = useCallback(async () => {
    setTypesLoading(true);
    setUsingFallbackTypes(false);
    try {
      // 1) If api exposes helper
      if (api.devices?.types) {
        const data = await api.devices.types();
        const normalized = normalizeTypes(data);
        if (normalized.length) {
          setDeviceTypes(normalized);
          setTypeById(buildTypeIndex(normalized));
          setTypesLoading(false);
          return;
        }
      }

      // 2) Probe common endpoints
      const candidates = [
        '/api/v1/devices/types/',
        '/api/v1/devices/device-types/',
        '/api/v1/device-types/',
        '/api/v1/devicetypes/',
      ];
      for (const path of candidates) {
        try {
          const data = await authFetch(path);
          const normalized = normalizeTypes(data);
          if (normalized.length) {
            setDeviceTypes(normalized);
            setTypeById(buildTypeIndex(normalized));
            setTypesLoading(false);
            return;
          }
        } catch {
          /* keep trying */
        }
      }

      // 3) Fallback (no banner — just works visually)
      setDeviceTypes(DEFAULT_TYPES);
      setTypeById(buildTypeIndex(DEFAULT_TYPES));
      setUsingFallbackTypes(true);
    } finally {
      setTypesLoading(false);
    }
  }, []);

  /* -------------------------------------------
     Devices & stats
  -------------------------------------------- */
  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      if (!tokenManager.isLoggedIn?.() && !localStorage.getItem('accessToken')) {
        window.location.replace('/');
        return;
      }
      const response = await api.devices.list();
      const items = Array.isArray(response) ? response : response?.results || [];
      setDevices(items);
      setError(null);
    } catch (err) {
      console.error('❌ Error loading devices:', err);
      setError('Failed to load devices: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatistics = useCallback(async () => {
    try {
      const stats = await api.devices.statistics();
      if (stats) {
        setStatistics(stats);
        return;
      }
      throw new Error('No stats');
    } catch {
      setStatistics({
        total_devices: devices.length,
        online_devices: devices.filter((d) => d.status === 'online').length,
        offline_devices: devices.filter((d) => d.status === 'offline').length,
        warning_devices: devices.filter((d) => d.status === 'warning').length,
      });
    }
  }, [devices]);

  // Initial load
  useEffect(() => {
    loadDeviceTypes();
    loadDevices();
  }, [loadDeviceTypes, loadDevices]);

  // Update stats when devices change
  useEffect(() => {
    if (devices.length) loadStatistics();
  }, [devices, loadStatistics]);

  /* -------------------------------------------
     CRUD
  -------------------------------------------- */
  const createDevice = async (deviceData) => {
    try {
      const chosen = typeById[Number(deviceData.device_type)];
      if (!chosen) throw new Error('Invalid device type selected.');
      if (chosen.isPlaceholder) {
        setError(
          'Please create real Device Types on the server (e.g., via Admin), then pick one from the list.'
        );
        return;
      }
      const payload = { ...deviceData, device_type: Number(deviceData.device_type) };
      await api.devices.create(payload);
      await loadDevices();
      await loadStatistics();
      setShowAddModal(false);
      resetForm();
      setError(null);
    } catch (err) {
      console.error('❌ Error creating device:', err);
      if (String(err.message).match(/Invalid pk|device_type|incorrect type/i)) {
        setError('Invalid device type selected. Pick a real server type and try again.');
      } else if (String(err.message).match(/unique|ip_address/i)) {
        setError('A device with this IP already exists. Use a different IP.');
      } else {
        setError('Failed to create device: ' + err.message);
      }
    }
  };

  const updateDevice = async (id, deviceData) => {
    try {
      const chosen = typeById[Number(deviceData.device_type)];
      if (!chosen || chosen.isPlaceholder) {
        setError('Pick a real device type (after adding on server) and try again.');
        return;
      }
      const payload = { ...deviceData, device_type: Number(deviceData.device_type) };
      await api.devices.update(id, payload);
      await loadDevices();
      await loadStatistics();
      setShowEditModal(false);
      resetForm();
      setSelectedDevice(null);
      setError(null);
    } catch (err) {
      console.error('❌ Error updating device:', err);
      setError('Failed to update device: ' + err.message);
    }
  };

  const deleteDevice = async (id) => {
    try {
      await api.devices.delete(id);
      await loadDevices();
      await loadStatistics();
      setShowDeleteModal(false);
      setSelectedDevice(null);
      setError(null);
    } catch (err) {
      console.error('❌ Error deleting device:', err);
      if (String(err.message).match(/500|internal/i)) {
        setError('Cannot delete device. It may be referenced by other records.');
      } else {
        setError('Failed to delete device: ' + err.message);
      }
    }
  };

  /* -------------------------------------------
     Actions
  -------------------------------------------- */
  const pingDevice = async (device) => {
    const deviceId = device.id;
    try {
      setPingLoading((prev) => ({ ...prev, [deviceId]: true }));
      setError(null);
      const result = await api.devices.ping(deviceId);
      if (result?.success) {
        setError(`✔️ ${device.name}: Online (${result.response_time}ms)`);
        setTimeout(() => setError(null), 3000);
      } else {
        setError(`✖ ${device.name}: ${result?.message || 'Ping failed'}`);
        setTimeout(() => setError(null), 5000);
      }
      await loadDevices();
      await loadStatistics();
    } catch (err) {
      console.error('❌ Ping error:', err);
      setError(`✖ Failed to ping ${device.name}: ${err.message}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setPingLoading((prev) => ({ ...prev, [deviceId]: false }));
    }
  };

  const pingAllDevices = async () => {
    try {
      setPingAllLoading(true);
      setError(null);
      const result = await api.devices.pingAll();
      if (result?.summary) {
        const { summary } = result;
        setError(`Ping All: ${summary.online}/${summary.total} online (${summary.success_rate}% success)`);
        setTimeout(() => setError(null), 5000);
      }
      await loadDevices();
      await loadStatistics();
    } catch (err) {
      console.error('❌ Ping all error:', err);
      setError('Failed to ping all devices: ' + err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setPingAllLoading(false);
    }
  };

  /* -------------------------------------------
     Form & Modal
  -------------------------------------------- */
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      ip_address: '',
      device_type: '',
      vendor: '',
      model: '',
      location: '',
      monitoring_enabled: true,
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.ip_address || !formData.device_type) {
      setError('Please fill Name, IP Address and Device Type.');
      return;
    }
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(formData.ip_address)) {
      setError('Please enter a valid IP address (e.g., 192.168.1.100).');
      return;
    }
    if (selectedDevice) await updateDevice(selectedDevice.id, formData);
    else await createDevice(formData);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (device) => {
    setSelectedDevice(device);
    let dt = device.device_type;
    if (dt && typeof dt === 'object') dt = dt.id;
    if (typeof dt !== 'number') dt = Number(dt) || '';
    setFormData({
      name: device.name || '',
      description: device.description || '',
      ip_address: device.ip_address || '',
      device_type: dt,
      vendor: device.vendor || '',
      model: device.model || '',
      location: device.location || '',
      monitoring_enabled: device.monitoring_enabled !== false,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (device) => {
    setSelectedDevice(device);
    setShowDeleteModal(true);
  };

  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setSelectedDevice(null);
    resetForm();
  };

  /* -------------------------------------------
     Filtering & display helpers
  -------------------------------------------- */
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        device.name?.toLowerCase().includes(q) ||
        device.ip_address?.includes(searchTerm) ||
        device.vendor?.toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || device.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [devices, searchTerm, filterStatus]);

  const getStatusClass = (status) => {
    switch (status) {
      case 'online':
        return 'status-online';
      case 'offline':
        return 'status-offline';
      case 'warning':
        return 'status-warning';
      case 'maintenance':
        return 'status-maintenance';
      default:
        return 'status-unknown';
    }
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Never';
    const now = new Date();
    const ds = new Date(lastSeen);
    const diffMins = Math.floor((now - ds) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  const typeDisplay = (device) => {
    // Prefer backend-provided display if available
    if (device.device_type_name || device.device_type_icon) {
      return (
        <span className="device-type">
          {device.device_type_icon ? <i className={`bi ${device.device_type_icon}`} /> : null}{' '}
          {device.device_type_name || ''}
        </span>
      );
    }
    let id = device.device_type;
    if (id && typeof id === 'object') id = id.id;
    id = Number(id);
    const meta = typeById[id];
    return (
      <span className="device-type">
        <i className={`bi ${meta?.iconClass || 'bi-box'}`} /> {(meta?.name) || 'Unknown'}
      </span>
    );
  };

  /* -------------------------------------------
     Render
  -------------------------------------------- */
  if (loading) {
    return (
      <div className="devices-container">
        <div className="container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading devices...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="devices-container">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <h2>Device Management</h2>
          <p>Monitor and manage your network devices with real-time ping functionality</p>
        </div>

        {/* Error / Info banner (only operational messages) */}
        {error && (
          <div className="error-message">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="error-close">×</button>
          </div>
        )}

        {/* Controls */}
        <div className="devices-controls">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-section">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="action-buttons-group">
            <button
              className="btn btn-success add-device-btn"
              onClick={pingAllDevices}
              disabled={pingAllLoading}
              title="Ping all devices"
            >
              {pingAllLoading ? (
                <>
                  <i className="bi bi-arrow-repeat spin" /> Pinging…
                </>
              ) : (
                <>
                  <i className="bi bi-broadcast-pin" /> Ping All
                </>
              )}
            </button>

            {/* (Removed "Test Network" by request) */}

            <button className="btn btn-primary add-device-btn" onClick={openAddModal}>
              <i className="bi bi-plus-lg" /> Add Device
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="device-stats">
          <div className="stat-item">
            <span className="stat-label">Total Devices</span>
            <span className="stat-value">{statistics.total_devices}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Online</span>
            <span className="stat-value online">{statistics.online_devices}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Offline</span>
            <span className="stat-value offline">{statistics.offline_devices}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Warning</span>
            <span className="stat-value warning">{statistics.warning_devices}</span>
          </div>
        </div>

        {/* Table */}
        <div className="devices-table-container">
          {filteredDevices.length === 0 ? (
            <div className="no-devices">
              <p>
                No devices found.{' '}
                {devices.length === 0 ? 'Add your first device!' : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : (
            <table className="devices-table">
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>IP Address</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Response Time</th>
                  <th>Vendor</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td className="device-name">
                      <strong>{device.name}</strong>
                      {device.description && <div className="device-description">{device.description}</div>}
                    </td>
                    <td className="ip-address">{device.ip_address}</td>
                    <td>{typeDisplay(device)}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(device.status)}`}>
                        {device.status_display || device.status}
                      </span>
                    </td>
                    <td className="response-time">{device.response_time ? `${device.response_time}ms` : '-'}</td>
                    <td>{device.vendor || '-'}</td>
                    <td>{formatLastSeen(device.last_seen)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-small btn-info"
                          onClick={() => openEditModal(device)}
                          title="Edit device"
                        >
                          <i className="bi bi-pencil-square" /> Edit
                        </button>
                        <button
                          className={`btn-small btn-warning ${pingLoading[device.id] ? 'loading' : ''}`}
                          onClick={() => pingDevice(device)}
                          disabled={pingLoading[device.id]}
                          title="Ping device"
                        >
                          {pingLoading[device.id] ? (
                            <>
                              <i className="bi bi-arrow-repeat spin" /> Ping
                            </>
                          ) : (
                            <>
                              <i className="bi bi-broadcast" /> Ping
                            </>
                          )}
                        </button>
                        <button
                          className="btn-small btn-danger"
                          onClick={() => openDeleteModal(device)}
                          title="Delete device"
                        >
                          <i className="bi bi-trash" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Modal */}
        {showAddModal && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add New Device</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <form onSubmit={handleSubmit} className="device-form">
                <div className="form-section">
                  <h4 className="form-section-title">Basic Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., AP-Office-Main"
                      />
                    </div>
                    <div className="form-group">
                      <label>IP Address *</label>
                      <input
                        type="text"
                        name="ip_address"
                        value={formData.ip_address}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., 192.168.1.50"
                        pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Type *</label>
                      <select
                        name="device_type"
                        value={formData.device_type}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">{typesLoading ? 'Loading types…' : 'Choose device type...'}</option>
                        {deviceTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} {type.isPlaceholder ? '(add on server)' : ''}
                          </option>
                        ))}
                      </select>
                      {usingFallbackTypes && (
                        <small className="form-help">
                          These are placeholders to help you get started. Add real types in Admin then select them here.
                        </small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Location</label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleInputChange}
                        placeholder="e.g., Main Office, Building A"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">Hardware Details</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor</label>
                      <input
                        type="text"
                        name="vendor"
                        value={formData.vendor}
                        onChange={handleInputChange}
                        placeholder="e.g., Ubiquiti, Cisco, TP-Link"
                      />
                    </div>
                    <div className="form-group">
                      <label>Model</label>
                      <input
                        type="text"
                        name="model"
                        value={formData.model}
                        onChange={handleInputChange}
                        placeholder="e.g., UniFi AC Pro, EAP225"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">Configuration</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Describe the device's purpose or any notes..."
                      rows="3"
                    />
                  </div>
                  <div className="form-group checkbox-group">
                    <input
                      type="checkbox"
                      name="monitoring_enabled"
                      checked={formData.monitoring_enabled}
                      onChange={handleInputChange}
                    />
                    <label className="checkbox-label">
                      <strong>Enable real-time monitoring for this device</strong>
                      <div className="form-help">The system will perform network pings automatically.</div>
                    </label>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModals}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add Device
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedDevice && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit Device: {selectedDevice.name}</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <form onSubmit={handleSubmit} className="device-form">
                <div className="form-section">
                  <h4 className="form-section-title">Basic Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., Router-R1, Switch-Floor2"
                      />
                    </div>
                    <div className="form-group">
                      <label>IP Address *</label>
                      <input
                        type="text"
                        name="ip_address"
                        value={formData.ip_address}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., 192.168.1.1"
                        pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Type *</label>
                      <select
                        name="device_type"
                        value={formData.device_type}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">{typesLoading ? 'Loading types…' : 'Choose device type...'}</option>
                        {deviceTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} {type.isPlaceholder ? '(add on server)' : ''}
                          </option>
                        ))}
                      </select>
                      {usingFallbackTypes && (
                        <small className="form-help">Pick a real server type after adding it in Admin.</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Location</label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleInputChange}
                        placeholder="e.g., Server Room A, Floor 2"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">Hardware Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor</label>
                      <input
                        type="text"
                        name="vendor"
                        value={formData.vendor}
                        onChange={handleInputChange}
                        placeholder="e.g., Cisco, Ubiquiti, Dell"
                      />
                    </div>
                    <div className="form-group">
                      <label>Model</label>
                      <input
                        type="text"
                        name="model"
                        value={formData.model}
                        onChange={handleInputChange}
                        placeholder="e.g., ISR4321, UniFi AC Pro"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">Settings</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Optional description..."
                      rows="3"
                    />
                  </div>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="monitoring_enabled"
                        checked={formData.monitoring_enabled}
                        onChange={handleInputChange}
                      />
                      <span className="checkmark"></span>
                      Enable real-time monitoring for this device
                    </label>
                    <small className="form-help">The system will perform real ping tests</small>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModals}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Update Device
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && selectedDevice && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirm Deletion</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to delete <strong>{selectedDevice.name}</strong>?
                </p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={closeModals}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={() => deleteDevice(selectedDevice.id)}>
                  Delete Device
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Devices;
