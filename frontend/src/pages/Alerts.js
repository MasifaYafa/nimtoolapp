// frontend/src/pages/Alerts.js
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { api, tokenManager } from '../services/api';
import './Alerts.css';

/**
 * >>> PLACE YOUR IMAGE HERE <<<
 *    frontend/src/assets/alerts-bg.jpg
 *
 * If you rename or move it, update the path below accordingly.
 */
import alertsBg from '../assets/alerts-bg.jpg';

// Background image style (lets Webpack/Vite bundle the asset)
const BG_STYLE = {
  backgroundImage: `url(${alertsBg})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

const ALERTS_SSE_URL = process.env.REACT_APP_ALERTS_SSE_URL || '';

function computeStatsFromAlerts(list = []) {
  const safe = Array.isArray(list) ? list : [];
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

  // filters
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  // actions
  const [actionBusy, setActionBusy] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);

  // modal
  const [selected, setSelected] = useState(null);

  // live refs
  const esRef = useRef(null);
  const pollRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      setError('');
      if (!tokenManager.isLoggedIn()) {
        window.location.href = '/login';
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
      const msg = String(e?.message || '');
      if (msg.includes('session') || msg.includes('login')) {
        setError('Your session has expired. Redirecting to login…');
        setTimeout(() => (window.location.href = '/login'), 1500);
      } else setError('Failed to load alerts: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  // Live updates: SSE with polling fallback
  useEffect(() => {
    let aborted = false;

    const startPolling = () => {
      if (!pollRef.current) pollRef.current = setInterval(fetchAlerts, 10000);
    };

    const startSSE = () => {
      if (!ALERTS_SSE_URL) return startPolling();
      try {
        const token = tokenManager.getAccessToken();
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
  }, [severity, status, search]);

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
      <div className="alerts-container" style={BG_STYLE}>
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading alerts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-container" style={BG_STYLE}>
      {/* Header */}
      <header className="alerts-header">
        <div className="wrap">
          <div className="header-content">
            <div>
              <h1 className="h1">Alerts</h1>
              <p className="muted">Real-time incidents, email/SMS notifications, and quick actions</p>
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
            <div className="error-message">
              <span>⚠️ {error}</span>
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
                  🧪 Test Alert
                </button>
              </div>
            </div>
          </section>

          {/* KPIs (orange) */}
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

          {/* Recent Alerts — horizontal cards */}
          <section className="card">
            <div className="panel__title">Recent Alerts</div>
            {alerts.length ? (
              <div className="recent-grid">
                {alerts.slice(0, 24).map((a) => (
                  <div key={a.id} className="recent-card">
                    <div className="recent-top">
                      <span className={sevBadgeClass(a.severity)}>{(a.severity || 'info').toUpperCase()}</span>
                      <span className={statusBadgeClass(a.status)} style={{ marginLeft: 6 }}>
                        {(a.status || 'active').toUpperCase()}
                      </span>
                      <span className="muted right">{a.device_name || a.device || 'Unknown device'}</span>
                    </div>
                    <div className="recent-title">{a.title || a.message || 'Alert'}</div>
                    {a.message && <div className="recent-desc muted">{a.message}</div>}
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
                ))}
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
                  <div>{selected.title || selected.message || '—'}</div>
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
                {selected.current_value && (
                  <div className="detail-item">
                    <strong>Current Value</strong>
                    <div>{selected.current_value}</div>
                  </div>
                )}
                {selected.threshold_value && (
                  <div className="detail-item">
                    <strong>Threshold</strong>
                    <div>{selected.threshold_value}</div>
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
