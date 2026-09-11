from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func, desc
from typing import List, Optional
from datetime import datetime, timedelta
import csv
import io

from database import get_db
from models import SensorPrediction, Alert
from schemas import (
    DashboardStats, AlertResponse, AlertAcknowledge,
    AnalyticsResponse, AnalyticsDataPoint, RiskDistribution
)

router = APIRouter()


# ============================================================
# Dashboard Stats — Real DB queries
# ============================================================

@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get real dashboard statistics from the database."""
    total = db.query(sql_func.count(SensorPrediction.id)).scalar() or 0
    high = db.query(sql_func.count(SensorPrediction.id)).filter(
        SensorPrediction.fire_risk == "High"
    ).scalar() or 0
    medium = db.query(sql_func.count(SensorPrediction.id)).filter(
        SensorPrediction.fire_risk == "Medium"
    ).scalar() or 0
    low = db.query(sql_func.count(SensorPrediction.id)).filter(
        SensorPrediction.fire_risk == "Low"
    ).scalar() or 0

    # Active fires = High risk readings in last 1 hour
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    active_fires = db.query(sql_func.count(SensorPrediction.id)).filter(
        SensorPrediction.fire_risk == "High",
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
    return alerts


@router.put("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Acknowledge an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_acknowledged = True
    db.commit()
    return {"status": "acknowledged", "alert_id": alert_id}


def _auto_generate_alerts(db: Session):
    """Auto-generate alerts for high/medium risk predictions that don't have alerts yet."""
    # Get predictions that already have corresponding alerts
    existing_pred_ids = [
        row[0] for row in db.query(Alert.prediction_id).filter(Alert.prediction_id.isnot(None)).all()
    ]
    
    query = db.query(SensorPrediction).filter(
        SensorPrediction.fire_risk.in_(["High", "Medium"])
    )
    if existing_pred_ids:
        query = query.filter(~SensorPrediction.id.in_(existing_pred_ids))
    
    new_high_risk = query.order_by(desc(SensorPrediction.created_at)).limit(50).all()
    
    for pred in new_high_risk:
        if pred.fire_risk == "High":
            alert_type = "HIGH_RISK"
            risk_level = "High"
            message = f"🔥 HIGH fire risk detected! Temperature: {pred.temperature}°C, Wind: {pred.wind_speed} m/s. Confidence: {pred.confidence:.1%}"
        else:
            alert_type = "MEDIUM_RISK"
            risk_level = "Medium"
            message = f"⚠️ MEDIUM fire risk detected. Temperature: {pred.temperature}°C, Humidity: {pred.humidity}%. Confidence: {pred.confidence:.1%}"
        
        alert = Alert(
            prediction_id=pred.id,
            alert_type=alert_type,
            risk_level=risk_level,
            zone_name=pred.zone_name,
            message=message,
            latitude=pred.latitude,
            longitude=pred.longitude,
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
            SensorPrediction.fire_risk == level
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
