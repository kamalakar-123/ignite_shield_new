import pytest
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure test settings
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEVICE_API_KEY"] = "test-device-secret-token"
os.environ["ADMIN_API_KEY"] = "test-admin-secret-token"
os.environ["TWILIO_ACCOUNT_SID"] = "ACmockaccountsid00000000000000000"
os.environ["TWILIO_AUTH_TOKEN"] = "mockauthtoken00000000000000000"

from database import Base, get_db
from main import app
from config import settings
from models import Device, SensorReading, SensorPrediction, Alert

# Explicitly set settings for test execution
settings.DEVICE_API_KEY = "test-device-secret-token"
settings.ADMIN_API_KEY = "test-admin-secret-token"


# Set up isolated in-memory test database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_db():
    """Clean tables before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


# ==============================================================================
# 1. IoT Ingestion & Device Health Tests
# ==============================================================================

def test_iot_ingestion_valid():
    """Test valid sensor reading payload with valid authentication."""
    headers = {"X-Device-Token": "test-device-secret-token"}
    payload = {
        "temperature": 32.5,
        "humidity": 45.0,
        "soil_moisture": 28.0,
        "device_id": "ESP32-NODE-01",
        "latitude": 12.2958,
        "longitude": 76.6394,
        "battery_level": 94.0
    }

    with patch("api.routes_readings.fetch_live_weather") as mock_weather:
        mock_weather.return_value = {
            "wind_speed": 3.2,
            "wind_direction": 180.0,
            "precipitation": 0.0,
            "time": "2026-10-09T12:00:00",
            "latitude": 12.2958,
            "longitude": 76.6394
        }
        response = client.post("/api/sensor-readings", json=payload, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["sensor_data"]["temperature"] == 32.5
    assert data["sensor_data"]["device_id"] == "ESP32-NODE-01"

    # Verify device registry was created and updated
    db = TestingSessionLocal()
    dev = db.query(Device).filter(Device.device_id == "ESP32-NODE-01").first()
    assert dev is not None
    assert dev.status == "online"
    assert dev.battery_level == 94.0
    db.close()


def test_iot_ingestion_unauthorized():
    """Test that requests with an invalid device token are rejected."""
    headers = {"X-Device-Token": "invalid-wrong-token"}
    payload = {
        "temperature": 32.5,
        "humidity": 45.0,
        "soil_moisture": 28.0,
        "device_id": "ESP32-NODE-01"
    }
    response = client.post("/api/sensor-readings", json=payload, headers=headers)
    assert response.status_code == 401
    assert "Invalid or missing device authentication token" in response.json()["detail"]


def test_iot_ingestion_out_of_bounds_rejected():
    """Test physical sanity validation rejects out-of-range sensor readings."""
    headers = {"X-Device-Token": "test-device-secret-token"}

    # Temperature out of bounds (> 100°C)
    res_temp = client.post("/api/sensor-readings", json={
        "temperature": 150.0,
        "humidity": 50.0,
        "soil_moisture": 30.0
    }, headers=headers)
    assert res_temp.status_code == 422

    # Negative humidity
    res_hum = client.post("/api/sensor-readings", json={
        "temperature": 25.0,
        "humidity": -5.0,
        "soil_moisture": 30.0
    }, headers=headers)
    assert res_hum.status_code == 422


def test_device_fleet_endpoint():
    """Test GET /api/devices returns device health and connectivity status."""
    db = TestingSessionLocal()
    dev = Device(
        device_id="ESP32-NODE-02",
        station_name="Sector Beta Gateway",
        status="online",
        battery_level=88.0,
        latitude=12.3000,
        longitude=76.6400
    )
    db.add(dev)
    db.commit()
    db.close()

    res = client.get("/api/devices")
    assert res.status_code == 200
    devices = res.json()
    assert len(devices) >= 1
    found = [d for d in devices if d["device_id"] == "ESP32-NODE-02"]
    assert len(found) == 1
    assert found[0]["status"] == "online"
    assert found[0]["battery_level"] == 88.0


# ==============================================================================
# 2. Alert Testing Endpoint Authorization Tests
# ==============================================================================

def test_alert_test_endpoints_require_admin_key():
    """Ensure manual test notification endpoints reject unauthorized callers."""
    # Test without auth header
    res_wa = client.post("/api/alerts/test-whatsapp")
    assert res_wa.status_code == 401

    res_sms = client.post("/api/alerts/test-sms")
    assert res_sms.status_code == 401

    res_email = client.post("/api/alerts/test-email")
    assert res_email.status_code == 401

    res_all = client.post("/api/alerts/test-all")
    assert res_all.status_code == 401


def test_alert_test_endpoints_allow_valid_admin_key():
    """Ensure valid admin key allows access to test endpoints."""
    headers = {"X-Admin-Key": "test-admin-secret-token"}
    with patch("api.routes_dashboard.send_whatsapp_test_alert") as mock_wa:
        mock_wa.return_value = {
            "success": True,
            "status": "SENT",
            "message_sid": "SMmock12345",
            "recipient": "whatsapp:+1234567890",
            "error": None
        }
        res = client.post("/api/alerts/test-whatsapp", headers=headers)
        assert res.status_code == 200
        assert res.json()["success"] is True


# ==============================================================================
# 3. Alert Acknowledgement & Map Enrichment Tests
# ==============================================================================

def test_alert_acknowledgement():
    """Test acknowledging an alert and triggering notification dispatch."""
    db = TestingSessionLocal()
    alert = Alert(
        alert_type="HIGH_RISK",
        risk_level="High",
        message="🔥 HIGH fire risk detected!",
        latitude=12.2958,
        longitude=76.6394,
        temperature=42.0,
        humidity=15.0,
        soil_moisture=10.0,
        is_acknowledged=False
    )
    db.add(alert)
    db.commit()
    alert_id = alert.id
    db.close()

    with patch("api.routes_dashboard.dispatch_acknowledgement_notification") as mock_ack:
        mock_ack.return_value = {
            "whatsapp": {"success": True, "status": "SENT"},
            "sms": {"success": True, "status": "SENT"}
        }
        res = client.put(f"/api/alerts/{alert_id}/acknowledge")

    assert res.status_code == 200
    assert res.json()["status"] == "acknowledged"

    # Verify DB was updated
    db = TestingSessionLocal()
    updated = db.query(Alert).filter(Alert.id == alert_id).first()
    assert updated.is_acknowledged is True
    db.close()


# ==============================================================================
# 4. AI Assistant Grounding & Question Verification Tests
# ==============================================================================

def test_ai_chat_questions():
    """
    Test that the AI Assistant answers all 6 key operational questions grounded on real state:
    1. Current fire risk
    2. Latest sensor readings
    3. Weather near incident
    4. Reported incident location
    5. Tactical next checks for response team
    6. Summarize latest incident and available evidence
    """
    db = TestingSessionLocal()
    reading = SensorReading(
        device_id="ESP32-NODE-01",
        temperature=38.5,
        humidity=22.0,
        soil_moisture=14.0,
        battery_level=92.0,
        latitude=12.2958,
        longitude=76.6394
    )
    pred = SensorPrediction(
        temperature=38.5,
        humidity=22.0,
        soil_moisture=14.0,
        wind_speed=4.5,
        fire_risk="HIGH",
        confidence=0.96,
        latitude=12.2958,
        longitude=76.6394,
        zone_name="Forest Sector Alpha"
    )
    alert = Alert(
        prediction_id=1,
        alert_type="HIGH_RISK",
        risk_level="High",
        message="🔥 HIGH fire risk detected in Sector Alpha!",
        latitude=12.2958,
        longitude=76.6394,
        temperature=38.5,
        humidity=22.0,
        soil_moisture=14.0,
        wind_speed=4.5,
        whatsapp_status="SENT",
        is_acknowledged=False
    )
    db.add_all([reading, pred, alert])
    db.commit()
    db.close()

    mock_weather = {
        "wind_speed": 4.5,
        "wind_direction": 120.0,
        "precipitation": 0.0,
        "time": "2026-10-09T14:00:00",
        "latitude": 12.2958,
        "longitude": 76.6394
    }

    with patch("services.ai_service.fetch_live_weather", return_value=mock_weather):
        # 1. Fire risk question
        res1 = client.post("/api/ai/chat", json={"message": "What is the current fire risk at this monitoring station?"})
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["success"] is True
        assert "HIGH" in d1["answer"]
        assert d1["measured_facts"]["temperature_celsius"] == 38.5
        assert d1["measured_facts"]["fire_risk"] == "HIGH"

        # 2. Latest sensor readings question
        res2 = client.post("/api/ai/chat", json={"message": "What are the latest sensor readings?"})
        assert res2.status_code == 200
        d2 = res2.json()
        assert "38.5" in d2["answer"]
        assert "22.0" in d2["answer"]
        assert d2["measured_facts"]["battery_level_percent"] == 92.0

        # 3. Weather question
        res3 = client.post("/api/ai/chat", json={"message": "What is the current weather near the incident?"})
        assert res3.status_code == 200
        d3 = res3.json()
        assert "4.5" in d3["answer"]
        assert d3["external_weather"]["wind_speed"] == 4.5

        # 4. Location question
        res4 = client.post("/api/ai/chat", json={"message": "Where is the reported incident?"})
        assert res4.status_code == 200
        d4 = res4.json()
        assert "12.2958" in d4["answer"]
        assert "Google Maps" in d4["answer"]

        # 5. Response team checklist question
        res5 = client.post("/api/ai/chat", json={"message": "What should the response team check next?"})
        assert res5.status_code == 200
        d5 = res5.json()
        assert len(d5["recommendations"]) > 0

        # 6. Incident evidence summary question
        res6 = client.post("/api/ai/chat", json={"message": "Summarize the latest incident and its available evidence."})
        assert res6.status_code == 200
        d6 = res6.json()
        assert "Incident #" in d6["answer"]
        assert "WhatsApp" in d6["answer"]


def test_ai_context_endpoint():
    """Test inspection of grounding state via GET /api/ai/context."""
    res = client.get("/api/ai/context?station_id=ESP32-NODE-01")
    assert res.status_code == 200
    ctx = res.json()
    assert "measured_facts" in ctx
    assert "coordinates" in ctx
