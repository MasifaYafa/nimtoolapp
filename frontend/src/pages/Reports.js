// frontend/src/pages/Reports.js
import React, { useEffect, useMemo, useState } from 'react';
import { api, tokenManager } from '../services/api';
import './Reports.css';

/**
 * >>> PLACE YOUR IMAGE HERE <<<
 *    frontend/src/assets/reports-bg.jpg
 *
 * If you rename or move it, update the import below accordingly.
 * (You can also reuse dashboard-bg.jpg if you prefer.)
 */
import reportsBg from '../assets/reports-bg.jpg';

// Background image style (lets Webpack/Vite bundle the asset)
const BG_STYLE = {
  backgroundImage: `url(${reportsBg})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
};

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

const Reports = () => {
  const [reportType, setReportType] = useState('uptime');
  const [dateRange, setDateRange] = useState('7days');
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [error, setError] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [reports, setReports] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');

  // ---------- utils ----------
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    switch (dateRange) {
      case '1day':  start.setDate(end.getDate() - 1);  break;
      case '7days': start.setDate(end.getDate() - 7);  break;
      case '30days': start.setDate(end.getDate() - 30); break;
      case '90days': start.setDate(end.getDate() - 90); break;
      default: start.setDate(end.getDate() - 7);
    }
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const filenameFromHeaders = (resp, fallback) => {
    const cd = resp.headers.get('Content-Disposition') || resp.headers.get('content-disposition');
    if (!cd) return fallback;
    const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1].replace(/["']/g, '')); }
      catch { /* ignore */ }
      return m[1].replace(/["']/g, '');
    }
    return fallback;
  };

  const downloadById = async (id, name, format = 'pdf') => {
    const token = tokenManager.getAccessToken();
    const resp = await fetch(`${API_BASE_URL}/reports/reports/${id}/export/`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Download failed (HTTP ${resp.status}) ${text || ''}`);
    }
    const blob = await resp.blob();
    const suggested = filenameFromHeaders(resp, `${name || 'report'}.${format}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggested;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Polling until the backend says "completed"
  const pollUntilComplete = async (id, { intervalMs = 1000, timeoutMs = 30000 } = {}) => {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await api.request(`/reports/reports/${id}/`);
      if (res?.status === 'completed') return res;
      if (res?.status === 'failed') throw new Error(res?.error_message || 'Report generation failed');
      if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for the report to complete');
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };

  const loadRecentReports = async () => {
    try {
      const res = await api.request('/reports/reports/?limit=50');
      setReports(res?.results || res || []);
    } catch (e) {
      console.error('Error loading recent reports:', e);
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const tRes = await api.request('/reports/templates/');
      const t = tRes?.results || tRes || [];
      setTemplates(t);
      if (t.length) setReportType(t[0].category);
      await loadRecentReports();
    } catch (e) {
      console.error('Error loading initial data:', e);
      setError(`Failed to load report data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInitialData(); }, []);

  // ---------- actions ----------
  const handleGenerateReport = async () => {
    if (generatingReport) return;
    setGeneratingReport(true);
    setError(null);

    try {
      const selectedTemplate = templates.find(t => t.category === reportType);
      if (!selectedTemplate) throw new Error('Selected report template not found');

      const { start, end } = getDateRange();
      const payload = {
        template_id: selectedTemplate.id,
        name: `${selectedTemplate.name} - ${new Date().toLocaleDateString()}`,
        description: `Generated ${selectedTemplate.name} report for ${dateRange}`,
        format: 'pdf',
        date_range_start: start,
        date_range_end: end,
        include_all_devices: true,
        filters: {},
        parameters: {},
      };

      const created = await api.request('/reports/reports/generate/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!created?.id) throw new Error('Generation failed to return a report id');

      const final = await pollUntilComplete(created.id);
      await downloadById(final.id, final.name, final.format || 'pdf');
      await loadRecentReports();
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.message || 'Failed to generate report');
      alert(`Error generating report: ${err.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportReport = async (format) => {
    if (generatingReport) return;

    const selectedTemplate = templates.find(t => t.category === reportType);
    if (!selectedTemplate) {
      alert('Please select a report type first');
      return;
    }

    setGeneratingReport(true);
    try {
      const { start, end } = getDateRange();
      const payload = {
        template_id: selectedTemplate.id,
        name: `${selectedTemplate.name} - ${format.toUpperCase()} Export`,
        description: `${selectedTemplate.name} report exported as ${format.toUpperCase()}`,
        format,
        date_range_start: start,
        date_range_end: end,
        include_all_devices: true,
        filters: {},
        parameters: {},
      };

      const res = await api.request('/reports/reports/generate/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res?.id) throw new Error('Export failed to return a report id');

      const final = await pollUntilComplete(res.id);
      await downloadById(final.id, final.name, final.format || format);
      await loadRecentReports();
    } catch (err) {
      console.error('Error exporting report:', err);
      alert(`Error exporting report: ${err.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleDownloadReport = async (report) => {
    if (report.status !== 'completed') {
      alert('Report is not completed yet');
      return;
    }
    try {
      await downloadById(report.id, `${report.name}.${report.format}`, report.format);
    } catch (err) {
      console.error('Error downloading report:', err);
      alert(`Error downloading report: ${err.message}`);
    }
  };

  // ---------- helpers ----------
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':  return 'badge-success';
      case 'generating': return 'badge-warning';
      case 'pending':    return 'badge-info';
      case 'failed':     return 'badge-error';
      default:           return 'badge-secondary';
    }
  };

  const filteredReports = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.template_name || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.format || '').toLowerCase().includes(q)
    );
  }, [reports, historyQuery]);

  if (loading) {
    return (
      <div className="reports-container" style={BG_STYLE}>
        <div className="container">
          <div className="loading-message">Loading reports...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container" style={BG_STYLE}>
      <div className="container">

        {/* Header / toolbar */}
        <div className="page-header toolbar">
          <div>
            <h2>Reports &amp; Analytics</h2>
            <p>Generate comprehensive reports for network monitoring and analysis</p>
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-orange" onClick={() => setShowHistory(true)}>History</button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Report Configuration */}
        <div className="report-config">
          <div className="config-section">
            <h3>Report Configuration</h3>
            <div className="config-options">
              <div className="option-group">
                <label>Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="form-select"
                  disabled={generatingReport || templates.length === 0}
                >
                  {templates.length === 0 ? (
                    <option value="">No report templates available</option>
                  ) : (
                    templates.map(t => (
                      <option key={t.id} value={t.category}>{t.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="option-group">
                <label>Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="form-select"
                  disabled={generatingReport}
                >
                  <option value="1day">Last 24 Hours</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="90days">Last 90 Days</option>
                </select>
              </div>
              <div className="option-group">
                <label>&nbsp;</label>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateReport}
                  disabled={generatingReport || !templates.length}
                >
                  {generatingReport ? 'Generating…' : 'Generate Report'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="export-section">
          <div className="export-header">
            <h3>Export Current Report Type</h3>
            <div className="export-options">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleExportReport('pdf')}
                disabled={generatingReport || !templates.length}
              >
                {generatingReport ? 'Generating…' : 'Export PDF'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleExportReport('csv')}
                disabled={generatingReport || !templates.length}
              >
                {generatingReport ? 'Generating…' : 'Export CSV'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleExportReport('excel')}
                disabled={generatingReport || !templates.length}
              >
                {generatingReport ? 'Generating…' : 'Export Excel'}
              </button>
            </div>
          </div>
        </div>

        {/* Available Report Templates */}
        <div className="available-reports">
          <h3>Available Report Types</h3>
          <div className="reports-grid">
            {templates.map(t => (
              <div
                key={t.id}
                className={`report-card ${reportType === t.category ? 'active' : ''}`}
                onClick={() => setReportType(t.category)}
              >
                <h4>{t.name}</h4>
                <p>{t.description}</p>
                <div className="report-metadata">
                  <small>Category: {t.category_display || t.category}</small>
                  <small>Formats: {t.supported_formats ? t.supported_formats.join(', ').toUpperCase() : 'PDF, CSV, EXCEL'}</small>
                </div>
                <div className="report-actions">
                  <button className="btn btn-sm btn-primary" disabled={generatingReport}>Select</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HISTORY OVERLAY */}
        {showHistory && (
          <div className="history-overlay" onClick={() => setShowHistory(false)}>
            <div className="history-panel" onClick={(e) => e.stopPropagation()}>
              <div className="history-head">
                <h3>Report History</h3>
                <div className="history-tools">
                  <input
                    className="history-search"
                    placeholder="Search name, template, status…"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={loadRecentReports}>Refresh</button>
                  <button className="btn btn-orange btn-sm" onClick={() => setShowHistory(false)}>Close</button>
                </div>
              </div>

              <div className="reports-table-container">
                {filteredReports.length === 0 ? (
                  <div className="no-reports">No history matches your search.</div>
                ) : (
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Report Name</th>
                        <th>Template</th>
                        <th>Format</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Generated By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.template_name}</td>
                          <td>{(r.format || '').toUpperCase()}</td>
                          <td>
                            <span className={`badge ${getStatusBadge(r.status)}`}>
                              {r.status_display || r.status}
                            </span>
                          </td>
                          <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                          <td>{r.generated_by_username}</td>
                          <td>
                            {r.status === 'completed' ? (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleDownloadReport(r)}
                              >
                                Download
                              </button>
                            ) : (
                              <span className="text-muted">
                                {r.status === 'generating' ? 'Processing…' :
                                  r.status === 'pending' ? 'Queued' : 'Failed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Reports;
