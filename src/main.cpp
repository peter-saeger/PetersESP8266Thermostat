#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPUpdateServer.h>
#include <ESP8266mDNS.h>
#include <LittleFS.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <WebSocketsServer.h>
#include <DHT.h>
#include "ThermostatLogic.h"

// Pins & Hardware Configuration
#define DHTPIN D1
#define RELAYPIN D2
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);
ThermostatLogic thermo;

// Dynamic History Buffer (RAM)
struct HistoryPoint {
  unsigned long timestampSec;
  float temp;
  bool relayState;
};
const int HISTORY_SIZE = 60; // Holds last 60 records
HistoryPoint historyBuffer[HISTORY_SIZE];
int historyHead = 0;
int historyCount = 0;

// Timing Delays (non-blocking millis)
unsigned long lastTempCheck = 0;
const unsigned long TEMP_CHECK_INTERVAL = 2000; // Check sensor every 2s

unsigned long lastHistoryRecord = 0;
const unsigned long HISTORY_RECORD_INTERVAL = 60000; // Record history every 1m

// Servers
ESP8266WebServer server(80);
ESP8266HTTPUpdateServer httpUpdater;
WebSocketsServer webSocket(81);

// Forward Declarations
void loadConfig();
void saveConfig();
void broadcastStatus();
void recordHistoryPoint();
String getContentType(String filename);
bool handleFileRead(String path);

void setup() {
  Serial.begin(115200);
  Serial.println("\n[INIT] Starting Peter's ESP8266 Thermostat...");

  pinMode(RELAYPIN, OUTPUT);
  digitalWrite(RELAYPIN, LOW);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); // Off initially for active-low LED

  // Initialize Filesystem
  if (!LittleFS.begin()) {
    Serial.println("[FS] LittleFS Mount Failed! Formatting...");
    LittleFS.format();
    LittleFS.begin();
  } else {
    Serial.println("[FS] LittleFS Mounted Successfully.");
  }

  // Load saved bounds from config.json
  loadConfig();

  // Initialize DHT Sensor
  dht.begin();
  thermo.resetSmoothing(60.0);

  // WiFiManager - AutoConnect / Captive Portal
  WiFiManager wm;
  wm.setConnectTimeout(30);
  wm.setConfigPortalTimeout(180);

  Serial.println("[WIFI] Connecting to Wi-Fi...");
  if (!wm.autoConnect("Shop-Thermostat-AP")) {
    Serial.println("[WIFI] Connection failed. Restarting...");
    ESP.restart();
  }
  Serial.print("[WIFI] Connected! IP: ");
  Serial.println(WiFi.localIP());

  // Setup Web OTA Updater at /update
  httpUpdater.setup(&server, "/update");

  // REST API Endpoints
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<256> doc;
    doc["temperature"] = serialized(String(thermo.getAverageTemp(), 1));
    doc["rawTemp"] = serialized(String(thermo.getCurrentTemp(), 1));
    doc["relayStatus"] = thermo.isHeating() ? 1 : 0;
    doc["lowTemp"] = serialized(String(thermo.getLowBound(), 1));
    doc["highTemp"] = serialized(String(thermo.getHighBound(), 1));
    doc["rssi"] = WiFi.RSSI();
    doc["uptime"] = millis() / 1000;
    doc["ip"] = WiFi.localIP().toString();

    String jsonStr;
    serializeJson(doc, jsonStr);
    server.send(200, "application/json", jsonStr);
  });

  server.on("/api/settings", HTTP_POST, []() {
    float newLow = thermo.getLowBound();
    float newHigh = thermo.getHighBound();
    bool updated = false;

    if (server.hasArg("plain")) {
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, server.arg("plain"));
      if (!err) {
        if (doc.containsKey("lowTemp")) newLow = doc["lowTemp"].as<float>();
        if (doc.containsKey("highTemp")) newHigh = doc["highTemp"].as<float>();
        updated = true;
      }
    } else if (server.hasArg("lowTemp") && server.hasArg("highTemp")) {
      newLow = server.arg("lowTemp").toFloat();
      newHigh = server.arg("highTemp").toFloat();
      updated = true;
    }

    if (updated) {
      thermo.setBounds(newLow, newHigh);
      saveConfig();
      broadcastStatus();
      server.send(200, "application/json", "{\"status\":\"success\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid Request\"}");
    }
  });

  server.on("/api/history", HTTP_GET, []() {
    DynamicJsonDocument doc(4096);
    JsonArray points = doc.createNestedArray("history");
    
    // Output history in chronological order
    int start = (historyCount < HISTORY_SIZE) ? 0 : historyHead;
    for (int i = 0; i < historyCount; i++) {
      int idx = (start + i) % HISTORY_SIZE;
      JsonObject pt = points.createNestedObject();
      pt["time"] = historyBuffer[idx].timestampSec;
      pt["temp"] = serialized(String(historyBuffer[idx].temp, 1));
      pt["relay"] = historyBuffer[idx].relayState ? 1 : 0;
    }

    String jsonStr;
    serializeJson(doc, jsonStr);
    server.send(200, "application/json", jsonStr);
  });

  // Serve static files from LittleFS
  server.onNotFound([]() {
    if (!handleFileRead(server.uri())) {
      server.send(404, "text/plain", "404: File Not Found");
    }
  });

  server.begin();
  Serial.println("[HTTP] Web Server Started on Port 80.");

  // WebSockets Server
  webSocket.begin();
  webSocket.onEvent([](uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    if (type == WStype_CONNECTED) {
      Serial.printf("[WS] Client #%u connected\n", num);
      broadcastStatus();
    }
  });
  Serial.println("[WS] WebSocket Server Started on Port 81.");

  // Start mDNS Responder (http://thermostat.local)
  if (MDNS.begin("thermostat")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("[mDNS] Responder started: http://thermostat.local");
  }
}

