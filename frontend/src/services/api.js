// frontend/src/services/api.js
// Fixed API service with correct backend URL routing, safe coord PATCH helpers,
// troubleshoot + app_settings endpoints, and robust token handling.

// Use same-origin API in production; fall back to localhost in dev
const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (window?.location?.origin?.includes('localhost')
    ? 'http://localhost:8000/api/v1'
    : '/api/v1');

console.log('API Base URL:', API_BASE_URL);

// -----------------------------
// Token Manager
// -----------------------------
const tokenManager = {
  setTokens: (accessToken, refreshToken) => {
    try {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tokenTimestamp', Date.now().toString());
    } catch (err) {
      console.error('Failed to store tokens:', err);
    }
  },

  getAccessToken: () => {
    try {
      return localStorage.getItem('accessToken');
    } catch (err) {
      console.error('Error getting access token:', err);
      return null;
    }
  },

  getRefreshToken: () => {
    try {
      return localStorage.getItem('refreshToken');
    } catch (err) {
      console.error('Error getting refresh token:', err);
      return null;
    }
  },

  clearTokens: () => {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenTimestamp');
    } catch (err) {
      console.error('Error clearing tokens:', err);
    }
  },

  isLoggedIn: () => {
    const a = tokenManager.getAccessToken();
    const r = tokenManager.getRefreshToken();
    return !!(a && r);
  },

  isTokenExpired: () => {
    const token = tokenManager.getAccessToken();
    if (!token) return true;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = payload.exp - now;
      // treat as expired with < 2 minutes remaining
      return timeUntilExpiry < 120;
    } catch {
      return true;
    }
  },
};

// -----------------------------
// Helpers
// -----------------------------
const getHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (includeAuth) {
    const token = tokenManager.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const refreshAccessToken = async () => {
  const refreshToken = tokenManager.getRefreshToken();
  if (!refreshToken) {
    tokenManager.clearTokens();
    return null;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) tokenManager.clearTokens();
      return null;
    }

    const data = await res.json();
    if (data?.access) {
      tokenManager.setTokens(data.access, data.refresh || refreshToken);
      return data.access;
    }
    return null;
  } catch (err) {
    console.error('Token refresh failed:', err);
    tokenManager.clearTokens();
    return null;
  }
};

// numeric helpers for coordinate PATCH
const clamp = (n, min, max) => Math.min(Math.max(Number(n), min), max);
// Latitude typical: max_digits=10, decimal_places=8
const fmtLat = (v) =>
  Number.isFinite(Number(v)) ? parseFloat(clamp(v, -90, 90).toFixed(8)) : null;
// Longitude typical: max_digits=11, decimal_places=8
const fmtLon = (v) =>
  Number.isFinite(Number(v)) ? parseFloat(clamp(v, -180, 180).toFixed(8)) : null;

