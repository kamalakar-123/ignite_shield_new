import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from dotenv import load_dotenv
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from config import settings

logger = logging.getLogger("ignite_shield.twilio")

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _load_environment():
    """Ensure .env is loaded from backend directory with override."""
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH, override=True)
    load_dotenv(override=True)


_load_environment()


def _clean_secret(val: Optional[str]) -> str:
    """Strip whitespace, accidental ellipsis, or quote prefixes/suffixes."""
    if not val:
        return ""
    val = str(val).strip().strip("'\"")
    while val.startswith("."):
        val = val[1:]
    while val.endswith("."):
        val = val[:-1]
    return val.strip().strip("'\"")


def _sanitize_error_message(err: str, auth_token: str = "", account_sid: str = "") -> str:
    """Strips Twilio auth tokens or sensitive credentials from error messages."""
    sanitized = str(err)
    if auth_token and len(auth_token) >= 4:
        sanitized = sanitized.replace(auth_token, "[REDACTED_AUTH_TOKEN]")
    if account_sid and len(account_sid) >= 6:
        # Keep prefix of SID for debugging but redact body if found in plaintext
        sanitized = sanitized.replace(account_sid, f"{account_sid[:6]}...[REDACTED]")
    return sanitized


def _get_twilio_config():
    """Reads Twilio configuration from environment variables or settings."""
    _load_environment()
    account_sid = _clean_secret(os.getenv("TWILIO_ACCOUNT_SID") or getattr(settings, "TWILIO_ACCOUNT_SID", ""))
    auth_token = _clean_secret(os.getenv("TWILIO_AUTH_TOKEN") or getattr(settings, "TWILIO_AUTH_TOKEN", ""))
    sms_from = _clean_secret(os.getenv("TWILIO_SMS_FROM") or getattr(settings, "TWILIO_SMS_FROM", "+17372212163"))
    sms_to = _clean_secret(os.getenv("TWILIO_SMS_TO") or getattr(settings, "TWILIO_SMS_TO", "+918431621612"))
    whatsapp_from = _clean_secret(os.getenv("TWILIO_WHATSAPP_FROM") or getattr(settings, "TWILIO_WHATSAPP_FROM", "whatsapp:+17372212163"))
    whatsapp_to = _clean_secret(os.getenv("TWILIO_WHATSAPP_TO") or getattr(settings, "TWILIO_WHATSAPP_TO", "whatsapp:+918431621612"))
    content_sid = _clean_secret(os.getenv("TWILIO_WHATSAPP_CONTENT_SID", ""))

    return {
        "account_sid": account_sid,
        "auth_token": auth_token,
        "sms_from": sms_from,
        "sms_to": sms_to,
        "whatsapp_from": whatsapp_from,
        "whatsapp_to": whatsapp_to,
        "content_sid": content_sid,
    }


def generate_sms_text(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
) -> str:
    """Generates concise, human-readable SMS alert message within standard length limits."""
    time_display = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    conf_str = f" ({confidence:.1f}%)" if confidence is not None else ""
    return (
        f"🔥 IGNITE SHIELD ALERT: {risk_level} Forest Fire Risk{conf_str}\n"
        f"Location: {location}\n"
        f"Temp: {temperature:.1f}C | Hum: {humidity:.1f}% | Soil: {soil_moisture:.1f}% | Wind: {wind_speed:.1f}m/s\n"
        f"Time: {time_display}\n"
        f"Action: Inspect affected location immediately."
    )


def generate_whatsapp_text(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
    incident_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    wind_direction: Optional[float] = None,
    precipitation: Optional[float] = None,
) -> str:
    """Generates formatted WhatsApp alert message with rich markdown, incident ID, maps, and weather."""
    time_display = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    conf_str = f"{confidence:.1f}%" if confidence is not None else "High"
    incident_header = f"🚨 *Incident ID:* #{incident_id}\n" if incident_id else ""

    weather_extra = ""
    if wind_direction is not None and wind_direction > 0:
        weather_extra += f"• 🧭 Wind Direction: *{wind_direction:.0f}°*\n"
    if precipitation is not None and precipitation > 0:
        weather_extra += f"• 🌧 Precipitation: *{precipitation:.1f} mm*\n"

    map_section = ""
    if latitude is not None and longitude is not None:
        map_section = f"🗺️ *Live Incident Map:* https://maps.google.com/?q={latitude:.4f},{longitude:.4f}\n"

    return (
        f"🔥 *IGNITE SHIELD - Forest Fire Alert* 🔥\n"
        f"=================================\n"
        f"{incident_header}"
        f"⚠️ *Status:* *{risk_level} FOREST FIRE RISK DETECTED*\n"
        f"🤖 *Model Confidence:* {conf_str}\n\n"
        f"📊 *Live Sensor Readings:*\n"
        f"• 🌡 Temperature: *{temperature:.1f} °C*\n"
        f"• 💧 Relative Humidity: *{humidity:.1f} %*\n"
        f"• 🌱 Soil Moisture: *{soil_moisture:.1f} %*\n"
        f"• 💨 Wind Speed: *{wind_speed:.1f} m/s*\n"
        f"{weather_extra}\n"
        f"📍 *Location:* {location}\n"
        f"{map_section}"
        f"🕒 *Timestamp:* {time_display}\n\n"
        f"⚠️ *Recommended Action:*\n"
        f"Verify reported telemetry and deploy ground inspection immediately to prevent fire spread.\n"
        f"=================================\n"
        f"_Automated emergency notification from IGNITE SHIELD Early Warning System._"
    )


