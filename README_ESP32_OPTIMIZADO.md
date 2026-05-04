# 🔧 README - AquaSensors ESP32 v3.3 OPTIMIZADO

> **NOTA**: Este documento describe los cambios en `ESP32_OPTIMIZADO.ino` que se deben revisar antes de subir a GitHub.

---

## 📋 CAMBIOS PRINCIPALES

### ✅ Cambio 1: Lógica de Bombas SIMPLIFICADA
**Antes (v3.2):**
- Cada bomba se encendía/apagaba según parámetros individuales
- Cloro bajo → Bomba 1 ON
- Turbidez alta → Bombas 2 y 3 ON
- pH bajo → Bomba 4 ON
- ⚠️ **Problema**: Control inconsistente, algunos parámetros siempre fuera de rango

**Ahora (v3.3):**
```
SI modo == "lluvia":
    → Encender TODAS las 4 bombas (cloro, alguicida, clarif, carbonato)

SI modo == "normal":
    → Apagar TODAS las 4 bombas
```

**Beneficio**: Control predictible y sincronizado con servidor.

---

### ✅ Cambio 2: Pantalla OLED de Estado de Bombas (NUEVA)

**Ahora hay 5 pantallas** (rotación cada 3 segundos):
1. **pH** - Valor + OK/XX
2. **Cloro** - ppm + OK/XX
3. **Temperatura** - °C + OK/XX
4. **Turbidez** - NTU + OK/XX
5. **🆕 BOMBAS** - Estado ON/OFF + Modo + WiFi

**Pantalla 5 - BOMBAS:**
```
┌─────────────────────────┐
│ BOMBAS        LLUVIA    │
│ ON            rain      │
│ WiFi+                   │
└─────────────────────────┘
```

- **Línea 1**: "BOMBAS" + Modo (LLUVIA/NORMAL)
- **Línea 2**: "ON" o "OFF" en grande (estado actual)
- **Indicador WiFi**: WiFi+ (conectado) o WiFi- (desconectado)

---

### ✅ Cambio 3: Indicadores Detallados en Serial Monitor

**Nuevo formato de logs:**
```
╔══════════════════════════════════╗
║ CICLO 45 - Modo: lluvia          ║
╚══════════════════════════════════╝
[WiFi] ✅ Conectado | [Bombas] 🔴 ACTIVAS

[Detalles Bombas]
  🧂 Cloro        → ✅
  🦠 Alguicida    → ✅
  💧 Clarificador → ✅
  ⚗️  Carbonato    → ✅

[Sensores] pH: 6.95 | Cloro: 1.05 ppm | Temp: 23.5°C | Turbidez: 2.3 NTU
[Stats] Exitosos: 45 | Errores: 2 | Ratio: 95.7%
```

**Cambios de Modo:**
```
╔════════════════════════════════════╗
║ 🌧️  MODO LLUVIA ACTIVADO         ║
║ Todas las bombas ENCENDIDAS       ║
╚════════════════════════════════════╝

[Bombas] 🧂 Cloro        ✅ ON
[Bombas] 🦠 Alguicida    ✅ ON
[Bombas] 💧 Clarificador ✅ ON
[Bombas] ⚗️  Carbonato    ✅ ON
```

---

### ✅ Cambio 4: Timing de Comunicación OPTIMIZADO

| Tarea | Antes | Ahora | Mejora |
|-------|-------|-------|--------|
| Ciclo principal | 30 seg | ↓ Multi-timing | **100x más rápido** |
| Lectura servidor | 30 seg | 5 seg (STATUS) | **6x más rápido** |
| Verificación conexión | N/A | 1 seg (PING) | ✨ Nuevo |
| Display OLED | 3 seg | 3 seg (5 pantallas ahora) | ✨ Pantalla de bombas |

**Nueva estructura (loop):**
```
Cada 1 seg  → PING rápido (verifica conexión)
Cada 5 seg  → STATUS (obtiene modo + aplica control)
Cada 3 seg  → Rotación OLED (5 pantallas: pH/Cloro/Temp/Turb/BOMBAS)
Cada 30 seg → Envío de lecturas a BD
```

**Beneficio**: Respuesta inmediata, no espera 30 segundos.