// -----------------------------
// Core request with auto-refresh
// -----------------------------
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;

  const make = async (isRetry = false) => {
    if (options.includeAuth !== false) {
      const tk = tokenManager.getAccessToken();
      if (!tk) throw new Error('No authentication token available. Please login.');
    }

    const config = {
      credentials: 'include',
      headers: getHeaders(options.includeAuth !== false),
      ...options,
    };

    try {
      const res = await fetch(url, config);

      if (res.status === 401 && !isRetry && options.includeAuth !== false) {
        const newToken = await refreshAccessToken();
        if (newToken) return make(true);
        throw new Error('Your session has expired. Please login again.');
      }

      if (res.status === 403) {
        throw new Error('You do not have permission to perform this action.');
      }

      if (res.status === 204) return null;

      const contentType = res.headers.get('content-type') || '';
      const isJSON = contentType.includes('application/json');
      const data = isJSON ? await res.json() : await res.text();

      if (!res.ok) {
        if (isJSON && data) {
          if (data.detail) throw new Error(data.detail);
          if (data.message) throw new Error(data.message);
          if (data.non_field_errors) throw new Error(data.non_field_errors.join(', '));
          const fieldErrors = Object.keys(data).filter((k) => Array.isArray(data[k]));
          if (fieldErrors.length) {
            const msg = fieldErrors.map((f) => `${f}: ${data[f].join(', ')}`).join('; ');
            throw new Error(msg);
          }
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return data;
    } catch (err) {
      if (err?.name === 'TypeError' && String(err?.message || '').includes('fetch')) {
        throw new Error('Network error: Unable to connect to server.');
      }
      throw err;
    }
  };

  return make();
};

// -----------------------------
// Backward-compatible ApiService
// -----------------------------
const ApiService = {
  login: async (username, password) => {
    const response = await apiRequest('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      includeAuth: false,
    });

    let accessToken, refreshToken;
    if (response?.tokens) {
      accessToken = response.tokens.access;
      refreshToken = response.tokens.refresh;
    } else if (response?.access) {
      accessToken = response.access;
      refreshToken = response.refresh;
    }

    if (accessToken && refreshToken) {
      tokenManager.setTokens(accessToken, refreshToken);
    } else {
      console.error('Login succeeded but tokens missing in response:', response);
    }

    return response;
  },

  logout: async () => {
    try {
      await apiRequest('/auth/logout/', { method: 'POST' });
    } finally {
      tokenManager.clearTokens();
    }
  },

  // Devices
  getDevices: () => apiRequest('/devices/'),
  createDevice: (deviceData) =>
    apiRequest('/devices/', { method: 'POST', body: JSON.stringify(deviceData) }),
  updateDevice: (id, deviceData) =>
    apiRequest(`/devices/${id}/`, { method: 'PUT', body: JSON.stringify(deviceData) }),
  deleteDevice: (id) => apiRequest(`/devices/${id}/`, { method: 'DELETE' }),
  updateDeviceCoords: (id, { latitude, longitude }) => {
    const payload = {};
    if (latitude != null) payload.latitude = fmtLat(latitude);
    if (longitude != null) payload.longitude = fmtLon(longitude);
    return apiRequest(`/devices/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  pingDevice: (id) => apiRequest(`/devices/${id}/ping/`, { method: 'POST' }),
  pingAllDevices: () => apiRequest('/devices/ping_all/', { method: 'POST' }),
  getDeviceStatistics: () => apiRequest('/devices/statistics/'),
  testConnectivity: () => apiRequest('/devices/test_connectivity/', { method: 'POST' }),
  getDeviceTypes: () => apiRequest('/types/'),

  // Alerts
  getAlertStatistics: () => apiRequest('/alerts/alerts/statistics/'),
};

// -----------------------------
// Modern API object
// -----------------------------
const api = {
  request: (endpoint, options = {}) => apiRequest(endpoint, options),

  auth: {
    login: async (credentials) => {
      const res = await apiRequest('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(credentials),
        includeAuth: false,
      });
      if (res?.tokens) {
        tokenManager.setTokens(res.tokens.access, res.tokens.refresh);
      } else if (res?.access) {
        tokenManager.setTokens(res.access, res.refresh);
      }
      return res;
    },
    logout: () => apiRequest('/auth/logout/', { method: 'POST' }),
    profile: () => apiRequest('/auth/profile/'),
  },

  devices: {
    list: () => apiRequest('/devices/'),
    get: (id) => apiRequest(`/devices/${id}/`),
    create: (deviceData) =>
      apiRequest('/devices/', { method: 'POST', body: JSON.stringify(deviceData) }),
    update: (id, deviceData) =>
      apiRequest(`/devices/${id}/`, { method: 'PUT', body: JSON.stringify(deviceData) }),
    delete: (id) => apiRequest(`/devices/${id}/`, { method: 'DELETE' }),
    statistics: () => apiRequest('/devices/statistics/'),
    updateCoords: (id, { latitude, longitude }) => {
      const payload = {};
      if (latitude != null) payload.latitude = fmtLat(latitude);
      if (longitude != null) payload.longitude = fmtLon(longitude);
      return apiRequest(`/devices/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    ping: (id) => apiRequest(`/devices/${id}/ping/`, { method: 'POST' }),
    pingAll: () => apiRequest('/devices/ping_all/', { method: 'POST' }),
    testConnectivity: () => apiRequest('/devices/test_connectivity/', { method: 'POST' }),
    getMetrics: (id, options = {}) => {
      const params = new URLSearchParams();
      if (options.hours) params.append('hours', options.hours);
      if (options.type) params.append('type', options.type);
      const q = params.toString() ? `?${params.toString()}` : '';
      return apiRequest(`/devices/${id}/metrics/${q}`);
    },
    backupConfig: (id) => apiRequest(`/devices/${id}/backup_config/`, { method: 'POST' }),
    getConfigurations: (id) => apiRequest(`/devices/${id}/configurations/`),
  },

  alerts: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/alerts/alerts/${qs ? `?${qs}` : ''}`);
    },
    get: (id) => apiRequest(`/alerts/alerts/${id}/`),
    create: (data) => apiRequest('/alerts/alerts/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      apiRequest(`/alerts/alerts/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/alerts/alerts/${id}/`, { method: 'DELETE' }),
    statistics: () => apiRequest('/alerts/alerts/statistics/'),
    acknowledge: (id, note = '') =>
      apiRequest(`/alerts/alerts/${id}/acknowledge/`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    resolve: (id, note = '') =>
      apiRequest(`/alerts/alerts/${id}/resolve/`, { method: 'POST', body: JSON.stringify({ note }) }),
    acknowledgeAll: (options = {}) =>
      apiRequest('/alerts/alerts/acknowledge_all/', { method: 'POST', body: JSON.stringify(options) }),
    bulkAcknowledge: (ids, note = '') =>
      apiRequest('/alerts/alerts/bulk_acknowledge/', {
        method: 'POST',
        body: JSON.stringify({ alert_ids: ids, note }),
      }),
    bulkResolve: (ids, note = '') =>
      apiRequest('/alerts/alerts/bulk_resolve/', {
        method: 'POST',
        body: JSON.stringify({ alert_ids: ids, note }),
      }),
    recent: (hours = 24, limit = 10) =>
      apiRequest(`/alerts/alerts/recent/?hours=${hours}&limit=${limit}`),
    active: (severity = null) =>
      apiRequest(`/alerts/alerts/active/${severity ? `?severity=${severity}` : ''}`),
    critical: () => apiRequest('/alerts/alerts/critical/'),
    createTestAlert: () => apiRequest('/alerts/alerts/create_test_alert/', { method: 'POST' }),
  },

  alertRules: {
    list: () => apiRequest('/alerts/rules/'),
    get: (id) => apiRequest(`/alerts/rules/${id}/`),
    create: (data) => apiRequest('/alerts/rules/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      apiRequest(`/alerts/rules/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/alerts/rules/${id}/`, { method: 'DELETE' }),
    toggleActive: (id) => apiRequest(`/alerts/rules/${id}/toggle_active/`, { method: 'POST' }),
    summary: () => apiRequest('/alerts/rules/summary/'),
  },

  notifications: {
    list: () => apiRequest('/alerts/notifications/'),
    get: (id) => apiRequest(`/alerts/notifications/${id}/`),
    summary: () => apiRequest('/alerts/notifications/summary/'),
    failed: () => apiRequest('/alerts/notifications/failed/'),
  },

  reports: {
    templates: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/reports/templates/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/reports/templates/${id}/`),
      create: (data) =>
        apiRequest('/reports/templates/', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) =>
        apiRequest(`/reports/templates/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => apiRequest(`/reports/templates/${id}/`, { method: 'DELETE' }),
      categories: () => apiRequest('/reports/templates/categories/'),
    },

    reports: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/reports/reports/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/reports/reports/${id}/`),
      generate: (data) =>
        apiRequest('/reports/reports/generate/', { method: 'POST', body: JSON.stringify(data) }),
      export: (id) => apiRequest(`/reports/reports/${id}/export/`, { method: 'POST' }),
      download: async (id) => {
        const url = `${API_BASE_URL}/reports/reports/${id}/export/`;
        const token = tokenManager.getAccessToken();
        const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
        return res.blob();
      },
      statistics: () => apiRequest('/reports/reports/statistics/'),
    },

    schedules: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/reports/schedules/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/reports/schedules/${id}/`),
      create: (data) =>
        apiRequest('/reports/schedules/', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) =>
        apiRequest(`/reports/schedules/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => apiRequest(`/reports/schedules/${id}/`, { method: 'DELETE' }),
      runNow: (id) => apiRequest(`/reports/schedules/${id}/run_now/`, { method: 'POST' }),
    },
  },

  troubleshoot: {
    networkTests: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/troubleshoot/network-tests/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/troubleshoot/network-tests/${id}/`),
      ping: (data) => apiRequest('/troubleshoot/network-tests/ping/', { method: 'POST', body: JSON.stringify(data) }),
      traceroute: (data) =>
        apiRequest('/troubleshoot/network-tests/traceroute/', { method: 'POST', body: JSON.stringify(data) }),
      portScan: (data) =>
        apiRequest('/troubleshoot/network-tests/port_scan/', { method: 'POST', body: JSON.stringify(data) }),
      dnsLookup: (data) =>
        apiRequest('/troubleshoot/network-tests/dns_lookup/', { method: 'POST', body: JSON.stringify(data) }),
    },

    systemHealth: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/troubleshoot/system-health/${qs ? `?${qs}` : ''}`);
      },
      current: () => apiRequest('/troubleshoot/system-health/current/'),
      interfaces: () => apiRequest('/troubleshoot/system-health/interfaces/'),
    },

    diagnostics: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/troubleshoot/diagnostics/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/troubleshoot/diagnostics/${id}/`),
      connectivity: () => apiRequest('/troubleshoot/diagnostics/connectivity/', { method: 'POST' }),
      performance: () => apiRequest('/troubleshoot/diagnostics/performance/', { method: 'POST' }),
      speedTest: () => apiRequest('/troubleshoot/diagnostics/speed/', { method: 'POST' }),
      securityScan: () => apiRequest('/troubleshoot/diagnostics/security/', { method: 'POST' }),
    },

    issues: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/troubleshoot/issues/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/troubleshoot/issues/${id}/`),
      create: (data) => apiRequest('/troubleshoot/issues/', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) =>
        apiRequest(`/troubleshoot/issues/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => apiRequest(`/troubleshoot/issues/${id}/`, { method: 'DELETE' }),
      resolve: (id) => apiRequest(`/troubleshoot/issues/${id}/resolve/`, { method: 'POST' }),
    },

    logs: {
      list: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiRequest(`/troubleshoot/logs/${qs ? `?${qs}` : ''}`);
      },
      get: (id) => apiRequest(`/troubleshoot/logs/${id}/`),
      statistics: () => apiRequest('/troubleshoot/logs/statistics/'),
    },

    statistics: () => apiRequest('/troubleshoot/statistics/'),
  },

  appSettings: {
    getSettings: () => apiRequest('/app_settings/settings/'),
    updateSettings: (settingsData) =>
      apiRequest('/app_settings/settings/1/', { method: 'PUT', body: JSON.stringify(settingsData) }),
    testSNMP: () => apiRequest('/app_settings/settings/test_snmp/', { method: 'POST' }),

    getUsers: () => apiRequest('/app_settings/users/'),
    createUser: (userData) =>
      apiRequest('/app_settings/users/', { method: 'POST', body: JSON.stringify(userData) }),
    updateUser: (userId, userData) =>
      apiRequest(`/app_settings/users/${userId}/`, { method: 'PUT', body: JSON.stringify(userData) }),
    deleteUser: (userId) => apiRequest(`/app_settings/users/${userId}/`, { method: 'DELETE' }),
    resetPassword: (userId, newPassword) =>
      apiRequest(`/app_settings/users/${userId}/reset_password/`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      }),

    getStats: () => apiRequest('/app_settings/stats/'),
  },
};

// -----------------------------
// Utility helpers for UI
// -----------------------------
const apiUtils = {
  handleError: (error) => {
    const msg = String(error?.message || '');
    if (msg.includes('Network error')) return 'Unable to connect to server. Please check your network.';
    if (msg.includes('401')) return 'Authentication failed. Please login again.';
    if (msg.includes('403')) return 'You do not have permission to perform this action.';
    if (msg.includes('404')) return 'The requested resource was not found.';
    if (msg.includes('500')) return 'Server error occurred. Please try again later.';
    return msg || 'An unexpected error occurred. Please try again.';
  },
  isNetworkError: (error) => {
    const msg = String(error?.message || '');
    return msg.includes('Network error') || msg.includes('fetch');
  },
  getAuthHeaders: () => {
    const token = tokenManager.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// Exports
export { tokenManager, api, apiUtils };
export default ApiService;
