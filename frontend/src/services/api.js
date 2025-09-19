// frontend/src/services/api.js
// Fixed API service with correct backend URL routing + safe coord PATCH helpers + troubleshoot integration + AppSettings

// Backend API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

console.log('API Base URL:', API_BASE_URL);

// Enhanced token manager
const tokenManager = {
    setTokens: (accessToken, refreshToken) => {
        try {
            console.log('🔐 Storing tokens...');
            console.log('Access token length:', accessToken ? accessToken.length : 'null');
            console.log('Refresh token length:', refreshToken ? refreshToken.length : 'null');

            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('tokenTimestamp', Date.now().toString());

            console.log('✅ Tokens stored successfully');
            console.log('Stored access token:', localStorage.getItem('accessToken') ? 'Present' : 'Missing');
            console.log('Stored refresh token:', localStorage.getItem('refreshToken') ? 'Present' : 'Missing');
        } catch (error) {
            console.error('❌ Failed to store tokens:', error);
        }
    },

    getAccessToken: () => {
        try {
            const token = localStorage.getItem('accessToken');
            if (token) {
                console.log('📋 Retrieved access token');
                return token;
            } else {
                console.warn('⚠️ No access token found');
                return null;
            }
        } catch (error) {
            console.error('❌ Error getting access token:', error);
            return null;
        }
    },

    getRefreshToken: () => {
        try {
            return localStorage.getItem('refreshToken');
        } catch (error) {
            console.error('❌ Error getting refresh token:', error);
            return null;
        }
    },

    clearTokens: () => {
        try {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('tokenTimestamp');
            console.log('🗑️ Tokens cleared successfully');
        } catch (error) {
            console.error('❌ Error clearing tokens:', error);
        }
    },

    isLoggedIn: () => {
        const accessToken = tokenManager.getAccessToken();
        const refreshToken = tokenManager.getRefreshToken();
        const isLoggedIn = !!(accessToken && refreshToken);

        console.log('🔍 Checking login status:');
        console.log('- Access token:', accessToken ? 'Present' : 'Missing');
        console.log('- Refresh token:', refreshToken ? 'Present' : 'Missing');
        console.log('- Is logged in:', isLoggedIn);

        return isLoggedIn;
    },

    isTokenExpired: () => {
        const token = tokenManager.getAccessToken();
        if (!token) return true;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = payload.exp - now;

            // Consider expired if less than 2 minutes remaining
            const isExpired = timeUntilExpiry < 120;

            if (isExpired) {
                console.log(`⏰ Token expires in ${timeUntilExpiry} seconds`);
            }

            return isExpired;
        } catch (error) {
            console.error('❌ Error checking token expiration:', error);
            return true;
        }
    },
};

// Helper function to get auth headers
const getHeaders = (includeAuth = true) => {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    if (includeAuth) {
        const token = tokenManager.getAccessToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log('🔑 Adding Authorization header');
        }
    }

    return headers;
};

// Token refresh function
const refreshAccessToken = async () => {
    const refreshToken = tokenManager.getRefreshToken();

    if (!refreshToken) {
        console.error('❌ No refresh token available for refresh');
        tokenManager.clearTokens();
        return null;
    }

    try {
        console.log('🔄 Attempting to refresh token...');

        const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!response.ok) {
            console.error(`❌ Token refresh failed with status: ${response.status}`);

            if (response.status === 401 || response.status === 403) {
                console.log('🚪 Refresh token invalid, clearing tokens...');
                tokenManager.clearTokens();
                return null;
            }

            return null;
        }

        const data = await response.json();

        if (data.access) {
            tokenManager.setTokens(data.access, data.refresh || refreshToken);
            console.log('✅ Token refreshed successfully');
            return data.access;
        } else {
            console.error('❌ No access token in refresh response');
            return null;
        }

    } catch (error) {
        console.error('❌ Token refresh failed:', error);
        tokenManager.clearTokens();
        return null;
    }
};

// === helpers for coordinates (keep digits within DecimalField limits) ===
const clamp = (n, min, max) => Math.min(Math.max(Number(n), min), max);
// Latitude typical: max_digits=10, decimal_places=8  →  keep ≤ 8 dp and ≤ 90
const fmtLat = (v) => Number.isFinite(Number(v)) ? parseFloat(clamp(v, -90, 90).toFixed(8)) : null;
// Longitude typical: max_digits=11, decimal_places=8 →  keep ≤ 8 dp and ≤ 180
const fmtLon = (v) => Number.isFinite(Number(v)) ? parseFloat(clamp(v, -180, 180).toFixed(8)) : null;

