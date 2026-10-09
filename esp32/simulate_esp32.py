"""
IGNITE SHIELD - Simulated ESP32 Telemetry Generator
---------------------------------------------------
Use this script to test the backend and dashboard without needing physical ESP32 hardware.
It periodically sends randomized realistic sensor packets (Temperature, Humidity, Soil Moisture)
to the FastAPI endpoint: POST http://localhost:8000/api/readings/sensor
"""

import time
import random
import requests

API_URL = "http://localhost:8000/api/readings/sensor"
INTERVAL_SECONDS = 10

def generate_telemetry():
    # Realistic forest conditions
    temp = round(random.uniform(24.0, 38.5), 1)
    humidity = round(random.uniform(30.0, 75.0), 1)
    soil_moisture = round(random.uniform(20.0, 65.0), 1)
    return {
        "temperature": temp,
        "humidity": humidity,
        "soil_moisture": soil_moisture
    }

def main():
    print("==================================================")
    print("  IGNITE SHIELD - ESP32 Telemetry Simulator       ")
    print(f"  Target: {API_URL} (every {INTERVAL_SECONDS}s)  ")
    print("  Press Ctrl+C to stop                            ")
    print("==================================================")

    packet_num = 1
    while True:
        payload = generate_telemetry()
        try:
            res = requests.post(API_URL, json=payload, timeout=5)
            if res.status_code == 200:
                data = res.json()
                print(f"[Packet #{packet_num}] Sent: {payload} -> Status 200 OK | Message: {data.get('message')}")
            else:
                print(f"[Packet #{packet_num}] Error: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[Packet #{packet_num}] Connection failed: {e}")
        
        packet_num += 1
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
