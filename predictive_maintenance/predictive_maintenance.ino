#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ===== WIFI =====
const char* ssid = "TT";
const char* password = "tahir786";
const char* serverIP = "10.90.254.200";

// ===== PINS =====
#define DHT_PIN 4
#define VIB_PIN 34
#define SOUND_PIN 32
#define CURRENT_PIN 35
#define RELAY_PIN 26
#define BUZZER_PIN 27

#define LED_GREEN 12
#define LED_YELLOW 13
#define LED_RED 14

// ===== RELAY CONFIG =====
// 🔥 CHANGE THIS AFTER TESTING
#define RELAY_ACTIVE_LOW true

#if RELAY_ACTIVE_LOW
  #define RELAY_ON LOW
  #define RELAY_OFF HIGH
#else
  #define RELAY_ON HIGH
  #define RELAY_OFF LOW
#endif

// ===== THRESHOLDS =====
float TEMP_THRESHOLD = 45.0;
int SOUND_THRESHOLD = 2500;
float CURRENT_THRESHOLD = 2.0;

// ===== EMERGENCY THRESHOLDS =====
float TEMP_CRITICAL = 60.0;
int SOUND_CRITICAL = 2600;
float CURRENT_CRITICAL = 3.5;

// ===== OBJECTS =====
DHT dht(DHT_PIN, DHT11);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ===== VARIABLES =====
float temperature = 0;
int vibration = 0;
int sound = 0;
float current = 0;

float zeroCurrentVoltage = 2.5;
unsigned long lastSend = 0;
unsigned long lastActionPoll = 0;
const unsigned long SEND_INTERVAL_MS = 1000;
const unsigned long ACTION_INTERVAL_MS = 1000;

String backendState = "NORMAL";
bool backendStop = false;
bool emergencyLatched = false;

String lastLcdState = "";
bool lastLcdStop = false;

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("SYSTEM STARTING...");

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  pinMode(VIB_PIN, INPUT);

  digitalWrite(RELAY_PIN, RELAY_OFF);
  digitalWrite(BUZZER_PIN, LOW);

  dht.begin();

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0,0);
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  int count = 0;
  while (WiFi.status() != WL_CONNECTED && count < 20) {
    delay(500);
    Serial.print(".");
    count++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.println(WiFi.localIP());
    lcd.clear();
    lcd.print("WiFi OK");
    delay(1000);
  } else {
    Serial.println("\nWiFi FAILED!");
    lcd.clear();
    lcd.print("WiFi FAIL");
    while (1);
  }

  // ===== ACS712 CALIBRATION =====
  long sum = 0;
  for (int i = 0; i < 50; i++) {
    sum += analogRead(CURRENT_PIN);
    delay(5);
  }
  zeroCurrentVoltage = (sum / 50.0 / 4095.0) * 3.3;

  Serial.println("System Ready");
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

void applyOutputs(const String& state, bool stopMotor) {
  if (state == lastLcdState && stopMotor == lastLcdStop) {
    return;
  }

  lastLcdState = state;
  lastLcdStop = stopMotor;

  if (stopMotor) {
    digitalWrite(RELAY_PIN, RELAY_OFF);
    digitalWrite(BUZZER_PIN, HIGH);

    digitalWrite(LED_RED, HIGH);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_YELLOW, LOW);

    lcd.setCursor(0, 0); lcd.print("CRITICAL FAIL ");
    lcd.setCursor(0, 1); lcd.print("Motor OFF    ");
    return;
  }

  digitalWrite(RELAY_PIN, RELAY_ON);
  digitalWrite(BUZZER_PIN, LOW);

  if (state == "FAILURE_LIKELY") {
    digitalWrite(LED_YELLOW, HIGH);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, LOW);
    lcd.setCursor(0, 0); lcd.print("FAILURE LIKELY");
    lcd.setCursor(0, 1); lcd.print("Monitor     ");
    return;
  }

  if (state == "WARNING") {
    digitalWrite(LED_YELLOW, HIGH);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, LOW);
    lcd.setCursor(0, 0); lcd.print("WARNING     ");
    lcd.setCursor(0, 1); lcd.print("Check system");
    return;
  }

  if (state == "RECOVERING") {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_YELLOW, LOW);
    digitalWrite(LED_RED, LOW);
    lcd.setCursor(0, 0); lcd.print("RECOVERING  ");
    lcd.setCursor(0, 1); lcd.print("Trend OK    ");
    return;
  }

  if (state == "STABILIZING") {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_YELLOW, LOW);
    digitalWrite(LED_RED, LOW);
    lcd.setCursor(0, 0); lcd.print("STABILIZING ");
    lcd.setCursor(0, 1); lcd.print("Stable      ");
    return;
  }

  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);
  lcd.setCursor(0, 0); lcd.print("NORMAL      ");
  lcd.setCursor(0, 1); lcd.print("Motor ON    ");
}

