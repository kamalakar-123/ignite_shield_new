from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean
from sqlalchemy.sql import func
from database import Base

class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, nullable=True, default="ESP32-NODE-01")
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    soil_moisture = Column(Float, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    battery_level = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    @property
    def timestamp(self):
        return self.created_at

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id or "ESP32-NODE-01",
            "temperature": self.temperature,
            "humidity": self.humidity,
            "soil_moisture": self.soil_moisture,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "battery_level": self.battery_level,
            "timestamp": self.created_at.isoformat() if self.created_at else None
        }


class SensorPrediction(Base):
    __tablename__ = "sensor_predictions"

    id = Column(Integer, primary_key=True, index=True)
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    soil_moisture = Column(Float, nullable=False)
    wind_speed = Column(Float, nullable=False)
    wind_direction = Column(Float, nullable=True)
    precipitation = Column(Float, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    zone_name = Column(String, nullable=True)
    
    fire_risk = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def timestamp(self):
        return self.created_at

    @property
    def prediction(self):
        return self.fire_risk.upper() if self.fire_risk else None

    @property
    def probability(self):
        return self.confidence

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.created_at.isoformat() if self.created_at else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "temperature": self.temperature,
            "humidity": self.humidity,
            "soil_moisture": self.soil_moisture,
            "wind_speed": self.wind_speed,
            "wind_direction": self.wind_direction,
            "precipitation": self.precipitation,
            "fire_risk": self.fire_risk,
            "confidence": self.confidence,
            "zone_name": self.zone_name,
        }


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="officer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, nullable=True)
    alert_type = Column(String, nullable=False)  # HIGH_RISK, MEDIUM_RISK, SENSOR_ALERT, SYSTEM_ALERT
    risk_level = Column(String, nullable=False)   # High, Medium, Low
    zone_name = Column(String, nullable=True)
    message = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    soil_moisture = Column(Float, nullable=True)
    wind_speed = Column(Float, nullable=True)
    location = Column(String, nullable=True)
    email_status = Column(String, nullable=True)  # SENT, FAILED, PENDING, SKIPPED, SUPPRESSED
    email_recipient = Column(String, nullable=True)
    email_error = Column(String, nullable=True)
    sms_status = Column(String, nullable=True)  # SENT, FAILED, PENDING, SKIPPED, SUPPRESSED
    sms_recipient = Column(String, nullable=True)
    sms_message_sid = Column(String, nullable=True)
    sms_error = Column(String, nullable=True)
    whatsapp_status = Column(String, nullable=True)  # SENT, FAILED, PENDING, SKIPPED, SUPPRESSED
    whatsapp_recipient = Column(String, nullable=True)
    whatsapp_message_sid = Column(String, nullable=True)
    whatsapp_error = Column(String, nullable=True)
    device_id = Column(String, nullable=True, default="ESP32-NODE-01")
    is_acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    station_name = Column(String, nullable=True, default="Forest Sector Alpha Station")
    latitude = Column(Float, nullable=True, default=12.2958)
    longitude = Column(Float, nullable=True, default=76.6394)
    firmware_version = Column(String, nullable=True, default="v1.2.0")
    battery_level = Column(Float, nullable=True, default=100.0)
    status = Column(String, default="online")  # online | offline | degraded
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "station_name": self.station_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "firmware_version": self.firmware_version,
            "battery_level": self.battery_level,
            "status": self.status,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