// Generic API request function
const apiRequest = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;

    const makeRequest = async (isRetry = false) => {
        if (options.includeAuth !== false) {
            const currentToken = tokenManager.getAccessToken();
            console.log('🔍 Checking token before request:', currentToken ? 'Present' : 'Missing');

            if (!currentToken) {
                console.error('❌ No authentication token available');
                throw new Error('No authentication token available. Please login.');
            }
        }

        const config = {
            credentials: 'include',
            headers: getHeaders(options.includeAuth !== false),
            ...options,
        };

        console.log(`📡 Making API request to: ${url}`);
        console.log(`📡 Include auth: ${options.includeAuth !== false}`);

        try {
            const response = await fetch(url, config);
            console.log(`📡 Response status: ${response.status}`);

            // Handle 401 - Unauthorized (only try refresh once)
            if (response.status === 401 && !isRetry && options.includeAuth !== false) {
                console.log('🔄 Got 401, attempting token refresh...');

                const newToken = await refreshAccessToken();

                if (newToken) {
                    console.log('✅ Token refreshed, retrying request...');
                    return makeRequest(true);
                } else {
                    console.error('❌ Token refresh failed, authentication required');
                    throw new Error('Your session has expired. Please login again.');
                }
            }

            if (response.status === 403) {
                throw new Error('You do not have permission to perform this action.');
            }

            if (response.status === 204) {
                return null;
            }

            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                console.error('❌ API Error:', {
                    status: response.status,
                    url: url,
                    data: data
                });

                // Handle specific error messages from backend
                if (data && typeof data === 'object') {
                    if (data.detail) {
                        throw new Error(data.detail);
                    }
                    if (data.message) {
                        throw new Error(data.message);
                    }
                    if (data.non_field_errors) {
                        throw new Error(data.non_field_errors.join(', '));
                    }
                    const fieldErrors = Object.keys(data).filter(key => Array.isArray(data[key]));
                    if (fieldErrors.length > 0) {
                        const errorMessages = fieldErrors.map(field => `${field}: ${data[field].join(', ')}`);
                        throw new Error(errorMessages.join('; '));
                    }
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log('✅ API Success');
            return data;

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error: Unable to connect to server. Please check your connection.');
            }
            throw error;
        }
    };

    return makeRequest();
};

