from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from schemas import SensorData, PredictionResponse
from database import get_db
from models import SensorPrediction
from services.prediction_service import predict_risk

router = APIRouter()

@router.post("/predict/risk", response_model=PredictionResponse, status_code=status.HTTP_201_CREATED)
def predict_and_store(data: SensorData, db: Session = Depends(get_db)):
    """
    Receives sensor values, gets model prediction, stores record in DB, and returns prediction.
    """
    try:
        # 1. Get prediction from ML service
        prediction_result = predict_risk(
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=data.wind_speed
        )
        
        # 2. Store record in DB with sensor fields
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
