#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ===== WIFI =====
const char* ssid = "Shiva Sai PG 5th Floor_M";
const char* password = "9611556579";
const char* serverIP = "192.168.1.17"; // 🔥 change this

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
  if (sound > 4000) sound = 0;

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
  bool failure = false;

  if (temperature > TEMP_THRESHOLD) failure = true;
  if (sound > SOUND_THRESHOLD) failure = true;
  if (current > CURRENT_THRESHOLD) failure = true;

  // -------- ACTION --------
  if (failure) {
    digitalWrite(RELAY_PIN, RELAY_OFF);
    digitalWrite(BUZZER_PIN, HIGH);

    digitalWrite(LED_RED, HIGH);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_YELLOW, LOW);

    lcd.setCursor(0,0); lcd.print("ALERT        ");
    lcd.setCursor(0,1); lcd.print("Motor OFF    ");
  }
  else if (vibration) {
    digitalWrite(RELAY_PIN, RELAY_ON);
    digitalWrite(BUZZER_PIN, LOW);

    digitalWrite(LED_YELLOW, HIGH);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, LOW);

    lcd.setCursor(0,0); lcd.print("WARNING      ");
    lcd.setCursor(0,1); lcd.print("Vibration    ");
  }
  else {
    digitalWrite(RELAY_PIN, RELAY_ON);
    digitalWrite(BUZZER_PIN, LOW);

    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_YELLOW, LOW);
    digitalWrite(LED_RED, LOW);

    lcd.setCursor(0,0); lcd.print("NORMAL       ");
    lcd.setCursor(0,1); lcd.print("Motor ON     ");
  }

  // -------- SEND DATA --------
  if (WiFi.status() == WL_CONNECTED && millis() - lastSend > 3000) {

    HTTPClient http;
    String url = String("http://") + serverIP + ":5000/api/data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);

    StaticJsonDocument<200> doc;
    doc["temperature"] = temperature;
    doc["vibration"] = vibration;
    doc["sound"] = sound;
    doc["current"] = current;

    String payload;
    serializeJson(doc, payload);

    int code = http.POST(payload);

    Serial.print("HTTP: ");
    Serial.println(code);

    http.end();

    lastSend = millis();
  }

  delay(500);
}