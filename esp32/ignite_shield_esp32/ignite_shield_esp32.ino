/*
 * ======================================================================================
 * IGNITE SHIELD - ESP32 Forest Fire Early Detection Telemetry Node (v2.0 Production)
 * ======================================================================================
 *
 * Hardware Connections:
 * --------------------------------------------------------------------------------------
 * 1. DHT11 / DHT22 Sensor (Ambient Temperature & Relative Humidity):
 *    - VCC  -> 3.3V or 5V (depending on module)
 *    - GND  -> ESP32 GND
 *    - DATA -> GPIO 4 (with 10k pull-up resistor if using bare sensor)
 *
 * 2. Capacitive / Resistive Soil Moisture Sensor:
 *    - VCC  -> 3.3V
 *    - GND  -> ESP32 GND
 *    - AOUT -> GPIO 34 (ADC1 - Safe to use alongside active Wi-Fi)
 *    * Note: Do NOT use ADC2 pins (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) with Wi-Fi!
 *
 * Target Endpoint:
 * --------------------------------------------------------------------------------------
 * POST http(s)://<BACKEND_HOST>/api/readings/sensor
 * Headers:
 *   Content-Type: application/json
 *   X-Device-Token: <DEVICE_TOKEN> (Optional if unconfigured on backend)
 *
 * Enriched Payload Format:
 * {
 *   "device_id": "ESP32-NODE-01",
 *   "temperature": 28.5,
 *   "humidity": 72.4,
 *   "soil_moisture": 58.3,
 *   "latitude": 12.2958,
 *   "longitude": 76.6394,
 *   "battery_level": 98.5,
 *   "device_status": "online"
 * }
 * ======================================================================================
 */

#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// ======================================================================================
// CONFIGURATION: Wi-Fi Credentials & Server Address
// ======================================================================================
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Target FastAPI backend URL (supports HTTPS when deployed, or HTTP for local dev):
const char *SERVER_URL = "http://10.195.109.101:8000/api/readings/sensor";

// Device Identification and Security Token:
const char *DEVICE_ID = "ESP32-NODE-01";
const char *DEVICE_TOKEN = "ignite-shield-device-secret"; // Matches DEVICE_API_KEY if configured

// Configured Station GPS Coordinates (Fallback if hardware GPS module is absent):
const float STATION_LATITUDE = 12.2958;
const float STATION_LONGITUDE = 76.6394;

// Telemetry transmit interval (in milliseconds) - default: 15 seconds
const unsigned long SEND_INTERVAL_MS = 15000;

// ======================================================================================
// HARDWARE PIN DEFINITIONS
// ======================================================================================
#define DHTPIN 4      // Digital GPIO connected to DHT data pin
#define DHTTYPE DHT11 // Change to DHT22 if using DHT22 / AM2302 sensor

#define SOIL_PIN 34   // Analog pin ADC1 (GPIO 34)

// Calibration values for Soil Moisture Sensor (12-bit ADC: 0 - 4095):
const int SOIL_AIR_VALUE = 3500;   // Raw ADC reading in dry air (0% moisture)
const int SOIL_WATER_VALUE = 1400; // Raw ADC reading submerged in water (100% moisture)

const int NUM_SOIL_SAMPLES = 10;

// ======================================================================================
// OFFLINE QUEUE (RAM BUFFER FOR TEMPORARY NETWORK OUTAGES)
// ======================================================================================
struct TelemetryPacket {
  float temperature;
  float humidity;
  float soilMoisture;
  float batteryLevel;
  unsigned long uptimeSeconds;
};

#define MAX_OFFLINE_QUEUE 12
TelemetryPacket offlineQueue[MAX_OFFLINE_QUEUE];
int queueCount = 0;

void enqueuePacket(float temp, float hum, float soil, float batt) {
  if (queueCount < MAX_OFFLINE_QUEUE) {
    offlineQueue[queueCount].temperature = temp;
    offlineQueue[queueCount].humidity = hum;
    offlineQueue[queueCount].soilMoisture = soil;
    offlineQueue[queueCount].batteryLevel = batt;
    offlineQueue[queueCount].uptimeSeconds = millis() / 1000;
    queueCount++;
    Serial.printf("[Offline Cache] Packet buffered. Queue count: %d/%d\n", queueCount, MAX_OFFLINE_QUEUE);
  } else {
    // Drop oldest to make room for newest
    for (int i = 0; i < MAX_OFFLINE_QUEUE - 1; i++) {
      offlineQueue[i] = offlineQueue[i + 1];
    }
    offlineQueue[MAX_OFFLINE_QUEUE - 1].temperature = temp;
    offlineQueue[MAX_OFFLINE_QUEUE - 1].humidity = hum;
    offlineQueue[MAX_OFFLINE_QUEUE - 1].soilMoisture = soil;
    offlineQueue[MAX_OFFLINE_QUEUE - 1].batteryLevel = batt;
    offlineQueue[MAX_OFFLINE_QUEUE - 1].uptimeSeconds = millis() / 1000;
    Serial.println("[Offline Cache] Queue full, dropped oldest packet.");
  }
}

// ======================================================================================
// GLOBAL OBJECTS & STATE
// ======================================================================================
DHT dht(DHTPIN, DHTTYPE);
unsigned long lastSendTime = 0;

