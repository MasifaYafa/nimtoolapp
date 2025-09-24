// frontend/src/pages/Reports.js
import React, { useEffect, useState } from 'react';
import { api, apiUtils } from '../services/api';
import './Alerts.css'; // reuse the same dark theme styles/cards/buttons

const Reports = () => {
  const [templates, setTemplates] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [params, setParams] = useState({ hours: 24 });

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [tpls, reps] = await Promise.all([
        api.reports.templates.list().catch(() => []),
        api.reports.reports.list().catch(() => []),
      ]);

      setTemplates(Array.isArray(tpls?.results) ? tpls.results : (Array.isArray(tpls) ? tpls : []));
      setReports(Array.isArray(reps?.results) ? reps.results : (Array.isArray(reps) ? reps : []));
      if (!selectedTemplate && (tpls?.results?.[0] || tpls?.[0])) {
        setSelectedTemplate((tpls.results?.[0] || tpls[0]).id);
      }
    } catch (e) {
      setError(apiUtils.handleError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  const generate = async () => {
    if (!selectedTemplate) return;
    try {
      setBusy(true);
      setError('');
      await api.reports.reports.generate({
        template: selectedTemplate,
        parameters: params,
      });
      // refresh list
      await loadData();
    } catch (e) {
      setError(apiUtils.handleError(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (id) => {
    try {
      setBusy(true);
      const blob = await api.reports.reports.download(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiUtils.handleError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="alerts-container">
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading reports…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-container">
      <header className="alerts-header">
        <div className="wrap">
          <div className="header-content">
            <div>
              <h1 className="h1">Reports</h1>
              <p className="muted">Generate and download network reports</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
            </div>
          </div>
        </div>
      </header>

      <main className="alerts-main">
        <div className="wrap">
          {error && (
            <div className="card error-message">
              <span>{error}</span>
              <button className="btn btn-ghost" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}

          {/* Generate panel */}
          <section className="card controls" style={{ marginBottom: 16 }}>
            <div className="row">
              <div className="row">
                <select
                  className="select"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="">Select a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Template ${t.id}`}
                    </option>
                  ))}
                </select>

                {/* simple parameter example */}
                <input
                  className="input"
                  type="number"
                  min={1}
                  placeholder="Hours (e.g., 24)"
                  value={params.hours}
                  onChange={(e) => setParams(p => ({ ...p, hours: Number(e.target.value || 24) }))}
                />
              </div>

              <div className="row">
                <button className="btn btn-primary" onClick={generate} disabled={busy || !selectedTemplate}>
                  {busy ? 'Working…' : 'Generate Report'}
                </button>
              </div>
            </div>
          </section>

          {/* Recent reports grid */}
          <section className="card">
            <div className="panel__title">Recent Reports</div>
            {reports.length ? (
              <div className="recent-grid">
                {reports.slice(0, 24).map(r => (
                  <div key={r.id} className="recent-card">
                    <div className="recent-top">
                      <span className="sev sev-info">REPORT</span>
                      <span className="muted right">{r.template_name || r.template || 'Template'}</span>
                    </div>
                    <div className="recent-title">
                      {r.name || r.title || `Report ${r.id}`}
                    </div>
                    <div className="recent-desc muted">
                      Generated {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                    </div>
                    <div className="row">
                      <button className="btn btn-primary btn-sm" onClick={() => download(r.id)} disabled={busy}>
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 12 }}>No reports yet. Generate one above.</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Reports;
