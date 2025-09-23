// frontend/src/pages/Devices.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, tokenManager } from '../services/api';
import './Devices.css';
import devicesBg from '../assets/devices-bg.jpg';

// Background image style
const BG_STYLE = {
  backgroundImage: `url(${devicesBg})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

/* -------------------------------------------
   Icons for device-type-friendly names
-------------------------------------------- */
const TYPE_ICON_BY_NAME = [
  { match: /router|cpe|lte|modem/i, icon: '🌐' },
  { match: /switch/i,               icon: '🔀' },
  { match: /access\s*point|ap/i,    icon: '📡' },
  { match: /firewall/i,             icon: '🔥' },
  { match: /server/i,               icon: '🖥️' },
  { match: /printer/i,              icon: '🖨️' },
  { match: /ups/i,                  icon: '🔋' },
];
const iconForTypeName = (name = '') =>
  (TYPE_ICON_BY_NAME.find(({ match }) => match.test(name))?.icon) || '📦';

/* ===========================================
   Component
=========================================== */
const Devices = () => {
  // Lists & meta
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]); // [{id,name,icon}]
  const [typeById, setTypeById] = useState({});       // { [id]: meta }

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
  const [typesError, setTypesError] = useState(null);
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
     Device Types loader (robust)
  -------------------------------------------- */
  const authFetch = async (url) => {
    const token = tokenManager.getAccess?.() || localStorage.getItem('accessToken');
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };

  const normalizeTypes = (raw) => {
    const list = Array.isArray(raw) ? raw : (raw?.results || []);
    return list.map((t) => {
      const id = Number(t.id ?? t.pk);
      const name = String(t.name ?? t.label ?? t.title ?? 'Unknown');
      return { id, name, icon: iconForTypeName(name) };
    }).filter(t => Number.isFinite(t.id) && t.name);
  };

  const loadDeviceTypes = useCallback(async () => {
    setTypesLoading(true);
    setTypesError(null);
    try {
      // 1) If your api.js already exposes a typed helper, try that first
      if (api.devices?.types) {
        const data = await api.devices.types();
        const normalized = normalizeTypes(data);
        if (normalized.length) {
          setDeviceTypes(normalized);
          const m = {};
          normalized.forEach(t => (m[t.id] = t));
          setTypeById(m);
          // Ensure form has a valid value or blank
          setFormData(prev => ({
            ...prev,
            device_type: prev.device_type && m[Number(prev.device_type)]
              ? Number(prev.device_type) : ''
          }));
          setTypesLoading(false);
          return;
        }
      }

      // 2) Try common REST endpoints (same-origin; Django serves API)
      const candidates = [
        '/api/v1/devices/types/',
        '/api/v1/devices/device-types/',
        '/api/v1/device-types/',
        '/api/v1/devicetypes/',
      ];

      let success = false;
      for (const path of candidates) {
        try {
          const data = await authFetch(path);
          const normalized = normalizeTypes(data);
          if (normalized.length) {
            setDeviceTypes(normalized);
            const m = {};
            normalized.forEach(t => (m[t.id] = t));
            setTypeById(m);
            setFormData(prev => ({
              ...prev,
              device_type: prev.device_type && m[Number(prev.device_type)]
                ? Number(prev.device_type) : ''
            }));
            success = true;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!success) {
        setDeviceTypes([]);
        setTypeById({});
        setTypesError(
          'No device types found. Add Device Types in the admin or seed them, then click Retry.'
        );
      }
    } catch (err) {
      console.error('❌ Failed to load device types:', err);
      setTypesError('Could not load device types. Click Retry.');
      setDeviceTypes([]);
      setTypeById({});
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
      const items = Array.isArray(response) ? response : (response?.results || []);
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
        online_devices: devices.filter(d => d.status === 'online').length,
        offline_devices: devices.filter(d => d.status === 'offline').length,
        warning_devices: devices.filter(d => d.status === 'warning').length,
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
      const payload = { ...deviceData, device_type: Number(deviceData.device_type) };
      if (!typeById[payload.device_type]) {
        throw new Error('Invalid device type selected.');
      }
      await api.devices.create(payload);
      await loadDevices();
      await loadStatistics();
      setShowAddModal(false);
      resetForm();
      setError(null);
    } catch (err) {
      console.error('❌ Error creating device:', err);
      if (String(err.message).match(/Invalid pk|device_type|incorrect type/i)) {
        setError('Invalid device type selected. Click the field and pick a type again.');
      } else if (String(err.message).match(/unique|ip_address/i)) {
        setError('A device with this IP already exists. Use a different IP.');
      } else {
        setError('Failed to create device: ' + err.message);
      }
    }
  };

  const updateDevice = async (id, deviceData) => {
    try {
      const payload = { ...deviceData, device_type: Number(deviceData.device_type) };
      if (!typeById[payload.device_type]) {
        throw new Error('Invalid device type selected.');
      }
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
      setPingLoading(prev => ({ ...prev, [deviceId]: true }));
      setError(null);
      const result = await api.devices.ping(deviceId);
      if (result?.success) {
        setError(`✅ ${device.name}: Online (${result.response_time}ms)`);
        setTimeout(() => setError(null), 3000);
      } else {
        setError(`❌ ${device.name}: ${result?.message || 'Ping failed'}`);
        setTimeout(() => setError(null), 5000);
      }
      await loadDevices();
      await loadStatistics();
    } catch (err) {
      console.error('❌ Ping error:', err);
      setError(`❌ Failed to ping ${device.name}: ${err.message}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setPingLoading(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const pingAllDevices = async () => {
    try {
      setPingAllLoading(true);
      setError(null);
      const result = await api.devices.pingAll();
      if (result?.summary) {
        const { summary } = result;
        setError(`📊 Ping All: ${summary.online}/${summary.total} online (${summary.success_rate}% success)`);
        setTimeout(() => setError(null), 5000);
      }
      await loadDevices();
      await loadStatistics();
    } catch (err) {
      console.error('❌ Ping all error:', err);
      setError('❌ Failed to ping all devices: ' + err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setPingAllLoading(false);
    }
  };

  const testConnectivity = async () => {
    try {
      setError('🌐 Testing network connectivity...');
      const result = await api.devices.testConnectivity();
      if (result) {
        const statusIcon =
          result.connectivity_status === 'good' ? '✅' :
          result.connectivity_status === 'poor' ? '⚠️' : '❌';
        setError(`${statusIcon} Network: ${result.connectivity_status.toUpperCase()} - ${result.summary}`);
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      console.error('❌ Connectivity error:', err);
      setError('❌ Connectivity test failed: ' + err.message);
      setTimeout(() => setError(null), 5000);
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
    setFormData(prev => ({
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
    return devices.filter(device => {
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
      case 'online': return 'status-online';
      case 'offline': return 'status-offline';
      case 'warning': return 'status-warning';
      case 'maintenance': return 'status-maintenance';
      default: return 'status-unknown';
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
    if (device.device_type_name || device.device_type_icon) {
      return (
        <span className="device-type">
          {device.device_type_icon || ''} {device.device_type_name || ''}
        </span>
      );
    }
    let id = device.device_type;
    if (id && typeof id === 'object') id = id.id;
    id = Number(id);
    const meta = typeById[id];
    return (
      <span className="device-type">
        {(meta?.icon) || '📦'} {(meta?.name) || 'Unknown'}
      </span>
    );
  };

  /* -------------------------------------------
     Render
  -------------------------------------------- */
  if (loading) {
    return (
      <div className="devices-container" style={BG_STYLE}>
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
    <div className="devices-container" style={BG_STYLE}>
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <h2>Device Management</h2>
          <p>Monitor and manage your network devices with real-time ping functionality</p>
        </div>

        {/* Error / Info banner */}
        {error && (
          <div className={`error-message ${error.includes('✅') ? 'success-message' : error.includes('📊') ? 'info-message' : ''}`}>
            <span className="error-icon">{error.includes('✅') ? '✅' : error.includes('📊') ? '📊' : '⚠️'}</span>
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
              className="btn btn-success"
              onClick={pingAllDevices}
              disabled={pingAllLoading}
              title="Ping all devices"
            >
              {pingAllLoading ? '🔄 Pinging...' : '📡 Ping All'}
            </button>
            <button className="btn btn-info" onClick={testConnectivity} title="Test internet connectivity">
              🌐 Test Network
            </button>
            <button className="btn btn-primary add-device-btn" onClick={openAddModal}>
              + Add Device
            </button>
          </div>
        </div>

        {/* If device types failed to load, show a small warning near the top */}
        {typesError && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{typesError}</span>
            <button className="btn btn-small" onClick={loadDeviceTypes} style={{ marginLeft: 8 }}>
              Retry
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="device-stats">
          <div className="stat-item"><span className="stat-label">Total Devices</span><span className="stat-value">{statistics.total_devices}</span></div>
          <div className="stat-item"><span className="stat-label">Online</span><span className="stat-value online">{statistics.online_devices}</span></div>
          <div className="stat-item"><span className="stat-label">Offline</span><span className="stat-value offline">{statistics.offline_devices}</span></div>
          <div className="stat-item"><span className="stat-label">Warning</span><span className="stat-value warning">{statistics.warning_devices}</span></div>
        </div>

        {/* Table */}
        <div className="devices-table-container">
          {filteredDevices.length === 0 ? (
            <div className="no-devices">
              <p>No devices found. {devices.length === 0 ? 'Add your first device!' : 'Try adjusting your search or filters.'}</p>
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
                {filteredDevices.map(device => (
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
                        <button className="btn-small btn-info" onClick={() => openEditModal(device)} title="Edit device">Edit</button>
                        <button className={`btn-small btn-warning ${pingLoading[device.id] ? 'loading' : ''}`} onClick={() => pingDevice(device)} disabled={pingLoading[device.id]} title="Ping device">
                          {pingLoading[device.id] ? '🔄' : '📡'} Ping
                        </button>
                        <button className="btn-small btn-danger" onClick={() => openDeleteModal(device)} title="Delete device">Delete</button>
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
                  <h4 className="form-section-title">📋 Basic Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Name *</label>
                      <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="e.g., AP-Office-Main" />
                    </div>
                    <div className="form-group">
                      <label>IP Address *</label>
                      <input type="text" name="ip_address" value={formData.ip_address} onChange={handleInputChange} required placeholder="e.g., 192.168.1.50" pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Type *</label>
                      <select name="device_type" value={formData.device_type} onChange={handleInputChange} required disabled={typesLoading || deviceTypes.length === 0}>
                        <option value="">{typesLoading ? 'Loading types…' : 'Choose device type...'}</option>
                        {deviceTypes.map(type => (
                          <option key={type.id} value={type.id}>
                            {type.icon ? `${type.icon} ` : ''}{type.name}
                          </option>
                        ))}
                      </select>
                      {(!typesLoading && deviceTypes.length === 0) && (
                        <small className="form-help">No types available. Open Django Admin → “Device Types” and add some, then click Retry above.</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Location</label>
                      <input type="text" name="location" value={formData.location} onChange={handleInputChange} placeholder="e.g., Main Office, Building A" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">🔧 Hardware Details</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor</label>
                      <input type="text" name="vendor" value={formData.vendor} onChange={handleInputChange} placeholder="e.g., Ubiquiti, Cisco, TP-Link" />
                    </div>
                    <div className="form-group">
                      <label>Model</label>
                      <input type="text" name="model" value={formData.model} onChange={handleInputChange} placeholder="e.g., UniFi AC Pro, EAP225" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">⚙️ Configuration</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Describe the device's purpose or any notes..." rows="3" />
                  </div>
                  <div className="form-group checkbox-group">
                    <input type="checkbox" name="monitoring_enabled" checked={formData.monitoring_enabled} onChange={handleInputChange} />
                    <label className="checkbox-label">
                      <strong>Enable real-time monitoring for this device</strong>
                      <div className="form-help">When enabled, the system performs network ping tests to monitor connectivity</div>
                    </label>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModals}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Device</button>
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
                  <h4 className="form-section-title">📋 Basic Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Name *</label>
                      <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="e.g., Router-R1, Switch-Floor2" />
                    </div>
                    <div className="form-group">
                      <label>IP Address *</label>
                      <input type="text" name="ip_address" value={formData.ip_address} onChange={handleInputChange} required placeholder="e.g., 192.168.1.1" pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Device Type *</label>
                      <select name="device_type" value={formData.device_type} onChange={handleInputChange} required disabled={typesLoading || deviceTypes.length === 0}>
                        <option value="">{typesLoading ? 'Loading types…' : 'Choose device type...'}</option>
                        {deviceTypes.map(type => (
                          <option key={type.id} value={type.id}>
                            {type.icon ? `${type.icon} ` : ''}{type.name}
                          </option>
                        ))}
                      </select>
                      {(!typesLoading && deviceTypes.length === 0) && (
                        <small className="form-help">No types available. Add some in Admin, then click Retry above.</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Location</label>
                      <input type="text" name="location" value={formData.location} onChange={handleInputChange} placeholder="e.g., Server Room A, Floor 2" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">🔧 Hardware Information</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor</label>
                      <input type="text" name="vendor" value={formData.vendor} onChange={handleInputChange} placeholder="e.g., Cisco, Ubiquiti, Dell" />
                    </div>
                    <div className="form-group">
                      <label>Model</label>
                      <input type="text" name="model" value={formData.model} onChange={handleInputChange} placeholder="e.g., ISR4321, UniFi AC Pro" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="form-section-title">⚙️ Settings</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Optional description..." rows="3" />
                  </div>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input type="checkbox" name="monitoring_enabled" checked={formData.monitoring_enabled} onChange={handleInputChange} />
                      <span className="checkmark"></span>
                      Enable real-time monitoring for this device
                    </label>
                    <small className="form-help">The system will perform real ping tests</small>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModals}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Update Device</button>
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
                <p>Are you sure you want to delete <strong>{selectedDevice.name}</strong>?</p>
                <p className="warning-text">This action cannot be undone.</p>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={closeModals}>Cancel</button>
                <button className="btn btn-danger" onClick={() => deleteDevice(selectedDevice.id)}>Delete Device</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Devices;
