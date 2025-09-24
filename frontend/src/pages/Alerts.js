// frontend/src/pages/Alerts.js
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { api, tokenManager } from '../services/api';
import './Alerts.css';

const ALERTS_SSE_URL = process.env.REACT_APP_ALERTS_SSE_URL || '';

function asArray(x) { return Array.isArray(x) ? x : []; }
function computeStatsFromAlerts(list = []) {
  const safe = asArray(list);
  const now = Date.now();
  let active = 0, acknowledged = 0, resolved24h = 0, critical = 0;

  safe.forEach(a => {
    const sev = (a.severity || 'info').toLowerCase();
    const st = (a.status || 'active').toLowerCase();
    if (st === 'active' || st === 'open') active++;
    if (st === 'acknowledged') acknowledged++;
    if (sev === 'critical') critical++;
    const resolvedAt = a.resolved_at || a.resolvedAt;
    if (resolvedAt) {
      const dt = new Date(resolvedAt).getTime();
      if (!Number.isNaN(dt) && now - dt <= 24 * 3600 * 1000) resolved24h++;
    }
  });

  return {
    active_alerts: active,
    critical_alerts: critical,
    acknowledged_alerts: acknowledged,
    resolved_24h: resolved24h
  };
}

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const [actionBusy, setActionBusy] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState(null);

  const esRef = useRef(null);
  const pollRef = useRef(null);

  const normalizeMessage = (a) => {
    // Force the exact text when a device goes offline (from backend monitoring)
    const metric = (a.metric_name || a.metricName || '').toLowerCase();
    const val = (a.current_value || a.currentValue || '').toString().toLowerCase();
    if (metric === 'device_status' && val === 'offline') return 'This device is offline';
    return a.message || a.title || 'Alert';
  };

  const fetchAlerts = async () => {
    try {
      setError('');
      if (!tokenManager.isLoggedIn?.()) {
        window.location.href = '/';
        return;
      }
      const params = {};
      if (severity !== 'all') params.severity = severity;
      if (status !== 'all') params.status = status;
      if (search.trim()) params.search = search.trim();

      const [list, s] = await Promise.all([
        api.alerts.list(params),
        api.alerts.statistics?.().catch(() => null),
      ]);

      const items = Array.isArray(list?.results) ? list.results : (Array.isArray(list) ? list : []);
      setAlerts(items);
      setStats(s || computeStatsFromAlerts(items));
    } catch (e) {
      setError('Failed to load alerts: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let aborted = false;

    const startPolling = () => {
      if (!pollRef.current) pollRef.current = setInterval(fetchAlerts, 10000);
    };

    const startSSE = () => {
      if (!ALERTS_SSE_URL) return startPolling();
      try {
        const token = tokenManager.getAccessToken?.();
        const url = token
          ? `${ALERTS_SSE_URL}${ALERTS_SSE_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
          : ALERTS_SSE_URL;
        const es = new EventSource(url, { withCredentials: true });
        esRef.current = es;
        es.onmessage = () => { if (!aborted) fetchAlerts(); };
        es.onerror = () => { es.close(); esRef.current = null; startPolling(); };
      } catch {
        startPolling();
      }
    };

    (async () => {
      setLoading(true);
      await fetchAlerts();
      startSSE();
    })();

    return () => {
      aborted = true;
      if (esRef.current) esRef.current.close();
      if (pollRef.current) clearInterval(pollRef.current);
      esRef.current = null;
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, status]);

  const acknowledgeAlert = async (id) => {
    try {
      setActionBusy((p) => ({ ...p, [id]: true }));
      await api.alerts.acknowledge(id, 'Acknowledged via dashboard');
      await fetchAlerts();
    } catch (e) {
      setError('Failed to acknowledge: ' + (e?.message || e));
    } finally {
      setActionBusy((p) => ({ ...p, [id]: false }));
    }
  };

  const resolveAlert = async (id) => {
    try {
      setActionBusy((p) => ({ ...p, [id]: true }));
      await api.alerts.resolve(id, 'Resolved via dashboard');
      await fetchAlerts();
    } catch (e) {
      setError('Failed to resolve: ' + (e?.message || e));
    } finally {
      setActionBusy((p) => ({ ...p, [id]: false }));
    }
  };

  const acknowledgeAll = async () => {
    try {
      setBulkBusy(true);
      const options = { note: 'Bulk acknowledge from dashboard' };
      if (severity !== 'all') options.severity = severity;
      await api.alerts.acknowledgeAll(options);
      await fetchAlerts();
    } catch (e) {
      setError('Bulk acknowledge failed: ' + (e?.message || e));
    } finally {
      setBulkBusy(false);
    }
  };

  const createTestAlert = async () => {
    try {
      setBulkBusy(true);
      await api.alerts.createTestAlert();
      await fetchAlerts();
    } catch (e) {
      setError('Failed to create test alert: ' + (e?.message || e));
    } finally {
      setBulkBusy(false);
    }
  };

  const sevBadgeClass = (s) => {
    const k = (s || '').toLowerCase();
    if (k === 'critical') return 'sev sev-crit';
    if (k === 'warning' || k === 'major' || k === 'high') return 'sev sev-warn';
    return 'sev sev-info';
  };
  const statusBadgeClass = (s) => {
    const k = (s || '').toLowerCase();
    if (k === 'active' || k === 'open') return 'st st-active';
    if (k === 'acknowledged') return 'st st-ack';
    if (k === 'resolved') return 'st st-res';
    return 'st';
  };
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

  const kpi = useMemo(() => ({
    active: stats?.active_alerts ?? 0,
    critical: stats?.critical_alerts ?? 0,
    ack: stats?.acknowledged_alerts ?? 0,
    res24: stats?.resolved_24h ?? 0,
  }), [stats]);

  if (loading) {
    return (
      <div className="alerts-container">
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading alerts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-container">
      {/* Header */}
      <header className="alerts-header">
        <div className="wrap">
          <div className="header-content">
            <div>
              <h1 className="h1">Alerts</h1>
              <p className="muted">Real-time incidents, notifications, and quick actions</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={fetchAlerts}>Refresh</button>
              <a className="btn btn-primary" href="/devices">Go to Devices</a>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="alerts-main">
        <div className="wrap">
          {error && (
            <div className="card error-message">
              <span>{error}</span>
              <button className="btn btn-ghost" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}

          {/* Controls */}
          <section className="card controls">
            <div className="row">
              <div className="row">
                <select value={severity} onChange={e => setSeverity(e.target.value)} className="select">
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning / Major</option>
                  <option value="info">Info</option>
                </select>
                <select value={status} onChange={e => setStatus(e.target.value)} className="select">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="resolved">Resolved</option>
                </select>
                <input
                  className="input"
                  placeholder="Search alerts, device, message…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-ghost" onClick={fetchAlerts}>Apply</button>
              </div>
              <div className="row">
                <button className="btn btn-primary" onClick={acknowledgeAll} disabled={bulkBusy}>
                  {bulkBusy ? 'Working…' : 'Acknowledge All'}
                </button>
                <button className="btn btn-secondary" onClick={createTestAlert} disabled={bulkBusy}>
                  Test Alert
                </button>
              </div>
            </div>
          </section>

          {/* KPIs */}
          <section className="kpi-row">
            <div className="kpi card">
              <div className="kpi__label">Active Alerts</div>
              <div className="kpi__value">{kpi.active}</div>
              <div className="kpi__meta">Currently open</div>
            </div>
            <div className="kpi card">
              <div className="kpi__label">Critical</div>
              <div className="kpi__value">{kpi.critical}</div>
              <div className="kpi__meta">Highest severity</div>
            </div>
            <div className="kpi card">
              <div className="kpi__label">Acknowledged</div>
              <div className="kpi__value">{kpi.ack}</div>
              <div className="kpi__meta">Under investigation</div>
            </div>
            <div className="kpi card">
              <div className="kpi__label">Resolved (24h)</div>
              <div className="kpi__value">{kpi.res24}</div>
              <div className="kpi__meta">Last 24 hours</div>
            </div>
          </section>

          {/* Recent Alerts — dark horizontal cards */}
          <section className="card">
            <div className="panel__title">Recent Alerts</div>
            {alerts.length ? (
              <div className="recent-grid">
                {alerts.slice(0, 24).map((a) => {
                  const msg = normalizeMessage(a);
                  return (
                    <div key={a.id} className="recent-card">
                      <div className="recent-top">
                        <span className={sevBadgeClass(a.severity)}>{(a.severity || 'info').toUpperCase()}</span>
                        <span className={statusBadgeClass(a.status)} style={{ marginLeft: 6 }}>
                          {(a.status || 'active').toUpperCase()}
                        </span>
                        <span className="muted right">{a.device_name || a.device || 'Unknown device'}</span>
                      </div>
                      <div className="recent-title">{a.title || msg || 'Alert'}</div>
                      {msg && <div className="recent-desc muted">{msg}</div>}
                      <div className="muted">{fmt(a.created_at || a.createdAt || a.first_occurred)}</div>
                      <div className="row">
                        {(['active', 'open'].includes((a.status || '').toLowerCase())) && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => acknowledgeAlert(a.id)}
                            disabled={!!actionBusy[a.id]}
                          >
                            {actionBusy[a.id] ? '…' : 'Acknowledge'}
                          </button>
                        )}
                        {(['active', 'acknowledged'].includes((a.status || '').toLowerCase())) && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => resolveAlert(a.id)}
                            disabled={!!actionBusy[a.id]}
                          >
                            {actionBusy[a.id] ? '…' : 'Resolve'}
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(a)}>Details</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 12 }}>No alerts match your filters.</div>
            )}
          </section>
        </div>
      </main>

      {/* Details modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Alert Details</h3>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <strong>Title</strong>
                  <div>{selected.title || normalizeMessage(selected) || '—'}</div>
                </div>
                <div className="detail-item">
                  <strong>Severity</strong>
                  <span className={sevBadgeClass(selected.severity)}>{(selected.severity || 'info').toUpperCase()}</span>
                </div>
                <div className="detail-item">
                  <strong>Status</strong>
                  <span className={statusBadgeClass(selected.status)}>{(selected.status || 'active').toUpperCase()}</span>
                </div>
                <div className="detail-item">
                  <strong>Device</strong>
                  <div>{selected.device_name || selected.device || '—'}</div>
                </div>
                <div className="detail-item">
                  <strong>IP</strong>
                  <div>{selected.device_ip || '—'}</div>
                </div>
                <div className="detail-item">
                  <strong>First Occurred</strong>
                  <div>{fmt(selected.first_occurred)}</div>
                </div>
                <div className="detail-item">
                  <strong>Last Occurred</strong>
                  <div>{fmt(selected.last_occurred)}</div>
                </div>
                <div className="detail-item">
                  <strong>Count</strong>
                  <div>{selected.occurrence_count ?? '—'}</div>
                </div>
                {selected.current_value != null && (
                  <div className="detail-item">
                    <strong>Current Value</strong>
                    <div>{String(selected.current_value)}</div>
                  </div>
                )}
                {selected.threshold_value != null && (
                  <div className="detail-item">
                    <strong>Threshold</strong>
                    <div>{String(selected.threshold_value)}</div>
                  </div>
                )}
                {selected.description && (
                  <div className="detail-item full">
                    <strong>Description</strong>
                    <div>{selected.description}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              {(['active', 'open'].includes((selected.status || '').toLowerCase())) && (
                <button className="btn btn-ghost" onClick={() => { acknowledgeAlert(selected.id); setSelected(null); }}>
                  Acknowledge
                </button>
              )}
              {(['active', 'acknowledged'].includes((selected.status || '').toLowerCase())) && (
                <button className="btn btn-primary" onClick={() => { resolveAlert(selected.id); setSelected(null); }}>
                  Resolve
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alerts;
