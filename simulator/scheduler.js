// ═══════════════════════════════════════════════════════════════════
// SCHEDULER — Lecturas cada 5 minutos con hora real
// Sin modo acelerado — clima fijo aleatorio por día
// ═══════════════════════════════════════════════════════════════════

const Injector               = require('./injector');
const { getCondicionesHora,
        getNombreEscenario } = require('./day_cycle');

const INTERVALO_LECTURA_MS   = 5 * 60 * 1000;  // 5 minutos
const INTERVALO_CONDICION_MS = 5 * 60 * 1000;  // actualizar display cada 5 min

class Scheduler {

  constructor(broadcast) {
    this.broadcast           = broadcast;
    this.injector            = new Injector();
    this.timerLectura        = null;
    this.timerCondicion      = null;
    this.corriendo           = false;
    this.pools               = [];
    this.sesionId            = null;
    this.ciclosHechos        = 0;
    this.estadoPools         = {};
    this.condicionesActuales = null;
    this.escenarioActual     = 'normal';

    // Cargar condiciones al arrancar
    this._actualizarCondiciones();
  }

  async iniciar({ pools }) {
    if (this.corriendo) await this.detener();

    this.pools        = pools;
    this.ciclosHechos = 0;
    this.estadoPools  = {};

    await this.injector.testConexion();

    const sesion = await this.injector.crearSesion(
      `Simulación ${new Date().toLocaleString('es-MX')}`,
      this.escenarioActual,
      pools.map(p => p.id),
      this.condicionesActuales?.tempAmbiente || null,
      false
    );
    this.sesionId = sesion.id;

    pools.forEach(pool => {
      this.estadoPools[pool.id] = {
        pool,
        cloro:       1.8 + Math.random() * 0.4,
        ph:          7.3 + Math.random() * 0.2,
        alcalinidad: 105 + Math.random() * 15,
        turbidez:    0.3 + Math.random() * 0.2,
      };
    });

    this.corriendo = true;
    this._actualizarCondiciones();
    await this._ejecutarLectura();

    this.timerLectura = setInterval(async () => {
      if (!this.corriendo) return;
      await this._ejecutarLectura();
    }, INTERVALO_LECTURA_MS);

    this.timerCondicion = setInterval(() => {
      if (!this.corriendo) return;
      this._actualizarCondiciones();
    }, INTERVALO_CONDICION_MS);

    console.log(`\n[Scheduler] Iniciado — lecturas cada 5min | Clima: ${this.escenarioActual}\n`);
    this._broadcastEstado();
  }

  _actualizarCondiciones() {
    const ahora       = new Date();
    const condiciones = getCondicionesHora(ahora);
    const escenario   = getNombreEscenario(condiciones);

    this.condicionesActuales = condiciones;
    this.escenarioActual     = escenario;

    console.log(`[DayCycle] ${ahora.toLocaleTimeString('es-MX')} | ${condiciones.desc} | ${condiciones.tempAmbiente}°C | UV:${condiciones.factorUV} | Uso:${(condiciones.factorUso*100).toFixed(0)}%`);
    this._broadcastEstado();
  }

  async _ejecutarLectura() {
    if (!this.corriendo || !this.condicionesActuales) return;
    this.ciclosHechos++;
    const cond = this.condicionesActuales;

    console.log(`\n[Scheduler] ── Lectura ${this.ciclosHechos} — ${new Date().toLocaleTimeString('es-MX')} ──`);

    for (const pool of this.pools) {
      try {
        const e   = this.estadoPools[pool.id];
        const r   = () => (Math.random() * 0.04 - 0.02);
        const deg = cond.degradacion;

        e.cloro       = Math.max(0,   Math.min(8,   e.cloro       + deg.cloro       + r()));
        e.ph          = Math.max(5.5, Math.min(9.0, e.ph          + deg.ph          + r() * 0.5));
        e.alcalinidad = Math.max(0,   Math.min(300, e.alcalinidad + deg.alcalinidad + r() * 3));
        const factorCloroTurb = e.cloro < 1.0 ? 1.8 : 1.0;
        e.turbidez    = Math.max(0,   Math.min(10,  e.turbidez    + deg.turbidez * factorCloroTurb + r()));

        const cloro       = Math.round(e.cloro       * 100) / 100;
        const ph          = Math.round(e.ph           * 100) / 100;
        const alcalinidad = Math.round(e.alcalinidad  * 10)  / 10;
        const turbidez    = Math.round(e.turbidez     * 100) / 100;
        const tempAgua    = Math.round((cond.tempAgua    + Math.random() * 0.6 - 0.3) * 10) / 10;
        const tempAmb     = Math.round((cond.tempAmbiente + Math.random() * 0.4 - 0.2) * 10) / 10;

        const cicloData = {
          pool_id:       pool.id,
          temp_agua:     tempAgua,
          temp_ambiente: tempAmb,
          lecturas: {
            cloro:            { valor: cloro,       status: this._stCloro(cloro)       },
            ph:               { valor: ph,           status: this._stPh(ph)             },
            alcalinidad:      { valor: alcalinidad,  status: this._stAlc(alcalinidad)   },
            turbidez:         { valor: turbidez,     status: this._stTurb(turbidez)     },
            temperatura_agua: { valor: tempAgua,     status: 'optimo'                   },
          },
        };

        const ok = await this.injector.insertarCiclo(cicloData);
        if (ok) {
          await this._procesarAlertas(pool, cicloData);
          await this._procesarInventario(pool, cicloData);
        }

      } catch (err) {
        console.error(`[Scheduler] Error pool ${pool.nombre}:`, err.message);
      }
    }
    this._broadcastEstado();
  }

