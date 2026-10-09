from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from schemas import (
    ReadingResponse, HistoricalReadingResponse,
    ESP32SensorReading, ESP32SensorResponse, LatestSensorReadingResponse
)
from database import get_db
from models import SensorReading, SensorPrediction
from services.sensor_store import set_latest_sensor_data, get_latest_sensor_data
from services.prediction_service import predict_risk
from services.weather_service import fetch_live_weather
from services.email_service import process_risk_alert_state

logger = logging.getLogger("ignite_shield.readings")
router = APIRouter()

# ============================================================
# ESP32 Sensor Ingestion Endpoints (Saves Directly to PostgreSQL)
# ============================================================

@router.post("/readings/sensor", response_model=ESP32SensorResponse, status_code=status.HTTP_200_OK)
@router.post("/sensor", response_model=ESP32SensorResponse, status_code=status.HTTP_200_OK)
def ingest_esp32_sensor_data(data: ESP32SensorReading, db: Session = Depends(get_db)):
    """
    Endpoint for ESP32 to send periodic sensor telemetry (e.g. every 15-30s):
    1. Validates sensor data.
    2. Saves reading directly to PostgreSQL sensor_readings table.
    3. Caches reading in sensor_store.
    4. Evaluates live Random Forest prediction.
    5. Saves prediction in sensor_predictions table.
    6. If prediction == HIGH and previous_risk != HIGH:
       Sends emergency Email notification via Gmail SMTP and logs Alert.
       (Continuous HIGH is deduplicated; LOW/MEDIUM does not send).
    7. Returns successful HTTP 200 response with sensor data.
    """

    logger.info("ESP32 sensor data received: temp=%.1f°C, hum=%.1f%%, soil=%.1f%%",
                data.temperature, data.humidity, data.soil_moisture)

    # 1. Save directly to PostgreSQL sensor_readings table
    record = SensorReading(
        temperature=data.temperature,
        humidity=data.humidity,
        soil_moisture=data.soil_moisture
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # 2. Cache latest reading in memory for rapid retrieval
    set_latest_sensor_data(
        temperature=data.temperature,
        humidity=data.humidity,
        soil_moisture=data.soil_moisture
    )

    # 3. Determine location & weather parameters (wind speed)
    latest_pred = db.query(SensorPrediction).order_by(SensorPrediction.id.desc()).first()
    lat = latest_pred.latitude if (latest_pred and latest_pred.latitude is not None) else 12.2958
    lon = latest_pred.longitude if (latest_pred and latest_pred.longitude is not None) else 76.6394
    zone_name = latest_pred.zone_name if (latest_pred and latest_pred.zone_name) else "Forest Sector Alpha"

    wind_speed = latest_pred.wind_speed if (latest_pred and latest_pred.wind_speed is not None) else 0.8
    wind_direction = latest_pred.wind_direction if latest_pred else 0.0
    precipitation = latest_pred.precipitation if latest_pred else 0.0

    try:
        weather = fetch_live_weather(lat, lon)
        wind_speed = weather["wind_speed"]
        wind_direction = weather.get("wind_direction", wind_direction)
        precipitation = weather.get("precipitation", precipitation)
    except Exception as w_err:
        logger.warning("Could not fetch live weather for ESP32 prediction: %s. Using wind_speed=%.1f m/s", w_err, wind_speed)

    # 4. Run Random Forest fire risk prediction
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

    # 5. Persist prediction in sensor_predictions table
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

    # 6. Evaluate Email alert state (triggers ONLY if final prediction == HIGH and previous != HIGH)
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
            timestamp=record.created_at or datetime.now(timezone.utc),
            async_dispatch=True
        )
    except Exception as alert_err:
        logger.error("[Email] Error processing emergency alert dispatch: %s", alert_err)


    return ESP32SensorResponse(
        success=True,
        message="Sensor data received successfully",
        data=data,
        sensor_data=data,
        timestamp=record.created_at
    )

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
