import logging
import httpx
from typing import Dict, Any
from config import settings

logger = logging.getLogger("ignite_shield.weather")

class WeatherAPIError(Exception):
    """Custom exception raised when live weather API retrieval fails."""
    pass

def fetch_live_weather(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Fetch live weather data from Open-Meteo for the specified latitude and longitude.
    Extracts:
      - wind_speed (m/s)
      - wind_direction (degrees)
      - precipitation (mm)
    """
    logger.info("Fetching weather data...")
    url = settings.OPEN_METEO_BASE_URL
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "wind_speed_10m,wind_direction_10m,precipitation",
        "wind_speed_unit": "ms"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as e:
        logger.error(f"Weather API timeout: {e}")
        raise WeatherAPIError("Weather data temporarily unavailable") from e
    except httpx.HTTPStatusError as e:
        logger.error(f"Weather API returned error status {e.response.status_code}: {e}")
        raise WeatherAPIError("Weather data temporarily unavailable") from e
    except Exception as e:
        logger.error(f"Failed to fetch weather data: {e}")
        raise WeatherAPIError("Weather data temporarily unavailable") from e

    current = data.get("current")
    if not current:
        logger.error("Open-Meteo response missing 'current' payload.")
        raise WeatherAPIError("Weather data temporarily unavailable")

    wind_speed = current.get("wind_speed_10m")
    wind_direction = current.get("wind_direction_10m")
    precipitation = current.get("precipitation")

    if wind_speed is None:
        logger.error("Open-Meteo 'wind_speed_10m' is missing.")
        raise WeatherAPIError("Weather data temporarily unavailable")

    result = {
        "wind_speed": round(float(wind_speed), 2),
        "wind_direction": round(float(wind_direction if wind_direction is not None else 0.0), 1),
        "precipitation": round(float(precipitation if precipitation is not None else 0.0), 2),
        "time": current.get("time"),
        "latitude": data.get("latitude", latitude),
        "longitude": data.get("longitude", longitude)
    }

    logger.info("Weather data received")
    return result
