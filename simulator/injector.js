// ═══════════════════════════════════════════════════════════════════
// INJECTOR — Inserta lecturas en Supabase
// Maneja readings, temperatura ambiente, inventario y sesiones
// ═══════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class Injector {

  constructor() {
    this.sessionId = null;
  }

  // ── Crear sesión de simulación ───────────────────────────────────
  async crearSesion(nombre, escenario, poolIds, tempAmbiental, acelerado) {
    const { data, error } = await supabase
      .from('simulation_sessions')
      .insert({
        nombre,
        escenario,
        pool_ids:         poolIds,
        temp_ambiente_avg: tempAmbiental,
        intervalo_min:    acelerado ? 1 : 180,
        acelerado,
        activa:           true,
      })
      .select()
      .single();

    if (error) throw new Error(`Error creando sesión: ${error.message}`);
    this.sessionId = data.id;
    console.log(`[Injector] Sesión creada: ${data.id}`);
    return data;
  }

  // ── Finalizar sesión ─────────────────────────────────────────────
  async finalizarSesion() {
    if (!this.sessionId) return;
    await supabase
      .from('simulation_sessions')
      .update({ activa: false, finalizada_en: new Date().toISOString() })
      .eq('id', this.sessionId);
    this.sessionId = null;
  }

  // ── Insertar ciclo completo de lecturas ──────────────────────────
  async insertarCiclo(cicloData) {
    const { pool_id, lecturas, temp_agua, temp_ambiente } = cicloData;
    const timestamp = new Date().toISOString();
    const session_id = this.sessionId;

    const promises = [];

    // Cloro
    promises.push(
      supabase.from('readings_cloro').insert({
        pool_id, session_id,
        valor:     lecturas.cloro.valor,
        status:    lecturas.cloro.status,
        source:    'simulator',
        timestamp,
      })
    );

    // pH
    promises.push(
      supabase.from('readings_ph').insert({
        pool_id, session_id,
        valor:     lecturas.ph.valor,
        status:    lecturas.ph.status,
        source:    'simulator',
        timestamp,
      })
    );

    // Alcalinidad
    promises.push(
      supabase.from('readings_alcalinidad').insert({
        pool_id, session_id,
        valor:     lecturas.alcalinidad.valor,
        status:    lecturas.alcalinidad.status,
        source:    'simulator',
        timestamp,
      })
    );

    // Turbidez
    promises.push(
      supabase.from('readings_turbidez').insert({
        pool_id, session_id,
        valor:     lecturas.turbidez.valor,
        status:    lecturas.turbidez.status,
        source:    'simulator',
        timestamp,
      })
    );

    // Temperatura agua (tabla readings_temperatura existente)
    promises.push(
      supabase.from('readings_temperatura').insert({
        pool_id, session_id,
        valor:     lecturas.temperatura_agua.valor,
        status:    lecturas.temperatura_agua.status,
        source:    'simulator',
        tipo:      'agua',
        timestamp,
      })
    );

    // Temperatura ambiente (tabla nueva)
    promises.push(
      supabase.from('readings_temperatura_ambiente').insert({
        pool_id, session_id,
        valor:     temp_ambiente,
        status:    'referencia',
        source:    'simulator',
        timestamp,
      })
    );

    const results = await Promise.all(promises);

    // Detectar errores
    const errores = results.filter(r => r.error).map(r => r.error.message);
    if (errores.length > 0) {
      console.error('[Injector] Errores al insertar:', errores);
    } else {
      console.log(`[Injector] Ciclo insertado para pool ${pool_id.slice(0, 8)}... ` +
        `Cl:${lecturas.cloro.valor} pH:${lecturas.ph.valor} ` +
        `Alc:${lecturas.alcalinidad.valor} Turb:${lecturas.turbidez.valor} ` +
        `TAgua:${temp_agua}°C TAm:${temp_ambiente}°C`);
    }

    return errores.length === 0;
  }

  // ── Insertar alerta química directamente a Supabase ──────────────
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
    if (error) {
      console.error(`[Alerta] Error insertando alerta ${parametro}:`, error.message);
    } else {
      console.log(`[Alerta] ${nivel.toUpperCase()} — ${parametro}: ${valor_detectado}`);
    }
  }

  // ── Descontar inventario tras dosis recomendada ──────────────────
  async descontarInventario(poolId, quimicoId, cantidadMl) {
    // Obtener nivel actual
    const { data: inv, error: errGet } = await supabase
      .from('chemical_inventory')
      .select('*')
      .eq('pool_id', poolId)
      .eq('quimico_id', quimicoId)
      .single();

    if (errGet || !inv) return;

    const cantidadLitros = cantidadMl / 1000;
    const nuevoNivel = Math.max(0, inv.nivel_actual_litros - cantidadLitros);
    const pctActual  = (nuevoNivel / inv.capacidad_max_litros) * 100;

    await supabase
      .from('chemical_inventory')
      .update({
        nivel_actual_litros: nuevoNivel,
        updated_at:          new Date().toISOString(),
      })
      .eq('pool_id', poolId)
      .eq('quimico_id', quimicoId);

    console.log(`[Inventario] ${inv.quimico_nombre}: ${nuevoNivel.toFixed(1)}L (${pctActual.toFixed(0)}%)`);

    // Si baja del umbral, insertar alerta
    if (pctActual <= inv.nivel_alerta_pct) {
      await supabase.from('alerts').insert({
        pool_id:        poolId,
        parametro:      'inventario',
        valor_detectado: pctActual,
        nivel:          pctActual <= 10 ? 'critico' : 'alerta',
        mensaje:        `${inv.quimico_nombre} al ${pctActual.toFixed(0)}% — reabastecer pronto`,
        resuelta:       false,
      });
      console.log(`[ALERTA] Inventario bajo: ${inv.quimico_nombre} al ${pctActual.toFixed(0)}%`);
    }

    return { nuevoNivel, pctActual };
  }

  // ── Forzar nivel de inventario (desde panel) ─────────────────────
  async forzarInventario(poolId, quimicoId, pct) {
    const { data: inv } = await supabase
      .from('chemical_inventory')
      .select('capacidad_max_litros')
      .eq('pool_id', poolId)
      .eq('quimico_id', quimicoId)
      .single();

    if (!inv) return;

    const nuevoNivel = (inv.capacidad_max_litros * pct) / 100;
    await supabase
      .from('chemical_inventory')
      .update({ nivel_actual_litros: nuevoNivel, updated_at: new Date().toISOString() })
      .eq('pool_id', poolId)
      .eq('quimico_id', quimicoId);
  }

  // ── Obtener inventario actual de todas las albercas ──────────────
  async getInventario(poolIds) {
    const { data, error } = await supabase
      .from('chemical_inventory')
      .select('*')
      .in('pool_id', poolIds)
      .order('pool_id')
      .order('categoria');

    if (error) return [];
    return data.map(item => ({
      ...item,
      pct: Math.round((item.nivel_actual_litros / item.capacidad_max_litros) * 100),
    }));
  }

  // ── Limpiar datos simulados de una sesión ────────────────────────
  async limpiarSesion(sessionId) {
    const tablas = [
      'readings_cloro',
      'readings_ph',
      'readings_alcalinidad',
      'readings_turbidez',
      'readings_temperatura',
      'readings_temperatura_ambiente',
    ];

    for (const tabla of tablas) {
      await supabase.from(tabla).delete().eq('session_id', sessionId);
    }
    console.log(`[Injector] Datos de sesión ${sessionId.slice(0, 8)} eliminados`);
  }

  // ── Test de conexión ─────────────────────────────────────────────
  async testConexion() {
    const { data, error } = await supabase.from('pools').select('id, nombre').limit(3);
    if (error) throw new Error(`Sin conexión a Supabase: ${error.message}`);
    return data;
  }
}

module.exports = Injector;
