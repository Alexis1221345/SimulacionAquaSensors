// ═══════════════════════════════════════════════════════════════════
// AquaSensors ESP32 — v3.3 OPTIMIZADO
// OLED 128×32 — Control de bombas POR MODO (no por parámetros)
// Modo LLUVIA = Bombas ON | Modo NORMAL = Bombas OFF
// ═══════════════════════════════════════════════════════════════════

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WebServer.h>
#include <Preferences.h>

// ── OLED ──────────────────────────────────────────────────────────
#define OLED_WIDTH  128
#define OLED_HEIGHT  32
#define OLED_RESET   -1
#define OLED_ADDR   0x3C

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
bool oledOk = false;

// ── Provisioning (SoftAP + HTTP) ─────────────────────────────────────
WebServer server(80);
Preferences prefs;
String savedSsid = "";
String savedPass = "";
bool provisioningMode = false;
const char* DEFAULT_AP_SSID = "AquaSensors-Setup";
const char* DEFAULT_AP_PASS = ""; // abierto por simplicidad

// ── WiFi ──────────────────────────────────────────────────────────
const char* WIFI_SSID     = "Totalplay-5FB5";
const char* WIFI_PASSWORD = "5FB5C290DGT5Wvyt";

// ── Servidor ──────────────────────────────────────────────────────
const char* URL_PING     = "https://simulacionaquasensors.onrender.com/api/esp32/ping";
const char* URL_STATUS   = "https://simulacionaquasensors.onrender.com/api/esp32/status";
const char* URL_READINGS = "https://simulacionaquasensors.onrender.com/api/esp32/readings";
const char* POOL_ID      = "2ca40228-45f4-4355-b3e0-3175bcbe11f1";

// ── Relay (activa-baja) ───────────────────────────────────────────
#define RELAY_CLORO       13
#define RELAY_ALGUICIDA   14
#define RELAY_CLARIF      27
#define RELAY_CARBONATO   26

#define BOMBA_ON(pin)   digitalWrite(pin, LOW)
#define BOMBA_OFF(pin)  digitalWrite(pin, HIGH)

// ── Umbrales para display de parámetros (no para control de bombas) ─
#define PH_MIN          7.2
#define PH_MAX          7.8
#define CLORO_MIN       1.0
#define CLORO_MAX       5.0
#define TEMP_MIN       25.0
#define TEMP_MAX       30.0
#define TURBIDEZ_MAX    1.0

// ── Timing ────────────────────────────────────────────────────────
const unsigned long INTERVALO_PING      = 1000;   // 1 seg — heartbeat rápido
const unsigned long INTERVALO_STATUS    = 5000;   // 5 seg — lectura completa
const unsigned long INTERVALO_OLED      = 3000;   // 3 seg — rotación pantalla
const unsigned long INTERVALO_ENVIO     = 30000;  // 30 seg — envío de lecturas

unsigned long ultimoPing    = 0;
unsigned long ultimoStatus  = 0;
unsigned long ultimoOled    = 0;
unsigned long ultimoEnvio   = 0;
int pantallaActual          = 0;  // 0=pH, 1=Cloro, 2=Temp, 3=Turbidez, 4=Bombas

// ── Estado global ─────────────────────────────────────────────────
String g_modo           = "---";
String g_modoAnterior   = "";    // Para detectar cambios
float  g_ph             = 0;
float  g_cloro          = 0;
float  g_temp           = 0;
float  g_turbidez       = 0;
bool   g_bombasActivas  = false; // Estado actual de TODAS las bombas
bool   g_wifiOk         = false;
int    g_ciclosErrados  = 0;     // Contador de fallos
int    g_ciclosExitosos = 0;     // Contador de éxitos

// ═════════════════════════════════════════════════════════════════
// Prototipos
// ═════════════════════════════════════════════════════════════════
void oledBoot();
void oledRotar();
void oledPantalla(const char* nombre, const char* valor, const char* unidad, bool ok);
void oledPantallaBombas();
void conectarWiFi();
bool pingServidor();
void consultarStatus(String &modo, bool &bombasActivas);
void startProvisioningAP();
void stopProvisioningAP();
void handleProvision();
void loadSavedCredentials();
void saveCredentials(const char* ssid, const char* pass);
void enviarLecturas(float ph, float cloro, float temperatura, float turbidez, float alcalinidad);
void controlarBombasPorModo(String modo);
void apagarTodasLasBombas();
float rango(float minVal, float maxVal);
float generarPH(String modo);
float generarCloro(String modo);
float generarTemperatura(String modo);
float generarTurbidez(String modo);
float generarAlcalinidad(String modo);
float serializado(float val);

