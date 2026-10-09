import os
import smtplib
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional

from dotenv import load_dotenv
from config import settings
from database import SessionLocal

logger = logging.getLogger("ignite_shield.email")

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _load_environment():
    """Ensure .env is loaded from backend directory regardless of current working directory."""
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH)
    load_dotenv()


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


def _sanitize_error_message(err: str, smtp_password: str = "") -> str:
    """Strips SMTP passwords or sensitive tokens from error messages."""
    sanitized = str(err)
    if smtp_password and len(smtp_password) >= 4:
        sanitized = sanitized.replace(smtp_password, "[REDACTED_PASSWORD]")
    return sanitized


def _get_smtp_config():
    """Reads Gmail SMTP configuration from environment variables or settings."""
    _load_environment()
    smtp_host = (os.getenv("SMTP_HOST") or getattr(settings, "SMTP_HOST", "smtp.gmail.com")).strip()
    try:
        smtp_port = int(os.getenv("SMTP_PORT") or getattr(settings, "SMTP_PORT", 587))
    except (ValueError, TypeError):
        smtp_port = 587

    smtp_email = _clean_secret(os.getenv("SMTP_EMAIL") or getattr(settings, "SMTP_EMAIL", ""))
    smtp_password = _clean_secret(os.getenv("SMTP_PASSWORD") or getattr(settings, "SMTP_PASSWORD", ""))
    alert_email = _clean_secret(os.getenv("ALERT_EMAIL") or getattr(settings, "ALERT_EMAIL", ""))

    return smtp_host, smtp_port, smtp_email, smtp_password, alert_email


def generate_email_html(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str,
    confidence: Optional[float],
    location: str,
    timestamp: str,
    device_id: str = "ESP32-NODE-01",
) -> str:
    """Generates a professional, responsive HTML email for HIGH fire risk alerts."""
    conf_str = f"{confidence:.1f}%" if confidence is not None else "High Confidence"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IGNITE SHIELD - HIGH FIRE RISK ALERT</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">🔥 IGNITE SHIELD</h1>
        <p style="margin: 6px 0 0 0; color: #fecaca; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Forest Fire Early Warning System</p>
      </td>
    </tr>
    <!-- Alert Banner -->
    <tr>
      <td style="padding: 24px 24px 12px 24px; text-align: center;">
        <div style="display: inline-block; background-color: rgba(220, 38, 38, 0.15); border: 2px solid #ef4444; border-radius: 8px; padding: 12px 24px;">
          <span style="color: #ef4444; font-size: 18px; font-weight: 800; letter-spacing: 0.5px;">⚠️ HIGH FIRE RISK DETECTED</span>
        </div>
      </td>
    </tr>
    <!-- Details -->
    <tr>
      <td style="padding: 12px 24px 24px 24px;">
        <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #94a3b8; text-align: center;">
          The Random Forest AI model has evaluated live sensor readings and detected dangerous forest conditions exceeding safety thresholds.
        </p>

        <!-- Sensor Readings Table -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 20px; background-color: #0f172a; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">🌡 Temperature</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #f87171; text-align: right;">{temperature:.1f} °C</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">💧 Relative Humidity</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #38bdf8; text-align: right;">{humidity:.1f} %</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">🌱 Soil Moisture</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #4ade80; text-align: right;">{soil_moisture:.1f} %</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">💨 Wind Speed</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #fbbf24; text-align: right;">{wind_speed:.1f} m/s</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">🔥 Risk Level</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 800; color: #ef4444; text-align: right;">{risk_level}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">🤖 Model Confidence</td>
            <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #c084fc; text-align: right;">{conf_str}</td>
          </tr>
        </table>

        <!-- Metadata Box -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px; font-size: 12px; color: #94a3b8; background-color: #0f172a; border-radius: 8px; padding: 12px 16px; border: 1px solid #334155;">
          <tr>
            <td style="padding: 4px 0;">📍 <strong>Location / GPS:</strong> {location}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;">📡 <strong>Sensor / Node ID:</strong> {device_id}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;">🕒 <strong>Alert Timestamp:</strong> {timestamp}</td>
          </tr>
        </table>

        <!-- Action Box -->
        <div style="background-color: #451a03; border-left: 4px solid #f97316; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 13px; font-weight: 600; color: #fdba74;">
            ⚠️ Recommended Action: Verify the reported conditions and inspect the affected area promptly.
          </p>
        </div>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="background-color: #0f172a; padding: 16px 24px; text-align: center; border-top: 1px solid #334155;">
        <p style="margin: 0; font-size: 11px; color: #64748b;">
          This is an automated alert generated by the IGNITE SHIELD Forest Fire Early Warning System.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""


