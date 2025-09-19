// frontend/src/pages/Devices.js
import React, { useState, useEffect, useCallback } from 'react';
import { api, tokenManager } from '../services/api';
import './Devices.css';

/**
 * >>> PLACE YOUR IMAGE HERE <<<
 *    frontend/src/assets/devices-bg.jpg
 *
 * If you rename or move it, update the path below accordingly.
 */
import devicesBg from '../assets/devices-bg.jpg';

// Background image style (lets Webpack/Vite bundle the asset)
const BG_STYLE = {
  backgroundImage: `url(${devicesBg})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

const Devices = () => {
  // State management
  const [devices, setDevices] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [statistics, setStatistics] = useState({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    warning_devices: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [pingLoading, setPingLoading] = useState({}); // Track individual ping loading states
  const [pingAllLoading, setPingAllLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ip_address: '',
    device_type: '',
    vendor: '',
    model: '',
    location: '',
    monitoring_enabled: true
  });

  // API Functions
  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      console.log('📱 Loading devices...');

      // Check if user is logged in before making request
      if (!tokenManager.isLoggedIn()) {
        console.warn('⚠️ No valid token found, redirecting to login');
        window.location.href = '/login';
        return;
      }

      const response = await api.devices.list();
      console.log('📱 Devices loaded:', response);

      // Handle paginated response format
      if (response && response.results) {
        setDevices(response.results);
      } else if (Array.isArray(response)) {
        setDevices(response);
      } else {
        setDevices([]);
      }

      setError(null);
    } catch (err) {
      console.error('❌ Error loading devices:', err);

      // Handle specific error cases
      if (err.message.includes('Not found') || err.message.includes('404')) {
        setError('⚠️ Devices API endpoint not found. Is your Django server running on http://localhost:8000?');
        console.error('🔧 Possible fixes:');
        console.error('   1. Check if Django server is running: python manage.py runserver');
        console.error('   2. Verify API URL is correct in your .env file');
        console.error('   3. Check Django URL patterns for /api/v1/devices/');
      } else if (err.message.includes('session') || err.message.includes('login') || err.message.includes('authentication')) {
        setError('Your session has expired. Redirecting to login...');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setError('Failed to load devices: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeviceTypes = useCallback(async () => {
    // Use the actual DeviceType IDs from your Django database
    console.log('📋 Using actual DeviceType IDs from database');

    setDeviceTypes([
      { id: 5, name: 'Router', icon: '🌐' },
      { id: 6, name: 'Switch', icon: '🔀' },
      { id: 7, name: 'Access Point', icon: '📡' },
      { id: 8, name: 'Server', icon: '🖥️' },
      { id: 14, name: 'Firewall', icon: '🔥' }
    ]);

    console.log('✅ Device types loaded with actual database IDs:');
    console.log('   - Router (ID: 5)');
    console.log('   - Switch (ID: 6)');
    console.log('   - Access Point (ID: 7)');
    console.log('   - Server (ID: 8)');
    console.log('   - Firewall (ID: 14)');
  }, []);

  const loadStatistics = useCallback(async () => {
    try {
      // Only load if we have valid authentication
      if (!tokenManager.isLoggedIn()) {
        return;
      }

      const stats = await api.devices.statistics();
      setStatistics(stats);
    } catch (err) {
      console.error('Error loading statistics:', err);
      // Don't show error for statistics failure, just use default values
      setStatistics({
        total_devices: devices.length,
        online_devices: devices.filter(d => d.status === 'online').length,
        offline_devices: devices.filter(d => d.status === 'offline').length,
        warning_devices: devices.filter(d => d.status === 'warning').length
      });
    }
  }, [devices]);

  // Load data on component mount
  useEffect(() => {
    loadDevices();
    loadDeviceTypes();
  }, [loadDevices, loadDeviceTypes]);

  // Load statistics when devices change
  useEffect(() => {
    if (devices.length > 0) {
      loadStatistics();
    }
  }, [devices, loadStatistics]);

  const createDevice = async (deviceData) => {
    try {
      console.log('Creating device with data:', deviceData);
      console.log('Available device types:', deviceTypes);
      console.log('Selected device type ID:', deviceData.device_type);

      // Find the selected device type to confirm it exists
      const selectedType = deviceTypes.find(type => type.id === deviceData.device_type);
      console.log('Selected device type object:', selectedType);

      // Ensure device_type is converted to the correct type (number if it's a numeric string)
      const processedData = {
        ...deviceData,
        device_type: isNaN(deviceData.device_type) ? deviceData.device_type : Number(deviceData.device_type)
      };

      console.log('Processed device data for API:', processedData);

      await api.devices.create(processedData);
      await loadDevices();
      await loadStatistics();
      setShowAddModal(false);
      resetForm();
      setError(null);
      console.log('✅ Device created successfully');
    } catch (err) {
      console.error('❌ Error creating device:', err);

      // Handle authentication errors specially
      if (err.message.includes('session') || err.message.includes('login')) {
        setError('Your session has expired. Please refresh the page and login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        // Show more specific error message
        if (err.message.includes('device_type') || err.message.includes('Invalid pk') || err.message.includes('Incorrect type')) {
          setError('Invalid device type selected. The device types may have changed. Please refresh the page and try again.');
        } else if (err.message.includes('ip_address must make a unique set') || err.message.includes('unique')) {
          setError('A device with this IP address already exists. Please use a different IP address.');
        } else if (err.message.includes('ip_address')) {
          setError('Please enter a valid IP address (e.g., 192.168.1.100).');
        } else {
          setError('Failed to create device: ' + err.message);
        }
      }
    }
  };

  const updateDevice = async (id, deviceData) => {
    try {
      console.log('Updating device:', id, deviceData);
      await api.devices.update(id, deviceData);
      await loadDevices();
      await loadStatistics();
      setShowEditModal(false);
      resetForm();
      setSelectedDevice(null);
      setError(null);
      console.log('✅ Device updated successfully');
    } catch (err) {
      console.error('❌ Error updating device:', err);
      setError('Failed to update device: ' + err.message);
    }
  };

  const deleteDevice = async (id) => {
    try {
      console.log('Deleting device:', id);
      await api.devices.delete(id);
      await loadDevices();
      await loadStatistics();
      setShowDeleteModal(false);
      setSelectedDevice(null);
      setError(null);
      console.log('✅ Device deleted successfully');
    } catch (err) {
      console.error('❌ Error deleting device:', err);
      if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        setError('Cannot delete device. It may be referenced by other records (alerts, configurations, etc.). Please contact your administrator.');
      } else {
        setError('Failed to delete device: ' + err.message);
      }
    }
  };

  const pingDevice = async (device) => {
    const deviceId = device.id;

    try {
      console.log('🔄 Pinging device:', device.name, `(${device.ip_address})`);

      // Set loading state for this specific device
      setPingLoading(prev => ({ ...prev, [deviceId]: true }));
      setError(null); // Clear any previous errors

      // Call the real ping API
      const result = await api.devices.ping(deviceId);
      console.log('📡 Ping result:', result);

      // Handle the response from the new real ping implementation
      if (result.success) {
        console.log(`✅ Ping successful: ${device.name} - ${result.response_time}ms`);

        // Show success message temporarily
        const successMsg = `✅ ${device.name}: Online (${result.response_time}ms)`;
        setError(successMsg);
        setTimeout(() => setError(null), 3000);

      } else {
        console.log(`❌ Ping failed: ${device.name} - ${result.message}`);

        // Show failure message
        const failureMsg = `❌ ${device.name}: ${result.message}`;
        setError(failureMsg);
        setTimeout(() => setError(null), 5000);
      }

      // Always reload devices to get updated status
      await loadDevices();
      await loadStatistics();

    } catch (err) {
      console.error('❌ Error during ping operation:', err);

      // Handle different types of errors
      if (err.message.includes('timeout') || err.message.includes('network')) {
        setError(`🌐 Network Error: Unable to ping ${device.name}. Check your connection.`);
      } else if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        setError(`⚙️ Server Error: Ping service unavailable. Contact administrator.`);
      } else if (err.message.includes('monitoring_enabled')) {
        setError(`⚠️ ${device.name}: Monitoring is disabled for this device.`);
      } else {
        setError(`❌ Failed to ping ${device.name}: ${err.message}`);
      }

      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      // Clear loading state for this device
      setPingLoading(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const pingAllDevices = async () => {
    try {
      console.log('🔄 Pinging all devices...');
      setPingAllLoading(true);
      setError(null);

      const result = await api.devices.pingAll();
      console.log('📡 Ping all result:', result);

      if (result && result.summary) {
        const { summary } = result;

        // Show summary message
        const summaryMsg = `📊 Ping All Complete: ${summary.online}/${summary.total} devices online (${summary.success_rate}% success rate)`;
        setError(summaryMsg);
        setTimeout(() => setError(null), 5000);

        // Log individual results for debugging
        if (result.results) {
          result.results.forEach(device => {
            if (device.success) {
              console.log(`✅ ${device.name}: Online (${device.response_time}ms)`);
            } else {
              console.log(`❌ ${device.name}: ${device.message}`);
            }
          });
        }
      }

      // Reload devices and statistics to show updated statuses
      await loadDevices();
      await loadStatistics();

    } catch (err) {
      console.error('❌ Error during ping all operation:', err);
      setError(`❌ Failed to ping all devices: ${err.message}`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setPingAllLoading(false);
    }
  };

  const testConnectivity = async () => {
    try {
      console.log('🌐 Testing network connectivity...');
      setError('🌐 Testing network connectivity...');

      const result = await api.devices.testConnectivity();
      console.log('🌐 Connectivity test result:', result);

      if (result) {
        const statusIcon = result.connectivity_status === 'good' ? '✅' :
                          result.connectivity_status === 'poor' ? '⚠️' : '❌';

        const connectivityMsg = `${statusIcon} Network Connectivity: ${result.connectivity_status.toUpperCase()} - ${result.summary}`;
        setError(connectivityMsg);
        setTimeout(() => setError(null), 5000);
      }

    } catch (err) {
      console.error('❌ Error during connectivity test:', err);
      setError(`❌ Connectivity test failed: ${err.message}`);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Form handling
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      ip_address: '',
      device_type: '',
      vendor: '',
      model: '',
      location: '',
      monitoring_enabled: true
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name || !formData.ip_address || !formData.device_type) {
      setError('Please fill in all required fields (Name, IP Address, and Device Type)');
      return;
    }

    // Basic IP validation
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(formData.ip_address)) {
      setError('Please enter a valid IP address (e.g., 192.168.1.1)');
      return;
    }

    console.log('Form submitted with data:', formData);

    if (selectedDevice) {
      await updateDevice(selectedDevice.id, formData);
    } else {
      await createDevice(formData);
    }
  };

  // Modal handlers
  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (device) => {
    setSelectedDevice(device);
    setFormData({
      name: device.name || '',
      description: device.description || '',
      ip_address: device.ip_address || '',
      device_type: device.device_type || '',
      vendor: device.vendor || '',
      model: device.model || '',
      location: device.location || '',
      monitoring_enabled: device.monitoring_enabled !== false
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

  // Filtering and search
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.ip_address?.includes(searchTerm) ||
                         device.vendor?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || device.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Utility functions
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
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

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

        {/* Error Message */}
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
              title="Ping all devices with real network tests"
            >
              {pingAllLoading ? '🔄 Pinging...' : '📡 Ping All'}
            </button>
            <button
              className="btn btn-info"
              onClick={testConnectivity}
              title="Test internet connectivity"
            >
              🌐 Test Network
            </button>
            <button
              className="btn btn-primary add-device-btn"
              onClick={openAddModal}
            >
              + Add Device
            </button>
          </div>
        </div>

        {/* Device Statistics */}
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

        {/* Devices Table */}
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
                      {device.description && (
                        <div className="device-description">{device.description}</div>
                      )}
                    </td>
                    <td className="ip-address">{device.ip_address}</td>
                    <td>
                      <span className="device-type">
                        {device.device_type_icon} {device.device_type_name}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusClass(device.status)}`}>
                        {device.status_display || device.status}
                      </span>
                    </td>
                    <td className="response-time">
                      {device.response_time ? `${device.response_time}ms` : '-'}
                    </td>
                    <td>{device.vendor || '-'}</td>
                    <td>{formatLastSeen(device.last_seen)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-small btn-info"
                          onClick={() => openEditModal(device)}
                          title="Edit device"
                        >
                          Edit
                        </button>
                        <button
                          className={`btn-small btn-warning ${pingLoading[device.id] ? 'loading' : ''}`}
                          onClick={() => pingDevice(device)}
                          disabled={pingLoading[device.id]}
                          title="Perform real network ping test"
                        >
                          {pingLoading[device.id] ? '🔄' : '📡'} Ping
                        </button>
                        <button
                          className="btn-small btn-danger"
                          onClick={() => openDeleteModal(device)}
                          title="Delete device"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Device Modal */}
        {showAddModal && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add New Device</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <form onSubmit={handleSubmit} className="device-form">
                {/* Basic Information Section */}
                <div className="form-section">
                  <h4 className="form-section-title">📋 Basic Information</h4>
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
                        <option value="">Choose device type...</option>
                        {deviceTypes.map(type => (
                          <option
                            key={type.id}
                            value={type.id}
                            disabled={type.disabled}
                          >
                            {type.icon ? `${type.icon} ` : ''}{type.name}
                          </option>
                        ))}
                      </select>
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

                {/* Hardware Information Section */}
                <div className="form-section">
                  <h4 className="form-section-title">🔧 Hardware Details</h4>
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

                {/* Configuration Section */}
                <div className="form-section">
                  <h4 className="form-section-title">⚙️ Configuration</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Describe the device's purpose, location details, or any special notes..."
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
                      <div className="form-help">
                        When enabled, the system will perform actual network ping tests to monitor connectivity and response times
                      </div>
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

        {/* Edit Device Modal */}
        {showEditModal && selectedDevice && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit Device: {selectedDevice.name}</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <form onSubmit={handleSubmit} className="device-form">
                {/* Basic Information Section */}
                <div className="form-section">
                  <h4 className="form-section-title">📋 Basic Information</h4>
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
                        <option value="">Choose device type...</option>
                        {deviceTypes.map(type => (
                          <option
                            key={type.id}
                            value={type.id}
                            disabled={type.disabled}
                          >
                            {type.icon ? `${type.icon} ` : ''}{type.name}
                          </option>
                        ))}
                      </select>
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

                {/* Hardware Information Section */}
                <div className="form-section">
                  <h4 className="form-section-title">🔧 Hardware Information</h4>
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

                {/* Additional Settings Section */}
                <div className="form-section">
                  <h4 className="form-section-title">⚙️ Settings</h4>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Optional description of the device's role or purpose..."
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
                    <small className="form-help">When enabled, the system will perform actual network ping tests to monitor the device</small>
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

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedDevice && (
          <div className="modal-overlay" onClick={closeModals}>
            <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirm Deletion</h3>
                <button className="modal-close" onClick={closeModals}>×</button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete <strong>{selectedDevice.name}</strong>?</p>
                <p className="warning-text">This action cannot be undone and will remove all associated ping history and metrics.</p>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={closeModals}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => deleteDevice(selectedDevice.id)}
                >
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
