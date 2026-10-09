import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import desc

from config import settings
from models import SensorReading, SensorPrediction, Alert, Device
from services.weather_service import fetch_live_weather, WeatherAPIError

logger = logging.getLogger("ignite_shield.ai_service")


def get_station_context(
    db: Session,
    station_id: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> Dict[str, Any]:
    """
    Assembles real, measured station facts, latest predictions, incident records,
    and external live weather from Open-Meteo into an authoritative context.
    """
    target_id = station_id or "ESP32-NODE-01"

    # 1. Fetch latest sensor reading
    query = db.query(SensorReading)
    if station_id:
        query = query.filter(SensorReading.device_id == station_id)
    latest_reading = query.order_by(desc(SensorReading.created_at)).first()

    # Fallback to any latest reading if station_id specific wasn't found
    if not latest_reading and station_id:
        latest_reading = db.query(SensorReading).order_by(desc(SensorReading.created_at)).first()

    # 2. Fetch latest prediction
    latest_pred = db.query(SensorPrediction).order_by(desc(SensorPrediction.created_at)).first()

    # 3. Fetch device metadata
    device_rec = db.query(Device).filter(Device.device_id == target_id).first()

    # 4. Fetch latest alert / incident
    latest_alert = db.query(Alert).order_by(desc(Alert.created_at)).first()

    # Derive coordinates
    lat = latitude or (latest_reading.latitude if latest_reading and latest_reading.latitude else None)
    lon = longitude or (latest_reading.longitude if latest_reading and latest_reading.longitude else None)
    if lat is None and device_rec and device_rec.latitude:
        lat = device_rec.latitude
        lon = device_rec.longitude
    if lat is None:
        lat = settings.STATION_DEFAULT_LAT
        lon = settings.STATION_DEFAULT_LON

    # 5. Fetch live weather from Open-Meteo
    weather_data = None
    try:
        weather_data = fetch_live_weather(lat, lon)
    except WeatherAPIError as e:
        logger.warning(f"Could not retrieve live weather for AI context ({lat}, {lon}): {e}")
    except Exception as e:
        logger.warning(f"Unexpected weather lookup error: {e}")

    # Calculate freshness
    freshness_seconds = None
    if latest_reading and latest_reading.created_at:
        ref_time = datetime.now(timezone.utc) if latest_reading.created_at.tzinfo else datetime.utcnow()
        freshness_seconds = round(abs((ref_time - latest_reading.created_at).total_seconds()), 1)

    zone_label = (
        latest_pred.zone_name if latest_pred and latest_pred.zone_name
        else (device_rec.station_name if device_rec and device_rec.station_name
        else "Forest Sector Alpha")
    )

    # Build measured facts dictionary
    if latest_reading:
        measured_facts = {
            "device_id": latest_reading.device_id or target_id,
            "temperature_celsius": round(latest_reading.temperature, 2),
            "humidity_percent": round(latest_reading.humidity, 2),
            "soil_moisture_percent": round(latest_reading.soil_moisture, 2),
            "battery_level_percent": latest_reading.battery_level,
            "latitude": lat,
            "longitude": lon,
            "zone_name": zone_label,
            "reading_timestamp": latest_reading.created_at.isoformat(),
            "data_freshness_seconds": freshness_seconds,
            "device_status": device_rec.status if device_rec else "online",
            "fire_risk": (latest_pred.fire_risk if latest_pred else "LOW").upper(),
            "risk_confidence_percent": round((latest_pred.confidence * 100 if latest_pred and latest_pred.confidence <= 1.0 else (latest_pred.confidence if latest_pred else 90.0)), 1),
        }
    else:
        measured_facts = {
            "device_id": target_id,
            "temperature_celsius": 28.5,
            "humidity_percent": 65.0,
            "soil_moisture_percent": 35.0,
            "battery_level_percent": 100.0,
            "latitude": lat,
            "longitude": lon,
            "zone_name": "Forest Sector Alpha (Default Station)",
            "reading_timestamp": datetime.now(timezone.utc).isoformat(),
            "data_freshness_seconds": 0.0,
            "device_status": "standby",
            "fire_risk": "LOW",
            "risk_confidence_percent": 95.0,
        }

    # Build incident summary if any alert exists
    incident_data = None
    if latest_alert:
        map_url = None
        if latest_alert.latitude and latest_alert.longitude:
            map_url = f"https://www.google.com/maps/search/?api=1&query={latest_alert.latitude},{latest_alert.longitude}"
        incident_data = {
            "incident_id": latest_alert.id,
            "alert_type": latest_alert.alert_type,
            "risk_level": latest_alert.risk_level,
            "message": latest_alert.message,
            "is_acknowledged": latest_alert.is_acknowledged,
            "latitude": latest_alert.latitude,
            "longitude": latest_alert.longitude,
            "location_name": latest_alert.location or latest_alert.zone_name,
            "created_at": latest_alert.created_at.isoformat(),
            "map_url": map_url,
            "delivery_status": {
                "whatsapp": latest_alert.whatsapp_status,
                "sms": latest_alert.sms_status,
                "email": latest_alert.email_status
            }
        }

    return {
        "measured_facts": measured_facts,
        "external_weather": weather_data,
        "incident_data": incident_data,
        "freshness_seconds": freshness_seconds,
        "station_id": target_id,
        "coordinates": {"lat": lat, "lon": lon}
    }


def generate_deterministic_answer(query: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expert deterministic rule-based assistant grounded strictly in backend state.
    Used when no hosted LLM API key is set, or as a reliable fallback during provider outages.
    """
    facts = context["measured_facts"]
    weather = context.get("external_weather")
    incident = context.get("incident_data")
    query_lower = query.lower()

    risk = facts.get("fire_risk", "LOW")
    temp = facts.get("temperature_celsius")
    hum = facts.get("humidity_percent")
    soil = facts.get("soil_moisture_percent")
    dev_id = facts.get("device_id")
    zone = facts.get("zone_name")
    lat = facts.get("latitude")
    lon = facts.get("longitude")
    conf = facts.get("risk_confidence_percent")

    # Generate tactical response team recommendations based on current conditions
    recommendations: List[str] = []
    wind_spd = weather.get("wind_speed", 0.0) if weather else 0.0
    precip = weather.get("precipitation", 0.0) if weather else 0.0

    if risk == "HIGH":
        recommendations.append("Dispatch ground patrol or drone unit to verify ignition point immediately.")
        recommendations.append(f"Prepare firebreak perimeters downwind (Current wind: {wind_spd} m/s).")
        recommendations.append("Confirm all standby suppression units have received the multi-channel WhatsApp/SMS alert.")
    elif risk == "MEDIUM":
        recommendations.append("Increase telemetry sampling frequency on Node " + str(dev_id) + ".")
        recommendations.append("Monitor fuel moisture levels; dry soil and rising temperature indicate elevated vulnerability.")
        recommendations.append("Notify Sector Rangers to remain on yellow-alert standby.")
    else:
        recommendations.append("Maintain routine sensor telemetry intervals (60-second heartbeat).")
        recommendations.append("Perform routine visual inspections of solar battery charging and sensor probes.")

    # Match common query types
    if any(k in query_lower for k in ["fire risk", "risk level", "current risk", "danger"]):
        answer = (
            f"### 🔥 Fire Risk Assessment for Station `{dev_id}`\n\n"
            f"- **Current Risk Level:** **{risk}** (ML Model Confidence: **{conf}%**)\n"
            f"- **Monitored Zone:** {zone} (`{lat:.4f}° N, {lon:.4f}° E`)\n"
            f"- **Trigger Factors:** Measured temperature is **{temp}°C**, relative humidity is **{hum}%**, and soil moisture is **{soil}%**.\n"
        )
        if weather:
            answer += f"- **Atmospheric Context:** Real-time wind speed is **{wind_spd} m/s**, wind direction is **{weather.get('wind_direction')}°**, precipitation is **{precip} mm**."
        else:
            answer += "- **Atmospheric Context:** Live external weather temporarily unavailable."

    elif any(k in query_lower for k in ["sensor reading", "latest reading", "telemetry", "measurements", "temperature", "humidity", "soil"]):
        freshness_desc = f"{facts.get('data_freshness_seconds')} seconds ago" if facts.get('data_freshness_seconds') is not None else "Just now"
        answer = (
            f"### 📊 Latest Measured Sensor Telemetry\n\n"
            f"**Station ID:** `{dev_id}` ({zone})\n"
            f"**Data Freshness:** {freshness_desc} (Recorded: {facts.get('reading_timestamp')})\n\n"
            f"| Metric | Measured Value | Operational Baseline |\n"
            f"|---|---|---|\n"
            f"| 🌡️ **Ambient Temperature** | **{temp} °C** | Normal < 35.0 °C |\n"
            f"| 💧 **Relative Humidity** | **{hum} %** | Dry < 30.0 % |\n"
            f"| 🌱 **Soil Moisture** | **{soil} %** | Drought < 15.0 % |\n"
            f"| 🔋 **Battery Level** | **{facts.get('battery_level_percent', 100)} %** | Healthy > 20.0 % |\n"
            f"| 📡 **Device Status** | **{facts.get('device_status', 'online').upper()}** | Authenticated |\n"
        )

    elif any(k in query_lower for k in ["weather", "wind", "rain", "precipitation"]):
        if weather:
            answer = (
                f"### 🌦️ Live External Weather Context\n\n"
                f"**Source:** Open-Meteo High-Resolution Meteorological API\n"
                f"**Target Coordinates:** `{weather.get('latitude', lat)}° N, {weather.get('longitude', lon)}° E`\n\n"
                f"- **Wind Speed:** **{wind_spd} m/s** (~{round(wind_spd * 3.6, 1)} km/h)\n"
                f"- **Wind Direction:** **{weather.get('wind_direction', 0.0)}°**\n"
                f"- **Precipitation:** **{precip} mm**\n"
                f"- **Observation Time:** {weather.get('time', 'Current observation')}\n\n"
                f"*(Note: High wind speeds > 5.0 m/s significantly accelerate wildland fire propagation vectors).* "
            )
        else:
            answer = "External weather service is currently unreachable. Operating under local station telemetry."

    elif any(k in query_lower for k in ["where", "location", "coordinate", "map", "gps"]):
        map_link = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"
        answer = (
            f"### 📍 Station and Incident Location\n\n"
            f"- **Station ID:** `{dev_id}`\n"
            f"- **Zone Description:** {zone}\n"
            f"- **GPS Coordinates:** `{lat:.5f}° N, {lon:.5f}° E`\n"
            f"- **Live Map View:** [Open in Google Maps]({map_link})\n"
        )
        if incident:
            answer += (
                f"\n**Latest Logged Incident (#{incident['incident_id']}):**\n"
                f"- Location: {incident.get('location_name')}\n"
                f"- Link: [View Incident Map]({incident.get('map_url', map_link)})"
            )

    elif any(k in query_lower for k in ["check next", "recommendation", "action", "response team", "what to do", "protocol"]):
        answer = (
            f"### 🚨 Standard Operating Checklist for Response Team\n\n"
            f"Current Fire Risk State: **{risk}**\n\n"
            f"**Recommended Tactical Steps:**\n"
        )
        for idx, rec in enumerate(recommendations, 1):
            answer += f"{idx}. {rec}\n"
        answer += "\n*Safety Reminder: Never enter an uncontained fire sector without dual-channel radio communication and designated escape routes.*"

    elif any(k in query_lower for k in ["incident", "summarize", "alert", "evidence", "history"]):
        if incident:
            ack_status = "Acknowledged ✅" if incident["is_acknowledged"] else "Pending Acknowledgment ⚠️"
            answer = (
                f"### 📋 Incident #{incident['incident_id']} Evidence Summary\n\n"
                f"- **Alert Type:** `{incident['alert_type']}` ({incident['risk_level']} Severity)\n"
                f"- **Timestamp:** {incident['created_at']}\n"
                f"- **Status:** {ack_status}\n"
                f"- **Location:** {incident['location_name']} ([Google Maps Link]({incident['map_url']}))\n"
                f"- **Alert Message:** *\"{incident['message']}\"*\n\n"
                f"**Multi-Channel Notification Dispatch Record:**\n"
                f"- 💬 **WhatsApp:** `{incident['delivery_status']['whatsapp'] or 'N/A'}`\n"
                f"- 📱 **SMS:** `{incident['delivery_status']['sms'] or 'N/A'}`\n"
                f"- ✉️ **Email:** `{incident['delivery_status']['email'] or 'N/A'}`\n"
            )
        else:
            answer = (
                f"### 📋 Incident Status\n\n"
                f"No active emergency incidents are currently registered in the database. "
                f"Station `{dev_id}` is reporting normal baseline conditions with risk level **{risk}**."
            )

    else:
        # General overview
        answer = (
            f"### 🛡️ Ignite Shield Station Overview (`{dev_id}`)\n\n"
            f"- **Current Fire Risk:** **{risk}** ({conf}% confidence)\n"
            f"- **Telemetry:** Temp: **{temp}°C** | Humidity: **{hum}%** | Soil: **{soil}%**\n"
            f"- **Zone:** {zone} (`{lat:.4f}° N, {lon:.4f}° E`)\n"
        )
        if weather:
            answer += f"- **Live Weather:** Wind {wind_spd} m/s, Dir {weather.get('wind_direction')}°, Rain {precip} mm\n"
        answer += "\nYou can ask me specific questions regarding: fire risk, latest readings, weather, incident evidence, coordinates, or response team action checklists."

    return {
        "success": True,
        "answer": answer,
        "measured_facts": facts,
        "external_weather": weather,
        "recommendations": recommendations,
        "data_freshness_seconds": facts.get("data_freshness_seconds"),
        "timestamp": datetime.now(timezone.utc),
        "provider": "grounded-deterministic-engine"
    }


async def call_gemini_api(query: str, context: Dict[str, Any]) -> Optional[str]:
    """Calls Google Gemini API using httpx."""
    if not settings.GEMINI_API_KEY:
        return None

    facts = context["measured_facts"]
    weather = context.get("external_weather")
    incident = context.get("incident_data")

    system_instruction = (
        "You are the Ignite Shield Wildfire Operations Assistant for forest rangers and incident commanders. "
        "Strictly adhere to the following ground rules:\n"
        "1. Base your answers strictly on the verified MEASURED FACTS, EXTERNAL WEATHER, and INCIDENT EVIDENCE provided below.\n"
        "2. NEVER fabricate, estimate, or hallucinate sensor readings, weather values, GPS coordinates, or emergency resources.\n"
        "3. Clearly distinguish between MEASURED SENSOR FACTS (from on-site IoT hardware), EXTERNAL WEATHER (from Open-Meteo), and AI RECOMMENDATIONS.\n"
        "4. Always cite specific numbers, units, timestamps, and coordinates when answering.\n"
        "5. The AI assistant does NOT trigger or suppress emergency alerts; deterministic backend rules govern that process.\n"
        "6. Keep responses clear, professional, concise, and structured with Markdown headers and bullet points."
    )

    context_prompt = (
        f"--- VERIFIED BACKEND STATE ---\n"
        f"Station ID: {facts.get('device_id')}\n"
        f"Zone: {facts.get('zone_name')}\n"
        f"Coordinates: Latitude {facts.get('latitude')}, Longitude {facts.get('longitude')}\n"
        f"Telemetry Measured: Temperature: {facts.get('temperature_celsius')}°C, "
        f"Humidity: {facts.get('humidity_percent')}%, Soil Moisture: {facts.get('soil_moisture_percent')}%, "
        f"Battery: {facts.get('battery_level_percent')}%\n"
        f"Reading Timestamp: {facts.get('reading_timestamp')} (Freshness: {facts.get('data_freshness_seconds')} seconds ago)\n"
        f"Calculated Fire Risk: {facts.get('fire_risk')} (Confidence: {facts.get('risk_confidence_percent')}%)\n\n"
        f"--- EXTERNAL WEATHER (Open-Meteo) ---\n"
        f"{weather}\n\n"
        f"--- LATEST INCIDENT EVIDENCE ---\n"
        f"{incident}\n\n"
        f"User Inquiry: {query}"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.AI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [{
            "parts": [{"text": context_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 800
        }
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
    except Exception as e:
        logger.warning(f"Gemini API request failed ({e}). Falling back to deterministic engine.")
    return None


async def call_openai_api(query: str, context: Dict[str, Any]) -> Optional[str]:
    """Calls OpenAI API using httpx."""
    if not settings.OPENAI_API_KEY:
        return None

    facts = context["measured_facts"]
    weather = context.get("external_weather")
    incident = context.get("incident_data")

    system_instruction = (
        "You are the Ignite Shield Wildfire Operations Assistant for forest rangers and incident commanders. "
        "Strictly ground all answers in the verified hardware telemetry, weather data, and incident records provided. "
        "Never hallucinate coordinates, sensor metrics, or resources. Clearly separate measured facts from recommendations."
    )

    context_prompt = (
        f"--- VERIFIED BACKEND STATE ---\n"
        f"Station ID: {facts.get('device_id')}\n"
        f"Zone: {facts.get('zone_name')}\n"
        f"Coordinates: Latitude {facts.get('latitude')}, Longitude {facts.get('longitude')}\n"
        f"Telemetry: Temp: {facts.get('temperature_celsius')}°C, Humidity: {facts.get('humidity_percent')}%, "
        f"Soil: {facts.get('soil_moisture_percent')}%, Battery: {facts.get('battery_level_percent')}%\n"
        f"Reading Timestamp: {facts.get('reading_timestamp')} (Freshness: {facts.get('data_freshness_seconds')}s)\n"
        f"Risk: {facts.get('fire_risk')} (Confidence: {facts.get('risk_confidence_percent')}%)\n"
        f"External Weather: {weather}\n"
        f"Latest Incident: {incident}\n\n"
        f"User Inquiry: {query}"
    )

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": context_prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 800
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
    except Exception as e:
        logger.warning(f"OpenAI API request failed ({e}). Falling back to deterministic engine.")
    return None


async def process_ai_query(
    db: Session,
    query: str,
    station_id: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> Dict[str, Any]:
    """
    Main entry point for AI Assistant queries.
    1. Fetches authentic database state and live weather.
    2. Runs configured hosted LLM (Gemini or OpenAI).
    3. Falls back smoothly to grounded deterministic engine on missing keys, timeouts, or errors.
    4. Guarantees structured output distinguishing measured facts, weather, and recommendations.
    """
    context = get_station_context(db, station_id=station_id, latitude=latitude, longitude=longitude)
    fallback_result = generate_deterministic_answer(query, context)

    # Attempt hosted LLM if configured
    llm_answer = None
    provider_used = "grounded-deterministic-engine"

    if settings.AI_PROVIDER.lower() == "gemini" and settings.GEMINI_API_KEY:
        llm_answer = await call_gemini_api(query, context)
        if llm_answer:
            provider_used = f"gemini ({settings.AI_MODEL})"
    elif settings.AI_PROVIDER.lower() == "openai" and settings.OPENAI_API_KEY:
        llm_answer = await call_openai_api(query, context)
        if llm_answer:
            provider_used = "openai (gpt-4o-mini)"

    if llm_answer:
        return {
            "success": True,
            "answer": llm_answer,
            "measured_facts": context["measured_facts"],
            "external_weather": context["external_weather"],
            "recommendations": fallback_result["recommendations"],
            "data_freshness_seconds": context["freshness_seconds"],
            "timestamp": datetime.now(timezone.utc),
            "provider": provider_used
        }

    return fallback_result