void loop() {
  MDNS.update();
  server.handleClient();
  webSocket.loop();

  unsigned long currentMillis = millis();

  // Sensor Reading & Thermostat Control Loop
  if (currentMillis - lastTempCheck >= TEMP_CHECK_INTERVAL) {
    lastTempCheck = currentMillis;
    float readVal = dht.readTemperature(true);
    thermo.addTemperatureReading(readVal);
    
    if (thermo.updateRelayState()) {
      // Relay state changed! Apply physical hardware change
      digitalWrite(RELAYPIN, thermo.isHeating() ? HIGH : LOW);
      digitalWrite(LED_BUILTIN, thermo.isHeating() ? LOW : HIGH);
      broadcastStatus();
      recordHistoryPoint();
    }
  }

  // Record History Loop
  if (currentMillis - lastHistoryRecord >= HISTORY_RECORD_INTERVAL) {
    lastHistoryRecord = currentMillis;
    recordHistoryPoint();
  }
}

void broadcastStatus() {
  StaticJsonDocument<256> doc;
  doc["type"] = "status";
  doc["temperature"] = serialized(String(thermo.getAverageTemp(), 1));
  doc["rawTemp"] = serialized(String(thermo.getCurrentTemp(), 1));
  doc["relayStatus"] = thermo.isHeating() ? 1 : 0;
  doc["lowTemp"] = serialized(String(thermo.getLowBound(), 1));
  doc["highTemp"] = serialized(String(thermo.getHighBound(), 1));

  String jsonStr;
  serializeJson(doc, jsonStr);
  webSocket.broadcastTXT(jsonStr);
}

void recordHistoryPoint() {
  historyBuffer[historyHead].timestampSec = millis() / 1000;
  historyBuffer[historyHead].temp = thermo.getAverageTemp();
  historyBuffer[historyHead].relayState = thermo.isHeating();

  historyHead = (historyHead + 1) % HISTORY_SIZE;
  if (historyCount < HISTORY_SIZE) {
    historyCount++;
  }
}

void loadConfig() {
  if (!LittleFS.exists("/config.json")) return;

  File configFile = LittleFS.open("/config.json", "r");
  if (!configFile) return;

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, configFile);
  configFile.close();

  if (!err) {
    float l = thermo.getLowBound();
    float h = thermo.getHighBound();
    if (doc.containsKey("lowTemp")) l = doc["lowTemp"].as<float>();
    if (doc.containsKey("highTemp")) h = doc["highTemp"].as<float>();
    thermo.setBounds(l, h);
    Serial.printf("[CONFIG] Loaded bounds: Low = %.1f°F, High = %.1f°F\n", l, h);
  }
}

void saveConfig() {
  StaticJsonDocument<128> doc;
  doc["lowTemp"] = thermo.getLowBound();
  doc["highTemp"] = thermo.getHighBound();

  File configFile = LittleFS.open("/config.json", "w");
  if (configFile) {
    serializeJson(doc, configFile);
    configFile.close();
    Serial.println("[CONFIG] Configuration saved to LittleFS.");
  }
}

String getContentType(String filename) {
  if (filename.endsWith(".html")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".json")) return "application/json";
  else if (filename.endsWith(".ico")) return "image/x-icon";
  else if (filename.endsWith(".png")) return "image/png";
  else if (filename.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}

bool handleFileRead(String path) {
  if (path.endsWith("/")) path += "index.html";
  String contentType = getContentType(path);
  if (LittleFS.exists(path)) {
    File file = LittleFS.open(path, "r");
    server.streamFile(file, contentType);
    file.close();
    return true;
  }
  return false;
}
