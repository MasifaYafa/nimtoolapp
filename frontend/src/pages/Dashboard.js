// frontend/src/pages/Dashboard.js
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

/* ========= Colors (dark-blue theme) =========
   All charts use cool blues/cyans that match your Tailwind-y reference UI.
*/
const BLUE      = '#20a4ff';
const CYAN      = '#2cd4ff';
const INDIGO    = '#6d7cff';
const SKY       = '#52b6ff';
const DEEPBLUE  = '#0f1e3a';
const MINT      = '#44ead2';
const LAVENDER  = '#a78bfa';

const PIE_COLORS = [CYAN, BLUE, LAVENDER, SKY, INDIGO, MINT];

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

const Dashboard = ({ onLogout }) => {
  const [statistics, setStatistics] = useState(null);
  const [alertStats, setAlertStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uptimeHistory, setUptimeHistory] = useState([]); // [{ts, uptime}]
  const pollRef = useRef(null);

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
      } catch {
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
    return entries.map(([name, value], i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [statistics]);

  const deviceMiniData = useMemo(
    () => (devices || []).slice(0, 12).map(d => ({
      name: d.name || d.hostname || d.ip_address || `ID-${d.id}`,
      online: (d.status || '').toLowerCase() === 'online' ? 1 : 0,
    })),
    [devices]
  );

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
      <div className="dash-wrap">
        <div className="loading-card">
          <div className="spinner" aria-hidden="true" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-wrap">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">General Statistics</h1>
          <p className="dash-subtitle">Live overview of your network</p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-ghost" onClick={fetchDashboardData}>Refresh</button>
          <button className="btn btn-primary" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button className="btn btn-sm btn-ghost" onClick={fetchDashboardData} style={{ marginLeft: 10 }}>
            Retry
          </button>
        </div>
      )}

      {/* KPI Row */}
      {(statistics || alertStats) && (
        <section className="kpi-row">
          <div className="kpi-card">
            <div className="kpi-label">Total Devices</div>
            <div className="kpi-value">{statistics?.total_devices || 0}</div>
            <div className="kpi-meta">{statistics?.online_devices || 0} Online</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Active Alerts</div>
            <div className="kpi-value">{alertStats?.active_alerts || 0}</div>
            <div className="kpi-meta">{alertStats?.critical_alerts || 0} Critical</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Network Health</div>
            <div className="kpi-value">{statistics?.uptime_percentage || 0}%</div>
            <div className="kpi-meta">Uptime</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Alerts</div>
            <div className="kpi-value">{alertStats?.total_alerts || 0}</div>
            <div className="kpi-meta">{alertStats?.resolved_alerts || 0} Resolved</div>
          </div>
        </section>
      )}

      {/* Row 1: Uptime + Types */}
      <section className="grid-2">
        <div className="glass-card">
          <div className="card-title">Uptime % (live)</div>
          <div className="chart-box">
            <ResponsiveContainer>
              <AreaChart data={uptimeHistory.map(d => ({ ...d, x: new Date(d.ts).toLocaleTimeString() }))}>
                <defs>
                  <linearGradient id="uptimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.12)" strokeDasharray="3 3" />
                <XAxis dataKey="x" tick={{ fill: '#c9d8ff' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#c9d8ff' }} />
                <Tooltip contentStyle={{ background: DEEPBLUE, border: '1px solid #28416d', color: '#eaf4ff' }} />
                <Area type="monotone" dataKey="uptime" stroke={CYAN} strokeWidth={2} fill="url(#uptimeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card">
          <div className="card-title">Device Types</div>
          <div className="chart-box">
            <ResponsiveContainer>
              <PieChart>
                <Pie dataKey="value" data={typeData} innerRadius={55} outerRadius={95} paddingAngle={3} stroke="rgba(10,20,40,.6)">
                  {typeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: DEEPBLUE, border: '1px solid #28416d', color: '#eaf4ff' }} />
                <Legend wrapperStyle={{ color: '#c9d8ff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Row 2: Devices + Alerts */}
      <section className="grid-2">
        <div className="glass-card">
          <div className="card-title">Online by Device (top 12)</div>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={deviceMiniData}>
                <CartesianGrid stroke="rgba(255,255,255,.12)" strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={70} tick={{ fill: '#c9d8ff' }} />
                <YAxis ticks={[0, 1]} tick={{ fill: '#c9d8ff' }} />
                <Tooltip contentStyle={{ background: DEEPBLUE, border: '1px solid #28416d', color: '#eaf4ff' }} />
                <Legend wrapperStyle={{ color: '#c9d8ff' }} />
                <Bar name="Online" dataKey="online" fill={BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card">
          <div className="card-title">Alert Status</div>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={[
                { name: 'Active',   value: alertStats?.active_alerts || 0,   fill: '#ff6b6b' },
                { name: 'Critical', value: alertStats?.critical_alerts || 0, fill: '#ff3b3b' },
                { name: 'Warning',  value: alertStats?.warning_alerts || 0,  fill: '#fbbf24' },
                { name: 'Resolved', value: alertStats?.resolved_alerts || 0, fill: '#22c55e' },
              ]}>
                <CartesianGrid stroke="rgba(255,255,255,.12)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#c9d8ff' }} />
                <YAxis allowDecimals={false} tick={{ fill: '#c9d8ff' }} />
                <Tooltip contentStyle={{ background: DEEPBLUE, border: '1px solid #28416d', color: '#eaf4ff' }} />
                <Bar dataKey="value">
                  <Cell fill="#ff6b6b" />
                  <Cell fill="#ff3b3b" />
                  <Cell fill="#fbbf24" />
                  <Cell fill="#22c55e" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Recent Devices */}
      <section className="glass-card">
        <div className="card-title">Recent Devices</div>
        {devices && devices.length > 0 ? (
          <div className="recent-grid">
            {devices.slice(0, 12).map(d => {
              const statusKey = (d.status || 'unknown').toLowerCase();
              return (
                <div key={d.id} className="recent-card">
                  <div className="recent-top">
                    <span className="recent-type">{d.device_type || 'Unknown'}</span>
                    <span
                      className={
                        'status-pill ' +
                        (statusKey === 'online'
                          ? 'online'
                          : statusKey === 'offline'
                          ? 'offline'
                          : 'warn')
                      }
                    >
                      {getStatusDisplay(d.status)}
                    </span>
                  </div>
                  <div className="recent-name">{d.name || 'Unnamed Device'}</div>
                  <div className="recent-ip">{d.ip_address || d.ip || 'No IP'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="center" style={{ padding: 24 }}>
            <p>No devices found. Add some devices to get started!</p>
            <button onClick={fetchDashboardData} className="btn btn-primary" style={{ marginTop: 10 }}>
              Refresh
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
