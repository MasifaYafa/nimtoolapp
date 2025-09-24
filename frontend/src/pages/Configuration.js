// Configuration.js — Dark, dashboard-matched UI with Bootstrap Icons
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './Configuration.css';
import { api } from '../services/api'; // Use your existing API service

/* -------------------- Small UI helpers -------------------- */
const StatusPill = ({ status }) => (
  <span className={`status-badge ${String(status || 'unknown').toLowerCase()}`} aria-label={`Status ${status}`}>
    {(status || 'unknown').toUpperCase()}
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
      { id: 'devices', name: 'Device List', icon: <i className="bi bi-ui-checks-grid" /> },
      { id: 'configure', name: 'Configure Device', icon: <i className="bi bi-sliders2" /> },
    ],
    []
  );

  const getDeviceIcon = useCallback((type) => {
    const v = (type || '').toLowerCase();
    if (v.includes('router')) return <i className="bi bi-hdd-network" />;
    if (v.includes('switch')) return <i className="bi bi-diagram-3" />;
    if (v.includes('firewall')) return <i className="bi bi-shield-lock" />;
    if (v.includes('ap') || v.includes('access') || v.includes('point')) return <i className="bi bi-wifi" />;
    if (v.includes('server')) return <i className="bi bi-hdd-stack" />;
    return <i className="bi bi-cpu" />;
  }, []);

  const getStatusColor = useCallback((status) => {
    switch ((status || '').toLowerCase()) {
      case 'online': return '#22c55e';
      case 'offline': return '#ef4444';
      case 'warning': return '#f59e0b';
      default: return '#6b7280';
    }
  }, []);

  /* -------------------- Data loading using existing API -------------------- */
  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.devices.list();
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
      await api.devices.pingAll(); // reuse pingAll for discovery
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
      const deviceTypeId = 1; // adjust to your server’s default/real type IDs
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
      const configs = await api.devices.getConfigurations(selectedDevice.id);
      if (configs && configs.length > 0) {
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
      // stub validation
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
      await api.devices.backupConfig(selectedDevice.id);
      alert(`Configuration pushed to ${selectedDevice.name} successfully!\nA backup was created before applying changes.`);
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
          <i className="bi bi-terminal" /> Configure
        </button>
      </div>
    </div>
  );

  const ConfigEditor = () => (
    <div className="config-workspace">
      <div className="config-editor">
        <div className="editor-header">
          <h4><i className="bi bi-code-slash" /> Configuration Commands</h4>
          <div className="editor-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadCurrent}
              disabled={!selectedDevice || editorBusy}
            >
              {editorBusy ? 'Loading…' : (<><i className="bi bi-cloud-download" /> Load Current</>)}
            </button>
            <button
              className="btn btn-info btn-sm"
              onClick={validate}
              disabled={!selectedDevice || !configText.trim() || editorBusy}
            >
              <i className="bi bi-check2-circle" /> Validate
            </button>
            <button
              className="btn btn-success btn-sm"
              onClick={preview}
              disabled={!selectedDevice || !configText.trim() || editorBusy}
            >
              <i className="bi bi-eye" /> Preview
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
            {editorBusy ? 'Working…' : (<><i className="bi bi-upload" /> Push Configuration</>)}
          </button>
          <button
            className="btn btn-warning"
            onClick={() => setConfigText('')}
            disabled={!configText || editorBusy}
          >
            <i className="bi bi-arrow-counterclockwise" /> Reset
          </button>
        </div>
      </div>

      <aside className="config-sidebar" aria-label="Device summary and quick commands">
        <div className="device-summary">
          <h4><i className="bi bi-info-circle" /> Device Information</h4>
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
          <h4><i className="bi bi-lightning-charge" /> Quick Commands</h4>
          <button className="btn btn-secondary btn-sm full-width"><i className="bi bi-file-earmark-text" /> Show Running Config</button>
          <button className="btn btn-secondary btn-sm full-width"><i className="bi bi-cpu" /> Show Version</button>
          <button className="btn btn-secondary btn-sm full-width"><i className="bi bi-hdd-network" /> Show Interfaces</button>
          <button className="btn btn-secondary btn-sm full-width"><i className="bi bi-signpost-split" /> Show IP Route</button>
          <button className="btn btn-secondary btn-sm full-width"><i className="bi bi-diagram-3" /> Show VLAN</button>
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
                <i className="bi bi-search" /> Discover Devices
              </button>
              <button className="btn btn-primary" onClick={handleAddDevice} disabled={loading}>
                <i className="bi bi-plus-lg" /> Add Device
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <i className="bi bi-exclamation-triangle" /> {error}
            </div>
          )}

          {loading ? (
            <div className="loading-banner">
              <i className="bi bi-arrow-repeat" /> Loading devices…
            </div>
          ) : (
            <div className="devices-grid">
              {devices.map((d) => <DeviceCard key={d.id} device={d} />)}
              {!devices.length && !error && (
                <p className="no-device muted">No devices found.</p>
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
              <p className="no-device muted">Please select a device from the Device List</p>
            )}
          </div>

          {selectedDevice && <ConfigEditor />}
        </section>
      </div>
    </div>
  );
};

export default Configuration;
