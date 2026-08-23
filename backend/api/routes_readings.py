from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from schemas import ReadingResponse
from database import get_db
from models import SensorPrediction

router = APIRouter()

@router.get("/readings", response_model=List[ReadingResponse])
def get_readings(limit: int = 50, db: Session = Depends(get_db)):
    """
    Retrieve stored sensor predictions with an optional limit.
    """
    readings = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).limit(limit).all()
    return readings

@router.get("/readings/latest", response_model=ReadingResponse)
def get_latest_reading(db: Session = Depends(get_db)):
    """
    Retrieve the most recent sensor prediction.
    """
    reading = db.query(SensorPrediction).order_by(SensorPrediction.created_at.desc()).first()
    if not reading:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No readings found.")
    return reading

@router.get("/readings/{id}", response_model=ReadingResponse)
def get_reading_by_id(id: int, db: Session = Depends(get_db)):
    """
    Retrieve a specific prediction by ID.
    """
    reading = db.query(SensorPrediction).filter(SensorPrediction.id == id).first()
    if not reading:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reading with id {id} not found.")
    return reading
