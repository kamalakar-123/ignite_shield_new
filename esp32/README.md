# IGNITE SHIELD - ESP32 Firmware Guide

This directory contains the firmware to flash onto an **ESP32 DevKit** board to automatically stream real-time temperature, humidity, and soil moisture telemetry to the IGNITE SHIELD FastAPI backend.

---

## 1. Hardware Required

| Component | Recommended Model | Purpose |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 / NodeMCU ESP32 | Reads sensors, connects to Wi-Fi, posts HTTP data |
| **Temp & Humidity Sensor** | DHT11 or DHT22 (AM2302) | Ambient temperature (°C) & relative humidity (%) |
| **Soil Moisture Sensor** | Capacitive Soil Moisture v1.2 *(preferred)* or Resistive | Soil moisture level (%) |
| **Jumper Wires & Breadboard**| Male-to-Female / Male-to-Male | Connections |
| **Micro-USB Cable** | Data-capable cable | Flashing and serial monitor |

---

## 2. Wiring & Pinout Diagram

### DHT11 / DHT22 Sensor
* **VCC**: Connect to `3.3V` (or `5V` depending on module)
* **GND**: Connect to ESP32 `GND`
* **DATA**: Connect to **`GPIO 4`**
  *(If using a 3-pin DHT module with built-in resistor, wire directly. If using a bare 4-pin DHT sensor, add a 10kΩ pull-up resistor between VCC and DATA).*

### Soil Moisture Sensor (Analog)
* **VCC**: Connect to `3.3V`
* **GND**: Connect to ESP32 `GND`
* **AOUT (Signal)**: Connect to **`GPIO 34`**
  > **Crucial ESP32 Rule:** Always use **ADC1** pins (such as GPIO 32, 33, 34, 35, 36, 39) for analog readings when Wi-Fi is enabled. **ADC2** pins cannot be used while Wi-Fi is active.

---

## 3. Arduino IDE Setup

1. **Install ESP32 Board Support**:
   - In Arduino IDE, go to **File** → **Preferences**.
   - In *Additional Board Manager URLs*, paste:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to **Tools** → **Board** → **Boards Manager**, search for `esp32` by Espressif Systems and click **Install**.

2. **Install Required Libraries**:
   - Go to **Sketch** → **Include Library** → **Manage Libraries...**
   - Search for and install:
     - **DHT sensor library** (by Adafruit) *(Also install "Adafruit Unified Sensor" when prompted)*
     - **ArduinoJson** (by Benoit Blanchon - version 6.x or 7.x)

---

## 4. Configuration

Open [`esp32/ignite_shield_esp32/ignite_shield_esp32.ino`](file:///c:/Users/vasan/OneDrive/Desktop/major_project/esp32/ignite_shield_esp32/ignite_shield_esp32.ino) in Arduino IDE:

### 1. Set Wi-Fi Credentials
```cpp
const char* WIFI_SSID     = "Your_WiFi_Name";
const char* WIFI_PASSWORD = "Your_WiFi_Password";
```

### 2. Set Backend Server URL
Find your PC's local IPv4 address by opening Windows PowerShell and running:
```powershell
ipconfig
```
Look for `IPv4 Address` under your active Wi-Fi adapter (e.g. `192.168.1.15`). Update:
```cpp
const char* SERVER_URL = "http://192.168.1.15:8000/api/readings/sensor";
```

> **Note on Windows Firewall**: If the ESP32 receives an HTTP timeout error, make sure your laptop allows inbound connections on port 8000 or run your backend bound to `0.0.0.0`:
> ```powershell
> uvicorn main:app --host 0.0.0.0 --port 8000 --reload
> ```

### 3. Sensor Selection
If using **DHT22** instead of DHT11:
```cpp
#define DHTTYPE DHT22
```

---

## 5. Upload & Monitor

1. Connect ESP32 via USB.
2. Select **Tools** → **Board** → **ESP32 Arduino** → **ESP32 Dev Module**.
3. Select your serial port under **Tools** → **Port**.
4. Click **Upload** (arrow icon).
5. Open **Tools** → **Serial Monitor** and set baud rate to **`115200`**.

You will see:
```text
[WiFi] Connecting to: MyWiFiNetwork...
[WiFi] Connected successfully! IP: 192.168.1.42
[DHT] Initializing temperature & humidity sensor...
[Sampling] Reading sensor values...
[Telemetry] Temp: 28.5 C | Humidity: 65.2 % | Soil Moisture: 48.0 %
[HTTP POST] Sending to: http://192.168.1.15:8000/api/readings/sensor
[HTTP] Status: 200 OK
[HTTP] Server Response: {"success":true,"message":"Sensor data received successfully"...}
```

The React dashboard at `http://localhost:5173` or `5174` will immediately receive and display the live telemetry tagged with the **ESP32** badge and run fire risk predictions every 30 seconds!
