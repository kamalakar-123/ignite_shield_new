import axios from 'axios';
import type {
  SensorData,
  PredictionResponse,
  ReadingResponse,
  DashboardStats,
  AlertResponse,
  AnalyticsResponse,
  RiskMapPoint,
  FireSpreadResult,
  UserLogin,
  UserRegister,
  TokenResponse,
  UserResponse,
} from '../types';

// ============================================================
// Axios Instance
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ignite_shield_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect if already on login page
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('ignite_shield_token');
        localStorage.removeItem('ignite_shield_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================
// Auth API
// ============================================================

export const authApi = {
  login: async (data: UserLogin): Promise<TokenResponse> => {
    const res = await api.post('/auth/login', data);
    return res.data;
  },

  register: async (data: UserRegister): Promise<UserResponse> => {
    const res = await api.post('/auth/register', data);
    return res.data;
  },

  getMe: async (token: string): Promise<UserResponse> => {
    const res = await api.get(`/auth/me?token=${token}`);
    return res.data;
  },
};

// ============================================================
// Prediction API
// ============================================================

export const predictionApi = {
  predict: async (data: SensorData): Promise<PredictionResponse> => {
    const res = await api.post('/predict/risk', data);
    return res.data;
  },

  getLatest: async (): Promise<ReadingResponse> => {
    const res = await api.get('/predict/latest');
    return res.data;
  },

  getSpread: async (data: SensorData): Promise<FireSpreadResult> => {
    const res = await api.post('/predict/spread', data);
    return res.data;
  },
};

// ============================================================
// Sensor Readings API
// ============================================================

export const sensorApi = {
  getAll: async (limit: number = 50): Promise<ReadingResponse[]> => {
    const res = await api.get(`/sensors?limit=${limit}`);
    return res.data;
  },

  getLatest: async (): Promise<ReadingResponse> => {
    const res = await api.get('/sensors/latest');
    return res.data;
  },

  getById: async (id: number): Promise<ReadingResponse> => {
    const res = await api.get(`/sensors/${id}`);
    return res.data;
  },
};

// ============================================================
// Dashboard API
// ============================================================

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const res = await api.get('/dashboard/stats');
    return res.data;
  },
};

// ============================================================
// Alerts API
// ============================================================

export const alertsApi = {
  getAll: async (riskLevel?: string, limit: number = 100): Promise<AlertResponse[]> => {
    const params = new URLSearchParams();
    if (riskLevel && riskLevel !== 'All') params.append('risk_level', riskLevel);
    params.append('limit', limit.toString());
    const res = await api.get(`/alerts?${params.toString()}`);
    return res.data;
  },

  acknowledge: async (alertId: number): Promise<void> => {
    await api.put(`/alerts/${alertId}/acknowledge`);
  },
};

// ============================================================
// Analytics API
// ============================================================

export const analyticsApi = {
  get: async (hours: number = 24, limit: number = 200): Promise<AnalyticsResponse> => {
    const res = await api.get(`/analytics?hours=${hours}&limit=${limit}`);
    return res.data;
  },
};

// ============================================================
// Risk Map API
// ============================================================

export const riskMapApi = {
  get: async (): Promise<RiskMapPoint[]> => {
    const res = await api.get('/risk-map');
    return res.data;
  },
};

// ============================================================
// Export API
// ============================================================

export const exportApi = {
  downloadCsv: async (dataType: string = 'sensor', limit: number = 1000): Promise<Blob> => {
    const res = await api.get(`/export/csv?data_type=${dataType}&limit=${limit}`, {
      responseType: 'blob',
    });
    return res.data;
  },
};

// ============================================================
// Health Check
// ============================================================

export const healthApi = {
  check: async (): Promise<{ status: string }> => {
    const res = await axios.get(`${API_BASE_URL}/health`);
    return res.data;
  },
};

export default api;
