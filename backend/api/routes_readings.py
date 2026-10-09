from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from schemas import (
    ReadingResponse, HistoricalReadingResponse,
    ESP32SensorReading, ESP32SensorResponse, LatestSensorReadingResponse,
    DeviceResponse
)
from database import get_db
from models import SensorReading, SensorPrediction, Device
from config import settings
from services.sensor_store import set_latest_sensor_data, get_latest_sensor_data
from services.prediction_service import predict_risk
from services.weather_service import fetch_live_weather
from services.notification_service import process_risk_alert_state

logger = logging.getLogger("ignite_shield.readings")
router = APIRouter()

# ============================================================
# ESP32 Sensor Ingestion Endpoints (Saves to Database & Tracks Device)
# ============================================================

@router.post("/readings/sensor", response_model=ESP32SensorResponse, status_code=status.HTTP_200_OK)
@router.post("/sensor", response_model=ESP32SensorResponse, status_code=status.HTTP_200_OK)
@router.post("/sensor-readings", response_model=ESP32SensorResponse, status_code=status.HTTP_200_OK)
def ingest_esp32_sensor_data(
    data: ESP32SensorReading,
    db: Session = Depends(get_db),
    x_device_token: Optional[str] = Header(None, alias="X-Device-Token"),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Endpoint for ESP32 to send periodic sensor telemetry:
    1. Authenticates device if DEVICE_API_KEY is configured.
    2. Validates physical sensor ranges (-20 to 100°C, 0-100% hum/soil).
    3. Saves reading and updates Device health status and last-seen timestamp.
    4. Caches reading in sensor_store.
    5. Evaluates live Random Forest prediction with weather context.
    6. Dispatches emergency alerts across Email, SMS, WhatsApp on transition to HIGH.
    7. Returns HTTP 200 response with risk prediction.
    """
    # 1. Device Authentication (if configured)
    if settings.DEVICE_API_KEY:
        token = x_device_token or x_api_key
        if not token or token != settings.DEVICE_API_KEY:
            logger.warning("[Ingest Auth] Rejected unauthenticated telemetry from device: %s", data.device_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing device authentication token. Provide X-Device-Token header."
            )

    # 2. Strict Input Validation (Reject corrupt ADC / sensor readings)
    if not (-20.0 <= data.temperature <= 100.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Temperature value {data.temperature}°C is outside valid physical range (-20°C to 100°C)."
        )
    if not (0.0 <= data.humidity <= 100.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Humidity value {data.humidity}% is outside valid physical range (0% to 100%)."
        )
    if not (0.0 <= data.soil_moisture <= 100.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Soil moisture value {data.soil_moisture}% is outside valid physical range (0% to 100%)."
        )

    device_id = data.device_id or "ESP32-NODE-01"
    now_utc = datetime.now(timezone.utc)

    logger.info("ESP32 [%s] telemetry received: temp=%.1f°C, hum=%.1f%%, soil=%.1f%%",
                device_id, data.temperature, data.humidity, data.soil_moisture)

    # 3. Determine location & fallback station coordinates
    lat = data.latitude if data.latitude is not None else 12.2958
    lon = data.longitude if data.longitude is not None else 76.6394
    zone_name = f"Forest Sector Alpha ({device_id})"

    # 4. Save reading to sensor_readings table
    record = SensorReading(
        device_id=device_id,
        temperature=data.temperature,
        humidity=data.humidity,
        soil_moisture=data.soil_moisture,
        latitude=lat,
        longitude=lon,
        battery_level=data.battery_level,
        created_at=data.timestamp or now_utc
    )
    db.add(record)

    # 5. Update or register Device registry for health status
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        device = Device(
            device_id=device_id,
            station_name=f"Monitoring Node {device_id}",
            latitude=lat,
            longitude=lon,
            battery_level=data.battery_level if data.battery_level is not None else 100.0,
            status="online",
            last_seen=now_utc
        )
        db.add(device)
    else:
        device.last_seen = now_utc
        device.status = "online"
        if data.battery_level is not None:
            device.battery_level = data.battery_level
        if data.latitude is not None and data.longitude is not None:
            device.latitude = data.latitude
            device.longitude = data.longitude

    db.commit()
    db.refresh(record)

    # 6. Cache latest reading in memory for rapid retrieval
    set_latest_sensor_data(
        temperature=data.temperature,
        humidity=data.humidity,
        soil_moisture=data.soil_moisture
    )

    # 7. Weather parameters
    wind_speed = 0.8
    wind_direction = 0.0
    precipitation = 0.0

    try:
        weather = fetch_live_weather(lat, lon)
        wind_speed = weather["wind_speed"]
        wind_direction = weather.get("wind_direction", 0.0)
        precipitation = weather.get("precipitation", 0.0)
    except Exception as w_err:
        logger.warning("Could not fetch live weather for ESP32 prediction: %s. Using default wind_speed=%.1f m/s", w_err, wind_speed)

    # 8. Run Random Forest fire risk prediction
    try:
        pred_res = predict_risk(
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=wind_speed
        )
        current_risk = pred_res["fire_risk"].upper()
        confidence = pred_res["confidence"]
    except Exception as ml_err:
        logger.error("Random Forest prediction failed on ESP32 telemetry: %s", ml_err)
        current_risk = "LOW"
        confidence = 0.0

    # 9. Persist prediction in sensor_predictions table
    pred_record = SensorPrediction(
        temperature=data.temperature,
        humidity=data.humidity,
        soil_moisture=data.soil_moisture,
        wind_speed=wind_speed,
        wind_direction=wind_direction,
        precipitation=precipitation,
        latitude=lat,
        longitude=lon,
        zone_name=zone_name,
        fire_risk=current_risk,
        confidence=confidence
    )
    db.add(pred_record)
    db.commit()
    db.refresh(pred_record)

    # 10. Evaluate emergency alert state across all 3 channels
    try:
        process_risk_alert_state(
            db=db,
            current_risk=current_risk,
            confidence=confidence,
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=wind_speed,
            latitude=lat,
            longitude=lon,
            zone_name=zone_name,
            prediction_id=pred_record.id,
            timestamp=record.created_at or now_utc,
            async_dispatch=True
        )
    except Exception as alert_err:
        logger.error("[Alert Dispatch] Error processing emergency alert: %s", alert_err)

    return ESP32SensorResponse(
        success=True,
        message="Sensor data received successfully",
        data=data,
        sensor_data=data,
        device_id=device_id,
        fire_risk=current_risk,
        confidence=confidence,
        timestamp=record.created_at
    )

# ============================================================
# Device Registry & Health Endpoints
# ============================================================

@router.get("/devices", response_model=List[DeviceResponse])
def get_devices(db: Session = Depends(get_db)):
    """Retrieve list of registered IoT monitoring devices with connectivity and battery health."""
    devices = db.query(Device).order_by(Device.last_seen.desc()).all()
    now_utc = datetime.now(timezone.utc)
    for d in devices:
        if d.last_seen:
            ls = d.last_seen.replace(tzinfo=timezone.utc) if d.last_seen.tzinfo is None else d.last_seen
            # If not heard from within 60 seconds, mark as offline
            if (now_utc - ls).total_seconds() > 60:
                d.status = "offline"
            else:
                d.status = "online"
    db.commit()
    return devices


@router.get("/devices/{device_id}", response_model=DeviceResponse)
def get_device_by_id(device_id: str, db: Session = Depends(get_db)):
    """Retrieve health and telemetry status for a specific device."""
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found.")
    now_utc = datetime.now(timezone.utc)
    if device.last_seen:
        ls = device.last_seen.replace(tzinfo=timezone.utc) if device.last_seen.tzinfo is None else device.last_seen
        device.status = "offline" if (now_utc - ls).total_seconds() > 60 else "online"
        db.commit()
    return device


# ============================================================
# Latest ESP32 Reading Endpoint (PostgreSQL is Single Source of Truth)
# ============================================================

@router.get("/readings/latest", response_model=LatestSensorReadingResponse)
def get_latest_reading_from_db(db: Session = Depends(get_db)):
    """
    Retrieve the most recent ESP32 reading from PostgreSQL.
    The query retrieves the latest record by id/timestamp.
    No hardcoded, fake, or generated values.
    """
    latest = db.query(SensorReading).order_by(SensorReading.id.desc()).first()
    if latest:
        return LatestSensorReadingResponse(
            temperature=latest.temperature,
            humidity=latest.humidity,
            soil_moisture=latest.soil_moisture,
            timestamp=latest.created_at.isoformat() if latest.created_at else None
        )

    # Fallback to sensor_predictions table if sensor_readings hasn't populated yet
    latest_pred = db.query(SensorPrediction).order_by(SensorPrediction.id.desc()).first()
    if latest_pred:
        return LatestSensorReadingResponse(
            temperature=latest_pred.temperature,
            humidity=latest_pred.humidity,
            soil_moisture=latest_pred.soil_moisture,
            timestamp=latest_pred.created_at.isoformat() if latest_pred.created_at else None
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No sensor readings available in database yet"
    )

@router.get("/sensor/latest", response_model=ESP32SensorResponse)
@router.get("/readings/sensor/latest", response_model=ESP32SensorResponse)
@router.get("/readings/sensor", response_model=ESP32SensorResponse)
@router.get("/sensor", response_model=ESP32SensorResponse)
def get_latest_esp32_sensor_reading(db: Session = Depends(get_db)):
    """
    Compatibility endpoint returning ESP32SensorResponse structure.
    Retrieves latest reading from PostgreSQL.
    """
    latest = db.query(SensorReading).order_by(SensorReading.id.desc()).first()
    if latest:
        reading_data = ESP32SensorReading(
            temperature=latest.temperature,
            humidity=latest.humidity,
            soil_moisture=latest.soil_moisture
        )
        return ESP32SensorResponse(
            success=True,
            message="Latest sensor reading from PostgreSQL",
            data=reading_data,
            sensor_data=reading_data,
            timestamp=latest.created_at
        )

    latest_pred = db.query(SensorPrediction).order_by(SensorPrediction.id.desc()).first()
    if latest_pred:
        reading_data = ESP32SensorReading(
            temperature=latest_pred.temperature,
            humidity=latest_pred.humidity,
            soil_moisture=latest_pred.soil_moisture
        )
        return ESP32SensorResponse(
            success=True,
            message="Latest sensor reading from PostgreSQL",
            data=reading_data,
            sensor_data=reading_data,
            timestamp=latest_pred.created_at
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No sensor readings available in database yet"
    )

# ============================================================
# Historical Readings Endpoints
# ============================================================

@router.get("/readings", response_model=List[HistoricalReadingResponse])
def get_historical_readings(limit: int = 50, db: Session = Depends(get_db)):
    """
    Retrieve historical sensor + weather + prediction records from PostgreSQL.
    """
    readings = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).limit(limit).all()
    result = []
    for r in readings:
        result.append(HistoricalReadingResponse(
            id=r.id,
            timestamp=r.created_at,
            latitude=r.latitude,
            longitude=r.longitude,
            temperature=r.temperature,
            humidity=r.humidity,
            soil_moisture=r.soil_moisture,
            wind_speed=r.wind_speed,
            wind_direction=r.wind_direction,
            precipitation=r.precipitation,
            fire_risk=r.fire_risk,
            confidence=r.confidence
        ))
    return result

# ============================================================
# Legacy / Existing Sensor Endpoints
# ============================================================

@router.get("/sensors", response_model=List[ReadingResponse])
def get_readings(limit: int = 50, db: Session = Depends(get_db)):
    """
    Retrieve stored sensor predictions with an optional limit.
    """
    readings = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).limit(limit).all()
    return readings

@router.get("/sensors/latest", response_model=ReadingResponse)
def get_latest_reading(db: Session = Depends(get_db)):
    """
    Retrieve the most recent sensor prediction.
    """
    reading = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).first()
    if not reading:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No readings found.")
    return reading

@router.get("/sensors/{id}", response_model=ReadingResponse)
def get_reading_by_id(id: int, db: Session = Depends(get_db)):
    """
    Retrieve a specific prediction by ID.
    """
    reading = db.query(SensorPrediction).filter(SensorPrediction.id == id).first()
    if not reading:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reading with id {id} not found.")
    return reading
