"""
IGNITE SHIELD - Production ESP32 Telemetry & Incident Simulator
---------------------------------------------------------------
Use this script to test the backend, real-time dashboard, and emergency
multi-channel notifications (WhatsApp, SMS, Email) without physical hardware.

Usage:
    python esp32/simulate_esp32.py
    python esp32/simulate_esp32.py --risk high       # Simulate wildfire trigger
    python esp32/simulate_esp32.py --device ESP32-02 # Simulate secondary node
    python esp32/simulate_esp32.py --once            # Send single packet and exit
"""

import sys
import time
import random
import os
import argparse
import requests
from datetime import datetime, timezone

DEFAULT_API_URL = os.getenv("API_URL", "http://localhost:8000/api/readings/sensor")
DEFAULT_INTERVAL = int(os.getenv("INTERVAL_SECONDS", "10"))
DEFAULT_TOKEN = os.getenv("DEVICE_API_KEY", "")


def generate_telemetry(risk_mode: str = "normal", device_id: str = "ESP32-NODE-01", lat: float = 12.2958, lon: float = 76.6394):
    """Generates realistic telemetry packet matching physical ESP32 firmware."""
    if risk_mode == "high":
        # Critical wildfire conditions: High temp, extreme dry air, dry soil
        temp = round(random.uniform(42.0, 48.5), 1)
        humidity = round(random.uniform(10.0, 18.0), 1)
        soil_moisture = round(random.uniform(5.0, 15.0), 1)
    elif risk_mode == "medium":
        temp = round(random.uniform(33.0, 38.0), 1)
        humidity = round(random.uniform(25.0, 38.0), 1)
        soil_moisture = round(random.uniform(20.0, 35.0), 1)
    elif risk_mode == "low":
        temp = round(random.uniform(22.0, 28.0), 1)
        humidity = round(random.uniform(60.0, 85.0), 1)
        soil_moisture = round(random.uniform(55.0, 80.0), 1)
    else:  # normal
        temp = round(random.uniform(26.0, 36.0), 1)
        humidity = round(random.uniform(35.0, 70.0), 1)
        soil_moisture = round(random.uniform(25.0, 60.0), 1)

    return {
        "device_id": device_id,
        "temperature": temp,
        "humidity": humidity,
        "soil_moisture": soil_moisture,
        "latitude": lat,
        "longitude": lon,
        "battery_level": round(random.uniform(94.0, 99.5), 1),
        "device_status": "online",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def main():
    parser = argparse.ArgumentParser(description="Ignite Shield ESP32 Telemetry Simulator")
    parser.add_argument("--url", default=DEFAULT_API_URL, help=f"Backend sensor endpoint (default: {DEFAULT_API_URL})")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Transmission interval in seconds")
    parser.add_argument("--device", default="ESP32-NODE-01", help="Device identifier")
    parser.add_argument("--token", default=DEFAULT_TOKEN, help="Device authentication token")
    parser.add_argument("--lat", type=float, default=12.2958, help="Station latitude")
    parser.add_argument("--lon", type=float, default=76.6394, help="Station longitude")
    parser.add_argument("--risk", choices=["normal", "high", "medium", "low"], default="normal", help="Preset fire risk mode")
    parser.add_argument("--once", action="store_true", help="Send one packet and exit")
    args = parser.parse_args()

    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["X-Device-Token"] = args.token
        headers["X-API-Key"] = args.token

    print("=" * 65)
    print("  IGNITE SHIELD - Production ESP32 Telemetry Simulator")
    print(f"  Target:     {args.url}")
    print(f"  Device ID:  {args.device} ({args.lat}° N, {args.lon}° E)")
    print(f"  Mode:       {args.risk.upper()}")
    print(f"  Interval:   {args.interval}s")
    print("  Press Ctrl+C to stop")
    print("=" * 65)

    packet_num = 1
    while True:
        payload = generate_telemetry(
            risk_mode=args.risk,
            device_id=args.device,
            lat=args.lat,
            lon=args.lon
        )
        try:
            res = requests.post(args.url, json=payload, headers=headers, timeout=6)
            if res.status_code == 200:
                data = res.json()
                risk = data.get("fire_risk", "N/A")
                conf = data.get("confidence", 0.0)
                print(f"[Packet #{packet_num}] {payload['temperature']}°C | Hum: {payload['humidity']}% | Soil: {payload['soil_moisture']}% -> Status: 200 OK | Risk: {risk} ({conf}%)")
            else:
                print(f"[Packet #{packet_num}] HTTP {res.status_code} Error: {res.text}")
        except Exception as exc:
            print(f"[Packet #{packet_num}] Connection failed: {exc}")

        if args.once:
            break

        packet_num += 1
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