  // ── Evaluar y enviar alertas químicas a Supabase ─────────────────
  async _procesarAlertas(pool, { lecturas, temp_agua }) {
    const checks = [
      { param: 'cloro',       val: lecturas.cloro.valor,       st: lecturas.cloro.status       },
      { param: 'ph',          val: lecturas.ph.valor,           st: lecturas.ph.status           },
      { param: 'alcalinidad', val: lecturas.alcalinidad.valor,  st: lecturas.alcalinidad.status  },
      { param: 'turbidez',    val: lecturas.turbidez.valor,     st: lecturas.turbidez.status     },
    ];

    for (const { param, val, st } of checks) {
      if (st === 'optimo') continue;
      await this.injector.insertarAlerta({
        pool_id:         pool.id,
        parametro:       param,
        valor_detectado: val,
        nivel:           st, // 'alerta' o 'critico'
        mensaje:         this._mensajeAlerta(param, val, st),
      });
    }
  }

  _mensajeAlerta(param, val, nivel) {
    const labels = { cloro:'Cloro', ph:'pH', alcalinidad:'Alcalinidad', turbidez:'Turbidez' };
    const unidad = { cloro:'ppm', ph:'', alcalinidad:'ppm', turbidez:'NTU' };
    const prefix = nivel === 'critico' ? '🔴 CRÍTICO' : '⚠️ Alerta';
    return `${prefix} — ${labels[param]}: ${val}${unidad[param]}`;
  }

  _stPh(v)    { return v < 6.8 || v > 8.2 ? 'critico' : v < 7.2 || v > 7.8 ? 'alerta' : 'optimo'; }
  _stCloro(v) { return v < 0.5 || v > 5.0 ? 'critico' : v < 1.0 || v > 3.0 ? 'alerta' : 'optimo'; }
  _stAlc(v)   { return v < 60  || v > 180  ? 'critico' : v < 80  || v > 150  ? 'alerta' : 'optimo'; }
  _stTurb(v)  { return v > 4.0 ? 'critico' : v > 1.0 ? 'alerta' : 'optimo'; }

  async _procesarInventario(pool, { lecturas }) {
    const dosis = [];
    if (lecturas.cloro.valor < 1.0) {
      const ml = Math.min((2.0 - lecturas.cloro.valor) * (pool.volumen_litros/1000) * 10 / (12*0.01*0.95), 5000);
      dosis.push({ quimicoId: 'hipoclorito_sodio', ml });
    }
    if      (lecturas.ph.valor < 7.2) dosis.push({ quimicoId: 'soda_caustica',            ml: 50  });
    else if (lecturas.ph.valor > 7.8) dosis.push({ quimicoId: 'acido_muriatico',           ml: 50  });
    if (lecturas.alcalinidad.valor < 80)  dosis.push({ quimicoId: 'alcalinidad_plus_liquido', ml: 200 });
    if (lecturas.turbidez.valor   > 1.0)  dosis.push({ quimicoId: 'floculante',                ml: 100 });
    for (const d of dosis) await this.injector.descontarInventario(pool.id, d.quimicoId, d.ml);
  }

  pausar()   { this.corriendo = false; console.log('[Scheduler] ⏸ Pausado');   this._broadcastEstado(); }
  reanudar() { this.corriendo = true;  console.log('[Scheduler] ▶ Reanudado'); this._broadcastEstado(); }

  async detener() {
    this.corriendo = false;
    if (this.timerLectura)   { clearInterval(this.timerLectura);   this.timerLectura   = null; }
    if (this.timerCondicion) { clearInterval(this.timerCondicion); this.timerCondicion = null; }
    await this.injector.finalizarSesion();
    console.log('[Scheduler] ⏹ Detenido');
    this._broadcastEstado();
  }

  _broadcastEstado() { this.broadcast(this.getEstadoCompleto()); }

  getEstadoCompleto() {
    const cond = this.condicionesActuales;
    return {
      corriendo:    this.corriendo,
      acelerado:    false,
      escenario:    this.escenarioActual,
      sesionId:     this.sesionId,
      ciclosHechos: this.ciclosHechos,
      horaReal:     new Date().getHours(),
      condiciones:  cond ? {
        hora:          cond.hora,
        desc:          cond.desc,
        modoNombre:    cond.modoNombre,
        tempAmbiente:  cond.tempAmbiente,
        tempAgua:      cond.tempAgua,
        estaLloviendo: cond.estaLloviendo,
        factorUV:      cond.factorUV,
        factorUso:     Math.round(cond.factorUso * 100),
      } : null,
      pools: Object.values(this.estadoPools).map(s => ({
        pool_id:       s.pool.id,
        nombre:        s.pool.nombre,
        ciclo:         this.ciclosHechos,
        hora_simulada: new Date().getHours(),
        cloro:         Math.round(s.cloro       * 100) / 100,
        ph:            Math.round(s.ph           * 100) / 100,
        alcalinidad:   Math.round(s.alcalinidad  * 10)  / 10,
        turbidez:      Math.round(s.turbidez     * 100) / 100,
        temp_agua:     cond ? cond.tempAgua      : 0,
        temp_ambiente: cond ? cond.tempAmbiente  : 0,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  async getInventario() {
    return this.injector.getInventario(this.pools.map(p => p.id));
  }
}

module.exports = Scheduler;