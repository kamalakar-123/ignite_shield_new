from pydantic import BaseModel, ConfigDict
from typing import Dict, Optional, List, Any
from datetime import datetime

# ============================================================
# Sensor / Prediction Schemas
# ============================================================

class ESP32SensorReading(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    device_id: Optional[str] = "ESP32-NODE-01"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery_level: Optional[float] = None
    device_status: Optional[str] = "online"
    timestamp: Optional[datetime] = None

class ESP32SensorResponse(BaseModel):
    success: bool = True
    message: str = "Sensor data received successfully"
    data: Optional[ESP32SensorReading] = None
    sensor_data: Optional[ESP32SensorReading] = None
    device_id: Optional[str] = "ESP32-NODE-01"
    fire_risk: Optional[str] = None
    confidence: Optional[float] = None
    timestamp: Optional[datetime] = None

class LatestSensorReadingResponse(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    device_id: Optional[str] = "ESP32-NODE-01"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery_level: Optional[float] = None
    timestamp: Optional[str] = None

class DeviceResponse(BaseModel):
    id: int
    device_id: str
    station_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    firmware_version: Optional[str] = None
    battery_level: Optional[float] = None
    status: str
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PredictionRequest(BaseModel):
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    soil_moisture: Optional[float] = None
    latitude: float
    longitude: float
    is_simulation: Optional[bool] = False

class LocationData(BaseModel):
    latitude: float
    longitude: float

class WeatherData(BaseModel):
    wind_speed: float
    wind_direction: float
    precipitation: float

class PredictionResult(BaseModel):
    fire_risk: str
    confidence: float

class PredictionFlowResponse(BaseModel):
    success: bool = True
    location: LocationData
    sensor_data: ESP32SensorReading
    weather_data: WeatherData
    prediction: PredictionResult
    timestamp: datetime

class SensorData(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None

class PredictionResponse(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    fire_risk: str
    confidence: float
    probabilities: Dict[str, float]
    prediction: Optional[str] = None
    probability: Optional[float] = None

class ReadingResponse(BaseModel):
    id: int
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    zone_name: Optional[str] = None
    fire_risk: str
    confidence: float
    created_at: datetime
    timestamp: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

class HistoricalReadingResponse(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    fire_risk: str
    confidence: float
    
    model_config = ConfigDict(from_attributes=True)

# ============================================================
# Dashboard Schemas
# ============================================================

class DashboardStats(BaseModel):
    total_readings: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    active_fires: int
    monitored_zones: int
    system_status: str
    last_updated: Optional[datetime] = None
    latest_risk: Optional[str] = None
    latest_confidence: Optional[float] = None

# ============================================================
# Alert Schemas
# ============================================================

class AlertResponse(BaseModel):
    id: int
    prediction_id: Optional[int] = None
    alert_type: str
    risk_level: str
    zone_name: Optional[str] = None
    message: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    soil_moisture: Optional[float] = None
    wind_speed: Optional[float] = None
    location: Optional[str] = None
    email_status: Optional[str] = None
    email_recipient: Optional[str] = None
    email_error: Optional[str] = None
    sms_status: Optional[str] = None
    sms_recipient: Optional[str] = None
    sms_message_sid: Optional[str] = None
    sms_error: Optional[str] = None
    whatsapp_status: Optional[str] = None
    whatsapp_recipient: Optional[str] = None
    whatsapp_message_sid: Optional[str] = None
    whatsapp_error: Optional[str] = None
    device_id: Optional[str] = "ESP32-NODE-01"
    map_url: Optional[str] = None
    is_acknowledged: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AlertAcknowledge(BaseModel):
    alert_id: int

class ChannelTestResult(BaseModel):
    success: bool
    status: str
    recipient: Optional[str] = None
    message_sid: Optional[str] = None
    error: Optional[str] = None

class EmailTestResponse(BaseModel):
    success: bool
    status: str
    message: str
    recipient: Optional[str] = None
    error: Optional[str] = None

class SMSTestResponse(BaseModel):
    success: bool
    status: str
    message: str
    recipient: Optional[str] = None
    message_sid: Optional[str] = None
    error: Optional[str] = None

class WhatsAppTestResponse(BaseModel):
    success: bool
    status: str
    message: str
    recipient: Optional[str] = None
    message_sid: Optional[str] = None
    error: Optional[str] = None

class MultiChannelTestResponse(BaseModel):
    success: bool
    message: str
    email: ChannelTestResult
    sms: ChannelTestResult
    whatsapp: ChannelTestResult


# ============================================================
# Analytics Schemas
# ============================================================

class AnalyticsDataPoint(BaseModel):
    timestamp: datetime
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    soil_moisture: Optional[float] = None
    wind_speed: Optional[float] = None
    fire_risk: Optional[str] = None

class RiskDistribution(BaseModel):
    risk_level: str
    count: int
    percentage: float

class AnalyticsResponse(BaseModel):
    time_series: List[AnalyticsDataPoint]
    risk_distribution: List[RiskDistribution]
    total_predictions: int

# ============================================================
# Auth Schemas
# ============================================================

class UserRegister(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ============================================================
# Export Schemas
# ============================================================

class ExportRequest(BaseModel):
    data_type: str  # sensor, fire_risk, alerts, incidents
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: Optional[int] = None

# ============================================================
# AI Assistant Schemas
# ============================================================

class AIChatRequest(BaseModel):
    message: str
    station_id: Optional[str] = "ESP32-NODE-01"
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class AIChatResponse(BaseModel):
    success: bool
    answer: str
    measured_facts: Dict[str, Any]
    external_weather: Optional[Dict[str, Any]] = None
    recommendations: List[str]
    data_freshness_seconds: Optional[float] = None
    timestamp: datetime
    provider: str

