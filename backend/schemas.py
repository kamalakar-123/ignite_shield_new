from pydantic import BaseModel, ConfigDict
from typing import Dict, Optional, List
from datetime import datetime

# ============================================================
# Sensor / Prediction Schemas
# ============================================================

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
    is_acknowledged: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AlertAcknowledge(BaseModel):
    alert_id: int

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
