import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from schemas import (
    SensorData, PredictionResponse,
    PredictionRequest, PredictionFlowResponse,
    LocationData, WeatherData, PredictionResult,
    ESP32SensorReading
)
from database import get_db
from models import SensorReading, SensorPrediction
from services.prediction_service import predict_risk
from services.weather_service import fetch_live_weather, WeatherAPIError
from services.sensor_store import get_latest_sensor_data
from services.email_service import process_risk_alert_state


logger = logging.getLogger("ignite_shield.api")
router = APIRouter()

@router.post("/prediction", response_model=PredictionFlowResponse, status_code=status.HTTP_200_OK)
def predict_fire_risk_flow(payload: PredictionRequest, db: Session = Depends(get_db)):
    """
    Complete Prediction Flow:
    1. Retrieve latest real ESP32 sensor values from PostgreSQL (Single Source of Truth)
    2. Get current laptop coordinates (latitude, longitude)
    3. Call Open-Meteo weather API for live wind speed, wind direction, precipitation
    4. Combine sensor values + weather wind speed
    5. Run Random Forest ML prediction (fire_risk: LOW/MEDIUM/HIGH, confidence: actual prob)
    6. Save complete record in PostgreSQL
    7. Return result to React dashboard
    """
    # Step 1: Resolve sensor data - predict based on values shown on dashboard or latest PostgreSQL record
    if payload.temperature is not None and payload.humidity is not None and payload.soil_moisture is not None:
        temperature = payload.temperature
        humidity = payload.humidity
        soil_moisture = payload.soil_moisture
        logger.info(f"Predicting based on sensor values: temp={temperature}°C, hum={humidity}%, soil={soil_moisture}%")
    else:
        latest_reading = db.query(SensorReading).order_by(SensorReading.id.desc()).first()
        if latest_reading:
            temperature = latest_reading.temperature
            humidity = latest_reading.humidity
            soil_moisture = latest_reading.soil_moisture
            logger.info(f"Using latest PostgreSQL ESP32 record #{latest_reading.id}: temp={temperature}°C, hum={humidity}%, soil={soil_moisture}%")
        else:
            latest_pred = db.query(SensorPrediction).order_by(SensorPrediction.id.desc()).first()
            if latest_pred:
                temperature = latest_pred.temperature
                humidity = latest_pred.humidity
                soil_moisture = latest_pred.soil_moisture
                logger.info(f"Using latest PostgreSQL sensor_predictions record #{latest_pred.id}: temp={temperature}°C, hum={humidity}%, soil={soil_moisture}%")
            else:
                latest_sensor = get_latest_sensor_data()
                if latest_sensor is not None:
                    temperature = latest_sensor["temperature"]
                    humidity = latest_sensor["humidity"]
                    soil_moisture = latest_sensor["soil_moisture"]
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Sensor data unavailable"
                    )

    # Step 2 & 3: Fetch weather data
    try:
        weather = fetch_live_weather(payload.latitude, payload.longitude)
    except WeatherAPIError as e:
        logger.error(f"Weather API error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Weather data temporarily unavailable"
        )
    except Exception as e:
        logger.error(f"Unexpected weather retrieval error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Weather data temporarily unavailable"
        )

    # Step 4 & 5: Run fire risk prediction
    try:
        pred_res = predict_risk(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=weather["wind_speed"]
        )
    except Exception as e:
        logger.error(f"ML model unavailable: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ML model unavailable"
        )

    # Step 6: Save complete record to PostgreSQL (ONLY if not temporary simulation)
    record_timestamp = datetime.now(timezone.utc)
    if not payload.is_simulation:
        logger.info("Saving prediction to database...")
        try:
            db_record = SensorPrediction(
                temperature=temperature,
                humidity=humidity,
                soil_moisture=soil_moisture,
                wind_speed=weather["wind_speed"],
                wind_direction=weather["wind_direction"],
                precipitation=weather["precipitation"],
                latitude=payload.latitude,
                longitude=payload.longitude,
                fire_risk=pred_res["fire_risk"],
                confidence=pred_res["confidence"]
            )
            db.add(db_record)
            db.commit()
            db.refresh(db_record)
            logger.info("Prediction saved successfully")
            record_timestamp = db_record.created_at or record_timestamp

            # Evaluate Email alert state (triggers ONLY if final prediction == HIGH and previous != HIGH)
            try:
                process_risk_alert_state(
                    db=db,
                    current_risk=pred_res["fire_risk"],
                    confidence=pred_res["confidence"],
                    temperature=temperature,
                    humidity=humidity,
                    soil_moisture=soil_moisture,
                    wind_speed=weather["wind_speed"],
                    latitude=payload.latitude,
                    longitude=payload.longitude,
                    prediction_id=db_record.id,
                    timestamp=record_timestamp,
                    async_dispatch=True
                )
            except Exception as alert_err:
                logger.error("[Email] Error processing emergency alert dispatch: %s", alert_err)


        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Database unavailable: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database unavailable"
            )
    else:
        logger.info("Simulation mode: prediction evaluated without persisting to database or dispatching alerts.")

    # Step 7: Return response
    return PredictionFlowResponse(
        success=True,
        location=LocationData(
            latitude=payload.latitude,
            longitude=payload.longitude
        ),
        sensor_data=ESP32SensorReading(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture
        ),
        weather_data=WeatherData(
            wind_speed=weather["wind_speed"],
            wind_direction=weather["wind_direction"],
            precipitation=weather["precipitation"]
        ),
        prediction=PredictionResult(
            fire_risk=pred_res["fire_risk"],
            confidence=pred_res["confidence"]
        ),
        timestamp=record_timestamp
    )

