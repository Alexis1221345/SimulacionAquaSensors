// ═══════════════════════════════════════════════════════════════════
// INJECTOR v2 — Inserta lecturas en Supabase
// Parámetros: cloro, ph, turbidez, temperatura
// Químicos: cloro_liquido, alguicida, clarificador, carbonato_sodio
// ═══════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class Injector {

  constructor() { this.sessionId = null; }

  async crearSesion(nombre, escenario, poolIds, tempAmbiental) {
    const { data, error } = await supabase
      .from('simulation_sessions')
      .insert({
        nombre,
        escenario,
        pool_ids:          poolIds,
        temp_ambiente_avg: tempAmbiental,
        intervalo_min:     5,
        acelerado:         false,
        activa:            true,
      })
      .select()
      .single();

    if (error) throw new Error(`Error creando sesión: ${error.message}`);
    this.sessionId = data.id;
    console.log(`[Injector] Sesión creada: ${data.id}`);
    return data;
  }

  async finalizarSesion() {
    if (!this.sessionId) return;
    await supabase
      .from('simulation_sessions')
      .update({ activa: false, finalizada_en: new Date().toISOString() })
      .eq('id', this.sessionId);
    this.sessionId = null;
  }

  async insertarCiclo(cicloData) {
    const { pool_id, lecturas, temp_agua, temp_ambiente } = cicloData;
    const timestamp  = new Date().toISOString();
    const session_id = this.sessionId;
    const base       = { pool_id, session_id, source: 'simulator', timestamp };

    const promises = [
      supabase.from('readings_cloro').insert({
        ...base, valor: lecturas.cloro.valor, status: lecturas.cloro.status,
      }),
      supabase.from('readings_ph').insert({
        ...base, valor: lecturas.ph.valor, status: lecturas.ph.status,
      }),
      supabase.from('readings_turbidez').insert({
        ...base, valor: lecturas.turbidez.valor, status: lecturas.turbidez.status,
      }),
      supabase.from('readings_temperatura').insert({
        ...base, valor: lecturas.temperatura_agua.valor,
        status: lecturas.temperatura_agua.status, tipo: 'agua',
      }),
      supabase.from('readings_temperatura_ambiente').insert({
        ...base, valor: temp_ambiente, status: 'referencia',
      }),
    ];

    const results = await Promise.all(promises);
    const errores = results.filter(r => r.error).map(r => r.error.message);

    if (errores.length > 0) {
      console.error('[Injector] Errores:', errores);
    } else {
      console.log(`[Injector] Pool ${pool_id.slice(0,8)} | Cl:${lecturas.cloro.valor} pH:${lecturas.ph.valor} Turb:${lecturas.turbidez.valor} T°agua:${temp_agua}°C T°amb:${temp_ambiente}°C`);
    }

    return errores.length === 0;
  }

  async insertarAlerta({ pool_id, parametro, valor_detectado, nivel, mensaje }) {
    const { error } = await supabase.from('alerts').insert({
      pool_id,
      session_id:      this.sessionId,
      parametro,
      valor_detectado,
      nivel,
      mensaje,
      resuelta:        false,
      created_at:      new Date().toISOString(),
    });
    if (error) console.error(`[Alerta] Error ${parametro}:`, error.message);
    else       console.log(`[Alerta] ${nivel.toUpperCase()} — ${parametro}: ${valor_detectado}`);
  }

  async getInventario(poolIds) {
    const { data, error } = await supabase
      .from('chemical_inventory')
      .select('*')
      .in('pool_id', poolIds)
      .order('pool_id');
    if (error) return [];
    return data.map(item => ({
      ...item,
      pct: Math.round((item.nivel_actual_litros / item.capacidad_max_litros) * 100),
    }));
  }

  async testConexion() {
    const { data, error } = await supabase.from('pools').select('id, nombre').limit(3);
    if (error) throw new Error(`Sin conexión a Supabase: ${error.message}`);
    return data;
  }
}

module.exports = Injector;