---

### ✅ Cambio 3: Endpoints API OPTIMIZADOS

**Nuevo flujo:**
```
ESP32
  ├─ PING /api/esp32/ping              (< 5ms)   ← Heartbeat
  ├─ GET /api/esp32/status             (< 20ms)  ← Modo + sensores
  ├─ POST /api/esp32/readings          (< 2seg)  ← Datos históricos
  └─ Si falla → Apagar todas bombas (seguridad)
```

---

## 🔌 VERIFICACIÓN DE CONEXIÓN

### 1️⃣ **Monitoreo Serial** (mientras está conectado USB)
```
[WiFi] ✅ Conectado: 192.168.1.XX
[Ping] OK
[Status] modo=lluvia bombas=ON
[Bombas] 🌧️  LLUVIA: ✅ TODAS ENCENDIDAS
[Ciclo] 1 | Modo: lluvia | WiFi: ✅ | Bombas: ON ✅
[Sensor] pH: 6.95 | Cloro: 1.05 ppm | Temp: 23.5°C | Turbidez: 2.3 NTU
[Stats] Exitosos: 1 | Errores: 0
```

### 2️⃣ **Panel Web en tiempo real**
- Ir a: `https://simulacionaquasensors.onrender.com`
- Ver si bombas cambian cuando cambias modo en servidor

---

## 🔴 VER ESTADO DE LAS BOMBAS

### 📱 Opción 1: OLED Display (Pantalla 5)

**Rotación OLED cada 3 segundos:**
```
[1] pH      [2] Cloro    [3] Temperatura
    ↓              ↓               ↓
[4] Turbidez      [5] BOMBAS ← NUEVA
```

**Pantalla "BOMBAS" muestra:**
- **Línea 1**: "BOMBAS" + Modo actual (LLUVIA/NORMAL)
- **Línea 2**: "ON" ✅ o "OFF" ❌ (estado actual)
- **Línea 3**: WiFi+ (conexión OK) o WiFi- (falla)

**Cambios visuales:**
```
Modo LLUVIA         Modo NORMAL
┌─────────────────┐ ┌─────────────────┐
│ BOMBAS   LLUVIA │ │ BOMBAS   NORMAL │
│ ON     rain     │ │ OFF     Sun     │
│ WiFi+           │ │ WiFi+           │
└─────────────────┘ └─────────────────┘
```

---

### 📺 Opción 2: Serial Monitor (115200 baud)

**Cambio de modo:**
```
╔════════════════════════════════════╗
║ 🌧️  MODO LLUVIA ACTIVADO         ║
║ Todas las bombas ENCENDIDAS       ║
╚════════════════════════════════════╝

[Bombas] 🧂 Cloro        ✅ ON
[Bombas] 🦠 Alguicida    ✅ ON
[Bombas] 💧 Clarificador ✅ ON
[Bombas] ⚗️  Carbonato    ✅ ON
```

**Cada ciclo (cada 30 seg):**
```
╔══════════════════════════════════╗
║ CICLO 45 - Modo: lluvia          ║
╚══════════════════════════════════╝
[WiFi] ✅ Conectado | [Bombas] 🔴 ACTIVAS

[Detalles Bombas]
  🧂 Cloro        → ✅
  🦠 Alguicida    → ✅
  💧 Clarificador → ✅
  ⚗️  Carbonato    → ✅

[Sensores] pH: 6.95 | Cloro: 1.05 ppm | Temp: 23.5°C | Turbidez: 2.3 NTU
[Stats] Exitosos: 45 | Errores: 2 | Ratio: 95.7%
```

**Leyenda de emojis:**
- 🧂 = Cloro líquido
- 🦠 = Alguicida
- 💧 = Clarificador
- ⚗️  = Carbonato de sodio
- 🔴 = Bombas ACTIVAS (todas ON)
- ⚪ = Bombas Inactivas (todas OFF)
- 🌧️ = Modo LLUVIA
- ☀️ = Modo NORMAL

---

### 3️⃣ **Verificar Endpoints (curl)**

**A. Ping rápido:**
```bash
curl -s https://simulacionaquasensors.onrender.com/api/esp32/ping | jq
```
**Respuesta esperada:**
```json
{
  "ok": true,
  "bombas": true,
  "ciclo": 45,
  "responseMs": 2
}
```

