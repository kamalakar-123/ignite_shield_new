/*
 * ============================================================
 * IGNITE SHIELD - ESP32 SENSOR + FASTAPI
 * ============================================================
 *
 * Sensors:
 *   DHT11:
 *     VCC  -> 3.3V
 *     GND  -> GND
 *     DATA -> GPIO 4
 *
 *   Soil Moisture:
 *     VCC  -> 3.3V
 *     GND  -> GND
 *     AO   -> GPIO 34
 *
 * Data sent to FastAPI:
 *   Temperature
 *   Humidity
 *   Soil Moisture
 *
 * ============================================================
 */

#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// ============================================================
// WIFI SETTINGS
// ============================================================

const char *WIFI_SSID = "motorola50";
const char *WIFI_PASSWORD = "123456789";

// IMPORTANT:
// This must be the LOCAL IP address of the laptop running
// your FastAPI backend.
//
// Example:
// http://192.168.1.100:8000/api/readings/sensor
//
const char *SERVER_URL = "http://10.83.29.101:8000/api/readings/sensor";

// ============================================================
// SENSOR SETTINGS
// ============================================================

#define DHTPIN 4
#define DHTTYPE DHT11

#define SOIL_PIN 34

DHT dht(DHTPIN, DHTTYPE);

// ============================================================
// SOIL MOISTURE CALIBRATION
// ============================================================

#define SOIL_DRY 4095
#define SOIL_WET 1200

#define NUM_SAMPLES 10

// ============================================================
// SEND INTERVAL
// ============================================================

// Send data every 5 seconds
const unsigned long SEND_INTERVAL = 10000;

unsigned long lastSendTime = 0;

// ============================================================
// CONNECT TO WIFI
// ============================================================

void connectToWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println();
  Serial.println("[WiFi] Connecting...");

  WiFi.mode(WIFI_STA);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 30) {

    delay(500);

    Serial.print(".");

    attempts++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("[WiFi] Connected!");

    Serial.print("[WiFi] ESP32 IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("[WiFi] Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

  } else {

    Serial.println("[WiFi] Connection failed.");
  }
}

// ============================================================
// READ SOIL MOISTURE
// ============================================================

float readSoilMoisture() {

  long total = 0;

  for (int i = 0; i < NUM_SAMPLES; i++) {

    total += analogRead(SOIL_PIN);

    delay(10);
  }

  int rawValue = total / NUM_SAMPLES;

  float moisture = map(rawValue, SOIL_DRY, SOIL_WET, 0, 100);

  moisture = constrain(moisture, 0, 100);

  Serial.print("[Sensor] Soil Raw: ");
  Serial.println(rawValue);

  return moisture;
}

// ============================================================
// SEND DATA TO FASTAPI
// ============================================================

void sendSensorData(float temperature, float humidity, float soilMoisture) {

  // Check Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("[HTTP] Wi-Fi disconnected.");

    connectToWiFi();

    if (WiFi.status() != WL_CONNECTED) {

      Serial.println("[HTTP] Cannot send data.");

      return;
    }
  }

  // Create HTTP client
  HTTPClient http;

  Serial.println();
  Serial.println("[HTTP] Sending sensor data...");

  Serial.print("[HTTP] URL: ");
  Serial.println(SERVER_URL);

  // Start connection
  http.begin(SERVER_URL);

  // Tell FastAPI we are sending JSON
  http.addHeader("Content-Type", "application/json");

  // Timeout
  http.setTimeout(8000);

  // ========================================================
  // JSON DATA
  // ========================================================

  String jsonData = "{";

  jsonData += "\"temperature\":";
  jsonData += String(temperature, 1);

  jsonData += ",\"humidity\":";
  jsonData += String(humidity, 1);

  jsonData += ",\"soil_moisture\":";
  jsonData += String(soilMoisture, 1);

  jsonData += "}";

  Serial.print("[HTTP] JSON: ");
  Serial.println(jsonData);

  // ========================================================
  // POST REQUEST
  // ========================================================

  int responseCode = http.POST(jsonData);

  // ========================================================
  // RESPONSE
  // ========================================================

  if (responseCode > 0) {

    Serial.print("[HTTP] Response code: ");
    Serial.println(responseCode);

    String response = http.getString();

    Serial.print("[HTTP] Server response: ");
    Serial.println(response);

  } else {

    Serial.print("[HTTP] Request failed: ");
    Serial.println(http.errorToString(responseCode));
  }

  // Close connection
  http.end();

  Serial.println("[HTTP] Request finished.");
}

// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("================================================");
  Serial.println("       IGNITE SHIELD - ESP32 TELEMETRY");
  Serial.println("================================================");

  // ----------------------------------------------------------
  // Sensor initialization
  // ----------------------------------------------------------

  dht.begin();

  analogReadResolution(12);

  analogSetAttenuation(ADC_11db);

  pinMode(SOIL_PIN, INPUT);

  Serial.println("[Sensor] DHT11 initialized.");

  Serial.println("[Sensor] Soil moisture initialized.");

  // ----------------------------------------------------------
  // Wi-Fi
  // ----------------------------------------------------------

  connectToWiFi();
}

// ============================================================
// LOOP
// ============================================================

void loop() {

  unsigned long currentTime = millis();

  // ----------------------------------------------------------
  // Maintain Wi-Fi
  // ----------------------------------------------------------

  if (WiFi.status() != WL_CONNECTED) {

    connectToWiFi();
  }

  // ----------------------------------------------------------
  // Send every 30 seconds
  // ----------------------------------------------------------

  if (currentTime - lastSendTime >= SEND_INTERVAL || lastSendTime == 0) {

    lastSendTime = currentTime;

    Serial.println();
    Serial.println("------------------------------------------------");
    Serial.println("[Sampling] Reading sensors...");
    Serial.println("------------------------------------------------");

    // --------------------------------------------------------
    // DHT11
    // --------------------------------------------------------

    float temperature = dht.readTemperature();

    float humidity = dht.readHumidity();

    // --------------------------------------------------------
    // Check DHT
    // --------------------------------------------------------

    if (isnan(temperature) || isnan(humidity)) {

      Serial.println("[DHT ERROR] Failed to read DHT11.");

      delay(2000);

      return;
    }

    // --------------------------------------------------------
    // Soil
    // --------------------------------------------------------

    float soilMoisture = readSoilMoisture();

    // --------------------------------------------------------
    // Display
    // --------------------------------------------------------

    Serial.println();

    Serial.print("Temperature   : ");
    Serial.print(temperature, 1);
    Serial.println(" °C");

    Serial.print("Humidity      : ");
    Serial.print(humidity, 1);
    Serial.println(" %");

    Serial.print("Soil Moisture : ");
    Serial.print(soilMoisture, 1);
    Serial.println(" %");

    // --------------------------------------------------------
    // Send to FastAPI
    // --------------------------------------------------------

    sendSensorData(temperature, humidity, soilMoisture);

    Serial.println("------------------------------------------------");
  }

  // Small delay
  delay(100);
}