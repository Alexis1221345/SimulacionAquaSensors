# 💧 AquaSensors

**Sistema de monitoreo de calidad del agua para albercas residenciales y comerciales.**  
Aplicación móvil Flutter conectada a sensores físicos (ESP32) y respaldada por Supabase como backend en tiempo real.

---

## 📋 Descripción

AquaSensors permite a propietarios y administradores de albercas monitorear en tiempo real los parámetros fisicoquímicos del agua — pH, cloro, temperatura y turbidez — directamente desde su dispositivo móvil. El sistema recibe lecturas de un microcontrolador ESP32 vía Wi-Fi o Bluetooth y las almacena en Supabase para generar reportes históricos, alertas automáticas y recomendaciones de dosis de químicos.

---

## ✨ Funcionalidades

- 📊 **Dashboard en tiempo real** — visualización de pH, cloro, temperatura y turbidez con tacómetros y gráficas de barras
- 🔔 **Alertas automáticas** — detección de parámetros fuera de rango (óptimo / alerta / crítico) generadas desde Supabase
- 💊 **Dosis recomendadas** — cálculo automático de químicos según el volumen de la alberca
- 📈 **Reportes históricos** — gráficas por día, semana, quincena y mes con descarga en PDF
- 🏊 **Gestión de albercas** — soporte para múltiples albercas (rectangular, circular, ovalada) con previsualización 3D SVG
- 📡 **Conexión ESP32** — vía IP directa por Wi-Fi o emparejamiento BLE (Bluetooth Low Energy) con cambio automático de transporte
- 👤 **Autenticación** — inicio de sesión con correo/contraseña o Google OAuth, verificación de correo y recuperación de contraseña
- 🖼️ **Galería de albercas** — subida de fotos al bucket de Supabase Storage

---

## 🗂️ Estructura del proyecto

```
aquasensors/
├── lib/
│   ├── main.dart                        # Entry point, providers globales
│   ├── config/
│   │   ├── router.dart                  # Navegación con transiciones
│   │   └── supabase_config.dart         # Inicialización de Supabase
│   ├── core/
│   │   ├── constants/                   # Colores, estilos, rangos de sensores
│   │   ├── theme/                       # Tema Material 3
│   │   └── utils/                       # Formatters, permisos, status helper
│   ├── data/
│   │   ├── arduino/                     # Servicios ESP32 (HTTP, BLE, Wi-Fi)
│   │   ├── models/                      # UserModel, PoolModel, SensorReading…
│   │   ├── repositories/                # Capa de abstracción sobre servicios
│   │   └── supabase/                    # Servicios de auth, sensores y storage
│   ├── features/
│   │   ├── auth/                        # Login, registro, verificación email
│   │   ├── home/                        # Dashboard con SensorCards y gauges
│   │   ├── pool/                        # Gestión de alberca, alertas, dosis
│   │   ├── reports/                     # Gráficas históricas y descarga PDF
│   │   └── account/                     # Perfil y edición de cuenta
│   └── shared/
│       ├── providers/                   # AuthProvider, SensorProvider, PoolProvider…
│       └── widgets/                     # AppHeader, AppDrawer, AppBottomNav…
├── android/
├── ios/
├── assets/
│   ├── images/
│   └── Inicio_Sesion/
├── pubspec.yaml
└── simulator/                           # Simulador de ESP32 (Node.js) — ver sección
```

---

## 🛠️ Tecnologías

| Capa | Tecnología |
|---|---|
| Framework móvil | Flutter 3.x / Dart 3 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Hardware | ESP32 (HTTP REST + BLE GATT) |
| State management | Provider |
| Comunicación HTTP | `http` ^1.2 |
| Bluetooth | `flutter_blue_plus` ^1.35 |
| Gráficas | SVG vectorial (`flutter_svg`) + `CustomPainter` |
| Permisos | `permission_handler`, `network_info_plus` |
| Auth OAuth | Google Sign-In (Supabase OAuth) |
| Imágenes | `image_picker`, Supabase Storage |

---

## 🚀 Instalación y configuración

### Requisitos previos