// ======================================================================================
// HELPER FUNCTIONS
// ======================================================================================

void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("[WiFi] Connection failed. Telemetry will be buffered in offline RAM queue.");
  }
}

float readSoilMoisturePercentage() {
  long sum = 0;
  for (int i = 0; i < NUM_SOIL_SAMPLES; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  int rawValue = sum / NUM_SOIL_SAMPLES;

  float percentage = map(rawValue, SOIL_AIR_VALUE, SOIL_WATER_VALUE, 0, 100);

  if (percentage < 0.0) percentage = 0.0;
  if (percentage > 100.0) percentage = 100.0;

  return percentage;
}

// Simulated battery estimation (returns 98.0 - 100.0% if hardware ADC voltage divider is not installed)
float readBatteryPercentage() {
  return 98.5;
}

bool transmitHttpPacket(float temp, float hum, float soil, float batt) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  if (strlen(DEVICE_TOKEN) > 0) {
    http.addHeader("X-Device-Token", DEVICE_TOKEN);
    http.addHeader("X-API-Key", DEVICE_TOKEN);
  }

  http.setTimeout(8000); // 8 second timeout

  StaticJsonDocument<350> doc;
  doc["device_id"] = DEVICE_ID;
  doc["temperature"] = serialized(String(temp, 1));
  doc["humidity"] = serialized(String(hum, 1));
  doc["soil_moisture"] = serialized(String(soil, 1));
  doc["latitude"] = STATION_LATITUDE;
  doc["longitude"] = STATION_LONGITUDE;
  doc["battery_level"] = serialized(String(batt, 1));
  doc["device_status"] = "online";

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("--------------------------------------------------");
  Serial.print("[HTTP POST] Sending to: ");
  Serial.println(SERVER_URL);
  Serial.print("[HTTP POST] Payload: ");
  Serial.println(requestBody);

  int httpResponseCode = http.POST(requestBody);
  bool success = false;

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Status: %d OK\n", httpResponseCode);
    Serial.print("[HTTP] Server Response: ");
    Serial.println(response);
    success = (httpResponseCode == 200);
  } else {
    Serial.printf("[HTTP] Error on POST: %s (Code: %d)\n",
                  http.errorToString(httpResponseCode).c_str(),
                  httpResponseCode);
  }

  http.end();
  Serial.println("--------------------------------------------------");
  return success;
}

void flushOfflineQueue() {
  if (queueCount == 0 || WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.printf("[Offline Cache] Flushing %d cached packets to backend...\n", queueCount);
  int sent = 0;
  for (int i = 0; i < queueCount; i++) {
    bool ok = transmitHttpPacket(
      offlineQueue[i].temperature,
      offlineQueue[i].humidity,
      offlineQueue[i].soilMoisture,
      offlineQueue[i].batteryLevel
    );
    if (!ok) {
      Serial.printf("[Offline Cache] Flush interrupted at index %d. Will retry remaining.\n", i);
      // Shift remaining items to start
      int remaining = queueCount - i;
      for (int j = 0; j < remaining; j++) {
        offlineQueue[j] = offlineQueue[i + j];
      }
      queueCount = remaining;
      return;
    }
    sent++;
    delay(200); // Brief pacing between bursts
  }
  queueCount = 0;
  Serial.printf("[Offline Cache] Successfully flushed %d cached packets.\n", sent);
}

void sendTelemetry(float temperature, float humidity, float soilMoisture) {
  float battery = readBatteryPercentage();

  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  if (WiFi.status() == WL_CONNECTED) {
    // Flush any previously buffered packets first
    flushOfflineQueue();

    bool sent = transmitHttpPacket(temperature, humidity, soilMoisture, battery);
    if (!sent) {
      enqueuePacket(temperature, humidity, soilMoisture, battery);
    }
  } else {
    enqueuePacket(temperature, humidity, soilMoisture, battery);
  }
}

// ======================================================================================
// ARDUINO SETUP & MAIN LOOP
// ======================================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("   IGNITE SHIELD - ESP32 Telemetry Transmitter v2 ");
  Serial.printf ("   Node ID: %s | Lat: %.4f | Lon: %.4f\n", DEVICE_ID, STATION_LATITUDE, STATION_LONGITUDE);
  Serial.println("==================================================");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(SOIL_PIN, INPUT);

  Serial.println("[DHT] Initializing temperature & humidity sensor...");
  dht.begin();

  connectToWiFi();
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = currentMillis;

    Serial.println("\n[Sampling] Reading sensor values...");

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("[DHT Error] Failed to read from DHT sensor! Check pin connections.");
      return;
    }

    // Physical sensor range sanity check
    if (temperature < -20.0 || temperature > 85.0 || humidity < 0.0 || humidity > 100.0) {
      Serial.printf("[Sensor Warning] Reading out of expected physical bounds: Temp=%.1f, Hum=%.1f. Skipping.\n", temperature, humidity);
      return;
    }

    float soilMoisture = readSoilMoisturePercentage();

    Serial.printf("[Telemetry] Node: %s | Temp: %.1f C | Hum: %.1f %% | Soil: %.1f %%\n",
                  DEVICE_ID, temperature, humidity, soilMoisture);

    sendTelemetry(temperature, humidity, soilMoisture);
  }

  delay(50);
}