def generate_email_text(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str,
    confidence: Optional[float],
    location: str,
    timestamp: str,
    device_id: str = "ESP32-NODE-01",
) -> str:
    """Generates plain-text alternative of the fire risk alert email."""
    conf_str = f"{confidence:.1f}%" if confidence is not None else "High"
    return (
        f"🚨 IGNITE SHIELD – HIGH FIRE RISK ALERT 🚨\n"
        f"=========================================\n"
        f"Project: IGNITE SHIELD Forest Fire Early Warning System\n"
        f"Alert Type: HIGH FIRE RISK DETECTED\n\n"
        f"Sensor Readings:\n"
        f"  - Temperature: {temperature:.1f} °C\n"
        f"  - Relative Humidity: {humidity:.1f} %\n"
        f"  - Soil Moisture: {soil_moisture:.1f} %\n"
        f"  - Wind Speed: {wind_speed:.1f} m/s\n"
        f"  - Risk Level: {risk_level}\n"
        f"  - Prediction Confidence: {conf_str}\n\n"
        f"Metadata:\n"
        f"  - Location: {location}\n"
        f"  - Sensor Device ID: {device_id}\n"
        f"  - Timestamp: {timestamp}\n\n"
        f"⚠️ Recommended Action: Verify the reported conditions and inspect the affected area promptly.\n\n"
        f"-----------------------------------------\n"
        f"This is an automated emergency notification from IGNITE SHIELD."
    )