// ApiService object (for compatibility with existing code)
const ApiService = {
    login: async (username, password) => {
        console.log('🔐 Attempting login for:', username);

        const response = await apiRequest('/auth/login/', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
            includeAuth: false,
        });

        console.log('🔐 Login response:', response);

        // Handle different response formats
        let accessToken, refreshToken;

        if (response && response.tokens) {
            accessToken = response.tokens.access;
            refreshToken = response.tokens.refresh;
        } else if (response && response.access) {
            accessToken = response.access;
            refreshToken = response.refresh;
        }

        if (accessToken && refreshToken) {
            console.log('🔐 Login successful, storing tokens...');
            tokenManager.setTokens(accessToken, refreshToken);

            setTimeout(() => {
                console.log('🔍 Verifying stored tokens...');
                console.log('Access token stored:', !!tokenManager.getAccessToken());
                console.log('Refresh token stored:', !!tokenManager.getRefreshToken());
                console.log('Is logged in:', tokenManager.isLoggedIn());
            }, 100);
        } else {
            console.error('❌ Login failed: No tokens found in response');
            console.error('Response structure:', response);
        }

        return response;
    },

    logout: async () => {
        console.log('🚪 Logging out...');
        try {
            await apiRequest('/auth/logout/', {
                method: 'POST',
            });
        } catch (error) {
            console.warn('⚠️ Logout API call failed:', error);
        } finally {
            tokenManager.clearTokens();
        }
    },

    // FIXED: Use correct router-based URLs
    getDevices: () => {
        console.log('📱 Fetching devices...');
        return apiRequest('/devices/');  // Correct: maps to /api/v1/devices/
    },

    createDevice: (deviceData) => {
        console.log('📱 Creating device:', deviceData);
        return apiRequest('/devices/', {
            method: 'POST',
            body: JSON.stringify(deviceData),
        });
    },

    updateDevice: (id, deviceData) => {
        console.log('📱 Updating device:', id);
        return apiRequest(`/devices/${id}/`, {
            method: 'PUT',
            body: JSON.stringify(deviceData),
        });
    },

    deleteDevice: (id) => {
        console.log('📱 Deleting device:', id);
        return apiRequest(`/devices/${id}/`, {
            method: 'DELETE',
        });
    },

    // ---- NEW: PATCH only coordinates with rounding/clamping ----
    updateDeviceCoords: (id, { latitude, longitude }) => {
        const payload = {};
        if (latitude != null)  payload.latitude  = fmtLat(latitude);
        if (longitude != null) payload.longitude = fmtLon(longitude);
        return apiRequest(`/devices/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    },

    pingDevice: (id) => {
        console.log('📡 Pinging device:', id);
        return apiRequest(`/devices/${id}/ping/`, {
            method: 'POST',
        });
    },

    pingAllDevices: () => {
        console.log('📡 Pinging all devices...');
        return apiRequest('/devices/ping_all/', {
            method: 'POST',
        });
    },

    // FIXED: Correct URL for device statistics
    getDeviceStatistics: () => {
        console.log('📊 Fetching device statistics...');
        return apiRequest('/devices/statistics/');  // Correct: maps to /api/v1/devices/statistics/
    },

    testConnectivity: () => {
        console.log('🌐 Testing connectivity...');
        return apiRequest('/devices/test_connectivity/', {
            method: 'POST',
        });
    },

    getDeviceTypes: () => {
        console.log('📋 Fetching device types...');
        return apiRequest('/types/');  // Correct: maps to /api/v1/types/
    },

    // NEW: Alert statistics method
    getAlertStatistics: () => {
        console.log('🚨 Fetching alert statistics...');
        return apiRequest('/alerts/alerts/statistics/');
    },
};

// Modern API structure (for compatibility with { api } imports)
const api = {
    request: (endpoint, options = {}) => {
        return apiRequest(endpoint, options);
    },

    auth: {
        login: async (credentials) => {
            console.log('🔐 api.auth.login called');

            const response = await apiRequest('/auth/login/', {
                method: 'POST',
                body: JSON.stringify(credentials),
                includeAuth: false,
            });

            if (response && response.tokens) {
                tokenManager.setTokens(response.tokens.access, response.tokens.refresh);
            } else if (response && response.access) {
                tokenManager.setTokens(response.access, response.refresh);
            }

            return response;
        },

        logout: () => {
            console.log('🚪 api.auth.logout called');
            return apiRequest('/auth/logout/', {
                method: 'POST',
            });
        },

        profile: () => apiRequest('/auth/profile/'),
    },

    devices: {
        list: () => apiRequest('/devices/'),
        get: (id) => apiRequest(`/devices/${id}/`),
        create: (deviceData) => apiRequest('/devices/', {
            method: 'POST',
            body: JSON.stringify(deviceData),
        }),
        update: (id, deviceData) => apiRequest(`/devices/${id}/`, {
            method: 'PUT',
            body: JSON.stringify(deviceData),
        }),
        delete: (id) => apiRequest(`/devices/${id}/`, {
            method: 'DELETE',
        }),
        // FIXED: Correct statistics endpoint
        statistics: () => apiRequest('/devices/statistics/'),

        // ---- NEW: update only coords (rounded & clamped) ----
        updateCoords: (id, { latitude, longitude }) => {
            const payload = {};
            if (latitude != null)  payload.latitude  = fmtLat(latitude);
            if (longitude != null) payload.longitude = fmtLon(longitude);
            return apiRequest(`/devices/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
        },

        ping: async (id) => {
            console.log('📡 Pinging single device:', id);
            return apiRequest(`/devices/${id}/ping/`, {
                method: 'POST',
            });
        },

        pingAll: async () => {
            console.log('📡 Pinging all devices...');
            return apiRequest('/devices/ping_all/', {
                method: 'POST',
            });
        },

        testConnectivity: async () => {
            console.log('🌐 Testing network connectivity...');
            return apiRequest('/devices/test_connectivity/', {
                method: 'POST',
            });
        },

        getMetrics: (id, options = {}) => {
            const params = new URLSearchParams();
            if (options.hours) params.append('hours', options.hours);
            if (options.type) params.append('type', options.type);

            const query = params.toString() ? `?${params.toString()}` : '';
            return apiRequest(`/devices/${id}/metrics/${query}`);
        },

        backupConfig: (id) => apiRequest(`/devices/${id}/backup_config/`, {
            method: 'POST',
        }),

        getConfigurations: (id) => apiRequest(`/devices/${id}/configurations/`),
    },

    // FIXED: Correct alert API methods with proper URL structure
    alerts: {
        list: (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiRequest(`/alerts/alerts/${queryString ? `?${queryString}` : ''}`);
        },

        get: (id) => apiRequest(`/alerts/alerts/${id}/`),

        create: (alertData) => apiRequest('/alerts/alerts/', {
            method: 'POST',
            body: JSON.stringify(alertData),
        }),

        update: (id, alertData) => apiRequest(`/alerts/alerts/${id}/`, {
            method: 'PUT',
            body: JSON.stringify(alertData),
        }),

        delete: (id) => apiRequest(`/alerts/alerts/${id}/`, {
            method: 'DELETE',
        }),

        // FIXED: Correct statistics URL
        statistics: () => apiRequest('/alerts/alerts/statistics/'),

        acknowledge: (id, note = '') => apiRequest(`/alerts/alerts/${id}/acknowledge/`, {
            method: 'POST',
            body: JSON.stringify({ note }),
        }),

        resolve: (id, note = '') => apiRequest(`/alerts/alerts/${id}/resolve/`, {
            method: 'POST',
            body: JSON.stringify({ note }),
        }),

        acknowledgeAll: (options = {}) => apiRequest('/alerts/alerts/acknowledge_all/', {
            method: 'POST',
            body: JSON.stringify(options),
        }),

        bulkAcknowledge: (alertIds, note = '') => apiRequest('/alerts/alerts/bulk_acknowledge/', {
            method: 'POST',
            body: JSON.stringify({ alert_ids: alertIds, note }),
        }),

        bulkResolve: (alertIds, note = '') => apiRequest('/alerts/alerts/bulk_resolve/', {
            method: 'POST',
            body: JSON.stringify({ alert_ids: alertIds, note }),
        }),

        recent: (hours = 24, limit = 10) => apiRequest(`/alerts/alerts/recent/?hours=${hours}&limit=${limit}`),

        active: (severity = null) => apiRequest(`/alerts/alerts/active/${severity ? `?severity=${severity}` : ''}`),

        critical: () => apiRequest('/alerts/alerts/critical/'),

        createTestAlert: () => apiRequest('/alerts/alerts/create_test_alert/', {
            method: 'POST',
        }),
    },

    // Alert rules API methods
    alertRules: {
        list: () => apiRequest('/alerts/rules/'),
        get: (id) => apiRequest(`/alerts/rules/${id}/`),
        create: (ruleData) => apiRequest('/alerts/rules/', {
            method: 'POST',
            body: JSON.stringify(ruleData),
        }),
        update: (id, ruleData) => apiRequest(`/alerts/rules/${id}/`, {
            method: 'PUT',
            body: JSON.stringify(ruleData),
        }),
        delete: (id) => apiRequest(`/alerts/rules/${id}/`, {
            method: 'DELETE',
        }),
        toggleActive: (id) => apiRequest(`/alerts/rules/${id}/toggle_active/`, {
            method: 'POST',
        }),
        summary: () => apiRequest('/alerts/rules/summary/'),
    },

    // Alert notifications API methods
    notifications: {
        list: () => apiRequest('/alerts/notifications/'),
        get: (id) => apiRequest(`/alerts/notifications/${id}/`),
        summary: () => apiRequest('/alerts/notifications/summary/'),
        failed: () => apiRequest('/alerts/notifications/failed/'),
    },

    // Reports API methods
    reports: {
        // Report Templates
        templates: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/reports/templates/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/reports/templates/${id}/`),
            create: (templateData) => apiRequest('/reports/templates/', {
                method: 'POST',
                body: JSON.stringify(templateData),
            }),
            update: (id, templateData) => apiRequest(`/reports/templates/${id}/`, {
                method: 'PUT',
                body: JSON.stringify(templateData),
            }),
            delete: (id) => apiRequest(`/reports/templates/${id}/`, {
                method: 'DELETE',
            }),
            categories: () => apiRequest('/reports/templates/categories/'),
        },

        // Reports
        reports: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/reports/reports/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/reports/reports/${id}/`),
            generate: (reportData) => {
                console.log('📊 Generating report:', reportData);
                return apiRequest('/reports/reports/generate/', {
                    method: 'POST',
                    body: JSON.stringify(reportData),
                });
            },
            export: (id) => {
                console.log('📥 Exporting report:', id);
                return apiRequest(`/reports/reports/${id}/export/`, {
                    method: 'POST',
                });
            },
            download: async (id) => {
                console.log('📥 Downloading report:', id);
                // Special handling for file downloads
                const url = `${API_BASE_URL}/reports/reports/${id}/export/`;
                const token = tokenManager.getAccessToken();

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`Download failed: ${response.statusText}`);
                }

                return response.blob();
            },
            statistics: () => {
                console.log('📊 Fetching report statistics...');
                return apiRequest('/reports/reports/statistics/');
            },
        },

        // Report Schedules
        schedules: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/reports/schedules/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/reports/schedules/${id}/`),
            create: (scheduleData) => apiRequest('/reports/schedules/', {
                method: 'POST',
                body: JSON.stringify(scheduleData),
            }),
            update: (id, scheduleData) => apiRequest(`/reports/schedules/${id}/`, {
                method: 'PUT',
                body: JSON.stringify(scheduleData),
            }),
            delete: (id) => apiRequest(`/reports/schedules/${id}/`, {
                method: 'DELETE',
            }),
            runNow: (id) => {
                console.log('▶️ Running schedule now:', id);
                return apiRequest(`/reports/schedules/${id}/run_now/`, {
                    method: 'POST',
                });
            },
        },
    },

    // Troubleshoot API methods - NEW SECTION
    troubleshoot: {
        // Network Tests
        networkTests: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/troubleshoot/network-tests/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/troubleshoot/network-tests/${id}/`),

            ping: (testData) => {
                console.log('🏓 Running ping test:', testData);
                return apiRequest('/troubleshoot/network-tests/ping/', {
                    method: 'POST',
                    body: JSON.stringify(testData),
                });
            },

            traceroute: (testData) => {
                console.log('🗺️ Running traceroute test:', testData);
                return apiRequest('/troubleshoot/network-tests/traceroute/', {
                    method: 'POST',
                    body: JSON.stringify(testData),
                });
            },

            portScan: (testData) => {
                console.log('🔍 Running port scan:', testData);
                return apiRequest('/troubleshoot/network-tests/port_scan/', {
                    method: 'POST',
                    body: JSON.stringify(testData),
                });
            },

            dnsLookup: (testData) => {
                console.log('🌐 Running DNS lookup:', testData);
                return apiRequest('/troubleshoot/network-tests/dns_lookup/', {
                    method: 'POST',
                    body: JSON.stringify(testData),
                });
            },
        },

        // System Health
        systemHealth: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/troubleshoot/system-health/${queryString ? `?${queryString}` : ''}`);
            },

            current: () => {
                console.log('🩺 Getting current system health');
                return apiRequest('/troubleshoot/system-health/current/');
            },

            interfaces: () => {
                console.log('🌐 Getting network interfaces');
                return apiRequest('/troubleshoot/system-health/interfaces/');
            },
        },

        // Diagnostic Tests
        diagnostics: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/troubleshoot/diagnostics/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/troubleshoot/diagnostics/${id}/`),

            connectivity: () => {
                console.log('🌐 Running connectivity test');
                return apiRequest('/troubleshoot/diagnostics/connectivity/', {
                    method: 'POST',
                });
            },

            performance: () => {
                console.log('⚡ Running performance analysis');
                return apiRequest('/troubleshoot/diagnostics/performance/', {
                    method: 'POST',
                });
            },

            speedTest: () => {
                console.log('🚀 Running speed test');
                return apiRequest('/troubleshoot/diagnostics/speed/', {
                    method: 'POST',
                });
            },

            securityScan: () => {
                console.log('🔒 Running security scan');
                return apiRequest('/troubleshoot/diagnostics/security/', {
                    method: 'POST',
                });
            },
        },

        // Common Issues
        issues: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/troubleshoot/issues/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/troubleshoot/issues/${id}/`),
            create: (issueData) => apiRequest('/troubleshoot/issues/', {
                method: 'POST',
                body: JSON.stringify(issueData),
            }),
            update: (id, issueData) => apiRequest(`/troubleshoot/issues/${id}/`, {
                method: 'PUT',
                body: JSON.stringify(issueData),
            }),
            delete: (id) => apiRequest(`/troubleshoot/issues/${id}/`, {
                method: 'DELETE',
            }),
            resolve: (id) => {
                console.log('✅ Resolving issue:', id);
                return apiRequest(`/troubleshoot/issues/${id}/resolve/`, {
                    method: 'POST',
                });
            },
        },

        // System Logs
        logs: {
            list: (params = {}) => {
                const queryString = new URLSearchParams(params).toString();
                return apiRequest(`/troubleshoot/logs/${queryString ? `?${queryString}` : ''}`);
            },
            get: (id) => apiRequest(`/troubleshoot/logs/${id}/`),
            statistics: () => {
                console.log('📊 Getting log statistics');
                return apiRequest('/troubleshoot/logs/statistics/');
            },
        },

        // Overall Statistics
        statistics: () => {
            console.log('📈 Getting troubleshoot statistics');
            return apiRequest('/troubleshoot/statistics/');
        },
    },

    // *** NEW: APP SETTINGS API METHODS ***
    appSettings: {
        // Settings management
        getSettings: () => {
            console.log('⚙️ Fetching app settings');
            return apiRequest('/app_settings/settings/');
        },

        updateSettings: (settingsData) => {
            console.log('⚙️ Updating app settings:', settingsData);
            return apiRequest('/app_settings/settings/1/', {
                method: 'PUT',
                body: JSON.stringify(settingsData),
            });
        },

        testSNMP: () => {
            console.log('🔧 Testing SNMP connection');
            return apiRequest('/app_settings/settings/test_snmp/', {
                method: 'POST',
            });
        },

        // User management
        getUsers: () => {
            console.log('👥 Fetching users');
            return apiRequest('/app_settings/users/');
        },

        createUser: (userData) => {
            console.log('👥 Creating new user:', userData);
            return apiRequest('/app_settings/users/', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
        },

        updateUser: (userId, userData) => {
            console.log('👥 Updating user:', userId);
            return apiRequest(`/app_settings/users/${userId}/`, {
                method: 'PUT',
                body: JSON.stringify(userData),
            });
        },

        deleteUser: (userId) => {
            console.log('👥 Deleting user:', userId);
            return apiRequest(`/app_settings/users/${userId}/`, {
                method: 'DELETE',
            });
        },

        resetPassword: (userId, newPassword) => {
            console.log('🔑 Resetting password for user:', userId);
            return apiRequest(`/app_settings/users/${userId}/reset_password/`, {
                method: 'POST',
                body: JSON.stringify({ new_password: newPassword }),
            });
        },

        // Dashboard stats
        getStats: () => {
            console.log('📊 Fetching dashboard stats');
            return apiRequest('/app_settings/stats/');
        },
    },
};

// Add utility functions for error handling
const apiUtils = {
    handleError: (error) => {
        console.error('API Error:', error);

        // Return user-friendly error message
        if (error.message.includes('Network error')) {
            return 'Unable to connect to server. Please check your internet connection.';
        }

        if (error.message.includes('401')) {
            return 'Authentication failed. Please login again.';
        }

        if (error.message.includes('403')) {
            return 'You do not have permission to perform this action.';
        }

        if (error.message.includes('404')) {
            return 'The requested resource was not found.';
        }

        if (error.message.includes('500')) {
            return 'Server error occurred. Please try again later.';
        }

        // Return the actual error message if it's user-friendly
        return error.message || 'An unexpected error occurred. Please try again.';
    },

    isNetworkError: (error) => {
        return error.message.includes('Network error') || error.message.includes('fetch');
    },

    getAuthHeaders: () => {
        const token = tokenManager.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }
};

// Export both styles for maximum compatibility
export { tokenManager, api, apiUtils };
export default ApiService;