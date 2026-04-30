// ═══════════════════════════════════════════════════════════════════
// SERVER v3 — AquaSensors
// Express + WebSocket + Panel web
// Simulador controlado (normal / lluvia)
// ESP32: POST /api/esp32/readings  |  GET /api/modo
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config();
const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const { createClient } = require('@supabase/supabase-js');
const Scheduler = require('./simulator/scheduler');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── WebSocket broadcast ──────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

const scheduler = new Scheduler(broadcast);

// ═════════════════════════════════════════════════════════════════
// HELPERS — status calculado igual que el simulador
// ═════════════════════════════════════════════════════════════════

function statusCloro(v) {
  if (v < 0.5 || v > 5.0) return 'critico';
  if (v < 1.0 || v > 3.0) return 'alerta';
  return 'optimo';
}

function statusPh(v) {
  if (v < 6.8 || v > 8.2) return 'critico';
  if (v < 7.2 || v > 7.8) return 'alerta';
  return 'optimo';
}

function statusTurbidez(v) {
  if (v > 4.0) return 'critico';
  if (v > 1.0) return 'alerta';
  return 'optimo';
}

function statusTemperatura(v) {
  if (v < 15 || v > 33) return 'critico';
  if (v < 18 || v > 30) return 'alerta';
  return 'optimo';
}

function statusAlcalinidad(v) {
  // Rango óptimo: 80–120 ppm
  if (v < 60 || v > 180)  return 'critico';
  if (v < 80 || v > 120)  return 'alerta';
  return 'optimo';
}

// ═════════════════════════════════════════════════════════════════
// RUTAS API — Simulador (sin cambios)
// ═════════════════════════════════════════════════════════════════