def send_email_alert(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha (12.2958° N, 76.6394° E)",
    timestamp: Optional[str] = None,
    device_id: str = "ESP32-NODE-01",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sends an automated Gmail SMTP emergency alert to ALERT_EMAIL.
    CRITICAL: Only sends if risk_level == 'HIGH'.

    Returns:
        dict: {
            "success": bool,
            "status": "SENT" | "FAILED" | "SKIPPED",
            "recipient": Optional[str],
            "error": Optional[str]
        }
    """
    # 1. Safety Check: Verify that risk_level is HIGH
    normalized_risk = str(risk_level).strip().upper() if risk_level else ""
    if normalized_risk != "HIGH":
        logger.info(
            "[Email] Risk level is '%s' (not HIGH). Skipping email alert.",
            risk_level
        )
        return {
            "success": False,
            "status": "SKIPPED",
            "recipient": None,
            "error": f"Risk level is '{risk_level}', email alerts trigger ONLY for HIGH"
        }

    # 2. Read SMTP configuration from environment / settings
    smtp_host, smtp_port, smtp_email, smtp_password, default_recipient = _get_smtp_config()
    recipient = recipient_override or default_recipient

    # 3. Validate configuration
    if not smtp_email or not smtp_password:
        err_msg = "Gmail SMTP credentials missing in configuration (SMTP_EMAIL / SMTP_PASSWORD in .env)"
        logger.error("[Email] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": recipient or None,
            "error": err_msg
        }

    if not recipient:
        err_msg = "Recipient email missing in configuration (ALERT_EMAIL in .env)"
        logger.error("[Email] %s", err_msg)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": None,
            "error": err_msg
        }

    if not timestamp:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # 4. Construct Multipart Email (HTML + Plain text)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "🔥 IGNITE SHIELD - HIGH FIRE RISK ALERT"
    msg["From"] = f"IGNITE SHIELD <{smtp_email}>"
    msg["To"] = recipient

    plain_text = generate_email_text(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level=normalized_risk,
        confidence=confidence,
        location=location,
        timestamp=timestamp,
        device_id=device_id,
    )

    html_content = generate_email_html(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level=normalized_risk,
        confidence=confidence,
        location=location,
        timestamp=timestamp,
        device_id=device_id,
    )

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    # 5. Connect to Gmail SMTP with STARTTLS and send
    try:
        logger.info("[Email] Connecting to Gmail SMTP (%s:%d)...", smtp_host, smtp_port)
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_email, smtp_password)
        server.send_message(msg)
        server.quit()

        logger.info("[Email] High risk alert successfully sent to %s", recipient)
        return {
            "success": True,
            "status": "SENT",
            "recipient": recipient,
            "error": None
        }

    except smtplib.SMTPAuthenticationError as e:
        safe_error = (
            "Gmail SMTP Authentication Failed. Ensure a 16-character Google App Password "
            "is set in SMTP_PASSWORD instead of your regular Gmail account password."
        )
        logger.error("[Email] Authentication error: %s", safe_error)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": recipient,
            "error": safe_error
        }
    except smtplib.SMTPException as e:
        raw_err = f"SMTP protocol error: {str(e)}"
        safe_error = _sanitize_error_message(raw_err, smtp_password)
        logger.error("[Email] Failed to send email alert: %s", safe_error)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": recipient,
            "error": safe_error
        }
    except Exception as e:
        raw_err = f"Email delivery error: {str(e)}"
        safe_error = _sanitize_error_message(raw_err, smtp_password)
        logger.error("[Email] Failed to send email alert: %s", safe_error)
        return {
            "success": False,
            "status": "FAILED",
            "recipient": recipient,
            "error": safe_error
        }


def send_email_test_alert(
    temperature: float = 30.0,
    humidity: float = 70.0,
    soil_moisture: float = 20.0,
    wind_speed: float = 1.5,
    location: str = "Forest Sector Alpha (12.2958° N, 76.6394° E)",
    recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sends a test Email alert to verify Gmail SMTP configuration and recipient delivery.
    Executes synchronously to return immediate feedback to the frontend.
    """
    logger.info("[Email] Test Email alert requested.")
    return send_email_alert(
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        risk_level="HIGH",
        confidence=98.5,
        location=location,
        recipient_override=recipient_override,
    )


def _async_email_dispatcher(
    alert_id: int,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    confidence: Optional[float],
    location: str,
    timestamp_str: str,
):
    """
    Background worker thread to dispatch email without blocking ESP32 sensor telemetry ingestion.
    Opens its own dedicated DB session to update the Alert record status upon completion.
    """
    from models import Alert

    db = SessionLocal()
    try:
        res = send_email_alert(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=wind_speed,
            risk_level="HIGH",
            confidence=confidence,
            location=location,
            timestamp=timestamp_str,
        )

        alert_record = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert_record:
            alert_record.email_status = res.get("status", "FAILED")
            alert_record.email_recipient = res.get("recipient")
            alert_record.email_error = res.get("error")
            db.commit()
            logger.info("[Email] Alert #%d status updated to %s", alert_id, alert_record.email_status)

    except Exception as exc:
        logger.error("[Email] Background worker error for Alert #%d: %s", alert_id, exc)
        try:
            alert_record = db.query(Alert).filter(Alert.id == alert_id).first()
            if alert_record:
                alert_record.email_status = "FAILED"
                alert_record.email_error = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def process_risk_alert_state(
    db,
    current_risk: str,
    confidence: float,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    zone_name: Optional[str] = None,
    prediction_id: Optional[int] = None,
    timestamp: Optional[datetime] = None,
    async_dispatch: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Evaluates risk state transitions, prevents duplicate notifications during continuous HIGH,
    and automatically dispatches multi-channel alerts (Email, SMS, WhatsApp) on transition to HIGH.
    Delegates to the unified notification coordinator while maintaining full backward compatibility.
    """
    from services.notification_service import process_risk_alert_state as coordinator_process
    return coordinator_process(
        db=db,
        current_risk=current_risk,
        confidence=confidence,
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        wind_speed=wind_speed,
        latitude=latitude,
        longitude=longitude,
        zone_name=zone_name,
        prediction_id=prediction_id,
        timestamp=timestamp,
        async_dispatch=async_dispatch,
    )
