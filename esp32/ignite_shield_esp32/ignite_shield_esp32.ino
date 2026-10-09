/*
 * ======================================================================================
 * IGNITE SHIELD - ESP32 Forest Fire Early Detection Telemetry Node
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
 *    * Note: Do NOT use ADC2 pins (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27)
 * with Wi-Fi!
 *
 * Target Endpoint:
 * --------------------------------------------------------------------------------------
 * POST http://<YOUR_PC_IP>:8000/api/readings/sensor
 * Payload format:
 * {
 *   "temperature": 28.5,
 *   "humidity": 72.4,
 *   "soil_moisture": 58.3
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
// Replace with your Wi-Fi Network credentials:
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your Laptop/Server IP running the FastAPI backend:
// Your PC's current Wi-Fi IP address (detected from ipconfig):
const char *SERVER_URL = "http://10.195.109.101:8000/api/readings/sensor";

// Telemetry transmit interval (in milliseconds) - default: 15 seconds
const unsigned long SEND_INTERVAL_MS = 15000;

// ======================================================================================
// HARDWARE PIN DEFINITIONS
// ======================================================================================
#define DHTPIN 4      // Digital GPIO connected to DHT data pin
#define DHTTYPE DHT11 // Change to DHT22 if using DHT22 / AM2302 sensor

#define SOIL_PIN 34 // Analog pin ADC1 (GPIO 34)

// Calibration values for Soil Moisture Sensor (12-bit ADC: 0 - 4095):
// Calibrate these by observing raw values in dry air and fully submerged in
// water.
const int SOIL_AIR_VALUE = 3500; // Raw ADC reading in dry air (0% moisture)
const int SOIL_WATER_VALUE =
    1400; // Raw ADC reading submerged in water (100% moisture)

// Number of analog samples to average for a stable soil moisture reading
const int NUM_SOIL_SAMPLES = 10;

// ======================================================================================
// GLOBAL OBJECTS & STATE
// ======================================================================================
DHT dht(DHTPIN, DHTTYPE);
unsigned long lastSendTime = 0;

// ======================================================================================
// HELPER FUNCTIONS
// ======================================================================================

// Connect or reconnect to Wi-Fi network
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
    Serial.println("[WiFi] Connection failed. Will retry on next cycle.");
  }
}

// Read smoothed Soil Moisture percentage (0% to 100%)
float readSoilMoisturePercentage() {
  long sum = 0;
  for (int i = 0; i < NUM_SOIL_SAMPLES; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  int rawValue = sum / NUM_SOIL_SAMPLES;

  // Map raw analog reading to percentage:
  // Note: Higher raw value means drier soil (lower moisture)
  float percentage = map(rawValue, SOIL_AIR_VALUE, SOIL_WATER_VALUE, 0, 100);

  // Constrain between 0.0% and 100.0%
  if (percentage < 0.0)
    percentage = 0.0;
  if (percentage > 100.0)
    percentage = 100.0;

  Serial.printf("[Sensor] Raw Soil ADC: %d -> Moisture: %.1f%%\n", rawValue,
                percentage);
  return percentage;
}

// Transmit telemetry packet to FastAPI backend via HTTP POST
void sendTelemetry(float temperature, float humidity, float soilMoisture) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi not connected. Attempting reconnection...");
    connectToWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[HTTP] Cannot send packet: No Wi-Fi connection.");
      return;
    }
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000); // 8 second timeout

  // Build JSON payload
  // Expected schema: {"temperature": float, "humidity": float, "soil_moisture":
  // float}
  StaticJsonDocument<200> doc;
  doc["temperature"] = serialized(String(temperature, 1));
  doc["humidity"] = serialized(String(humidity, 1));
  doc["soil_moisture"] = serialized(String(soilMoisture, 1));

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("--------------------------------------------------");
  Serial.print("[HTTP POST] Sending to: ");
  Serial.println(SERVER_URL);
  Serial.print("[HTTP POST] Payload: ");
  Serial.println(requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Status: %d OK\n", httpResponseCode);
    Serial.print("[HTTP] Server Response: ");
    Serial.println(response);
  } else {
    Serial.printf("[HTTP] Error on POST: %s (Code: %d)\n",
                  http.errorToString(httpResponseCode).c_str(),
                  httpResponseCode);
    Serial.println("[HTTP] Hint: Make sure your PC firewall allows incoming "
                   "connections on port 8000.");
  }

  http.end();
  Serial.println("--------------------------------------------------");
}

// ======================================================================================
// ARDUINO SETUP & MAIN LOOP
// ======================================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("   IGNITE SHIELD - ESP32 Telemetry Transmitter    ");
  Serial.println("==================================================");

  // Configure ADC for soil moisture (12-bit resolution: 0-4095)
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // Full 0V - 3.3V range
  pinMode(SOIL_PIN, INPUT);

  // Initialize DHT sensor
  Serial.println("[DHT] Initializing temperature & humidity sensor...");
  dht.begin();

  // Connect to local Wi-Fi
  connectToWiFi();
}

void loop() {
  unsigned long currentMillis = millis();

  // Execute transmission every SEND_INTERVAL_MS
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = currentMillis;

    Serial.println("\n[Sampling] Reading sensor values...");

    // Read DHT sensor values
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // in Celsius

    // Validate DHT readings
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println(
          "[DHT Error] Failed to read from DHT sensor! Check pin connections.");
      return;
    }

    // Read soil moisture percentage
    float soilMoisture = readSoilMoisturePercentage();

    Serial.printf("[Telemetry] Temp: %.1f C | Humidity: %.1f %% | Soil "
                  "Moisture: %.1f %%\n",
                  temperature, humidity, soilMoisture);

    // Send payload to backend
    sendTelemetry(temperature, humidity, soilMoisture);
  }

  // Small delay to yield to ESP32 RTOS background tasks
  delay(50);
}
