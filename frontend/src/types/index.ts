// ============================================================
// IGNITE SHIELD — TypeScript Types
// ============================================================

// Sensor & Prediction
export interface ESP32SensorReading {
  temperature: number;
  humidity: number;
  soil_moisture: number;
}

export interface ESP32SensorResponse {
  success: boolean;
  message: string;
  sensor_data: ESP32SensorReading;
  timestamp: string;
}

export interface LatestSensorReading {
  temperature: number;
  humidity: number;
  soil_moisture: number;
  timestamp?: string;
}

export interface PredictionFlowRequest {
  temperature?: number;
  humidity?: number;
  soil_moisture?: number;
  latitude: number;
  longitude: number;
  is_simulation?: boolean;
}

export interface PredictionFlowResponse {
  success: boolean;
  location: {
    latitude: number;
    longitude: number;
  };
  sensor_data: {
    temperature: number;
    humidity: number;
    soil_moisture: number;
  };
  weather_data: {
    wind_speed: number;
    wind_direction: number;
    precipitation: number;
  };
  prediction: {
    fire_risk: string;
    confidence: number;
  };
  timestamp: string;
}

export interface HistoricalReading {
  id?: number;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  temperature: number;
  humidity: number;
  soil_moisture: number;
  wind_speed: number;
  wind_direction?: number | null;
  precipitation?: number | null;
  fire_risk: string;
  confidence: number;
}

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
  prediction?: string;
  probability?: number;
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
  prediction?: string;
  probability?: number;
  probabilities?: Record<string, number>;
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
  temperature?: number | null;
  humidity?: number | null;
  soil_moisture?: number | null;
  wind_speed?: number | null;
  location?: string | null;
  email_status?: string | null;
  email_recipient?: string | null;
  email_error?: string | null;
  sms_status?: string | null;
  sms_recipient?: string | null;
  sms_message_sid?: string | null;
  sms_error?: string | null;
  whatsapp_status?: string | null;
  whatsapp_recipient?: string | null;
  whatsapp_message_sid?: string | null;
  whatsapp_error?: string | null;
  device_id?: string | null;
  map_url?: string | null;
  is_acknowledged: boolean;
  created_at: string;
}

// IoT Devices
export interface DeviceResponse {
  device_id: string;
  device_name?: string | null;
  status: string; // online, offline, degraded
  last_seen: string | null;
  firmware_version?: string | null;
  battery_level?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  is_active: boolean;
}

// AI Assistant
export interface AIChatRequest {
  message: string;
  station_id?: string;
  latitude?: number;
  longitude?: number;
}

export interface AIChatResponse {
  success: boolean;
  answer: string;
  measured_facts: Record<string, any>;
  external_weather?: Record<string, any> | null;
  recommendations: string[];
  data_freshness_seconds?: number | null;
  timestamp: string;
  provider: string;
}

export interface ChannelTestResult {
  success: boolean;
  status: string;
  recipient?: string | null;
  message_sid?: string | null;
  error?: string | null;
}

export interface EmailTestResponse {
  success: boolean;
  status: string;
  message: string;
  recipient?: string | null;
  error?: string | null;
}

export interface SMSTestResponse {
  success: boolean;
  status: string;
  message: string;
  recipient?: string | null;
  message_sid?: string | null;
  error?: string | null;
}

export interface WhatsAppTestResponse {
  success: boolean;
  status: string;
  message: string;
  recipient?: string | null;
  message_sid?: string | null;
  error?: string | null;
}

export interface MultiChannelTestResponse {
  success: boolean;
  message: string;
  email: ChannelTestResult;
  sms: ChannelTestResult;
  whatsapp: ChannelTestResult;
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