def generate_whatsapp_acknowledgement_text(
    incident_id: int,
    acknowledged_by: str = "Forest Duty Officer",
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
) -> str:
    """Generates WhatsApp alert acknowledgement message."""
    time_display = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return (
        f"✅ *IGNITE SHIELD - Incident Acknowledged* ✅\n"
        f"=================================\n"
        f"🚨 *Incident ID:* #{incident_id}\n"
        f"📍 *Location:* {location}\n"
        f"👤 *Acknowledged By:* {acknowledged_by}\n"
        f"🕒 *Timestamp:* {time_display}\n\n"
        f"Ground response team has been alerted and telemetry verification is underway.\n"
        f"=================================\n"
        f"_Ignite Shield Incident Response Command._"
    )


def generate_whatsapp_recovery_text(
    incident_id: int,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
) -> str:
    """Generates WhatsApp incident recovery / hazard cleared message."""
    time_display = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return (
        f"🟢 *IGNITE SHIELD - Hazard Cleared / Recovered* 🟢\n"
        f"=================================\n"
        f"🚨 *Incident ID:* #{incident_id}\n"
        f"📍 *Location:* {location}\n"
        f"📊 *Current Sensor Status:*\n"
        f"• 🌡 Temperature: *{temperature:.1f} °C*\n"
        f"• 💧 Relative Humidity: *{humidity:.1f} %*\n"
        f"• 🌱 Soil Moisture: *{soil_moisture:.1f} %*\n"
        f"🕒 *Timestamp:* {time_display}\n\n"
        f"Telemetry indicates fire hazard parameters have returned below alert thresholds.\n"
        f"=================================\n"
        f"_Ignite Shield Early Warning System._"
    )