// ═════════════════════════════════════════════════════════════════
// SETUP
// ═════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);

  // Relay — apagados al inicio (seguridad)
  pinMode(RELAY_CLORO,     OUTPUT); BOMBA_OFF(RELAY_CLORO);
  pinMode(RELAY_ALGUICIDA, OUTPUT); BOMBA_OFF(RELAY_ALGUICIDA);
  pinMode(RELAY_CLARIF,    OUTPUT); BOMBA_OFF(RELAY_CLARIF);
  pinMode(RELAY_CARBONATO, OUTPUT); BOMBA_OFF(RELAY_CARBONATO);

  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[OLED] No encontrada en 0x3C");
    oledOk = false;
  } else {
    oledOk = true;
    oledBoot();
  }

  Serial.println("\n╔══════════════════════════════════╗");
  Serial.println("║   AquaSensors ESP32  v3.3        ║");
  Serial.println("║   BOMBAS POR MODO (lluvia/normal)║");
  Serial.println("║   Optimizado + Ping rápido       ║");
  Serial.println("╚══════════════════════════════════╝\n");

  randomSeed(analogRead(0));
  loadSavedCredentials();
  conectarWiFi();
}

// ═════════════════════════════════════════════════════════════════
// LOOP — Multi-timing para máxima responsividad
// ═════════════════════════════════════════════════════════════════
void loop() {
  // Si estamos en modo provisioning atendemos al servidor HTTP
  if (provisioningMode) {
    server.handleClient();
  }


  // — PING rápido cada 1 segundo (verifica conexión) —
  if (millis() - ultimoPing >= INTERVALO_PING) {
    ultimoPing = millis();
    if (!pingServidor()) {
      g_wifiOk = false;
      g_ciclosErrados++;
    } else {
      g_wifiOk = true;
    }
  }

  // — STATUS cada 5 segundos (obtiene modo y aplica control) —
  if (millis() - ultimoStatus >= INTERVALO_STATUS) {
    ultimoStatus = millis();
    
    if (WiFi.status() != WL_CONNECTED) {
      g_wifiOk = false;
      Serial.println("[WiFi] Desconectado, reconectando...");
      apagarTodasLasBombas();
      conectarWiFi();
    } else {
      String modo = "normal";
      bool bombasActivas = false;
      consultarStatus(modo, bombasActivas);
      
      // ⚡ CONTROL DE BOMBAS POR MODO (NUEVA LÓGICA)
      if (modo != g_modoAnterior) {
        Serial.printf("[Cambio] Modo: %s → %s\n", g_modoAnterior.c_str(), modo.c_str());
        g_modoAnterior = modo;
      }
      controlarBombasPorModo(modo);
      g_ciclosExitosos++;
    }
  }

  // — Rotación de pantalla OLED cada 3 segundos —
  if (millis() - ultimoOled >= INTERVALO_OLED) {
    ultimoOled = millis();
    oledRotar();
  }

  // — Envío de lecturas cada 30 segundos —
  if (millis() - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = millis();

    String modo = g_modo;
    float ph          = generarPH(modo);
    float cloro       = generarCloro(modo);
    float temperatura = generarTemperatura(modo);
    float turbidez    = generarTurbidez(modo);
    float alcalinidad = generarAlcalinidad(modo);

    // Actualiza estado global
    g_ph       = ph;
    g_cloro    = cloro;
    g_temp     = temperatura;
    g_turbidez = turbidez;

    Serial.println("\n╔══════════════════════════════════╗");
    Serial.printf("║ CICLO %d - Modo: %s\n", g_ciclosExitosos, modo.c_str());
    Serial.println("╚══════════════════════════════════╝");
    
    Serial.printf("[WiFi] %s | [Bombas] %s\n",
      g_wifiOk ? "✅ Conectado" : "❌ Desconectado",
      g_bombasActivas ? "🔴 ACTIVAS" : "⚪ Inactivas");
    
    Serial.printf("[Detalles Bombas]\n");
    Serial.printf("  🧂 Cloro        → %s\n", g_bombasActivas ? "✅" : "❌");
    Serial.printf("  🦠 Alguicida    → %s\n", g_bombasActivas ? "✅" : "❌");
    Serial.printf("  💧 Clarificador → %s\n", g_bombasActivas ? "✅" : "❌");
    Serial.printf("  ⚗️  Carbonato    → %s\n", g_bombasActivas ? "✅" : "❌");
    
    Serial.printf("\n[Sensores] pH: %.2f | Cloro: %.2f ppm | Temp: %.1f°C | Turbidez: %.2f NTU\n",
      ph, cloro, temperatura, turbidez);
    Serial.printf("[Stats] Exitosos: %d | Errores: %d | Ratio: %.1f%%\n", 
      g_ciclosExitosos, g_ciclosErrados, 
      (g_ciclosExitosos * 100.0) / (g_ciclosExitosos + g_ciclosErrados));
    Serial.println("");

    enviarLecturas(ph, cloro, temperatura, turbidez, alcalinidad);
  }
}