@router.post("/predict/risk", response_model=PredictionResponse, status_code=status.HTTP_200_OK)
def predict_and_store(data: SensorData, save_to_db: bool = True, db: Session = Depends(get_db)):
    """
    Receives sensor values, gets model prediction, optionally stores record in DB, and returns prediction.
    When save_to_db is False (e.g. temporary manual demo simulation), runs ML model without persisting
    or triggering forest officer emergency alerts.
    """
    try:
        # 1. Get prediction from ML service
        prediction_result = predict_risk(
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=data.wind_speed
        )
        
        # 2. Store record in DB with sensor fields ONLY if save_to_db is True
        if save_to_db:
            logger.info("Saving prediction to database...")
            db_record = SensorPrediction(
                temperature=data.temperature,
                humidity=data.humidity,
                soil_moisture=data.soil_moisture,
                wind_speed=data.wind_speed,
                wind_direction=data.wind_direction,
                precipitation=data.precipitation,
                fire_risk=prediction_result["fire_risk"],
                confidence=prediction_result["confidence"]
            )
            db.add(db_record)
            db.commit()
            db.refresh(db_record)
            logger.info("Prediction saved successfully")

            # Evaluate Email alert state (triggers ONLY if final prediction == HIGH and previous != HIGH)
            try:
                process_risk_alert_state(
                    db=db,
                    current_risk=prediction_result["fire_risk"],
                    confidence=prediction_result["confidence"],
                    temperature=data.temperature,
                    humidity=data.humidity,
                    soil_moisture=data.soil_moisture,
                    wind_speed=data.wind_speed,
                    prediction_id=db_record.id,
                    timestamp=db_record.created_at or datetime.now(timezone.utc),
                    async_dispatch=True
                )
            except Exception as alert_err:
                logger.error("[Email] Error processing emergency alert dispatch: %s", alert_err)

        else:
            logger.info("Temporary demo prediction: ML evaluated without persisting to DB or triggering alerts.")
        
        # 3. Return response
        return PredictionResponse(
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=data.wind_speed,
            wind_direction=data.wind_direction,
            precipitation=data.precipitation,
            fire_risk=prediction_result["fire_risk"],
            confidence=prediction_result["confidence"],
            probabilities=prediction_result["probabilities"],
            prediction=prediction_result["prediction"],
            probability=prediction_result["probability"],
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )

@router.get("/predict/latest")
def get_latest_prediction(db: Session = Depends(get_db)):
    """Retrieve the latest prediction from the database."""
    reading = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).first()
    if not reading:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No readings found.")
    return reading

@router.post("/predict/spread")
def predict_fire_spread(data: SensorData):
    """Wind-based fire spread calculation."""
    wind_speed = data.wind_speed
    wind_direction = data.wind_direction or 0
    
    # Rule-based spread calculation
    # Spread rate based on wind speed (m/s to relative intensity)
    if wind_speed < 2:
        spread_intensity = "Low"
        spread_distance_km = 0.5
    elif wind_speed < 5:
        spread_intensity = "Medium"
        spread_distance_km = 1.5
    elif wind_speed < 10:
        spread_intensity = "High"
        spread_distance_km = 3.0
    else:
        spread_intensity = "Extreme"
        spread_distance_km = 5.0
    
    return {
        "status": "success",
        "wind_speed": wind_speed,
        "wind_direction": wind_direction,
        "spread_direction": wind_direction,
        "spread_intensity": spread_intensity,
        "spread_distance_km": spread_distance_km,
        "note": "This is a wind-based fire spread simulation, not a scientifically accurate wildfire prediction."
    }
