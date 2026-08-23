from sqlalchemy import Column, Integer, Float, String, DateTime
from sqlalchemy.sql import func
from database import Base

class SensorPrediction(Base):
    __tablename__ = "sensor_predictions"

    id = Column(Integer, primary_key=True, index=True)
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    soil_moisture = Column(Float, nullable=False)
    wind_speed = Column(Float, nullable=False)
    
    fire_risk = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
