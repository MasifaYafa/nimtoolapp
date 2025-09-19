import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ApiService from '../services/api';
import './Dashboard.css';

/**
 * >>> PLACE YOUR IMAGE HERE <<<
 *    frontend/src/assets/dashboard-bg.jpg
 *
 * If you rename or move it, update the path below accordingly.
 */
import dashboardBg from '../assets/dashboard-bg.jpg';

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#eab308'];

/** Convert devices to stats and buckets */
function computeStatsFromDevices(devices = []) {
  const statusCounts = { online: 0, offline: 0, warning: 0, unknown: 0 };
  const typeCounts = {};
  devices.forEach(d => {
    const s = (d.status || 'unknown').toLowerCase();
    if (statusCounts[s] == null) statusCounts.unknown += 1; else statusCounts[s] += 1;
    const t = (d.device_type || 'unknown').toLowerCase();
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const total = devices.length;
  const uptime_percentage = total > 0 ? Math.round((statusCounts.online / total) * 100) : 0;
  return {
    total_devices: total,
    online_devices: statusCounts.online,
    offline_devices: statusCounts.offline,
    uptime_percentage,
    device_types: typeCounts,
    status_counts: statusCounts,
  };
}

const Dashboard = ({ onLogout, onNavigate }) => {
  const [statistics, setStatistics] = useState(null);
  const [alertStats, setAlertStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // live series
  const [uptimeHistory, setUptimeHistory] = useState([]); // [{ts, uptime}]
  const pollRef = useRef(null);

  // Background image style (lets Webpack bundle the asset)
  const BG_STYLE = {
    backgroundImage: `url(${dashboardBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  // ---------- inline UI system ----------
  const ORANGE = '#f97316';
  const styles = {
    container: { maxWidth: 1200, margin: '0 auto', padding: 16 },
    row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
    kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 },
    card: {
      background: '#0f172a',
      border: '1px solid #1f2937',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 8px 20px rgba(0,0,0,.25)',
      color: '#e5e7eb',
    },
    title: { color: '#94a3b8', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center' },
    chartBox: { height: 260 },
    kpiLabel: { color: ORANGE, fontWeight: 700, letterSpacing: '.2px' },
    kpiValue: { color: ORANGE, fontWeight: 800, fontSize: 26, marginTop: 6 },
    kpiMeta: { color: '#9aa3b2', marginTop: 4 },
    right: { marginLeft: 'auto' },
    recentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 },
    recentCard: {
      background: '#101b30',
      border: '1px solid #1f2937',
      borderRadius: 12,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    recentTop: { display: 'flex', alignItems: 'center', gap: 8 },
    recentType: { color: '#9aa3b2', fontSize: 13 },
    recentName: { fontWeight: 700, letterSpacing: '.2px' },
    recentIp: { color: '#9aa3b2', fontSize: 13 },
    btn: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px 12px', borderRadius: 10, textDecoration: 'none',
      border: '1px solid #1f2937', background: '#18233a', color: '#e5e7eb', fontWeight: 600,
      cursor: 'pointer'
    },
    btnPrimary: { background: `linear-gradient(135deg, #ea580c, ${ORANGE})`, color: '#1a1a1a', border: 'none' },
    btnGhost: { background: 'transparent', color: ORANGE, border: `1px solid ${ORANGE}` },
    btnSm: { padding: '6px 10px', fontSize: 13 },
    btnFull: { width: '100%' },
    badge: {
      marginLeft: 'auto', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      border: '1px solid #25324a', background: '#18233a', color: '#e5e7eb',
    },
    badgeOnline: { background: 'rgba(34,197,94,.22)', color: '#bef7cb', borderColor: 'rgba(34,197,94,.35)' },
    badgeOffline: { background: 'rgba(239,68,68,.25)', color: '#ffd0d0', borderColor: 'rgba(239,68,68,.35)' },
    badgeWarning: { background: 'rgba(245,158,11,.25)', color: '#ffe2b8', borderColor: 'rgba(245,158,11,.35)' },
  };

  // SPA navigation helper (avoids page reload)
  const goToDevices = () => {
    if (typeof onNavigate === 'function') onNavigate('devices');
  };

  const fetchDashboardData = async () => {
    try {
      setError('');
      let devicesData = [];
      let statsData = null;
      let alertStatsData = null;

      try {
        const res = await ApiService.getDevices();
        devicesData = res?.results || res || [];
      } catch (e) {
        setError(`Failed to load devices: ${e.message}`);
      }

      try {
        statsData = await ApiService.getDeviceStatistics();
      } catch (e) {
        statsData = computeStatsFromDevices(devicesData);
      }

      try {
        alertStatsData = await ApiService.getAlertStatistics();
      } catch {
        alertStatsData = {
          total_alerts: 0,
          active_alerts: 0,
          critical_alerts: 0,
          warning_alerts: 0,
          acknowledged_alerts: 0,
          resolved_alerts: 0
        };
      }

      setDevices(devicesData);
      setStatistics(statsData);
      setAlertStats(alertStatsData);

      const ts = new Date();
      setUptimeHistory(prev => [...prev, { ts, uptime: statsData?.uptime_percentage ?? 0 }].slice(-60));
    } catch (e) {
      setError(`Failed to load dashboard data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let aborted = false;

    const startPolling = () => {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          if (!aborted) fetchDashboardData();
        }, 10000);
      }
    };

    (async () => {
      setLoading(true);
      await fetchDashboardData();
      startPolling();
    })();

    return () => {
      aborted = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeData = useMemo(() => {
    const entries = Object.entries(statistics?.device_types || {});
    return entries.map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  }, [statistics]);

  const statusBarData = useMemo(() => {
    if (!statistics) return [];
    return [
      { name: 'Online', value: statistics.online_devices || 0, fill: '#22c55e' },
      { name: 'Warning', value: statistics.status_counts?.warning || 0, fill: '#f59e0b' },
      { name: 'Offline', value: statistics.offline_devices || 0, fill: '#ef4444' },
    ];
  }, [statistics]);

  const deviceMiniData = useMemo(
    () => (devices || []).slice(0, 12).map(d => ({
      name: d.name || d.hostname || d.ip_address || `ID-${d.id}`,
      online: (d.status || '').toLowerCase() === 'online' ? 1 : 0,
    })),
    [devices]
  );

  const handleLogout = async () => {
    try {
      await ApiService.logout();
      onLogout?.();
    } catch {
      onLogout?.();
    }
  };

  const getDeviceTypeIcon = (deviceType) => {
    switch ((deviceType || '').toLowerCase()) {
      case 'router': return '🌐';
      case 'switch': return '🔀';
      case 'access_point': return '📶';
      case 'firewall': return '🛡️';
      default: return '📱';
    }
  };

  const getStatusDisplay = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'warning': return 'Warning';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container" style={BG_STYLE}>
        <div className="loading-container">
          <div className="spinner" aria-hidden="true" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={BG_STYLE}>
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content" style={styles.container}>
          <div>
            <h1 className="h1">NIM-Tool Dashboard</h1>
            <p className="muted">Live network overview &amp; health</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              style={{ ...styles.btn }}
              onClick={fetchDashboardData}
            >
              Refresh
            </button>
            <button
              className="btn btn-primary"
              style={{ ...styles.btn, ...styles.btnPrimary, marginLeft: 8 }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="dashboard-main">
        <div style={styles.container}>
          {error && (
            <div className="error-message" style={{ ...styles.card, background: '#2a1a13', marginBottom: 20 }}>
              {error}
              <button
                onClick={fetchDashboardData}
                className="btn btn-primary"
                style={{ ...styles.btn, ...styles.btnPrimary, marginLeft: 12 }}
              >
                Retry
              </button>
            </div>
          )}

          {/* KPIs */}
          {(statistics || alertStats) && (
            <section style={styles.kpiRow}>
              <div style={styles.card}>
                <div style={styles.kpiLabel}>Total Devices</div>
                <div style={styles.kpiValue}>{statistics?.total_devices || 0}</div>
                <div style={styles.kpiMeta}>{statistics?.online_devices || 0} Online</div>
              </div>
              <div style={styles.card}>
                <div style={styles.kpiLabel}>Active Alerts</div>
                <div style={styles.kpiValue}>{alertStats?.active_alerts || 0}</div>
                <div style={styles.kpiMeta}>
                  {alertStats?.critical_alerts || 0} Critical
                </div>
              </div>
              <div style={styles.card}>
                <div style={styles.kpiLabel}>Network Health</div>
                <div style={styles.kpiValue}>{statistics?.uptime_percentage || 0}%</div>
                <div style={styles.kpiMeta}>Uptime</div>
              </div>
              <div style={styles.card}>
                <div style={styles.kpiLabel}>Total Alerts</div>
                <div style={styles.kpiValue}>{alertStats?.total_alerts || 0}</div>
                <div style={styles.kpiMeta}>
                  {alertStats?.resolved_alerts || 0} Resolved
                </div>
              </div>
            </section>
          )}

          {/* Row 1: Uptime + Device Types */}
          <section style={styles.row2}>
            <div style={styles.card}>
              <div style={styles.title}>Uptime % (live)</div>
              <div style={styles.chartBox}>
                <ResponsiveContainer>
                  <AreaChart data={uptimeHistory.map(d => ({ ...d, x: new Date(d.ts).toLocaleTimeString() }))}>
                    <defs>
                      <linearGradient id="uptime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="x" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="uptime" stroke="#22c55e" fill="url(#uptime)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.title}>Device Types</div>
              <div style={styles.chartBox}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie dataKey="value" data={typeData} innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {typeData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Row 2: All Devices + Alert Status */}
          <section style={styles.row2}>
            <div style={styles.card}>
              <div style={{ ...styles.title }}>
                <span>All Devices (live)</span>
                {/* SPA navigation (no page reload) */}
                <button
                  type="button"
                  onClick={goToDevices}
                  style={{ ...styles.btn, ...styles.btnGhost, ...styles.right }}
                >
                  Open Devices
                </button>
              </div>
              <div style={styles.chartBox}>
                <ResponsiveContainer>
                  <BarChart data={deviceMiniData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={70} />
                    <YAxis ticks={[0, 1]} />
                    <Tooltip />
                    <Legend />
                    <Bar name="Online" dataKey="online" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.title}>Alert Status</div>
              <div style={styles.chartBox}>
                <ResponsiveContainer>
                  <BarChart data={[
                    { name: 'Active', value: alertStats?.active_alerts || 0, fill: '#ef4444' },
                    { name: 'Critical', value: alertStats?.critical_alerts || 0, fill: '#dc2626' },
                    { name: 'Warning', value: alertStats?.warning_alerts || 0, fill: '#f59e0b' },
                    { name: 'Resolved', value: alertStats?.resolved_alerts || 0, fill: '#22c55e' },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value">
                      {[
                        { fill: '#ef4444' },
                        { fill: '#dc2626' },
                        { fill: '#f59e0b' },
                        { fill: '#22c55e' },
                      ].map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Recent Devices — horizontal grid */}
          <section style={styles.card}>
            <div style={styles.title}>Recent Devices</div>
            {devices && devices.length > 0 ? (
              <div style={styles.recentGrid}>
                {devices.slice(0, 12).map(d => {
                  const statusKey = (d.status || 'unknown').toLowerCase();
                  const badgeStyle =
                    statusKey === 'online' ? styles.badgeOnline :
                    statusKey === 'offline' ? styles.badgeOffline :
                    statusKey === 'warning' ? styles.badgeWarning : {};
                  return (
                    <div key={d.id} style={styles.recentCard}>
                      <div style={styles.recentTop}>
                        <span style={styles.recentType} title={d.device_type}>
                          {getDeviceTypeIcon(d.device_type)} {d.device_type || 'Unknown'}
                        </span>
                        <span style={{ ...styles.badge, ...badgeStyle }}>
                          {getStatusDisplay(d.status)}
                        </span>
                      </div>
                      <div style={styles.recentName}>{d.name || 'Unnamed Device'}</div>
                      <div style={styles.recentIp}>{d.ip_address || d.ip || 'No IP'}</div>
                      {/* SPA navigation button */}
                      <button
                        type="button"
                        onClick={goToDevices}
                        style={{ ...styles.btn, ...styles.btnSm, ...styles.btnFull }}
                      >
                        View
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="center" style={{ padding: 24 }}>
                <p>No devices found. Add some devices to get started!</p>
                <button
                  onClick={fetchDashboardData}
                  className="btn btn-primary"
                  style={{ ...styles.btn, ...styles.btnPrimary, marginTop: 10 }}
                >
                  Refresh
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
