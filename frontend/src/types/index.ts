// ============================================================
// IGNITE SHIELD — TypeScript Types
// ============================================================

// Sensor & Prediction
export interface SensorData {
  temperature: number;
  humidity: number;
  soil_moisture: number;
  wind_speed: number;
  wind_direction?: number | null;
  precipitation?: number | null;
}

export interface PredictionResponse {
  temperature: number;
  humidity: number;
  soil_moisture: number;
  wind_speed: number;
  wind_direction?: number | null;
  precipitation?: number | null;
  fire_risk: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ReadingResponse {
  id: number;
  temperature: number;
  humidity: number;
  soil_moisture: number;
  wind_speed: number;
  wind_direction?: number | null;
  precipitation?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  zone_name?: string | null;
  fire_risk: string;
  confidence: number;
  created_at: string;
}

// Dashboard
export interface DashboardStats {
  total_readings: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  active_fires: number;
  monitored_zones: number;
  system_status: string;
  last_updated: string | null;
  latest_risk: string | null;
  latest_confidence: number | null;
}

// Alerts
export interface AlertResponse {
  id: number;
  prediction_id: number | null;
  alert_type: string;
  risk_level: string;
  zone_name: string | null;
  message: string;
  latitude: number | null;
  longitude: number | null;
  is_acknowledged: boolean;
  created_at: string;
}

// Analytics
export interface AnalyticsDataPoint {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  soil_moisture: number | null;
  wind_speed: number | null;
  fire_risk: string | null;
}

export interface RiskDistribution {
  risk_level: string;
  count: number;
  percentage: number;
}

export interface AnalyticsResponse {
  time_series: AnalyticsDataPoint[];
  risk_distribution: RiskDistribution[];
  total_predictions: number;
}

// Risk Map
export interface RiskMapPoint {
  id: number;
  temperature: number;
  humidity: number;
  soil_moisture: number;
  wind_speed: number;
  wind_direction: number | null;
  precipitation: number | null;
  latitude: number | null;
  longitude: number | null;
  zone_name: string;
  fire_risk: string;
  confidence: number;
  created_at: string | null;
}

// Fire Spread
export interface FireSpreadResult {
  status: string;
  wind_speed: number;
  wind_direction: number;
  spread_direction: number;
  spread_intensity: string;
  spread_distance_km: number;
  note: string;
}

// Auth
export interface UserLogin {
  username: string;
  password: string;
}

export interface UserRegister {
  username: string;
  email: string;
  full_name?: string;
  password: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

// Settings (frontend-only)
export interface AppSettings {
  refreshInterval: number; // seconds
  predictionInterval: number; // seconds for AI risk prediction
  autoPredictEnabled: boolean; // whether scheduled prediction is running
  alarmEnabled: boolean;
  alarmVolume: number;
  mapStyle: 'dark' | 'satellite' | 'terrain';
  theme: 'dark' | 'light';
}

// Risk color mapping
export const RISK_COLORS: Record<string, string> = {
  Low: '#22c55e',
  Medium: '#eab308',
  High: '#ef4444',
};

export const RISK_BG_COLORS: Record<string, string> = {
  Low: 'rgba(34, 197, 94, 0.15)',
  Medium: 'rgba(234, 179, 8, 0.15)',
  High: 'rgba(239, 68, 68, 0.15)',
};
