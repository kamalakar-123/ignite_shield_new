from pydantic import BaseModel, ConfigDict
from typing import Dict
from datetime import datetime

class SensorData(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float

class PredictionResponse(BaseModel):
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    fire_risk: str
    confidence: float
    probabilities: Dict[str, float]


class ReadingResponse(BaseModel):
    id: int
    temperature: float
    humidity: float
    soil_moisture: float
    wind_speed: float
    fire_risk: str
    confidence: float
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