// ═════════════════════════════════════════════════════════════════
// PING — Verificación rápida (<1ms)
// ═════════════════════════════════════════════════════════════════
bool pingServidor() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL_PING);
  http.setTimeout(2000);  // Timeout muy rápido

  int code = http.GET();
  http.end();

  if (code != 200) {
    Serial.printf("[Ping] ERROR %d — Reconectando WiFi\n", code);
    return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════
// OLED — Splash arranque
// ═════════════════════════════════════════════════════════════════
void oledBoot() {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 0);  display.println("AquaSensors v3.3");
  display.setCursor(20, 10); display.println("Iniciando...");
  display.setCursor(12, 20); display.println("Conectando WiFi");
  display.display();
}

// ═════════════════════════════════════════════════════════════════
// OLED — Rota entre los 4 parámetros + Estado de bombas
// ═════════════════════════════════════════════════════════════════
void oledRotar() {
  char valor[12];
  switch (pantallaActual) {
    case 0:
      snprintf(valor, sizeof(valor), "%.2f", g_ph);
      oledPantalla("pH", valor, "",
        g_ph >= PH_MIN && g_ph <= PH_MAX);
      break;
    case 1:
      snprintf(valor, sizeof(valor), "%.2f", g_cloro);
      oledPantalla("Cloro", valor, "ppm",
        g_cloro >= CLORO_MIN && g_cloro <= CLORO_MAX);
      break;
    case 2:
      snprintf(valor, sizeof(valor), "%.1f", g_temp);
      oledPantalla("Temp", valor, "C",
        g_temp >= TEMP_MIN && g_temp <= TEMP_MAX);
      break;
    case 3:
      snprintf(valor, sizeof(valor), "%.2f", g_turbidez);
      oledPantalla("Turbidez", valor, "NTU",
        g_turbidez <= TURBIDEZ_MAX);
      break;
    case 4:
      // ✅ NUEVA PANTALLA: Estado de las bombas
      oledPantallaBombas();
      break;
  }
  pantallaActual = (pantallaActual + 1) % 5;
}

// ═════════════════════════════════════════════════════════════════
// OLED — Dibuja una pantalla de parámetro
// ═════════════════════════════════════════════════════════════════
void oledPantalla(const char* nombre, const char* valor, const char* unidad, bool ok) {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // — Línea superior: nombre a la izquierda, estado a la derecha —
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(nombre);

  const char* estado = ok ? "OK" : "XX";
  int estadoX = 128 - (strlen(estado) * 6);
  display.setCursor(estadoX, 0);
  display.print(estado);

  // — Línea inferior: valor en tamaño 2 + unidad en tamaño 1 —
  display.setTextSize(2);
  display.setCursor(0, 14);
  display.print(valor);

  if (strlen(unidad) > 0) {
    int valorAncho = strlen(valor) * 12;
    display.setTextSize(1);
    display.setCursor(valorAncho + 2, 20);
    display.print(unidad);
  }

  display.display();
}

// ═════════════════════════════════════════════════════════════════
// ✅ OLED — Pantalla de Estado de Bombas (NUEVA)
//
// Muestra el estado ON/OFF de todas las bombas
// Modo LLUVIA → Todas encendidas
// Modo NORMAL → Todas apagadas
// ═════════════════════════════════════════════════════════════════
void oledPantallaBombas() {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // — Línea superior: "BOMBAS" —
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("BOMBAS");

  // — Estado: ON/OFF grande —
  const char* estadoBombas = g_bombasActivas ? "ON" : "OFF";
  const char* iconoBombas = g_bombasActivas ? "ON" : "OFF";
  
  display.setTextSize(2);
  display.setCursor(0, 14);
  display.print(estadoBombas);

  // — Indicador visual de modo a la derecha —
  display.setTextSize(1);
  int modoX = 128 - 35;
  display.setCursor(modoX, 0);
  if (g_modo == "lluvia") {
    display.print("LLUVIA");
    display.setCursor(modoX, 10);
    display.print("3rain");
  } else {
    display.print("NORMAL");
    display.setCursor(modoX, 10);
    display.print("Sun");
  }

  // — WiFi status abajo a la derecha —
  int wifiX = 128 - 20;
  display.setCursor(wifiX, 24);
  display.print(g_wifiOk ? "WiFi+" : "WiFi-");

  display.display();
}