- Flutter SDK `>=3.38.4`
- Dart `>=3.10.3`
- Cuenta en [Supabase](https://supabase.com)
- Android SDK (para compilar en Android)

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/aquasensors.git
cd aquasensors
```

### 2. Instalar dependencias

```bash
flutter pub get
```

### 3. Configurar Supabase

Las credenciales ya están configuradas en `lib/config/supabase_config.dart`. Si usas tu propia instancia de Supabase, edita los valores:

```dart
static const String supabaseUrl = 'https://<tu-proyecto>.supabase.co';
static const String supabaseAnonKey = '<tu-anon-key>';
```

> ⚠️ **Recomendación:** Para producción, usa variables de entorno con `flutter_dotenv` en lugar de hardcodear las credenciales.

### 4. Ejecutar la aplicación

```bash
flutter run
```

---

## 📡 Integración con ESP32

El ESP32 debe exponer un servidor HTTP en el puerto `80` con los siguientes endpoints:

| Endpoint | Método | Descripción |
|---|---|---|
| `/sensors` | `GET` | Devuelve lectura actual: `{ ph, cloro, temperatura, turbidez, timestamp }` |
| `/status` | `GET` | Estado del dispositivo: `{ connected, uptime, ip }` |
| `/provision-wifi` | `POST` | Recibe `{ ssid, password }` para unirse a la red local |

La IP por defecto es `192.168.1.100`. Se puede cambiar desde el diálogo de conexión Wi-Fi en la app.

### Conexión BLE

El servicio BLE del ESP32 debe usar los siguientes UUIDs:

```
Service UUID : 4fafc201-1fb5-459e-8fcc-c5c9c331914b
Char UUID    : beb5483e-36e1-4688-b7f5-ea07361b26a8
```

La app detecta automáticamente dispositivos cuyo nombre contenga `esp32` o que anuncien el Service UUID anterior.

---

## 🧪 Simulador ESP32 (Node.js)

El directorio `simulator/` contiene un servidor Node.js que simula el comportamiento del ESP32 para desarrollo sin hardware físico. Usa **Express** y el SDK de **Supabase JS** para insertar lecturas ficticias en la base de datos.

### Instalación

```bash
cd simulator
npm install
```

### Configuración

Crea o edita el archivo `.env`:

```env
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_ANON_KEY=<tu-anon-key>
```

### Ejecución

```bash
node index.js
```

El simulador levanta un servidor HTTP en `http://localhost:80` que responde a los mismos endpoints que el ESP32 real, y opcionalmente inserta lecturas periódicas en Supabase.

---

## 🗄️ Esquema de base de datos (Supabase)

| Tabla | Descripción |
|---|---|
| `profiles` | Datos del usuario (nombre, rol, avatar, teléfono) |
| `pools` | Albercas registradas con dimensiones y volumen calculado |
| `readings_ph` | Lecturas históricas de pH |
| `readings_cloro` | Lecturas históricas de cloro (ppm) |
| `readings_temperatura` | Lecturas históricas de temperatura (°C) |
| `readings_turbidez` | Lecturas históricas de turbidez (NTU) |
| `readings_alcalinidad` | Lecturas históricas de alcalinidad |
| `alerts` | Alertas activas generadas automáticamente |
| `chemical_doses` | Historial de dosis aplicadas |

### Función RPC

La pantalla de alberca consume la función `get_pool_dashboard(p_pool_id)` que agrega en una sola llamada: datos de la alberca, alertas activas, historial de dosis y dosis recomendadas calculadas por volumen.

### Buckets de Storage

| Bucket | Contenido |
|---|---|
| `avatars` | Fotos de perfil de usuarios |
| `pool-images` | Imágenes de albercas |

---

## 🔐 Autenticación

La app soporta dos métodos de inicio de sesión:

- **Email + contraseña** con verificación de correo obligatoria antes de acceder
- **Google OAuth** mediante Supabase OAuth con redirect a `io.supabase.flutter://signin-callback/`

---

## 📊 Rangos de parámetros

| Parámetro | Rango óptimo | Rango alerta |
|---|---|---|
| pH | 7.2 – 7.8 | 6.0 – 9.0 |
| Cloro | 1.0 – 3.0 ppm | 0.0 – 5.0 ppm |
| Temperatura | 26 – 30 °C | 15 – 40 °C |
| Turbidez | 0 – 1.0 NTU | 0 – 5.0 NTU |
| Alcalinidad | 80 – 150 mg/L | 60 – 200 mg/L |

---

## 📁 Assets requeridos

```
assets/
├── images/
│   └── Logo.jpg           # Ícono de la app (también usado para adaptive icon)
└── Inicio_Sesion/
    └── google_logo.png    # Logo de Google para el botón OAuth
```

---

## 🤝 Contribución

1. Haz un fork del repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Realiza tus cambios y commitea: `git commit -m "feat: descripción"`
4. Abre un Pull Request hacia `main`

---

## 📄 Licencia

Este proyecto es de uso privado. Todos los derechos reservados.