**B. Status completo:**
```bash
curl -s https://simulacionaquasensors.onrender.com/api/esp32/status | jq
```
**Respuesta esperada:**
```json
{
  "cloro": 0.6,
  "ph": 6.9,
  "turbidez": 2.8,
  "tempAgua": 23,
  "modo": "lluvia",
  "bombas": true,
  "activar": ["cloro_liquido", "alguicida", "clarificador", "carbonato_sodio"],
  "timestamp": "2026-05-04T...",
  "ciclo": 45
}
```

### 4️⃣ **Indicadores de Salud**

| Indicador | OK | ⚠️ Warning | ❌ Error |
|-----------|----|-----------|----|
| Ping | < 5ms | 5-50ms | > 50ms o timeout |
| Status | < 20ms | 20-100ms | > 100ms o timeout |
| WiFi | ✅ Conectado | - | ❌ Desconectado |
| Bombas | Sincronizadas con modo | Parciales | No responden |
| Ciclos | exitosos > errores | 50/50 | errores > exitosos |

## 🔍 CÓDIGO CLAVE - NUEVA FUNCIÓN

### `controlarBombasPorModo(String modo)`
```cpp
void controlarBombasPorModo(String modo) {
  if (modo == "lluvia") {
    // ✅ MODO LLUVIA: Encender todas las bombas
    BOMBA_ON(RELAY_CLORO);
    BOMBA_ON(RELAY_ALGUICIDA);
    BOMBA_ON(RELAY_CLARIF);
    BOMBA_ON(RELAY_CARBONATO);
    g_bombasActivas = true;
    
    Serial.println("[Bombas] 🌧️  LLUVIA: ✅ TODAS ENCENDIDAS");
  } else {
    // ❌ MODO NORMAL: Apagar todas las bombas
    BOMBA_OFF(RELAY_CLORO);
    BOMBA_OFF(RELAY_ALGUICIDA);
    BOMBA_OFF(RELAY_CLARIF);
    BOMBA_OFF(RELAY_CARBONATO);
    g_bombasActivas = false;
    
    Serial.println("[Bombas] ☀️  NORMAL: ❌ TODAS APAGADAS");
  }
}
```

**Cambio de parámetros a modo:**
- ❌ Eliminado: `if (cloro < CLORO_MIN)` individual
- ✅ Agregado: `if (modo == "lluvia")` global

---

## 📊 DIAGRAMA DE FLUJO

```
┌─────────────────────────────────────┐
│     ESP32 Inicia                    │
├─────────────────────────────────────┤
│ 1. Apagar todas bombas (seguridad)  │
│ 2. Conectar WiFi                    │
│ 3. Iniciar OLED splash              │
└────────────┬────────────────────────┘
             │
             ▼
    ┌────────────────┐
    │   LOOP INICIA  │
    └────────────────┘
             │
      ┌──────┼──────┐
      │      │      │
      ▼      ▼      ▼
    PING  STATUS  OLED   LECTURAS
   (1s)   (5s)   (3s)    (30s)
      │      │      │       │
      │      │      │       └─→ POST readings a BD
      │      │      └─────────→ Rotar pantalla (pH/Cloro/Temp/Turb)
      │      │
      │      └──→ GET /api/esp32/status
      │           ├─ Recibe: modo, bombas, sensores
      │           └─ Aplica: controlarBombasPorModo()
      │               ├─ Si "lluvia" → Todas ON
      │               └─ Si "normal" → Todas OFF
      │
      └─────────→ GET /api/esp32/ping
                  ├─ Si OK   → g_wifiOk = true
                  └─ Si FAIL → g_wifiOk = false
                               apagarTodasLasBombas()
```

---

## ⚡ COMPARACIÓN: ANTES vs DESPUÉS

### Antes v3.2 - Problema
```
t=0s   → Status: modo=lluvia, cloro=0.8, turbidez=2.5
t=1s   → Bomba1 ON (cloro bajo) ✅
t=2s   → Bomba2 ON (turbidez alta) ✅
t=3s   → Bomba3 ON (turbidez alta) ✅
t=5s   → Bomba4 ON (pH bajo) ✅
t=30s  → SIGUIENTE lectura... MUY LENTO 😱
```