// ═════════════════════════════════════════════════════════════════
// ⚡ CONTROL DE BOMBAS POR MODO (NUEVA LÓGICA SIMPLIFICADA)
//
// LLUVIA → Todas ON
// NORMAL → Todas OFF
// ═════════════════════════════════════════════════════════════════
void controlarBombasPorModo(String modo) {
  if (modo == "lluvia") {
    // ✅ MODO LLUVIA: Encender todas las bombas
    BOMBA_ON(RELAY_CLORO);
    BOMBA_ON(RELAY_ALGUICIDA);
    BOMBA_ON(RELAY_CLARIF);
    BOMBA_ON(RELAY_CARBONATO);
    g_bombasActivas = true;
    
    if (g_modoAnterior != "lluvia") {
      Serial.println("\n╔════════════════════════════════════╗");
      Serial.println("║ 🌧️  MODO LLUVIA ACTIVADO         ║");
      Serial.println("║ Todas las bombas ENCENDIDAS       ║");
      Serial.println("╚════════════════════════════════════╝\n");
      Serial.println("[Bombas] 🧂 Cloro        ✅ ON");
      Serial.println("[Bombas] 🦠 Alguicida    ✅ ON");
      Serial.println("[Bombas] 💧 Clarificador ✅ ON");
      Serial.println("[Bombas] ⚗️  Carbonato    ✅ ON\n");
    }
  } else {
    // ❌ MODO NORMAL: Apagar todas las bombas
    BOMBA_OFF(RELAY_CLORO);
    BOMBA_OFF(RELAY_ALGUICIDA);
    BOMBA_OFF(RELAY_CLARIF);
    BOMBA_OFF(RELAY_CARBONATO);
    g_bombasActivas = false;
    
    if (g_modoAnterior != "normal") {
      Serial.println("\n╔════════════════════════════════════╗");
      Serial.println("║ ☀️  MODO NORMAL ACTIVADO          ║");
      Serial.println("║ Todas las bombas APAGADAS         ║");
      Serial.println("╚════════════════════════════════════╝\n");
      Serial.println("[Bombas] 🧂 Cloro        ❌ OFF");
      Serial.println("[Bombas] 🦠 Alguicida    ❌ OFF");
      Serial.println("[Bombas] 💧 Clarificador ❌ OFF");
      Serial.println("[Bombas] ⚗️  Carbonato    ❌ OFF\n");
    }
  }
}

void apagarTodasLasBombas() {
  BOMBA_OFF(RELAY_CLORO);
  BOMBA_OFF(RELAY_ALGUICIDA);
  BOMBA_OFF(RELAY_CLARIF);
  BOMBA_OFF(RELAY_CARBONATO);
  g_bombasActivas = false;
  Serial.println("[Bombas] 🛑 EMERGENCIA: Todas apagadas por seguridad.");
}

