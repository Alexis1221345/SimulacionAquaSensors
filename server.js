// ═══════════════════════════════════════════════════════════════════
// SERVER v2 — AquaSensors Simulador controlado
// Express + WebSocket + Panel web en localhost:3000
// Arranca automáticamente. Solo 2 modos: normal / lluvia.
// Incluye GET /api/modo para que el ESP32 consulte el estado.
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
// RUTAS API
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
// Responde: { modo, bombas, tempAmbiente, tempAgua, activar[] }
app.get('/api/modo', (req, res) => {
  const estado = scheduler.getEstadoCompleto();
  const cond   = estado.condiciones;

  const respuesta = {
    modo:         cond.modoClima,
    bombas:       cond.bombas,
    tempAmbiente: cond.tempAmbiente,
    tempAgua:     cond.tempAgua,
    activar:      cond.bombas
      ? ['cloro_liquido', 'alguicida', 'clarificador', 'carbonato_sodio']
      : [],
  };

  res.json(respuesta);
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
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  AquaSensors Simulador v2 — Controlado   ║');
  console.log(`║  Panel: http://localhost:${PORT}            ║`);
  console.log('║  ESP32: GET /api/modo                    ║');
  console.log('╚══════════════════════════════════════════╝\n');
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