// GET /api/pools
app.get('/api/pools', async (req, res) => {
  const { data, error } = await supabase
    .from('pools')
    .select('id, nombre, tipo, volumen_litros, ubicacion')
    .eq('activa', true)
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/estado
app.get('/api/estado', async (req, res) => {
  const estado     = scheduler.getEstadoCompleto();
  const inventario = scheduler.pools.length > 0 ? await scheduler.getInventario() : [];
  res.json({ ...estado, inventario });
});

// POST /api/modo — cambia entre normal y lluvia desde el panel
app.post('/api/modo', async (req, res) => {
  const { modo } = req.body;
  if (modo !== 'normal' && modo !== 'lluvia')
    return res.status(400).json({ error: 'Modo debe ser "normal" o "lluvia"' });

  await scheduler.cambiarModo(modo);
  const cond = scheduler.getEstadoCompleto().condiciones;
  console.log(`[Server] Panel → Modo: ${modo} | T°amb: ${cond.tempAmbiente}°C | T°agua: ${cond.tempAgua}°C`);
  res.json({ ok: true, modo, tempAmbiente: cond.tempAmbiente, tempAgua: cond.tempAgua, bombas: cond.bombas });
});

// GET /api/modo — el ESP32 consulta este endpoint para saber si encender bombas
app.get('/api/modo', (req, res) => {
  const estado = scheduler.getEstadoCompleto();
  const cond   = estado.condiciones;

  res.json({
    modo:         cond.modoClima,
    bombas:       cond.bombas,
    tempAmbiente: cond.tempAmbiente,
    tempAgua:     cond.tempAgua,
    activar:      cond.bombas
      ? ['cloro_liquido', 'alguicida', 'clarificador', 'carbonato_sodio']
      : [],
  });
});

// GET /api/alertas
app.get('/api/alertas', async (req, res) => {
  const { data, error } = await supabase
    .from('alerts')
    .select('*, pools(nombre)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/forzar — forzar un valor manual en una alberca
app.post('/api/forzar', (req, res) => {
  const { pool_id, parametro, valor } = req.body;
  scheduler.forzarValor(pool_id, parametro, valor);
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════
// RUTA ESP32 — POST /api/esp32/readings
// Body esperado (JSON):
// {
//   "pool_id":     "2ca40228-45f4-4355-b3e0-3175bcbe11f1",
//   "ph":          7.4,
//   "cloro":       2.1,
//   "temperatura": 27.5,
//   "turbidez":    0.3,
//   "alcalinidad": 95.0
// }
// Todos los campos son opcionales excepto pool_id.
// Los que no se envíen simplemente no se insertan.
// ═════════════════════════════════════════════════════════════════
app.post('/api/esp32/readings', async (req, res) => {
  const { pool_id, ph, cloro, temperatura, turbidez, alcalinidad } = req.body;

  // Validar pool_id
  if (!pool_id) {
    return res.status(400).json({ error: 'pool_id es requerido' });
  }

  // Verificar que la alberca existe
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('id, nombre')
    .eq('id', pool_id)
    .single();

  if (poolError || !pool) {
    return res.status(404).json({ error: `Alberca ${pool_id} no encontrada` });
  }

  const timestamp = new Date().toISOString();
  const base      = { pool_id, session_id: null, source: 'esp32', timestamp };
  const promises  = [];
  const lecturas  = {};

  // ── Insertar solo los sensores que vienen en el body ────────────

  if (cloro !== undefined && cloro !== null) {
    const valor  = Math.round(parseFloat(cloro) * 100) / 100;
    const status = statusCloro(valor);
    lecturas.cloro = { valor, status };
    promises.push(
      supabase.from('readings_cloro').insert({ ...base, valor, status })
    );
  }

  if (ph !== undefined && ph !== null) {
    const valor  = Math.round(parseFloat(ph) * 100) / 100;
    const status = statusPh(valor);
    lecturas.ph = { valor, status };
    promises.push(
      supabase.from('readings_ph').insert({ ...base, valor, status })
    );
  }

  if (turbidez !== undefined && turbidez !== null) {
    const valor  = Math.round(parseFloat(turbidez) * 100) / 100;
    const status = statusTurbidez(valor);
    lecturas.turbidez = { valor, status };
    promises.push(
      supabase.from('readings_turbidez').insert({ ...base, valor, status })
    );
  }

  if (temperatura !== undefined && temperatura !== null) {
    const valor  = Math.round(parseFloat(temperatura) * 100) / 100;
    const status = statusTemperatura(valor);
    lecturas.temperatura = { valor, status };
    promises.push(
      supabase.from('readings_temperatura').insert({ ...base, valor, status, tipo: 'agua' })
    );
  }

  if (alcalinidad !== undefined && alcalinidad !== null) {
    const valor  = Math.round(parseFloat(alcalinidad) * 100) / 100;
    const status = statusAlcalinidad(valor);
    lecturas.alcalinidad = { valor, status };
    promises.push(
      supabase.from('readings_alcalinidad').insert({ ...base, valor, status })
    );
  }

  if (promises.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un parámetro (ph, cloro, temperatura, turbidez, alcalinidad)' });
  }

  // ── Ejecutar inserciones ────────────────────────────────────────
  try {
    const results = await Promise.all(promises);
    const errores = results
      .filter(r => r.error)
      .map(r => r.error.message);

    if (errores.length > 0) {
      console.error(`[ESP32] Errores insertando lecturas:`, errores);
      return res.status(500).json({ error: 'Error guardando lecturas', detalle: errores });
    }

    console.log(`[ESP32] ✓ ${pool.nombre} | ${Object.entries(lecturas).map(([k,v]) => `${k}:${v.valor}`).join(' | ')}`);

    // ── Generar alertas si algún parámetro está fuera de rango ────
    const alertPromises = [];
    const labels  = { cloro: 'Cloro', ph: 'pH', turbidez: 'Turbidez', temperatura: 'Temperatura agua', alcalinidad: 'Alcalinidad' };
    const unidades = { cloro: ' ppm', ph: '', turbidez: ' NTU', temperatura: '°C', alcalinidad: ' ppm' };

    for (const [param, { valor, status }] of Object.entries(lecturas)) {
      if (status === 'optimo') continue;
      const prefix  = status === 'critico' ? 'CRÍTICO' : 'Alerta';
      const mensaje = `${prefix} ESP32 — ${labels[param]}: ${valor}${unidades[param]}`;

      alertPromises.push(
        supabase.from('alerts').insert({
          pool_id,
          session_id:      null,
          parametro:       param,
          valor_detectado: valor,
          nivel:           status,
          mensaje,
          resuelta:        false,
          created_at:      timestamp,
        })
      );

      console.log(`[ESP32] ⚠ Alerta ${status.toUpperCase()} — ${param}: ${valor}`);
    }

    if (alertPromises.length > 0) {
      await Promise.all(alertPromises);
    }

    // ── Respuesta al ESP32 ─────────────────────────────────────────
    res.json({
      ok:        true,
      pool:      pool.nombre,
      timestamp,
      lecturas,
      alertas:   alertPromises.length,
    });

  } catch (err) {
    console.error(`[ESP32] Error inesperado:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── WebSocket handshake ──────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Panel conectado');
  ws.send(JSON.stringify({ ...scheduler.getEstadoCompleto(), type: 'init' }));
  ws.on('close', () => console.log('[WS] Panel desconectado'));
});

// ═════════════════════════════════════════════════════════════════
// ARRANQUE AUTOMÁTICO — modo normal por defecto
// ═════════════════════════════════════════════════════════════════
async function autoArrancar() {
  try {
    const { data: pools, error } = await supabase
      .from('pools')
      .select('id, nombre, tipo, volumen_litros')
      .eq('activa', true)
      .order('nombre');

    if (error) throw new Error(error.message);
    if (!pools || pools.length === 0) throw new Error('No hay albercas activas en Supabase');

    console.log(`[Auto] ${pools.length} albercas:`);
    pools.forEach(p => console.log(`       · ${p.nombre}`));
    console.log(`[Auto] Modo inicial: NORMAL | T°amb: 27°C | T°agua: 27°C\n`);

    await scheduler.iniciar({ pools });

  } catch (err) {
    console.error('[Auto] Error al arrancar:', err.message);
  }
}

// ── Servidor ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   AquaSensors v3 — Simulador + ESP32        ║');
  console.log(`║   Panel:  http://localhost:${PORT}              ║`);
  console.log('║   ESP32:  POST /api/esp32/readings           ║');
  console.log('║   Modo:   GET  /api/modo                     ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  autoArrancar();
});

process.on('SIGINT', async () => {
  console.log('\n[Server] Cerrando...');
  await scheduler.detener();
  process.exit(0);
});

// Evitar sleep en Render (plan gratuito)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
  }, 14 * 60 * 1000);
}