def send_sms_alert(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
    recipient_override: Optional[str] = None,
    sender_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sends an automated normal SMS alert via Twilio.
    CRITICAL: Only sends if risk_level == 'HIGH'.

    Returns:
        dict: {
            "success": bool,
            "status": "SENT" | "FAILED" | "SKIPPED",
            "recipient": Optional[str],
            "message_sid": Optional[str],
            "error": Optional[str]
        }
    """
    normalized_risk = str(risk_level).strip().upper() if risk_level else ""
    if normalized_risk != "HIGH":
        logger.info("[SMS] Risk level is '%s' (not HIGH). Skipping SMS alert.", risk_level)
        return {
            "success": False,
            "status": "SKIPPED",
            "recipient": None,
            "message_sid": None,
            "error": f"Risk level is '{risk_level}', SMS alerts trigger ONLY for HIGH",
        }

    cfg = _get_twilio_config()
    account_sid = cfg["account_sid"]
    auth_token = cfg["auth_token"]
    from_number = sender_override or cfg["sms_from"]
    to_number = recipient_override or cfg["sms_to"]

    if not account_sid or not auth_token:
        err_msg = "Twilio credentials missing in configuration (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in .env)"
        logger.error("[SMS] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number or None,
            "message_sid": None,
            "error": err_msg,
        }

    if not from_number or not to_number:
        err_msg = "Twilio SMS sender or recipient missing (TWILIO_SMS_FROM / TWILIO_SMS_TO in .env)"
        logger.error("[SMS] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number or None,
            "message_sid": None,
            "error": err_msg,
        }

    # Format numbers (ensure not prefixed with whatsapp: for normal SMS)
    if from_number.startswith("whatsapp:"):
        from_number = from_number.replace("whatsapp:", "")
    if to_number.startswith("whatsapp:"):
        to_number = to_number.replace("whatsapp:", "")

    sms_body = generate_sms_text(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level=normalized_risk,
        confidence=confidence,
        location=location,
        timestamp=timestamp,
    )

    try:
        logger.info("[SMS] Dispatching Twilio SMS from %s to %s...", from_number, to_number)
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            body=sms_body,
            from_=from_number,
            to=to_number,
        )

        msg_sid = getattr(message, "sid", None)
        msg_status = getattr(message, "status", "sent").upper()
        logger.info("[SMS] Twilio accepted SMS. SID: %s, Status: %s", msg_sid, msg_status)

        return {
            "success": True,
            "status": "SENT",
            "recipient": to_number,
            "message_sid": msg_sid,
            "error": None,
        }

    except TwilioRestException as exc:
        raw_err = f"Twilio Error {exc.code}: {exc.msg}"
        safe_err = _sanitize_error_message(raw_err, auth_token, account_sid)
        logger.error("[SMS] Twilio REST Exception: %s", safe_err)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number,
            "message_sid": None,
            "error": safe_err,
        }
    except Exception as exc:
        raw_err = f"SMS Delivery Exception: {str(exc)}"
        safe_err = _sanitize_error_message(raw_err, auth_token, account_sid)
        logger.error("[SMS] General Exception: %s", safe_err)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number,
            "message_sid": None,
            "error": safe_err,
        }


def send_whatsapp_alert(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha",
    timestamp: Optional[str] = None,
    recipient_override: Optional[str] = None,
    sender_override: Optional[str] = None,
    incident_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    wind_direction: Optional[float] = None,
    precipitation: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Sends an automated WhatsApp alert via Twilio with retry handling and metadata.
    CRITICAL: Only sends if risk_level == 'HIGH'.

    Returns:
        dict: {
            "success": bool,
            "status": "SENT" | "FAILED" | "SKIPPED",
            "recipient": Optional[str],
            "message_sid": Optional[str],
            "error": Optional[str]
        }
    """
    normalized_risk = str(risk_level).strip().upper() if risk_level else ""
    if normalized_risk != "HIGH":
        logger.info("[WhatsApp] Risk level is '%s' (not HIGH). Skipping WhatsApp alert.", risk_level)
        return {
            "success": False,
            "status": "SKIPPED",
            "recipient": None,
            "message_sid": None,
            "error": f"Risk level is '{risk_level}', WhatsApp alerts trigger ONLY for HIGH",
        }

    cfg = _get_twilio_config()
    account_sid = cfg["account_sid"]
    auth_token = cfg["auth_token"]
    from_number = sender_override or cfg["whatsapp_from"]
    to_number = recipient_override or cfg["whatsapp_to"]
    content_sid = cfg["content_sid"]

    if not account_sid or not auth_token:
        err_msg = "Twilio credentials missing in configuration (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in .env)"
        logger.error("[WhatsApp] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number or None,
            "message_sid": None,
            "error": err_msg,
        }

    if not from_number or not to_number:
        err_msg = "Twilio WhatsApp sender or recipient missing (TWILIO_WHATSAPP_FROM / TWILIO_WHATSAPP_TO in .env)"
        logger.error("[WhatsApp] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": to_number or None,
            "message_sid": None,
            "error": err_msg,
        }

    # Ensure whatsapp: prefix
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"
    if not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"

    wa_body = generate_whatsapp_text(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level=normalized_risk,
        confidence=confidence,
        location=location,
        timestamp=timestamp,
        incident_id=incident_id,
        latitude=latitude,
        longitude=longitude,
        wind_direction=wind_direction,
        precipitation=precipitation,
    )

    max_attempts = 2
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            logger.info("[WhatsApp] Attempt %d: Dispatching to %s...", attempt, to_number)
            client = Client(account_sid, auth_token)

            if content_sid:
                content_vars = json.dumps({
                    "1": f"{temperature:.1f}",
                    "2": f"{humidity:.1f}",
                    "3": f"{soil_moisture:.1f}",
                    "4": f"{wind_speed:.1f}",
                    "5": location,
                })
                message = client.messages.create(
                    from_=from_number,
                    to=to_number,
                    content_sid=content_sid,
                    content_variables=content_vars,
                )
            else:
                message = client.messages.create(
                    body=wa_body,
                    from_=from_number,
                    to=to_number,
                )

            msg_sid = getattr(message, "sid", None)
            msg_status = getattr(message, "status", "sent").upper()
            logger.info("[WhatsApp] Twilio accepted WhatsApp. SID: %s, Status: %s", msg_sid, msg_status)

            return {
                "success": True,
                "status": "SENT",
                "recipient": to_number,
                "message_sid": msg_sid,
                "error": None,
            }

        except TwilioRestException as exc:
            raw_err = f"Twilio Error {exc.code}: {exc.msg}"
            safe_err = _sanitize_error_message(raw_err, auth_token, account_sid)
            logger.error("[WhatsApp] Twilio REST Exception: %s", safe_err)
            return {
                "success": False,
                "status": "FAILED",
                "recipient": to_number,
                "message_sid": None,
                "error": safe_err,
            }
        except Exception as exc:
            raw_err = f"WhatsApp Delivery Exception: {str(exc)}"
            safe_err = _sanitize_error_message(raw_err, auth_token, account_sid)
            last_error = safe_err
            if attempt < max_attempts:
                logger.warning("[WhatsApp] Delivery attempt %d failed: %s. Retrying...", attempt, safe_err)

    return {
        "success": False,
        "status": "FAILED",
        "recipient": to_number,
        "message_sid": None,
        "error": last_error or "Delivery failed after retries",
    }


def send_whatsapp_acknowledgement_alert(
    incident_id: int,
    acknowledged_by: str = "Forest Duty Officer",
    location: str = "Forest Sector Alpha",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Sends a WhatsApp confirmation that an incident was acknowledged."""
    cfg = _get_twilio_config()
    account_sid = cfg["account_sid"]
    auth_token = cfg["auth_token"]
    from_number = cfg["whatsapp_from"]
    to_number = recipient_override or cfg["whatsapp_to"]

    if not account_sid or not auth_token or not from_number or not to_number:
        return {"success": False, "status": "FAILED", "error": "Twilio configuration incomplete"}

    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"
    if not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"

    msg_body = generate_whatsapp_acknowledgement_text(
        incident_id=incident_id,
        acknowledged_by=acknowledged_by,
        location=location,
    )

    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(body=msg_body, from_=from_number, to=to_number)
        return {"success": True, "status": "SENT", "recipient": to_number, "message_sid": getattr(message, "sid", None), "error": None}
    except Exception as exc:
        safe_err = _sanitize_error_message(str(exc), auth_token, account_sid)
        logger.error("[WhatsApp Ack] Error: %s", safe_err)
        return {"success": False, "status": "FAILED", "recipient": to_number, "error": safe_err}


def send_whatsapp_recovery_alert(
    incident_id: int,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    location: str = "Forest Sector Alpha",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Sends a WhatsApp confirmation that conditions have returned to normal / recovered."""
    cfg = _get_twilio_config()
    account_sid = cfg["account_sid"]
    auth_token = cfg["auth_token"]
    from_number = cfg["whatsapp_from"]
    to_number = recipient_override or cfg["whatsapp_to"]

    if not account_sid or not auth_token or not from_number or not to_number:
        return {"success": False, "status": "FAILED", "error": "Twilio configuration incomplete"}

    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"
    if not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"

    msg_body = generate_whatsapp_recovery_text(
        incident_id=incident_id,
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        location=location,
    )

    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(body=msg_body, from_=from_number, to=to_number)
        return {"success": True, "status": "SENT", "recipient": to_number, "message_sid": getattr(message, "sid", None), "error": None}
    except Exception as exc:
        safe_err = _sanitize_error_message(str(exc), auth_token, account_sid)
        logger.error("[WhatsApp Recovery] Error: %s", safe_err)
        return {"success": False, "status": "FAILED", "recipient": to_number, "error": safe_err}



def send_sms_test_alert(
    temperature: float = 30.0,
    humidity: float = 70.0,
    soil_moisture: float = 20.0,
    wind_speed: float = 1.5,
    location: str = "Forest Sector Alpha (12.2958° N, 76.6394° E)",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Sends a synchronous test SMS alert to verify Twilio SMS delivery."""
    logger.info("[SMS] Test SMS alert requested.")
    return send_sms_alert(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level="HIGH",
        confidence=98.5,
        location=location,
        recipient_override=recipient_override,
    )


def send_whatsapp_test_alert(
    temperature: float = 30.0,
    humidity: float = 70.0,
    soil_moisture: float = 20.0,
    wind_speed: float = 1.5,
    location: str = "Forest Sector Alpha (12.2958° N, 76.6394° E)",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Sends a synchronous test WhatsApp alert to verify Twilio WhatsApp delivery."""
    logger.info("[WhatsApp] Test WhatsApp alert requested.")
    return send_whatsapp_alert(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level="HIGH",
        confidence=98.5,
        location=location,
        recipient_override=recipient_override,
    )
