// frontend/src/pages/Troubleshoot.js
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './Troubleshoot.css';

const DEFAULT_PORTS = '80,443,22,23,3389';
const SELECTED_DEVICE_KEY = 'nimtool.selectedDeviceId';

function getDeviceAddress(d) {
  if (!d) return '';
  return d.management_ip || d.ip_address || d.ip || d.hostname || d.name || '';
}

/* --------- Tiny inline sparkline (no deps) --------- */
function Sparkline({ data = [], color = '#3b82f6', width = 160, height = 40 }) {
  const values = (Array.isArray(data) ? data : []).map((n) => Number(n)).filter((n) => !isNaN(n));
  if (!values.length) return null;

  const w = width;
  const h = height;
  const pad = 4;

  const max = Math.max(...values, 100); // keep headroom for percentages
  const min = Math.min(...values, 0);

  const scaleX = (i) => {
    if (values.length === 1) return pad;
    return pad + (i * (w - pad * 2)) / (values.length - 1);
  };
  const scaleY = (v) => {
    // invert so larger values go up
    const t = (v - min) / (max - min || 1);
    return h - pad - t * (h - pad * 2);
  };

  const pathD = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(2)} ${scaleY(v).toFixed(2)}`)
    .join(' ');

  const last = values[values.length - 1];

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="sparkline-svg" aria-hidden="true">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path
          d={`${pathD} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`}
          fill="url(#sparkGrad)"
          className="sparkline-area"
        />
        {/* Line */}
        <path d={pathD} stroke={color} fill="none" className="sparkline-line" />
        {/* Last point */}
        <circle cx={scaleX(values.length - 1)} cy={scaleY(last)} r="2.5" fill={color} />
      </svg>
    </div>
  );
}

/* --------- Donut gauge (no deps) --------- */
function Donut({ value = 0, label = '', color = '#3b82f6', history = [] }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 64 64" className="donut-svg" aria-label={`${label} ${v}%`}>
          <circle cx="32" cy="32" r={r} className="donut-track" />
          <circle
            cx="32"
            cy="32"
            r={r}
            className="donut-fill"
            style={{ strokeDasharray: `${dash} ${c - dash}`, stroke: color }}
          />
        </svg>
        <div className="donut-center">
          <div className="donut-value">{v}%</div>
          <div className="donut-label">{label}</div>
        </div>
      </div>
      {/* Sparkline under the donut (optional) */}
      <Sparkline data={history} color={color} />
    </div>
  );
}

export default function Troubleshoot() {
  const [activeTab, setActiveTab] = useState('network');

  // devices
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(localStorage.getItem(SELECTED_DEVICE_KEY) || '');
  const selectedDevice = useMemo(
    () => devices.find((d) => String(d.id) === String(selectedId)),
    [devices, selectedId]
  );

  // form fields
  const [pingTarget, setPingTarget] = useState('');
  const [tracerouteTarget, setTracerouteTarget] = useState('');
  const [portScanTarget, setPortScanTarget] = useState('');
  const [portScanPorts, setPortScanPorts] = useState(DEFAULT_PORTS);
  const [dnsTarget, setDnsTarget] = useState('');
  const [dnsRecordType, setDnsRecordType] = useState('A');

  // ui
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // backend data
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]);
  const [logFilters, setLogFilters] = useState({ level: 'all', time_range: '24hours' });

  const tabs = [
    { id: 'network', name: 'Network Tools', icon: <i className="bi bi-tools" /> },
    { id: 'diagnostics', name: 'System Diagnostics', icon: <i className="bi bi-activity" /> },
    { id: 'logs', name: 'Log Analyzer', icon: <i className="bi bi-clipboard-data" /> },
  ];

  // helpers
  const withDevice = (path) =>
    `${path}${selectedId ? (path.includes('?') ? '&' : '?') + `device_id=${selectedId}` : ''}`;

  const handleApi = async (fn, onSuccess) => {
    try {
      setError(null);
      setSessionExpired(false);
      const data = await fn();
      onSuccess?.(data);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('session has expired') || msg.toLowerCase().includes('authentication required')) {
        setSessionExpired(true);
      }
      setError(msg || 'Request failed');
    }
  };

  const primeTargetsFromDevice = (d) => {
    const addr = getDeviceAddress(d);
    if (!addr) return;
    setPingTarget(addr);
    setTracerouteTarget(addr);
    setPortScanTarget(addr);
    setDnsTarget(addr);
  };

  // loads
  useEffect(() => {
    handleApi(() => api.devices.list(), (data) => {
      const list = data?.results || data || [];
      setDevices(list);
      const initialId = localStorage.getItem(SELECTED_DEVICE_KEY) || (list.length ? String(list[0].id) : '');
      setSelectedId(initialId);
      const found = list.find((d) => String(d.id) === String(initialId));
      primeTargetsFromDevice(found);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(SELECTED_DEVICE_KEY, selectedId || '');
    primeTargetsFromDevice(selectedDevice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    (async () => {
      if (activeTab === 'diagnostics') {
        await loadSystemHealth();
      } else if (activeTab === 'logs') {
        await loadSystemLogs();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedId, logFilters.time_range, logFilters.level]);

  const loadSystemHealth = async () =>
    handleApi(() => api.request(withDevice('/troubleshoot/system-health/current/')), (data) => setSystemHealth(data));

  const loadSystemLogs = async () => {
    const params = {
      device_id: selectedId || undefined,
      level: logFilters.level !== 'all' ? logFilters.level : undefined,
      time_range: logFilters.time_range,
    };
    handleApi(() => api.troubleshoot.logs.list(params), (data) => setSystemLogs(data?.results || data || []));
  };

  // network actions
  const handlePing = async () => {
    const target = pingTarget || getDeviceAddress(selectedDevice);
    if (!target) return;
    setLoading((p) => ({ ...p, ping: true }));
    setError(null);
    try {
      const resp = await api.troubleshoot.networkTests.ping({
        test_type: 'ping',
        target,
        parameters: { count: 4 },
      });
      setResults((r) => ({ ...r, ping: resp.results }));
    } catch (e) {
      setError(`Ping failed: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, ping: false }));
    }
  };

  const handleTraceroute = async () => {
    const target = tracerouteTarget || getDeviceAddress(selectedDevice);
    if (!target) return;
    setLoading((p) => ({ ...p, traceroute: true }));
    setError(null);
    try {
      const resp = await api.troubleshoot.networkTests.traceroute({ test_type: 'traceroute', target });
      setResults((r) => ({ ...r, traceroute: resp.results }));
    } catch (e) {
      setError(`Traceroute failed: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, traceroute: false }));
    }
  };

  const handlePortScan = async () => {
    const target = portScanTarget || getDeviceAddress(selectedDevice);
    if (!target) return;
    setLoading((p) => ({ ...p, portscan: true }));
    setError(null);
    try {
      const portList = portScanPorts.split(',').map((s) => s.trim()).filter(Boolean);
      const resp = await api.troubleshoot.networkTests.portScan({
        test_type: 'port_scan',
        target,
        parameters: { ports: portList },
      });
      setResults((r) => ({ ...r, portscan: resp.results }));
    } catch (e) {
      setError(`Port scan failed: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, portscan: false }));
    }
  };

  const handleDnsLookup = async () => {
    const target = dnsTarget || getDeviceAddress(selectedDevice);
    if (!target) return;
    setLoading((p) => ({ ...p, dns: true }));
    setError(null);
    try {
      const resp = await api.troubleshoot.networkTests.dnsLookup({
        test_type: 'dns_lookup',
        target,
        parameters: { record_type: dnsRecordType },
      });
      setResults((r) => ({ ...r, dns: resp.results }));
    } catch (e) {
      setError(`DNS lookup failed: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, dns: false }));
    }
  };

  // diagnostics actions
  const runDiagnostic = async (kind) => {
    setLoading((p) => ({ ...p, [kind]: true }));
    setError(null);
    try {
      let resp;
      if (kind === 'connectivity') {
        resp = await api.request(withDevice('/troubleshoot/diagnostics/connectivity/'), { method: 'POST' });
      } else if (kind === 'speed') {
        resp = await api.request(withDevice('/troubleshoot/diagnostics/speed/'), { method: 'POST' });
      } else if (kind === 'security') {
        resp = await api.request(withDevice('/troubleshoot/diagnostics/security/'), { method: 'POST' });
      } else if (kind === 'performance') {
        resp = await api.request(withDevice('/troubleshoot/diagnostics/performance/'), { method: 'POST' });
      }
      setResults((r) => ({ ...r, [kind]: resp.results || resp }));
    } catch (e) {
      setError(`Diagnostic failed: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, [kind]: false }));
    }
  };

  // pull history arrays regardless of server naming
  const hist = {
    cpu:
      systemHealth?.history?.cpu ||
      systemHealth?.cpu_history ||
      [],
    memory:
      systemHealth?.history?.memory ||
      systemHealth?.memory_history ||
      [],
    disk:
      systemHealth?.history?.disk ||
      systemHealth?.disk_history ||
      [],
    network:
      systemHealth?.history?.network ||
      systemHealth?.network_history ||
      [],
  };

  return (
    <div className="troubleshoot-container">
      <div className="container">
        <div className="page-header">
          <div>
            <h2>Network Troubleshooting</h2>
            <p>Diagnose and resolve network issues with powerful troubleshooting tools</p>
          </div>

          {/* Device picker */}
          <div className="device-picker">
            <label htmlFor="deviceSel">Device</label>
            <select
              id="deviceSel"
              className="form-select"
              value={selectedId || ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.hostname || `Device #${d.id}`}
                  {getDeviceAddress(d) ? ` – ${getDeviceAddress(d)}` : ''}
                </option>
              ))}
              {devices.length === 0 && <option value="">No devices</option>}
            </select>
          </div>
        </div>

        {sessionExpired && (
          <div className="alert alert-warning" style={{ marginBottom: 12 }}>
            Your session has expired. Please log in again.
          </div>
        )}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Nav */}
        <div className="troubleshoot-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Network Tools */}
        {activeTab === 'network' && (
          <div className="tools-grid">
            {/* Ping */}
            <div className="tool-card">
              <h3><i className="bi bi-broadcast-pin" /> Ping Test</h3>
              <p>Test connectivity to a specific host or IP address</p>
              <div className="tool-form">
                <input
                  className="form-input"
                  type="text"
                  placeholder="Enter IP address or hostname"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  onClick={handlePing}
                  disabled={loading.ping || !(pingTarget || getDeviceAddress(selectedDevice))}
                >
                  {loading.ping ? 'Pinging…' : 'Start Ping'}
                </button>
              </div>
              {results.ping && (
                <div className="result-box">
                  <h4>Ping results for {results.ping.target}</h4>
                  <div className="ping-summary">
                    <span>Packets: {results.ping.received}/{results.ping.sent}</span>
                    <span>Loss: {results.ping.loss}%</span>
                    <span>Avg: {results.ping.avg_time_ms}ms</span>
                  </div>
                  <div className="ping-details">
                    {(results.ping.lines || []).map((l, i) => (
                      <div key={i} className="ping-line">{l}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Traceroute */}
            <div className="tool-card">
              <h3><i className="bi bi-signpost" /> Traceroute</h3>
              <p>Trace the network path to a destination</p>
              <div className="tool-form">
                <input
                  className="form-input"
                  type="text"
                  placeholder="Enter IP address or hostname"
                  value={tracerouteTarget}
                  onChange={(e) => setTracerouteTarget(e.target.value)}
                />
                <button
                  className="btn btn-info"
                  onClick={handleTraceroute}
                  disabled={loading.traceroute || !(tracerouteTarget || getDeviceAddress(selectedDevice))}
                >
                  {loading.traceroute ? 'Tracing…' : 'Start Traceroute'}
                </button>
              </div>
              {results.traceroute && (
                <div className="result-box">
                  <h4>Traceroute to {results.traceroute.target}</h4>
                  <div className="traceroute-hops">
                    {(results.traceroute.hops || []).map((h, i) => (
                      <div key={i} className="hop-line">
                        <span className="hop-number">{h.hop}</span>
                        <span className="hop-ip">{h.ip}</span>
                        <span className="hop-hostname">{h.hostname || ''}</span>
                        <span className="hop-time">{h.time_ms != null ? `${h.time_ms}ms` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Port scan */}
            <div className="tool-card">
              <h3><i className="bi bi-ethernet" /> Port Scanner</h3>
              <p>Scan for open ports on a target host</p>
              <div className="tool-form">
                <input
                  className="form-input"
                  type="text"
                  placeholder="Enter IP address or hostname"
                  value={portScanTarget}
                  onChange={(e) => setPortScanTarget(e.target.value)}
                />
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ports (comma-separated)"
                  value={portScanPorts}
                  onChange={(e) => setPortScanPorts(e.target.value)}
                />
                <button
                  className="btn btn-warning"
                  onClick={handlePortScan}
                  disabled={loading.portscan || !(portScanTarget || getDeviceAddress(selectedDevice))}
                >
                  {loading.portscan ? 'Scanning…' : 'Start Scan'}
                </button>
              </div>
              {results.portscan && (
                <div className="result-box">
                  <h4>Port scan results for {results.portscan.target}</h4>
                  <div className="port-results">
                    {(results.portscan.ports || []).map((p, i) => (
                      <div key={i} className={`port-line ${p.status}`}>
                        <span className="port-number">{p.port}</span>
                        <span className="port-service">{p.service || ''}</span>
                        <span className={`port-status ${p.status}`}>{(p.status || '').toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* DNS */}
            <div className="tool-card">
              <h3><i className="bi bi-globe2" /> DNS Lookup</h3>
              <p>Perform DNS resolution and reverse lookups</p>
              <div className="tool-form">
                <input
                  className="form-input"
                  type="text"
                  placeholder="Enter domain name or IP address"
                  value={dnsTarget}
                  onChange={(e) => setDnsTarget(e.target.value)}
                />
                <select
                  className="form-select"
                  value={dnsRecordType}
                  onChange={(e) => setDnsRecordType(e.target.value)}
                >
                  <option value="A">A Record</option>
                  <option value="AAAA">AAAA Record</option>
                  <option value="MX">MX Record</option>
                  <option value="CNAME">CNAME Record</option>
                  <option value="TXT">TXT Record</option>
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={handleDnsLookup}
                  disabled={loading.dns || !(dnsTarget || getDeviceAddress(selectedDevice))}
                >
                  {loading.dns ? 'Looking up…' : 'Lookup'}
                </button>
              </div>
              {results.dns && (
                <div className="result-box">
                  <h4>DNS results for {results.dns.query}</h4>
                  <div className="ping-details">
                    {(results.dns.answers || []).map((a, i) => (
                      <div key={i} className="ping-line">{a}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Diagnostics */}
        {activeTab === 'diagnostics' && (
          <div className="diagnostics-content">
            {/* Summary bars */}
            <div className="health-overview">
              <div className="section-title">
                <h3>System Health Overview</h3>
                {selectedDevice && (
                  <div className="section-subtitle">
                    Target:{' '}
                    <strong>
                      {selectedDevice.name || selectedDevice.hostname || `Device #${selectedDevice.id}`}
                    </strong>
                    {getDeviceAddress(selectedDevice) && <> — {getDeviceAddress(selectedDevice)}</>}
                  </div>
                )}
              </div>

              <div className="health-metrics">
                <div className="metric-card">
                  <div className="metric-label">CPU Usage</div>
                  <div className="metric-value">{systemHealth?.cpu ?? '—'}%</div>
                  <div className="metric-bar">
                    <div className="metric-fill" style={{ width: `${systemHealth?.cpu || 0}%` }} />
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Memory Usage</div>
                  <div className="metric-value">{systemHealth?.memory ?? '—'}%</div>
                  <div className="metric-bar">
                    <div className="metric-fill memory" style={{ width: `${systemHealth?.memory || 0}%` }} />
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Disk Usage</div>
                  <div className="metric-value">{systemHealth?.disk ?? '—'}%</div>
                  <div className="metric-bar">
                    <div className="metric-fill disk" style={{ width: `${systemHealth?.disk || 0}%` }} />
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Network Usage</div>
                  <div className="metric-value">{systemHealth?.network ?? '—'}%</div>
                  <div className="metric-bar">
                    <div className="metric-fill network" style={{ width: `${systemHealth?.network || 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Dashboard-like donut + sparklines */}
            <div className="health-charts">
              <h3>Health Charts</h3>
              <div className="donut-grid">
                <Donut value={systemHealth?.cpu} label="CPU" color="#3b82f6" history={hist.cpu} />
                <Donut value={systemHealth?.memory} label="Memory" color="#22c55e" history={hist.memory} />
                <Donut value={systemHealth?.disk} label="Disk" color="#f59e0b" history={hist.disk} />
                <Donut value={systemHealth?.network} label="Network" color="#06b6d4" history={hist.network} />
              </div>
              <p className="donut-note">
                Live gauges with usage history. Run quick diagnostics below for deeper checks.
              </p>
            </div>

            <div className="quick-diagnostics">
              <h3>Quick Diagnostics</h3>
              <div className="diagnostic-buttons">
                <button
                  className="btn btn-primary diagnostic-btn"
                  onClick={() => runDiagnostic('connectivity')}
                  disabled={loading.connectivity}
                >
                  {loading.connectivity ? 'Testing…' : 'Test Internet Connectivity'}
                </button>
                <button
                  className="btn btn-info diagnostic-btn"
                  onClick={() => runDiagnostic('speed')}
                  disabled={loading.speed}
                >
                  {loading.speed ? 'Testing…' : 'Network Speed Test'}
                </button>
                <button
                  className="btn btn-warning diagnostic-btn"
                  onClick={() => runDiagnostic('security')}
                  disabled={loading.security}
                >
                  {loading.security ? 'Scanning…' : 'Security Scan'}
                </button>
                <button
                  className="btn btn-secondary diagnostic-btn"
                  onClick={() => runDiagnostic('performance')}
                  disabled={loading.performance}
                >
                  {loading.performance ? 'Analyzing…' : 'Performance Analysis'}
                </button>
              </div>

              {(results.connectivity || results.speed || results.security || results.performance) && (
                <div className="result-box" style={{ marginTop: 18 }}>
                  <h4>Diagnostic Results</h4>
                  <pre className="json-pre">
                    {JSON.stringify(
                      {
                        connectivity: results.connectivity,
                        speed: results.speed,
                        security: results.security,
                        performance: results.performance,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <div className="logs-content">
            <h3>System Logs Analysis</h3>
            <div className="log-filters">
              <select
                className="form-select"
                value={logFilters.level}
                onChange={(e) => setLogFilters((f) => ({ ...f, level: e.target.value }))}
              >
                <option value="all">All Logs</option>
                <option value="error">Error Logs</option>
                <option value="warning">Warning Logs</option>
                <option value="info">Info Logs</option>
              </select>
              <select
                className="form-select"
                value={logFilters.time_range}
                onChange={(e) => setLogFilters((f) => ({ ...f, time_range: e.target.value }))}
              >
                <option value="1hour">Last Hour</option>
                <option value="24hours">Last 24 Hours</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
              <button className="btn btn-primary" onClick={loadSystemLogs}>
                Analyze Logs
              </button>
            </div>
            <div className="log-viewer">
              {(systemLogs || []).map((row, i) => (
                <div key={i} className={`log-entry ${row.level?.toLowerCase() || ''}`}>
                  <span className="log-time">{row.timestamp}</span>
                  <span className="log-level">{(row.level || '').toUpperCase()}</span>
                  <span className="log-message">{row.message}</span>
                </div>
              ))}
              {(!systemLogs || systemLogs.length === 0) && <div style={{ color: '#7e90aa' }}>No logs.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
