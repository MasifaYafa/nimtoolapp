// frontend/src/pages/Topology.js
// Clean, responsive, no horizontal scroll. Logical layout saves to localStorage.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ApiService, { api } from '../services/api';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './Topology.css';

// If you ever want the image again, uncomment the two lines below
// import topologyBg from '../assets/topology-bg.jpg';
// const BG_STYLE = { backgroundImage: `url(${topologyBg})`, backgroundSize: 'cover', backgroundPosition: 'center' };

const clamp = (n, min, max) => Math.min(Math.max(Number(n), min), max);
const LS_KEY = 'nim_topology_logical_positions_v1';

export default function Topology() {
  const [viewMode] = useState('logical'); // physical view removed per request
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rawDevices, setRawDevices] = useState([]);

  const [editing, setEditing] = useState(false);
  const [unsavedPos, setUnsavedPos] = useState({});
  const [savedLogicalPos, setSavedLogicalPos] = useState({});
  const svgRef = useRef(null);
  const dragRef = useRef({ id: null });

  // ---------- load devices ----------
  useEffect(() => {
    let mounted = true;

    try {
      const ls = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (ls && typeof ls === 'object') setSavedLogicalPos(ls);
    } catch {}

    (async () => {
      try {
        setError('');
        setLoading(true);
        const res = await ApiService.getDevices();
        const list = Array.isArray(res) ? res : (res?.results || []);
        if (mounted) setRawDevices(list);
      } catch (e) {
        if (mounted) setError(e?.message || 'Failed to load devices.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // ---------- helpers ----------
  const normType = (t) => {
    const v = (t || '').toString().toLowerCase();
    if (v.includes('router')) return 'router';
    if (v.includes('switch')) return 'switch';
    if (v.includes('access') || v === 'ap' || v.includes('point')) return 'ap';
    if (v.includes('server')) return 'server';
    return 'unknown';
  };

  const getStatusColor = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'online':  return '#22c55e';
      case 'offline': return '#ef4444';
      case 'warning': return '#f59e0b';
      default:        return '#6b7280';
    }
  };

  const baseNodes = useMemo(() => {
    return (rawDevices || []).map(d => ({
      id: d.id,
      name: d.name || d.hostname || d.ip_address || 'Device',
      ip: d.ip_address,
      status: (d.status || 'unknown').toLowerCase(),
      type: normType(d.device_type_name || d.device_type || ''),
    }));
  }, [rawDevices]);

  // logical layout baseline (rows by type)
  const logicalBaseline = useMemo(() => {
    const nodes = baseNodes.map(n => ({ ...n }));
    if (!nodes.length) return nodes;

    const spread = (i, total, pad = 10) => {
      const span = 100 - pad * 2;
      if (total <= 1) return 50;
      return pad + (i * (span / (total - 1)));
    };

    const routers  = nodes.filter(n => n.type === 'router');
    const switches = nodes.filter(n => n.type === 'switch');
    const aps      = nodes.filter(n => n.type === 'ap');
    const servers  = nodes.filter(n => n.type === 'server');
    const unknowns = nodes.filter(n => !['router', 'switch', 'ap', 'server'].includes(n.type));

    routers.forEach((n, i)  => { n.x = spread(i, routers.length);  n.y = 18; });
    switches.forEach((n, i) => { n.x = spread(i, switches.length); n.y = 40; });
    aps.forEach((n, i)      => { n.x = spread(i, aps.length);      n.y = 70; });
    servers.forEach((n, i)  => { n.x = spread(i, servers.length);  n.y = 86; });
    unknowns.forEach((n, i) => { n.x = spread(i, unknowns.length); n.y = 58; });

    return nodes;
  }, [baseNodes]);

  const buildLinks = (nodes) => {
    const routers  = nodes.filter(n => n.type === 'router');
    const switches = nodes.filter(n => n.type === 'switch');
    const aps      = nodes.filter(n => n.type === 'ap');
    const servers  = nodes.filter(n => n.type === 'server');

    const links = [];
    if (routers.length && switches.length) {
      routers.forEach(r => switches.forEach(s => links.push({ from: r.id, to: s.id })));
    }
    const attachTo = switches.length ? switches : (routers.length ? routers : []);
    if (attachTo.length) {
      const attach = (targets, sources) => {
        sources.forEach((n, i) => links.push({ from: targets[i % targets.length].id, to: n.id }));
      };
      attach(attachTo, aps);
      attach(attachTo, servers);
    } else if (nodes.length > 1) {
      const rest = nodes.slice(1);
      rest.forEach(n => links.push({ from: nodes[0].id, to: n.id }));
    }
    return links;
  };

  const laidOut = useMemo(() => {
    if (!baseNodes.length) return { nodes: [], links: [] };

    // start with logical baseline
    const map = Object.fromEntries(logicalBaseline.map(n => [n.id, { ...n }]));

    // apply saved then unsaved overrides
    Object.entries(savedLogicalPos).forEach(([id, pos]) => {
      if (map[id]) { map[id].x = pos.x; map[id].y = pos.y; }
    });
    Object.entries(unsavedPos).forEach(([id, pos]) => {
      if (map[id]) { map[id].x = pos.x; map[id].y = pos.y; }
    });

    const nodes = Object.values(map);
    return { nodes, links: buildLinks(nodes) };
  }, [baseNodes, logicalBaseline, savedLogicalPos, unsavedPos]);

  // KPI counts
  const counts = useMemo(() => {
    const by = { router: 0, switch: 0, ap: 0, server: 0, unknown: 0 };
    baseNodes.forEach(n => { by[n.type] = (by[n.type] || 0) + 1; });
    return by;
  }, [baseNodes]);

  // export (kept)
  const handleExport = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true);
    clone.querySelectorAll('line').forEach(line => {
      line.setAttribute('stroke', '#3b82f6');
      line.setAttribute('stroke-width', '0.35');
      line.setAttribute('opacity', '0.8');
    });
    clone.querySelectorAll('text.node-label').forEach(t => {
      t.setAttribute('fill', '#94a3b8');
    });

    const src = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'topology.svg';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // pointer → viewBox coords
  const pointerToView = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 6, 94);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 6, 94);
    return { x, y };
  };

  // dragging
  const startDrag = (id) => (e) => {
    if (!editing) return;
    e.preventDefault();
    dragRef.current = { id };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };
  const onDragMove = (e) => {
    const { id } = dragRef.current;
    if (!id) return;
    const { x, y } = pointerToView(e);
    setUnsavedPos((p) => ({ ...p, [id]: { x, y } }));
  };
  const endDrag = () => {
    dragRef.current = { id: null };
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  };
  useEffect(() => () => endDrag(), []);

  const hasUnsaved = Object.keys(unsavedPos).length > 0;
  const resetUnsaved = () => setUnsavedPos({});
  const toggleEditing = () => setEditing(v => !v);

  const saveLayout = async () => {
    if (!hasUnsaved) return;
    try {
      setError('');
      setSuccess('');
      const merged = { ...savedLogicalPos, ...unsavedPos };
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
      setSavedLogicalPos(merged);
      setUnsavedPos({});
      setSuccess('Layout saved.');
    } catch (e) {
      setError(e?.message || 'Failed to save layout.');
    } finally {
      setTimeout(() => setSuccess(''), 2500);
    }
  };

  if (loading) {
    return (
      <div className="topology-container">
        <div className="container">
          <div className="page-header">
            <h2>Network Topology</h2>
            <p>Visualize your network infrastructure and device connections</p>
          </div>
          <div className="topo-loading">Loading topology…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="topology-container">
      <div className="container">
        <div className="page-header">
          <h2>Network Topology</h2>
          <p>Visualize your network infrastructure and device connections</p>
        </div>

        {error && <div className="topo-error">{error}</div>}
        {success && <div className="topo-success">{success}</div>}

        {/* Controls */}
        <div className="topology-controls">
          <div className="view-controls">
            <button className="btn btn-primary">Logical View</button>
            <button className="btn btn-secondary" onClick={toggleEditing}>
              {editing ? 'Editing… (drag nodes)' : 'Edit Positions'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={resetUnsaved}
              disabled={!hasUnsaved}
              title={hasUnsaved ? 'Discard unsaved changes' : 'No changes'}
            >
              Reset (unsaved)
            </button>
            <button
              className="btn"
              onClick={saveLayout}
              disabled={!hasUnsaved}
              title="Save current positions"
            >
              Save Layout
            </button>
          </div>

          <div className="topology-actions">
            <button className="btn btn-secondary" onClick={handleExport} title="Export SVG">
              <i className="bi bi-download" /> Export
            </button>
          </div>
        </div>

        {/* KPI chips (Bootstrap Icons) */}
        <div className="network-stats">
          <div className="stat-item"><i className="bi bi-hdd-network stat-icon" /><span className="stat-text">{counts.router} Router{counts.router === 1 ? '' : 's'}</span></div>
          <div className="stat-item"><i className="bi bi-diagram-3 stat-icon" /><span className="stat-text">{counts.switch} Switch{counts.switch === 1 ? '' : 'es'}</span></div>
          <div className="stat-item"><i className="bi bi-wifi stat-icon" /><span className="stat-text">{counts.ap} Access Point{counts.ap === 1 ? '' : 's'}</span></div>
          <div className="stat-item"><i className="bi bi-hdd-stack stat-icon" /><span className="stat-text">{counts.server} Server{counts.server === 1 ? '' : 's'}</span></div>
        </div>

        {/* Canvas */}
        <div className={`topology-canvas ${editing ? 'editing' : ''}`}>
          <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            {laidOut.links.map((conn, idx) => {
              const from = laidOut.nodes.find(n => n.id === conn.from);
              const to = laidOut.nodes.find(n => n.id === conn.to);
              if (!from || !to) return null;
              return (
                <line
                  key={idx}
                  x1={from.x} y1={from.y}
                  x2={to.x}   y2={to.y}
                  stroke="#3b82f6"
                  strokeWidth="0.35"
                  opacity="0.8"
                />
              );
            })}

            {laidOut.nodes.map(n => (
              <g
                key={n.id}
                className={editing ? 'draggable' : ''}
                onPointerDown={startDrag(n.id)}
              >
                <circle cx={n.x} cy={n.y} r="3" fill={getStatusColor(n.status)} stroke="#0b1324" strokeWidth="0.5" />
                <text x={n.x} y={n.y + 7} textAnchor="middle" fontSize="2.5" className="node-label" fill="#94a3b8">
                  {n.name}
                </text>
              </g>
            ))}
          </svg>

          {/* Legend */}
          <div className="topology-legend">
            <h4>Device Status</h4>
            <div className="legend-items">
              <div className="legend-item"><span className="legend-color online"></span><span>Online</span></div>
              <div className="legend-item"><span className="legend-color offline"></span><span>Offline</span></div>
              <div className="legend-item"><span className="legend-color warning"></span><span>Warning</span></div>
            </div>
          </div>
        </div>

        {/* Device List */}
        <div className="device-summary">
          <h3>Network Devices</h3>
          {baseNodes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 12 }}>
              No devices yet. Add your first device to see it here.
            </div>
          ) : (
            <div className="device-grid">
              {baseNodes.map(n => (
                <div key={n.id} className="device-card">
                  <div className="device-icon">
                    {n.type === 'router' && <i className="bi bi-hdd-network" />}
                    {n.type === 'switch' && <i className="bi bi-diagram-3" />}
                    {n.type === 'ap' && <i className="bi bi-wifi" />}
                    {n.type === 'server' && <i className="bi bi-hdd-stack" />}
                    {n.type === 'unknown' && <i className="bi bi-cpu" />}
                  </div>
                  <div className="device-info">
                    <h4>{n.name}</h4>
                    <p className="device-type">{(n.type || 'unknown').toUpperCase()}</p>
                    <span className={`device-status ${n.status}`}>{(n.status || 'unknown').toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
