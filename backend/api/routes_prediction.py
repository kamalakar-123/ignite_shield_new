from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from schemas import SensorData, PredictionResponse
from database import get_db
from models import SensorPrediction
from services.prediction_service import predict_risk

router = APIRouter()

@router.post("/predict", response_model=PredictionResponse, status_code=status.HTTP_201_CREATED)
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
        
        # 2. Store record in DB
        db_record = SensorPrediction(
            temperature=data.temperature,
            humidity=data.humidity,
            soil_moisture=data.soil_moisture,
            wind_speed=data.wind_speed,
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
            fire_risk=prediction_result["fire_risk"],
            confidence=prediction_result["confidence"],
            probabilities=prediction_result["probabilities"],
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )

