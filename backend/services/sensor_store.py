import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("ignite_shield.sensor")

# In-memory storage for latest received ESP32 readings
_latest_sensor_reading: Optional[Dict[str, Any]] = None

def set_latest_sensor_data(temperature: float, humidity: float, soil_moisture: float) -> Dict[str, Any]:
    """Store latest ESP32 reading in-memory and log event."""
    global _latest_sensor_reading
    logger.info("ESP32 sensor data received")
    _latest_sensor_reading = {
        "temperature": round(float(temperature), 2),
        "humidity": round(float(humidity), 2),
        "soil_moisture": round(float(soil_moisture), 2),
        "received_at": datetime.now(timezone.utc),
        "is_live": True
    }
    return _latest_sensor_reading

def get_latest_sensor_data() -> Optional[Dict[str, Any]]:
    """Retrieve latest ESP32 sensor reading."""
    return _latest_sensor_reading
