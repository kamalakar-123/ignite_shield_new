from fastapi import APIRouter, Depends, HTTPException, status, Response, Header
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func, desc
from typing import List, Optional
from datetime import datetime, timedelta
import csv
import io
import logging

from database import get_db
from models import SensorPrediction, Alert
from config import settings
from schemas import (
    DashboardStats, AlertResponse, AlertAcknowledge, EmailTestResponse,
    SMSTestResponse, WhatsAppTestResponse, MultiChannelTestResponse, ChannelTestResult,
    AnalyticsResponse, AnalyticsDataPoint, RiskDistribution
)
from services.email_service import send_email_test_alert
from services.twilio_service import send_sms_test_alert, send_whatsapp_test_alert
from services.notification_service import dispatch_all_notifications, dispatch_acknowledgement_notification

logger = logging.getLogger("ignite_shield.dashboard")
router = APIRouter()


def verify_admin_authorization(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Enforces authorization on manual alert testing endpoints."""
    if not settings.ADMIN_API_KEY:
        return True
    if x_admin_key and x_admin_key == settings.ADMIN_API_KEY:
        return True
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token == settings.ADMIN_API_KEY or token == settings.JWT_SECRET_KEY:
            return True
    logger.warning("[Security] Unauthorized manual test alert trigger attempt rejected.")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: Admin access required to dispatch test notifications. Set X-Admin-Key header."
    )


def _enrich_alert(a: Alert) -> AlertResponse:
    map_url = None
    if a.latitude is not None and a.longitude is not None:
        map_url = f"https://maps.google.com/?q={a.latitude:.4f},{a.longitude:.4f}"
    res = AlertResponse.model_validate(a)
    res.map_url = map_url
    return res



# ============================================================
# Dashboard Stats — Real DB queries
# ============================================================

@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get real dashboard statistics from the database."""
    total = db.query(sql_func.count(SensorPrediction.id)).scalar() or 0
    high = db.query(sql_func.count(SensorPrediction.id)).filter(
        sql_func.upper(SensorPrediction.fire_risk) == "HIGH"
    ).scalar() or 0
    medium = db.query(sql_func.count(SensorPrediction.id)).filter(
        sql_func.upper(SensorPrediction.fire_risk) == "MEDIUM"
    ).scalar() or 0
    low = db.query(sql_func.count(SensorPrediction.id)).filter(
        sql_func.upper(SensorPrediction.fire_risk) == "LOW"
    ).scalar() or 0

    # Active fires = High risk readings in last 1 hour
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    active_fires = db.query(sql_func.count(SensorPrediction.id)).filter(
        sql_func.upper(SensorPrediction.fire_risk) == "HIGH",
        SensorPrediction.created_at >= one_hour_ago
    ).scalar() or 0

    # Monitored zones = distinct zone names
    zones = db.query(sql_func.count(sql_func.distinct(SensorPrediction.zone_name))).filter(
        SensorPrediction.zone_name.isnot(None)
    ).scalar() or 0
    # If no zones are defined, count total unique readings as "monitored points"
    if zones == 0:
        zones = min(total, 1)  # At least show 1 if we have any data

    latest = db.query(SensorPrediction).order_by(desc(SensorPrediction.created_at)).first()

    return DashboardStats(
        total_readings=total,
        high_risk_count=high,
        medium_risk_count=medium,
        low_risk_count=low,
        active_fires=active_fires,
        monitored_zones=zones,
        system_status="Online" if total > 0 else "No Data",
        last_updated=latest.created_at if latest else None,
        latest_risk=latest.fire_risk if latest else None,
        latest_confidence=latest.confidence if latest else None,
    )


# ============================================================
# Alerts — Generated from high-risk predictions + stored alerts
# ============================================================

@router.get("/alerts", response_model=List[AlertResponse])
def get_alerts(
    risk_level: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get alerts. Auto-generates alerts from high-risk predictions and returns stored alerts."""
    
    # First, auto-generate alerts for high/medium risk predictions that don't have alerts yet
    _auto_generate_alerts(db)
    
    query = db.query(Alert).order_by(desc(Alert.created_at))
    
    if risk_level and risk_level != "All":
        query = query.filter(Alert.risk_level == risk_level)
    
    alerts = query.limit(limit).all()
    return [_enrich_alert(a) for a in alerts]


@router.get("/alerts/latest", response_model=Optional[AlertResponse])
def get_latest_alert(db: Session = Depends(get_db)):
    """
    Return the most recent HIGH-risk emergency alert (or latest alert recorded).
    """
    # Prefer latest HIGH-risk alert
    alert = db.query(Alert).filter(
        sql_func.upper(Alert.risk_level) == "HIGH"
    ).order_by(desc(Alert.created_at)).first()

    if not alert:
        # Fallback to the latest alert of any severity
        alert = db.query(Alert).order_by(desc(Alert.created_at)).first()

    return _enrich_alert(alert) if alert else None


@router.post("/alerts/test", response_model=EmailTestResponse, status_code=status.HTTP_200_OK)
@router.post("/alerts/test-email", response_model=EmailTestResponse, status_code=status.HTTP_200_OK)
def trigger_test_email_alert(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_admin_authorization)
):
    """
    Manual testing endpoint:
    Sends a test Email alert via Gmail SMTP to verify configuration
    and delivery to the forest officer without waiting for a real HIGH prediction.
    """
    res = send_email_test_alert(
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)"
    )

    alert_status = "SENT" if res.get("success") else "FAILED"

    # Record test in alerts history for audit
    alert_record = Alert(
        alert_type="TEST_ALERT",
        risk_level="High",
        message="🔥 IGNITE SHIELD TEST ALERT: Gmail SMTP notification system test verified.",
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)",
        email_status=alert_status,
        email_recipient=res.get("recipient"),
        email_error=res.get("error"),
        sms_status="SKIPPED",
        whatsapp_status="SKIPPED",
        is_acknowledged=True
    )
    db.add(alert_record)
    db.commit()

    return EmailTestResponse(
        success=res.get("success", False),
        status=alert_status,
        message="Test email alert sent successfully" if res.get("success") else f"Failed to send test email: {res.get('error') or 'Delivery error'}",
        recipient=res.get("recipient"),
        error=res.get("error")
    )


@router.post("/alerts/test-sms", response_model=SMSTestResponse, status_code=status.HTTP_200_OK)
def trigger_test_sms_alert(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_admin_authorization)
):
    """
    Manual testing endpoint:
    Sends a test SMS alert via Twilio to verify SMS configuration and delivery.
    """
    res = send_sms_test_alert(
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)"
    )

    alert_status = "SENT" if res.get("success") else "FAILED"

    # Record test in alerts history for audit
    alert_record = Alert(
        alert_type="TEST_ALERT",
        risk_level="High",
        message="📱 IGNITE SHIELD TEST ALERT: Twilio SMS notification system test.",
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)",
        email_status="SKIPPED",
        sms_status=alert_status,
        sms_recipient=res.get("recipient"),
        sms_message_sid=res.get("message_sid"),
        sms_error=res.get("error"),
        whatsapp_status="SKIPPED",
        is_acknowledged=True
    )
    db.add(alert_record)
    db.commit()

    return SMSTestResponse(
        success=res.get("success", False),
        status=alert_status,
        message="Test SMS alert sent successfully" if res.get("success") else f"Failed to send test SMS: {res.get('error') or 'Delivery error'}",
        recipient=res.get("recipient"),
        message_sid=res.get("message_sid"),
        error=res.get("error")
    )


@router.post("/alerts/test-whatsapp", response_model=WhatsAppTestResponse, status_code=status.HTTP_200_OK)
def trigger_test_whatsapp_alert(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_admin_authorization)
):
    """
    Manual testing endpoint:
    Sends a test WhatsApp alert via Twilio to verify WhatsApp configuration and sandbox status.
    """
    res = send_whatsapp_test_alert(
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)"
    )

    alert_status = "SENT" if res.get("success") else "FAILED"

    # Record test in alerts history for audit
    alert_record = Alert(
        alert_type="TEST_ALERT",
        risk_level="High",
        message="💬 IGNITE SHIELD TEST ALERT: Twilio WhatsApp notification system test.",
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)",
        email_status="SKIPPED",
        sms_status="SKIPPED",
        whatsapp_status=alert_status,
        whatsapp_recipient=res.get("recipient"),
        whatsapp_message_sid=res.get("message_sid"),
        whatsapp_error=res.get("error"),
        is_acknowledged=True
    )
    db.add(alert_record)
    db.commit()

    return WhatsAppTestResponse(
        success=res.get("success", False),
        status=alert_status,
        message="Test WhatsApp alert sent successfully" if res.get("success") else f"Failed to send test WhatsApp: {res.get('error') or 'Delivery error'}",
        recipient=res.get("recipient"),
        message_sid=res.get("message_sid"),
        error=res.get("error")
    )


@router.post("/alerts/test-all", response_model=MultiChannelTestResponse, status_code=status.HTTP_200_OK)
@router.post("/alerts/test-channels", response_model=MultiChannelTestResponse, status_code=status.HTTP_200_OK)
def trigger_test_all_channels(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_admin_authorization)
):
    """
    Manual testing endpoint:
    Dispatches test alerts across ALL THREE channels simultaneously:
    1. SMTP Email
    2. Twilio SMS
    3. Twilio WhatsApp
    Each channel executes independently without blocking the others.
    """
    results = dispatch_all_notifications(
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        risk_level="HIGH",
        confidence=98.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)",
    )

    em = results["email"]
    sm = results["sms"]
    wa = results["whatsapp"]

    alert_record = Alert(
        alert_type="TEST_ALERT",
        risk_level="High",
        message="🔔 IGNITE SHIELD TEST ALERT: Multi-Channel (Email + SMS + WhatsApp) dispatch test.",
        temperature=30.0,
        humidity=70.0,
        soil_moisture=20.0,
        wind_speed=1.5,
        location="Forest Sector Alpha (12.2958° N, 76.6394° E)",
        email_status=em.get("status", "FAILED"),
        email_recipient=em.get("recipient"),
        email_error=em.get("error"),
        sms_status=sm.get("status", "FAILED"),
        sms_recipient=sm.get("recipient"),
        sms_message_sid=sm.get("message_sid"),
        sms_error=sm.get("error"),
        whatsapp_status=wa.get("status", "FAILED"),
        whatsapp_recipient=wa.get("recipient"),
        whatsapp_message_sid=wa.get("message_sid"),
        whatsapp_error=wa.get("error"),
        is_acknowledged=True
    )
    db.add(alert_record)
    db.commit()

    return MultiChannelTestResponse(
        success=results["any_success"],
        message="Multi-channel test executed. Inspect individual channel results for details.",
        email=ChannelTestResult(
            success=em.get("success", False),
            status=em.get("status", "FAILED"),
            recipient=em.get("recipient"),
            error=em.get("error"),
        ),
        sms=ChannelTestResult(
            success=sm.get("success", False),
            status=sm.get("status", "FAILED"),
            recipient=sm.get("recipient"),
            message_sid=sm.get("message_sid"),
            error=sm.get("error"),
        ),
        whatsapp=ChannelTestResult(
            success=wa.get("success", False),
            status=wa.get("status", "FAILED"),
            recipient=wa.get("recipient"),
            message_sid=wa.get("message_sid"),
            error=wa.get("error"),
        ),
    )




@router.put("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Acknowledge an alert and dispatch acknowledgement notifications."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_acknowledged = True
    db.commit()

    # Dispatch acknowledgement notification via WhatsApp / SMS / Email
    loc_str = alert.location or (f"Lat: {alert.latitude:.4f}, Lon: {alert.longitude:.4f}" if alert.latitude and alert.longitude else "Forest Sector Alpha")
    ack_res = None
    try:
        ack_res = dispatch_acknowledgement_notification(
            incident_id=alert.id,
            location=loc_str,
            acknowledged_by="Forest Command Center"
        )
    except Exception as e:
        logger.error(f"Error sending acknowledgement notification for alert {alert_id}: {e}")

    return {
        "status": "acknowledged",
        "alert_id": alert_id,
        "notification_dispatched": ack_res is not None and bool(ack_res.get("whatsapp", {}).get("success", False))
    }


def _auto_generate_alerts(db: Session):
    """Auto-generate alerts for high/medium risk predictions that don't have alerts yet."""
    # Get predictions that already have corresponding alerts
    existing_pred_ids = [
        row[0] for row in db.query(Alert.prediction_id).filter(Alert.prediction_id.isnot(None)).all()
    ]
    
    query = db.query(SensorPrediction).filter(
        sql_func.upper(SensorPrediction.fire_risk).in_(["HIGH", "MEDIUM"])
    )
    if existing_pred_ids:
        query = query.filter(~SensorPrediction.id.in_(existing_pred_ids))
    
    new_high_risk = query.order_by(desc(SensorPrediction.created_at)).limit(50).all()
    
    for pred in new_high_risk:
        risk_str = (pred.fire_risk or "").upper()
        conf_pct = pred.confidence * 100 if pred.confidence <= 1.0 else pred.confidence
        if risk_str == "HIGH":
            alert_type = "HIGH_RISK"
            risk_level = "High"
            message = f"🔥 HIGH fire risk detected! Temperature: {pred.temperature}°C, Wind: {pred.wind_speed} m/s. Confidence: {conf_pct:.1f}%"
        else:
            alert_type = "MEDIUM_RISK"
            risk_level = "Medium"
            message = f"⚠️ MEDIUM fire risk detected. Temperature: {pred.temperature}°C, Humidity: {pred.humidity}%. Confidence: {conf_pct:.1f}%"
        
        alert = Alert(
            prediction_id=pred.id,
            alert_type=alert_type,
            risk_level=risk_level,
            zone_name=pred.zone_name,
            message=message,
            latitude=pred.latitude,
            longitude=pred.longitude,
            temperature=pred.temperature,
            humidity=pred.humidity,
            soil_moisture=pred.soil_moisture,
            wind_speed=pred.wind_speed,
            location=pred.zone_name or (f"Lat: {pred.latitude:.4f}, Lon: {pred.longitude:.4f}" if pred.latitude and pred.longitude else "Forest Sector Alpha"),
            email_status="SKIPPED",
            sms_status="SKIPPED",
            whatsapp_status="SKIPPED"
        )
        db.add(alert)

    
    if new_high_risk:
        db.commit()


# ============================================================
# Analytics — Real time-series data from DB
# ============================================================

@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(
    hours: int = 24,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    """Get analytics data: time series and risk distribution from actual DB records."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    readings = db.query(SensorPrediction).filter(
        SensorPrediction.created_at >= cutoff
    ).order_by(SensorPrediction.created_at.asc()).limit(limit).all()
    
    # If no readings in the time window, get the most recent ones
    if not readings:
        readings = db.query(SensorPrediction).order_by(
            SensorPrediction.created_at.asc()
        ).limit(limit).all()
    
    time_series = [
        AnalyticsDataPoint(
            timestamp=r.created_at,
            temperature=r.temperature,
            humidity=r.humidity,
            soil_moisture=r.soil_moisture,
            wind_speed=r.wind_speed,
            fire_risk=r.fire_risk,
        )
        for r in readings
    ]
    
    # Risk distribution
    total = db.query(sql_func.count(SensorPrediction.id)).scalar() or 0
    risk_dist = []
    for level in ["Low", "Medium", "High"]:
        count = db.query(sql_func.count(SensorPrediction.id)).filter(
            sql_func.upper(SensorPrediction.fire_risk) == level.upper()
        ).scalar() or 0
        risk_dist.append(RiskDistribution(
            risk_level=level,
            count=count,
            percentage=round((count / total * 100) if total > 0 else 0, 1)
        ))
    
    return AnalyticsResponse(
        time_series=time_series,
        risk_distribution=risk_dist,
        total_predictions=total,
    )


# ============================================================
# Risk Map — Location-based risk data
# ============================================================

@router.get("/risk-map")
def get_risk_map(db: Session = Depends(get_db)):
    """Get risk map data. Returns latest reading per zone, or all recent readings if no zones defined."""
    # Try to get latest reading per zone
    zones_exist = db.query(SensorPrediction).filter(
        SensorPrediction.zone_name.isnot(None)
    ).first()
    
    if zones_exist:
        # Get latest reading per zone using subquery
        subq = db.query(
            SensorPrediction.zone_name,
            sql_func.max(SensorPrediction.id).label("max_id")
        ).filter(
            SensorPrediction.zone_name.isnot(None)
        ).group_by(SensorPrediction.zone_name).subquery()
        
        readings = db.query(SensorPrediction).join(
            subq, SensorPrediction.id == subq.c.max_id
        ).all()
    else:
        # No zones — return latest readings
        readings = db.query(SensorPrediction).order_by(
            desc(SensorPrediction.created_at)
        ).limit(20).all()
    
    result = []
    for r in readings:
        result.append({
            "id": r.id,
            "temperature": r.temperature,
            "humidity": r.humidity,
            "soil_moisture": r.soil_moisture,
            "wind_speed": r.wind_speed,
            "wind_direction": r.wind_direction,
            "precipitation": r.precipitation,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "zone_name": r.zone_name or f"Sensor-{r.id}",
            "fire_risk": r.fire_risk,
            "confidence": r.confidence,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    
    return result


# ============================================================
# Data Export — CSV download
# ============================================================

@router.get("/export/csv")
def export_csv(
    data_type: str = "sensor",
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """Export data as CSV. data_type: sensor, alerts, all"""
    output = io.StringIO()
    
    if data_type == "alerts":
        _auto_generate_alerts(db)
        alerts = db.query(Alert).order_by(desc(Alert.created_at)).limit(limit).all()
        writer = csv.writer(output)
        writer.writerow(["ID", "Alert Type", "Risk Level", "Zone", "Message", "Acknowledged", "Created At"])
        for a in alerts:
            writer.writerow([a.id, a.alert_type, a.risk_level, a.zone_name or "", a.message, a.is_acknowledged, a.created_at])
    else:
        readings = db.query(SensorPrediction).order_by(desc(SensorPrediction.created_at)).limit(limit).all()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Temperature (°C)", "Humidity (%)", "Soil Moisture (%)",
            "Wind Speed (m/s)", "Wind Direction (°)", "Precipitation (mm)",
            "Latitude", "Longitude", "Zone", "Fire Risk", "Confidence", "Created At"
        ])
        for r in readings:
            writer.writerow([
                r.id, r.temperature, r.humidity, r.soil_moisture,
                r.wind_speed, r.wind_direction or "", r.precipitation or "",
                r.latitude or "", r.longitude or "", r.zone_name or "",
                r.fire_risk, r.confidence, r.created_at
            ])
    
    csv_content = output.getvalue()
    output.close()
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ignite_shield_{data_type}_{datetime.utcnow().strftime('%Y%m%d')}.csv"}
    )
