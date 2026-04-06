// ═══════════════════════════════════════════════════════════════════
// SERVER — AquaSensors Simulator
// Express + WebSocket + Panel web en localhost:3000
// Auto-arranca con todas las albercas activas al iniciar
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const { createClient } = require('@supabase/supabase-js');
const Scheduler  = require('./simulator/scheduler');
const { SCENARIOS } = require('./simulator/scenarios');

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
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ── Scheduler global ─────────────────────────────────────────────
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

// GET /api/scenarios
app.get('/api/scenarios', (req, res) => {
  const lista = Object.entries(SCENARIOS).map(([key, s]) => ({
    key,
    nombre:      s.nombre,
    descripcion: s.descripcion,
    temp_min:    s.temp_ambiente.min,
    temp_max:    s.temp_ambiente.max,
  }));
  res.json(lista);
});

// GET /api/estado
app.get('/api/estado', async (req, res) => {
  const estado = scheduler.getEstadoCompleto();
  const inventario = scheduler.pools.length > 0
    ? await scheduler.getInventario()
    : [];
  res.json({ ...estado, inventario });
});

// POST /api/iniciar — arrancar o cambiar escenario manualmente
app.post('/api/iniciar', async (req, res) => {
  try {
    const { pool_ids, escenario, acelerado, ciclos } = req.body;

    if (!pool_ids || pool_ids.length === 0)
      return res.status(400).json({ error: 'Selecciona al menos una alberca' });
    if (!escenario)
      return res.status(400).json({ error: 'Selecciona un escenario' });

    const { data: pools, error } = await supabase
      .from('pools')
      .select('id, nombre, tipo, volumen_litros')
      .in('id', pool_ids);

    if (error) return res.status(500).json({ error: error.message });

    await scheduler.iniciar({ pools, acelerado: acelerado || false });

    res.json({ ok: true, mensaje: 'Simulación iniciada' });
  } catch (err) {
    console.error('[Server] Error al iniciar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pausar
app.post('/api/pausar', (req, res) => {
  scheduler.pausar();
  res.json({ ok: true });
});

// POST /api/reanudar
app.post('/api/reanudar', (req, res) => {
  scheduler.reanudar();
  res.json({ ok: true });
});

// POST /api/detener — solo detiene cuando el usuario lo pide explícitamente
app.post('/api/detener', async (req, res) => {
  await scheduler.detener();
  res.json({ ok: true });
});

// POST /api/cambiar-escenario — cambia escenario sin parar el servidor
app.post('/api/cambiar-escenario', async (req, res) => {
  try {
    const { escenario, acelerado } = req.body;
    if (!escenario)
      return res.status(400).json({ error: 'Escenario requerido' });

    const { data: pools, error } = await supabase
      .from('pools')
      .select('id, nombre, tipo, volumen_litros')
      .eq('activa', true);

    if (error) return res.status(500).json({ error: error.message });

    await scheduler.iniciar({
      pools,
      acelerado: acelerado !== undefined ? acelerado : scheduler.acelerado,
    });

    res.json({ ok: true, mensaje: `Escenario cambiado a: ${escenario}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forzar
app.post('/api/forzar', (req, res) => {
  const { pool_id, parametro, valor } = req.body;
  scheduler.forzarValor(pool_id, parametro, valor);
  res.json({ ok: true });
});

// GET /api/inventario
app.get('/api/inventario', async (req, res) => {
  const { data, error } = await supabase
    .from('chemical_inventory')
    .select('*, pools(nombre)')
    .order('pool_id')
    .order('categoria');
  if (error) return res.status(500).json({ error: error.message });

  const resultado = data.map(item => ({
    ...item,
    pool_nombre: item.pools?.nombre,
    pct: Math.round((item.nivel_actual_litros / item.capacidad_max_litros) * 100),
  }));
  res.json(resultado);
});

// POST /api/inventario/reset
app.post('/api/inventario/reset', async (req, res) => {
  const { pool_id } = req.body;
  const { data: items } = await supabase
    .from('chemical_inventory')
    .select('id, capacidad_max_litros')
    .eq('pool_id', pool_id);

  if (items) {
    for (const item of items) {
      await supabase
        .from('chemical_inventory')
        .update({ nivel_actual_litros: item.capacidad_max_litros })
        .eq('id', item.id);
    }
  }
  res.json({ ok: true, mensaje: 'Inventario repuesto al 100%' });
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

// ── WebSocket handshake ──────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Panel conectado');
  ws.send(JSON.stringify({
    ...scheduler.getEstadoCompleto(),
    type: 'init',
  }));
  ws.on('close', () => console.log('[WS] Panel desconectado'));
});

// ═════════════════════════════════════════════════════════════════
// ARRANQUE AUTOMÁTICO
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

    const acelerado = process.env.ACELERADO_DEFAULT === 'true';

    console.log(`[Auto] ${pools.length} albercas encontradas:`);
    pools.forEach(p => console.log(`       · ${p.nombre} (${(p.volumen_litros/1000).toLocaleString('es-MX')} m³)`));
    console.log(`[Auto] Modo: ${acelerado ? 'ACELERADO (30s/ciclo)' : 'REAL (3h/ciclo)'} — ciclo diario automático\n`);

    await scheduler.iniciar({ pools, acelerado });

  } catch (err) {
    console.error('[Auto] ⚠ Error al arrancar automáticamente:', err.message);
    console.error('[Auto]   Puedes iniciar manualmente desde el panel.\n');
  }
}

// ── Arrancar servidor ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   AquaSensors Simulator v1.0           ║');
  console.log('║   Panel: http://localhost:' + PORT + '          ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('Ctrl+C para detener\n');
  autoArrancar();
});

// ── Graceful shutdown — solo con Ctrl+C ──────────────────────────
process.on('SIGINT', async () => {
  console.log('\n[Server] Deteniendo simulador...');
  await scheduler.detener();
  console.log('[Server] ✓ Cerrado correctamente');
  process.exit(0);
});

// Evitar que Render se duerma (plan gratuito)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL)
      .then(() => console.log('Ping enviado para mantener el servicio activo'))
      .catch(err => console.error('Error en ping:', err));
  }, 14 * 60 * 1000); // cada 14 minutos
}