// ===== LOOP =====
void loop() {

  Serial.println("LOOP RUNNING");

  // -------- TEMPERATURE --------
  float t = dht.readTemperature();
  if (!isnan(t)) temperature = t;

  // -------- VIBRATION FILTER --------
  int vibCount = 0;
  for (int i = 0; i < 5; i++) {
    vibCount += digitalRead(VIB_PIN);
    delay(2);
  }
  vibration = (vibCount >= 2) ? 1 : 0;

  // -------- SOUND FILTER --------
  int maxVal = 0;
  for (int i = 0; i < 30; i++) {
    int val = analogRead(SOUND_PIN);
    if (val > maxVal) maxVal = val;
    delay(1);
  }
  sound = maxVal;

  // Fix sensor saturation
  if (sound > 4090) sound = 4090;

  // -------- CURRENT --------
  long sum = 0;
  for (int i = 0; i < 30; i++) {
    sum += analogRead(CURRENT_PIN);
    delayMicroseconds(200);
  }

  float avg = sum / 30.0;
  float voltage = (avg / 4095.0) * 3.3;
  current = abs((voltage - zeroCurrentVoltage) / 0.185);

  if (current < 0.05) current = 0;

  // -------- PRINT --------
  Serial.printf("T=%.1f V=%d S=%d C=%.2f\n", temperature, vibration, sound, current);

  // -------- LOGIC --------
  bool warning = false;
  bool localEmergency = false;
  StaticJsonDocument<200> emergencyDoc;
  JsonArray emergencyReasons = emergencyDoc.createNestedArray("reasons");

  if (temperature > TEMP_THRESHOLD) warning = true;
  if (sound > SOUND_THRESHOLD) warning = true;
  if (current > CURRENT_THRESHOLD) warning = true;
  if (vibration) warning = true;

  if (temperature >= TEMP_CRITICAL) {
    localEmergency = true;
    emergencyReasons.add("Temperature critical");
  }
  if (sound >= SOUND_CRITICAL) {
    localEmergency = true;
    emergencyReasons.add("Sound spike");
  }
  if (current >= CURRENT_CRITICAL) {
    localEmergency = true;
    emergencyReasons.add("Current overload");
  }
  if (vibCount >= 3) {
    localEmergency = true;
    emergencyReasons.add("Extreme vibration");
  }

  // -------- SEND DATA --------
  ensureWiFi();

  if (WiFi.status() == WL_CONNECTED && millis() - lastSend >= SEND_INTERVAL_MS) {

    HTTPClient http;
    String url = String("http://") + serverIP + ":5000/api/data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(1500);

    StaticJsonDocument<256> doc;
    doc["temperature"] = temperature;
    doc["vibration"] = vibration;
    doc["sound"] = sound;
    doc["current"] = current;
    doc["emergency"] = localEmergency;
    doc["emergencyReasons"] = emergencyReasons;

    String payload;
    serializeJson(doc, payload);

    int code = http.POST(payload);

    Serial.print("HTTP: ");
    Serial.println(code);

    http.end();

    lastSend = millis();
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastActionPoll >= ACTION_INTERVAL_MS) {
    HTTPClient httpAction;
    String actionUrl = String("http://") + serverIP + ":5000/api/action";
    httpAction.begin(actionUrl);
    httpAction.setTimeout(1500);
    int code = httpAction.GET();
    if (code > 0) {
      String payload = httpAction.getString();
      StaticJsonDocument<256> actionDoc;
      DeserializationError err = deserializeJson(actionDoc, payload);
      if (!err) {
        const char* action = actionDoc["action"] | "CONTINUE";
        const char* state = actionDoc["state"] | "NORMAL";
        backendStop = String(action) == "STOP_MOTOR";
        backendState = String(state);
      }
    }
    httpAction.end();
    lastActionPoll = millis();
  }

  if (localEmergency || backendStop) {
    emergencyLatched = true;
  }

  if (emergencyLatched) {
    applyOutputs("CRITICAL_FAILURE", true);
  } else if (backendState == "WARNING" || backendState == "FAILURE_LIKELY" || backendState == "RECOVERING" || backendState == "STABILIZING") {
    applyOutputs(backendState, false);
  } else if (warning) {
    applyOutputs("WARNING", false);
  } else {
    applyOutputs("NORMAL", false);
  }

  delay(50);
}