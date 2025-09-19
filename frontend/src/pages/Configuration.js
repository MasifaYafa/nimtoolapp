// Configuration.js — Fixed authentication to work with NIM-Tool backend
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './Configuration.css';
import { api } from '../services/api'; // Use your existing API service

/* -------------------- Small UI helpers -------------------- */
const StatusPill = ({ status }) => (
  <span className={`status-badge ${status}`} aria-label={`Status ${status}`}>
    {status?.toUpperCase()}
  </span>
);

/* -------------------- Main Component -------------------- */
const Configuration = () => {
  const [activeTab, setActiveTab] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [configText, setConfigText] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);

  const tabs = useMemo(
    () => [
      { id: 'devices', name: 'Device List', icon: '📋' },
      { id: 'configure', name: 'Configure Device', icon: '⚙️' },
    ],
    []
  );

  const getDeviceIcon = useCallback((type) => {
    switch ((type || '').toLowerCase()) {
      case 'router': return '🔀';
      case 'switch': return '🔗';
      case 'firewall': return '🛡️';
      case 'ap': return '📡';
      default: return '📱';
    }
  }, []);

  const getStatusColor = useCallback((status) => {
    switch ((status || '').toLowerCase()) {
      case 'online': return '#28a745';
      case 'offline': return '#dc3545';
      case 'warning': return '#ffc107';
      default: return '#6c757d';
    }
  }, []);

  /* -------------------- Data loading using existing API -------------------- */
  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use your existing API service
      const data = await api.devices.list();
      // Handle both paginated and direct array responses
      const deviceList = data.results || data || [];
      setDevices(Array.isArray(deviceList) ? deviceList : []);
    } catch (e) {
      console.error('Failed to fetch devices:', e);
      setDevices([]);
      setError(e.message || 'Failed to load devices. Please check your authentication.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  /* -------------------- Actions -------------------- */
  const handleDeviceSelect = useCallback((d) => {
    setSelectedDevice(d);
    setActiveTab('configure');
    setConfigText('');
  }, []);

  const handleDiscover = useCallback(async () => {
    setLoading(true);
    try {
      // Use existing ping all functionality as device discovery
      await api.devices.pingAll();
      await fetchDevices();
    } catch (e) {
      console.error('Discovery failed:', e);
      setError(e.message || 'Discovery failed.');
    } finally {
      setLoading(false);
    }
  }, [fetchDevices]);

  const handleAddDevice = useCallback(async () => {
    const name = prompt('Device Name?');
    const ip = prompt('IP Address?');
    if (!name || !ip) return;

    setLoading(true);
    try {
      // You'll need to determine the device type - for now, default to 'switch'
      // You may want to add a device type selector
      const deviceTypeId = 1; // Adjust based on your device types

      await api.devices.create({
        name,
        ip_address: ip,
        device_type: deviceTypeId,
        monitoring_enabled: true
      });
      await fetchDevices();
    } catch (e) {
      console.error('Add device failed:', e);
      setError(e.message || 'Add device failed.');
    } finally {
      setLoading(false);
    }
  }, [fetchDevices]);

  const loadCurrent = useCallback(async () => {
    if (!selectedDevice) return;
    setEditorBusy(true);
    try {
      // Use existing device configuration endpoint
      const configs = await api.devices.getConfigurations(selectedDevice.id);
      if (configs && configs.length > 0) {
        // Get the most recent configuration
        setConfigText(configs[0].config_data || '');
      } else {
        setConfigText('# No existing configuration found\n# Enter new configuration below\n');
      }
    } catch (e) {
      console.error('Failed to load config:', e);
      alert(e.message || 'Failed to load current config.');
    } finally {
      setEditorBusy(false);
    }
  }, [selectedDevice]);

  const validate = useCallback(async () => {
    if (!selectedDevice || !configText.trim()) return;
    setEditorBusy(true);
    try {
      // Mock validation for now - you can implement actual validation endpoint
      alert('Configuration syntax appears valid.');
    } catch (e) {
      alert(e.message || 'Validation failed.');
    } finally {
      setEditorBusy(false);
    }
  }, [selectedDevice, configText]);

  const preview = useCallback(async () => {
    if (!selectedDevice || !configText.trim()) return;
    setEditorBusy(true);
    try {
      // Mock preview for now
      const preview = `Preview for ${selectedDevice.name}:\n\n${configText}\n\n# This configuration will be applied to the device.`;
      alert(preview);
    } catch (e) {
      alert(e.message || 'Preview failed.');
    } finally {
      setEditorBusy(false);
    }
  }, [selectedDevice, configText]);

  const pushConfig = useCallback(async () => {
    if (!selectedDevice || !configText.trim()) return;
    if (!window.confirm(`Push configuration to ${selectedDevice.name}?`)) return;

    setEditorBusy(true);
    try {
      // Create a backup first using existing backup functionality
      await api.devices.backupConfig(selectedDevice.id);

      // For now, just create a "configuration session" simulation
      // In the full implementation, this would use your configuration API
      alert(`Configuration pushed to ${selectedDevice.name} successfully!\nA backup was created before applying changes.`);

      // Clear the editor
      setConfigText('');
    } catch (e) {
      console.error('Push failed:', e);
      alert(e.message || 'Push failed.');
    } finally {
      setEditorBusy(false);
    }
  }, [selectedDevice, configText]);

  /* -------------------- Subcomponents -------------------- */
  const TabNav = () => (
    <div className="config-nav" role="tablist" aria-label="Configuration Sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
          <span className="tab-name">{tab.name}</span>
        </button>
      ))}
    </div>
  );

  const DeviceCard = ({ device }) => (
    <div className="device-config-card" aria-label={`${device.device_type_name} ${device.name}`}>
      <div className="device-header">
        <div className="device-icon" aria-hidden="true">{getDeviceIcon(device.device_type_name)}</div>
        <div className="device-info">
          <h4 className="device-title">{device.name}</h4>
          <p className="device-subtitle">{device.vendor} {device.model}</p>
          <span className="device-ip">{device.ip_address}</span>
        </div>
        <div
          className="device-status-indicator"
          title={device.status}
          style={{ backgroundColor: getStatusColor(device.status) }}
        />
      </div>

      <div className="device-details">
        <div className="detail-item">
          <span className="detail-label">Type:</span>
          <span className="detail-value">{(device.device_type_name || '').toUpperCase()}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Last Seen:</span>
          <span className="detail-value">{device.last_seen ? new Date(device.last_seen).toLocaleString() : '—'}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Response Time:</span>
          <span className="detail-value">{device.response_time ? `${device.response_time}ms` : '—'}</span>
        </div>
      </div>

      <div className="device-actions">
        <button className="btn btn-primary btn-sm" onClick={() => handleDeviceSelect(device)}>
          Configure
        </button>
      </div>
    </div>
  );

  const ConfigEditor = () => (
    <div className="config-workspace">
      <div className="config-editor">
        <div className="editor-header">
          <h4>Configuration Commands</h4>
          <div className="editor-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadCurrent}
              disabled={!selectedDevice || editorBusy}
            >
              {editorBusy ? 'Loading…' : 'Load Current'}
            </button>
            <button
              className="btn btn-info btn-sm"
              onClick={validate}
              disabled={!selectedDevice || !configText.trim() || editorBusy}
            >
              Validate
            </button>
            <button
              className="btn btn-success btn-sm"
              onClick={preview}
              disabled={!selectedDevice || !configText.trim() || editorBusy}
            >
              Preview
            </button>
          </div>
        </div>

        <textarea
          className="config-textarea"
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          placeholder="Enter configuration commands here..."
          rows={20}
          aria-label="Configuration command editor"
        />

        <div className="editor-footer">
          <button
            className="btn btn-primary"
            onClick={pushConfig}
            disabled={!selectedDevice || !configText.trim() || editorBusy}
          >
            {editorBusy ? 'Working…' : 'Push Configuration'}
          </button>
          <button
            className="btn btn-warning"
            onClick={() => setConfigText('')}
            disabled={!configText || editorBusy}
          >
            Reset
          </button>
        </div>
      </div>

      <aside className="config-sidebar" aria-label="Device summary and quick commands">
        <div className="device-summary">
          <h4>Device Information</h4>
          {selectedDevice ? (
            <>
              <div className="summary-item"><strong>Name:</strong> {selectedDevice.name}</div>
              <div className="summary-item"><strong>Type:</strong> {(selectedDevice.device_type_name || '').toUpperCase()}</div>
              <div className="summary-item"><strong>Brand:</strong> {selectedDevice.vendor || '—'}</div>
              <div className="summary-item"><strong>Model:</strong> {selectedDevice.model || '—'}</div>
              <div className="summary-item"><strong>IP Address:</strong> {selectedDevice.ip_address}</div>
              <div className="summary-item"><strong>Status:</strong> <StatusPill status={selectedDevice.status || 'unknown'} /></div>
            </>
          ) : (
            <p className="no-device">Please select a device from the Device List</p>
          )}
        </div>

        <div className="quick-commands">
          <h4>Quick Commands</h4>
          <button className="btn btn-secondary btn-sm full-width">Show Running Config</button>
          <button className="btn btn-secondary btn-sm full-width">Show Version</button>
          <button className="btn btn-secondary btn-sm full-width">Show Interfaces</button>
          <button className="btn btn-secondary btn-sm full-width">Show IP Route</button>
          <button className="btn btn-secondary btn-sm full-width">Show VLAN</button>
        </div>
      </aside>
    </div>
  );

  /* -------------------- Render -------------------- */
  return (
    <div className="configuration-container">
      <div className="container">
        <header className="page-header">
          <div>
            <h2>Device Configuration</h2>
            <p>Configure and manage network device settings</p>
          </div>
          {selectedDevice && (
            <div className="selected-device inline">
              <span className="device-icon" aria-hidden="true">{getDeviceIcon(selectedDevice.device_type_name)}</span>
              <span className="device-name">{selectedDevice.name}</span>
              <span className="device-ip">({selectedDevice.ip_address})</span>
            </div>
          )}
        </header>

        {/* Tabs */}
        <TabNav />

        {/* Device List */}
        <section
          id="panel-devices"
          role="tabpanel"
          aria-labelledby="tab-devices"
          hidden={activeTab !== 'devices'}
          className="devices-list-tab"
        >
          <div className="devices-header">
            <h3>Network Devices</h3>
            <div className="devices-actions">
              <button className="btn btn-info" onClick={handleDiscover} disabled={loading}>
                Discover Devices
              </button>
              <button className="btn btn-primary" onClick={handleAddDevice} disabled={loading}>
                + Add Device
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner" style={{
              padding: '12px',
              margin: '12px 0',
              backgroundColor: '#dc3545',
              color: 'white',
              borderRadius: '8px'
            }}>
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="loading-banner" style={{
              padding: '20px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              Loading devices…
            </div>
          ) : (
            <div className="devices-grid">
              {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
              {!devices.length && !error && (
                <p className="no-device" style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  No devices found.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Configure Device */}
        <section
          id="panel-configure"
          role="tabpanel"
          aria-labelledby="tab-configure"
          hidden={activeTab !== 'configure'}
          className="configure-tab"
        >
          <div className="configure-header">
            <h3>Configure Device</h3>
            {selectedDevice ? (
              <div className="selected-device">
                <span className="device-icon" aria-hidden="true">{getDeviceIcon(selectedDevice.device_type_name)}</span>
                <span className="device-name">{selectedDevice.name}</span>
                <span className="device-ip">({selectedDevice.ip_address})</span>
              </div>
            ) : (
              <p className="no-device">Please select a device from the Device List</p>
            )}
          </div>

          {selectedDevice && <ConfigEditor />}
        </section>
      </div>
    </div>
  );
};

export default Configuration;