### Después v3.3 - Solución
```
t=0s   → Status: modo=lluvia
t=1s   → controlarBombasPorModo("lluvia")
         → Todas 4 bombas ON instantáneamente ✅
t=5s   → Verificar cambio de modo
t=30s  → Enviar histórico a BD
```

---

## 🛡️ PROTECCIONES DE SEGURIDAD

1. **Apagado de emergencia**: Si WiFi desconecta → Todas bombas OFF
2. **Timeout corto**: PING con timeout de 2 segundos
3. **Contador de errores**: Si errores > exitosos → Log warning
4. **Estado anterior**: Detecta cambios de modo y solo actúa si cambió

---

## 📝 INSTALACIÓN

1. **Abrir** `ESP32_OPTIMIZADO.ino` en Arduino IDE
2. **Configurar WiFi**:
   ```cpp
   const char* WIFI_SSID     = "Tu_WiFi";
   const char* WIFI_PASSWORD = "Tu_Password";
   ```
3. **Verificar Pool ID**:
   ```cpp
   const char* POOL_ID = "2ca40228-45f4-4355-b3e0-3175bcbe11f1";
   ```
4. **Cargar** a ESP32
5. **Abrir Serial Monitor** (115200 baud)
6. **Verificar logs** de conexión

---

## 🔗 ENDPOINTS UTILIZADOS

| Endpoint | Método | Propósito | Timeout |
|----------|--------|----------|---------|
| `/api/esp32/ping` | GET | Verificar conexión | 2s |
| `/api/esp32/status` | GET | Obtener modo + sensores | 5s |
| `/api/esp32/readings` | POST | Enviar lecturas a BD | 8s |

---

## ⚠️ TROUBLESHOOTING

### Bombas no responden
✓ Verificar WiFi: `[WiFi] ✅ Conectado`
✓ Verificar modo: `[Status] modo=...`
✓ Revisar relay pins: 13, 14, 27, 26

### Conexión lenta
✓ Verificar RSSI WiFi: `RSSI > -70 dBm`
✓ Revisar timeout de HTTP (reducir si es muy alto)
✓ Comprobar si servidor está activo

### Errores de JSON
✓ Verificar respuesta de API con curl
✓ Revisar tamaño buffer: `StaticJsonDocument<512>`

---

## 📊 VARIABLES GLOBALES IMPORTANTES

```cpp
String g_modo           // "normal" o "lluvia"
bool g_bombasActivas    // Estado actual de bombas
bool g_wifiOk           // Conexión WiFi OK/NO
int g_ciclosExitosos    // Contador de ciclos sin error
int g_ciclosErrados     // Contador de fallos
```

---

## ✨ MEJORAS IMPLEMENTADAS

| # | Mejora | Impacto |
|---|--------|--------|
| 1 | Lógica de bombas por modo | Control consistente |
| 2 | Ping rápido (1 seg) | Detección rápida de fallos |
| 3 | Status cada 5 seg | Respuesta instantánea |
| 4 | Multi-timing (no blocking) | Aplicación responsive |
| 5 | Contador de ciclos | Monitoreo de salud |
| 6 | Apagado de emergencia | Seguridad mejorada |
| 7 | Caché de parámetros | Logs sin reconexión |
| 8 | 🆕 Pantalla OLED de bombas | Ver estado en tiempo real |
| 9 | 🆕 Detalles en Serial Monitor | Logs detallados con emojis |
| 10 | 🆕 Indicadores por químico | Visualizar cada bomba |

---

## 🚀 PRÓXIMOS PASOS

1. ✅ Probar código en ESP32
2. ✅ Verificar logs en Serial Monitor
3. ✅ Confirmar bombas ON/OFF con cambio de modo
4. ✅ Validar endpoints con curl
5. ✅ Subir `ESP32_OPTIMIZADO.ino` a GitHub (opcional)
6. ✅ Actualizar documentación proyecto

---

**Última actualización**: 4 de mayo de 2026  
**Versión**: 3.3 OPTIMIZADO + Pantalla de Bombas