// ═════════════════════════════════════════════════════════════════
// WIFI
// ═════════════════════════════════════════════════════════════════
void conectarWiFi() {
  // Prioriza credenciales guardadas si existen
  if (savedSsid.length() > 0) {
    Serial.printf("[WiFi] Intentando conectar con credenciales guardadas: %s\n", savedSsid.c_str());
    WiFi.begin(savedSsid.c_str(), savedPass.c_str());
  } else {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  Serial.print("[WiFi] Conectando");
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  g_wifiOk = (WiFi.status() == WL_CONNECTED);
  if (g_wifiOk) {
    Serial.println("\n[WiFi] ✅ Conectado: " + WiFi.localIP().toString());
    // Si estábamos en modo provisioning, detener servidor
    if (provisioningMode) stopProvisioningAP();
  } else {
    Serial.println("\n[WiFi] ❌ No se pudo conectar.");
    // Si no hay credenciales guardadas o falló la conexión, levantar SoftAP
    if (!provisioningMode) {
      startProvisioningAP();
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// GET /api/esp32/status
// ═════════════════════════════════════════════════════════════════
void consultarStatus(String &modo, bool &bombasActivas) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL_STATUS);
  http.setTimeout(5000);

  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (!err) {
      if (doc.containsKey("modo"))   modo = doc["modo"].as<String>();
      if (doc.containsKey("bombas")) bombasActivas = doc["bombas"].as<bool>();
      
      // Guardar parámetros en variables globales
      if (doc.containsKey("ph"))       g_ph = doc["ph"].as<float>();
      if (doc.containsKey("cloro"))    g_cloro = doc["cloro"].as<float>();
      if (doc.containsKey("turbidez")) g_turbidez = doc["turbidez"].as<float>();
      if (doc.containsKey("tempAgua")) g_temp = doc["tempAgua"].as<float>();
      
      g_modo = modo;
    } else {
      Serial.println("[Status] ❌ Error JSON, usando defaults");
      g_ciclosErrados++;
    }
  } else {
    Serial.printf("[Status] ❌ Error HTTP %d\n", code);
    g_ciclosErrados++;
  }
  http.end();
}


// ═════════════════════════════════════════════════════════════════
// Provisioning HTTP handlers
// ═════════════════════════════════════════════════════════════════
void handleProvision() {
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "no body");
    return;
  }
  String body = server.arg("plain");
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    server.send(400, "application/json", "{\"ok\":false, \"error\":\"json\"}");
    return;
  }
  const char* ssid = doc["ssid"] | "";
  const char* pass = doc["password"] | "";
  if (strlen(ssid) == 0) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing ssid\"}");
    return;
  }
  saveCredentials(ssid, pass);
  server.send(200, "application/json", "{\"ok\":true}\n");
  delay(500);
  ESP.restart();
}

void startProvisioningAP() {
  Serial.println("[AP] Iniciando SoftAP para provisioning...");
  WiFi.softAP(DEFAULT_AP_SSID, DEFAULT_AP_PASS);
  IPAddress ip = WiFi.softAPIP();
  Serial.printf("[AP] SoftAP listo en %s\n", ip.toString().c_str());
  server.on("/provision", HTTP_POST, handleProvision);
  server.begin();
  provisioningMode = true;
  g_wifiOk = false;
}

void stopProvisioningAP() {
  if (!provisioningMode) return;
  Serial.println("[AP] Deteniendo SoftAP y servidor de provisioning");
  server.stop();
  WiFi.softAPdisconnect(true);
  provisioningMode = false;
}

void loadSavedCredentials() {
  prefs.begin("wifi", true);
  savedSsid = prefs.getString("ssid", "");
  savedPass = prefs.getString("pass", "");
  prefs.end();
  if (savedSsid.length() > 0) {
    Serial.printf("[Prefs] Cargado SSID guardado: %s\n", savedSsid.c_str());
  }
}

void saveCredentials(const char* ssid, const char* pass) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  Serial.printf("[Prefs] Guardadas credenciales para SSID: %s\n", ssid);
}

// ═════════════════════════════════════════════════════════════════
// POST /api/esp32/readings
// ═════════════════════════════════════════════════════════════════
void enviarLecturas(float ph, float cloro, float temperatura,
                    float turbidez, float alcalinidad) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL_READINGS);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  StaticJsonDocument<256> doc;
  doc["pool_id"]     = POOL_ID;
  doc["ph"]          = serializado(ph);
  doc["cloro"]       = serializado(cloro);
  doc["temperatura"] = serializado(temperatura);
  doc["turbidez"]    = serializado(turbidez);
  doc["alcalinidad"] = serializado(alcalinidad);

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 200) {
    Serial.println("[POST] ✅ Lecturas enviadas correctamente");
  } else {
    Serial.printf("[POST] ❌ Error HTTP: %d\n", code);
  }
  http.end();
}

// ═════════════════════════════════════════════════════════════════
// GENERADORES SIMULADOS
// ═════════════════════════════════════════════════════════════════
float rango(float minVal, float maxVal) {
  return minVal + ((float)random(0, 10000) / 10000.0) * (maxVal - minVal);
}

float generarPH(String modo)          { return modo == "lluvia" ? rango(6.8, 7.1)   : rango(7.2, 7.6);    }
float generarCloro(String modo)       { return modo == "lluvia" ? rango(0.8, 1.4)   : rango(1.5, 2.5);    }
float generarTemperatura(String modo) { return modo == "lluvia" ? rango(22.0, 25.0) : rango(26.0, 29.0);  }
float generarTurbidez(String modo)    { return modo == "lluvia" ? rango(1.5, 3.5)   : rango(0.1, 0.5);    }
float generarAlcalinidad(String modo) { return modo == "lluvia" ? rango(75.0, 90.0) : rango(90.0, 110.0); }

float serializado(float val) { return round(val * 100.0) / 100.0; }
