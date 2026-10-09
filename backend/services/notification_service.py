import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from database import SessionLocal
from services.email_service import send_email_alert, _get_smtp_config
from services.twilio_service import send_sms_alert, send_whatsapp_alert, _get_twilio_config

logger = logging.getLogger("ignite_shield.notifications")


def dispatch_all_notifications(
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    risk_level: str = "HIGH",
    confidence: Optional[float] = None,
    location: str = "Forest Sector Alpha (12.2958° N, 76.6394° E)",
    timestamp: Optional[str] = None,
    device_id: str = "ESP32-NODE-01",
    email_recipient: Optional[str] = None,
    sms_recipient: Optional[str] = None,
    whatsapp_recipient: Optional[str] = None,
    incident_id: Optional[int] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    wind_direction: Optional[float] = None,
    precipitation: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Coordinates simultaneous dispatch of all three notification channels:
    1. SMTP Email (preserves existing implementation)
    2. Twilio SMS
    3. Twilio WhatsApp

    Each channel executes in complete isolation:
    - Failure in SMS or WhatsApp does not affect Email.
    - Failure in Email does not affect SMS or WhatsApp.
    - Captures and records delivery status, message SIDs, and sanitized errors for each channel.
    """
    normalized_risk = str(risk_level).strip().upper() if risk_level else ""

    if normalized_risk != "HIGH":
        logger.info(
            "[Notification Coordinator] Risk is '%s' (not HIGH). Skipping all notifications.",
            risk_level
        )
        skipped_channel = {
            "success": False,
            "status": "SKIPPED",
            "recipient": None,
            "error": f"Risk level is '{risk_level}', notifications trigger ONLY for HIGH",
        }
        return {
            "email": skipped_channel,
            "sms": skipped_channel,
            "whatsapp": skipped_channel,
            "any_success": False,
        }

    time_str = timestamp or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # -------------------------------------------------------------
    # Channel 1: SMTP Email (Preserve existing implementation)
    # -------------------------------------------------------------
    email_result: Dict[str, Any] = {"success": False, "status": "FAILED", "recipient": None, "error": "Not attempted"}
    try:
        logger.info("[Notification Coordinator] Attempting Channel 1: SMTP Email...")
        email_result = send_email_alert(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=wind_speed,
            risk_level=normalized_risk,
            confidence=confidence,
            location=location,
            timestamp=time_str,
            device_id=device_id,
            recipient_override=email_recipient,
        )
        logger.info("[Notification Coordinator] Email channel completed: status=%s", email_result.get("status"))
    except Exception as exc:
        logger.error("[Notification Coordinator] Unexpected error in SMTP Email channel: %s", exc)
        email_result = {
            "success": False,
            "status": "FAILED",
            "recipient": email_recipient,
            "error": f"SMTP Email handler error: {str(exc)}",
        }

    # -------------------------------------------------------------
    # Channel 2: Twilio SMS (Attempted independently)
    # -------------------------------------------------------------
    sms_result: Dict[str, Any] = {"success": False, "status": "FAILED", "recipient": None, "error": "Not attempted"}
    try:
        logger.info("[Notification Coordinator] Attempting Channel 2: Twilio SMS...")
        sms_result = send_sms_alert(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=wind_speed,
            risk_level=normalized_risk,
            confidence=confidence,
            location=location,
            timestamp=time_str,
            recipient_override=sms_recipient,
        )
        logger.info("[Notification Coordinator] SMS channel completed: status=%s", sms_result.get("status"))
    except Exception as exc:
        logger.error("[Notification Coordinator] Unexpected error in Twilio SMS channel: %s", exc)
        sms_result = {
            "success": False,
            "status": "FAILED",
            "recipient": sms_recipient,
            "message_sid": None,
            "error": f"Twilio SMS handler error: {str(exc)}",
        }

    # -------------------------------------------------------------
    # Channel 3: Twilio WhatsApp (Attempted independently)
    # -------------------------------------------------------------
    whatsapp_result: Dict[str, Any] = {"success": False, "status": "FAILED", "recipient": None, "error": "Not attempted"}
    try:
        logger.info("[Notification Coordinator] Attempting Channel 3: Twilio WhatsApp...")
        whatsapp_result = send_whatsapp_alert(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=wind_speed,
            risk_level=normalized_risk,
            confidence=confidence,
            location=location,
            timestamp=time_str,
            recipient_override=whatsapp_recipient,
            incident_id=incident_id,
            latitude=latitude,
            longitude=longitude,
            wind_direction=wind_direction,
            precipitation=precipitation,
        )
        logger.info("[Notification Coordinator] WhatsApp channel completed: status=%s", whatsapp_result.get("status"))
    except Exception as exc:
        logger.error("[Notification Coordinator] Unexpected error in Twilio WhatsApp channel: %s", exc)
        whatsapp_result = {
            "success": False,
            "status": "FAILED",
            "recipient": whatsapp_recipient,
            "message_sid": None,
            "error": f"Twilio WhatsApp handler error: {str(exc)}",
        }

    any_success = bool(email_result.get("success") or sms_result.get("success") or whatsapp_result.get("success"))

    return {
        "email": email_result,
        "sms": sms_result,
        "whatsapp": whatsapp_result,
        "any_success": any_success,
    }


def _async_notification_dispatcher(
    alert_id: int,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    wind_speed: float,
    confidence: Optional[float],
    location: str,
    timestamp_str: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    wind_direction: Optional[float] = None,
    precipitation: Optional[float] = None,
):
    """
    Background worker thread to dispatch all 3 channels without blocking ESP32 telemetry ingestion.
    Updates the Alert database record with delivery statuses, SIDs, and errors for each channel.
    """
    from models import Alert

    db = SessionLocal()
    try:
        results = dispatch_all_notifications(
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            wind_speed=wind_speed,
            risk_level="HIGH",
            confidence=confidence,
            location=location,
            timestamp=timestamp_str,
            incident_id=alert_id,
            latitude=latitude,
            longitude=longitude,
            wind_direction=wind_direction,
            precipitation=precipitation,
        )

        alert_record = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert_record:
            # Email fields
            em = results["email"]
            alert_record.email_status = em.get("status", "FAILED")
            alert_record.email_recipient = em.get("recipient")
            alert_record.email_error = em.get("error")

            # SMS fields
            sm = results["sms"]
            alert_record.sms_status = sm.get("status", "FAILED")
            alert_record.sms_recipient = sm.get("recipient")
            alert_record.sms_message_sid = sm.get("message_sid")
            alert_record.sms_error = sm.get("error")

            # WhatsApp fields
            wa = results["whatsapp"]
            alert_record.whatsapp_status = wa.get("status", "FAILED")
            alert_record.whatsapp_recipient = wa.get("recipient")
            alert_record.whatsapp_message_sid = wa.get("message_sid")
            alert_record.whatsapp_error = wa.get("error")

            db.commit()
            logger.info(
                "[Notification Worker] Alert #%d updated: Email=%s, SMS=%s, WhatsApp=%s",
                alert_id,
                alert_record.email_status,
                alert_record.sms_status,
                alert_record.whatsapp_status,
            )

    except Exception as exc:
        logger.error("[Notification Worker] Background dispatch error for Alert #%d: %s", alert_id, exc)
        try:
            alert_record = db.query(Alert).filter(Alert.id == alert_id).first()
            if alert_record:
                if alert_record.email_status == "PENDING":
                    alert_record.email_status = "FAILED"
                    alert_record.email_error = str(exc)
                if alert_record.sms_status == "PENDING":
                    alert_record.sms_status = "FAILED"
                    alert_record.sms_error = str(exc)
                if alert_record.whatsapp_status == "PENDING":
                    alert_record.whatsapp_status = "FAILED"
                    alert_record.whatsapp_error = str(exc)
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
    cooldown_minutes: int = 30,
) -> Optional[Dict[str, Any]]:
    """
    Evaluates risk state transitions, prevents duplicate notifications during continuous HIGH,
    and automatically dispatches Email, SMS, and WhatsApp alerts on transition to HIGH.

    Logic:
      - previous_risk != 'HIGH' and current_risk == 'HIGH' -> DISPATCH ALL 3 & Record Alert
      - previous_risk == 'HIGH' and current_risk == 'HIGH' ->
          If within cooldown_minutes -> DO NOT Send (Continuous HIGH duplicate suppressed)
          If past cooldown_minutes -> RE-ALERT allowed
      - current_risk in ['LOW', 'MEDIUM'] -> DO NOT Send (Skipped)
      - Transition from LOW/MEDIUM back to HIGH later -> NEW ALERT dispatched across all 3 channels!
    """
    from models import Alert, SensorPrediction

    normalized_current = (current_risk or "").strip().upper()

    # 1. Determine previous risk state from PostgreSQL sensor_predictions table
    query = db.query(SensorPrediction)
    if prediction_id is not None:
        query = query.filter(SensorPrediction.id != prediction_id)
    previous_prediction = query.order_by(SensorPrediction.id.desc()).first()

    previous_risk = (
        previous_prediction.fire_risk.strip().upper()
        if (previous_prediction and previous_prediction.fire_risk)
        else None
    )

    logger.info(
        "[Risk State Check] Current: '%s' | Previous: '%s'",
        normalized_current,
        previous_risk or "NONE"
    )

    # 2. Check risk transition
    if normalized_current == "HIGH":
        # Check if continuous HIGH and whether cooldown has expired
        is_continuous_high = previous_risk == "HIGH"
        allow_dispatch = not is_continuous_high

        if is_continuous_high and cooldown_minutes > 0:
            # Check last HIGH alert timestamp for cooldown policy
            last_high_alert = (
                db.query(Alert)
                .filter(Alert.risk_level == "High")
                .order_by(Alert.id.desc())
                .first()
            )
            if last_high_alert and last_high_alert.created_at:
                now_utc = datetime.now(timezone.utc)
                last_time = last_high_alert.created_at
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=timezone.utc)
                if (now_utc - last_time) >= timedelta(minutes=cooldown_minutes):
                    logger.info(
                        "[Notification Coordinator] Cooldown of %d minutes expired during continuous HIGH. Re-alert triggered.",
                        cooldown_minutes,
                    )
                    allow_dispatch = True

        if allow_dispatch:
            logger.info(
                "[Notification Coordinator] HIGH RISK ALERT TRIGGERED (previous='%s'). Initiating all 3 channels.",
                previous_risk or "INITIAL",
            )

            location_str = zone_name or (
                f"Forest Sector Alpha (Lat: {latitude:.4f}° N, Lon: {longitude:.4f}° E)"
                if (latitude and longitude)
                else "Forest Sector Alpha (12.2958° N, 76.6394° E)"
            )
            time_str = (
                timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
                if timestamp
                else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            )

            _, _, _, _, alert_email_recipient = _get_smtp_config()
            twilio_cfg = _get_twilio_config()
            sms_recipient = twilio_cfg["sms_to"]
            whatsapp_recipient = twilio_cfg["whatsapp_to"]

            conf_pct = confidence * 100 if confidence <= 1.0 else confidence

            # 3. Persist Alert in database
            alert_record = None
            try:
                if prediction_id is not None:
                    alert_record = db.query(Alert).filter(Alert.prediction_id == prediction_id).first()

                if not alert_record:
                    alert_record = Alert(
                        prediction_id=prediction_id,
                        alert_type="HIGH_RISK",
                        risk_level="High",
                        zone_name=zone_name,
                        message=f"🔥 HIGH fire risk detected! Temperature: {temperature:.1f}°C, Wind: {wind_speed:.1f} m/s. Confidence: {conf_pct:.1f}%",
                        latitude=latitude,
                        longitude=longitude,
                        temperature=temperature,
                        humidity=humidity,
                        soil_moisture=soil_moisture,
                        wind_speed=wind_speed,
                        location=location_str,
                        email_status="PENDING" if async_dispatch else None,
                        email_recipient=alert_email_recipient,
                        sms_status="PENDING" if async_dispatch else None,
                        sms_recipient=sms_recipient,
                        whatsapp_status="PENDING" if async_dispatch else None,
                        whatsapp_recipient=whatsapp_recipient,
                    )
                    db.add(alert_record)
                    db.commit()
                    db.refresh(alert_record)
                else:
                    alert_record.email_status = "PENDING" if async_dispatch else alert_record.email_status
                    alert_record.email_recipient = alert_email_recipient
                    alert_record.sms_status = "PENDING" if async_dispatch else alert_record.sms_status
                    alert_record.sms_recipient = sms_recipient
                    alert_record.whatsapp_status = "PENDING" if async_dispatch else alert_record.whatsapp_status
                    alert_record.whatsapp_recipient = whatsapp_recipient
                    db.commit()
            except Exception as db_exc:
                logger.error("[Alert DB] Failed to save alert record: %s", db_exc)
                db.rollback()

            # 4. Dispatch all 3 channels (Async background thread or synchronous)
            if async_dispatch and alert_record:
                thread = threading.Thread(
                    target=_async_notification_dispatcher,
                    args=(
                        alert_record.id,
                        temperature,
                        humidity,
                        soil_moisture,
                        wind_speed,
                        conf_pct,
                        location_str,
                        time_str,
                        latitude,
                        longitude,
                    ),
                    daemon=True,
                )
                thread.start()
                return {
                    "success": True,
                    "status": "PENDING",
                    "alert_id": alert_record.id,
                    "email": {"status": "PENDING", "recipient": alert_email_recipient},
                    "sms": {"status": "PENDING", "recipient": sms_recipient},
                    "whatsapp": {"status": "PENDING", "recipient": whatsapp_recipient},
                    "error": None,
                }
            else:
                dispatch_res = dispatch_all_notifications(
                    temperature=temperature,
                    humidity=humidity,
                    soil_moisture=soil_moisture,
                    wind_speed=wind_speed,
                    risk_level="HIGH",
                    confidence=conf_pct,
                    location=location_str,
                    timestamp=time_str,
                    incident_id=alert_record.id,
                    latitude=latitude,
                    longitude=longitude,
                )
                if alert_record:
                    try:
                        em = dispatch_res["email"]
                        alert_record.email_status = em.get("status", "FAILED")
                        alert_record.email_recipient = em.get("recipient")
                        alert_record.email_error = em.get("error")

                        sm = dispatch_res["sms"]
                        alert_record.sms_status = sm.get("status", "FAILED")
                        alert_record.sms_recipient = sm.get("recipient")
                        alert_record.sms_message_sid = sm.get("message_sid")
                        alert_record.sms_error = sm.get("error")

                        wa = dispatch_res["whatsapp"]
                        alert_record.whatsapp_status = wa.get("status", "FAILED")
                        alert_record.whatsapp_recipient = wa.get("recipient")
                        alert_record.whatsapp_message_sid = wa.get("message_sid")
                        alert_record.whatsapp_error = wa.get("error")

                        db.commit()
                    except Exception as db_up_err:
                        logger.error("[Alert DB] Failed to update alert statuses: %s", db_up_err)
                        db.rollback()

                return dispatch_res

        else:
            # Continuous HIGH duplicate suppressed
            logger.info(
                "[Notification Coordinator] Continuous HIGH state (previous was HIGH). Duplicate notifications suppressed."
            )
            return {
                "success": True,
                "status": "SUPPRESSED",
                "email": {"status": "SUPPRESSED"},
                "sms": {"status": "SUPPRESSED"},
                "whatsapp": {"status": "SUPPRESSED"},
                "error": None,
            }

    else:
        # LOW or MEDIUM: Skip notifications
        logger.info(
            "[Notification Coordinator] Prediction is '%s' (not HIGH). No notifications triggered.",
            normalized_current,
        )
        return {
            "success": False,
            "status": "SKIPPED",
            "email": {"status": "SKIPPED"},
            "sms": {"status": "SKIPPED"},
            "whatsapp": {"status": "SKIPPED"},
            "error": None,
        }


def dispatch_acknowledgement_notification(
    incident_id: int,
    acknowledged_by: str = "Forest Duty Officer",
    location: str = "Forest Sector Alpha",
) -> Dict[str, Any]:
    """Dispatches a WhatsApp acknowledgement message when an alert is acknowledged."""
    from services.twilio_service import send_whatsapp_acknowledgement_alert
    try:
        return send_whatsapp_acknowledgement_alert(
            incident_id=incident_id,
            acknowledged_by=acknowledged_by,
            location=location,
        )
    except Exception as exc:
        logger.error("[Ack Notification] Error dispatching ack message: %s", exc)
        return {"success": False, "status": "FAILED", "error": str(exc)}


def dispatch_recovery_notification(
    incident_id: int,
    temperature: float,
    humidity: float,
    soil_moisture: float,
    location: str = "Forest Sector Alpha",
) -> Dict[str, Any]:
    """Dispatches a WhatsApp recovery notification when fire hazard conditions normalize."""
    from services.twilio_service import send_whatsapp_recovery_alert
    try:
        return send_whatsapp_recovery_alert(
            incident_id=incident_id,
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            location=location,
        )
    except Exception as exc:
        logger.error("[Recovery Notification] Error dispatching recovery message: %s", exc)
        return {"success": False, "status": "FAILED", "error": str(exc)}

