// ═══════════════════════════════════════════════════════════════════
// SCHEDULER v2 — Simulador controlado
// Corre automáticamente al iniciar. El presentador solo cambia
// entre modo "normal" y "lluvia" desde el panel.
// ═══════════════════════════════════════════════════════════════════

const Injector = require('./injector');
const { getCondicionesHora, getNombreEscenario, setModo, getModoActual } = require('./day_cycle');

const INTERVALO_LECTURA_MS = 5 * 60 * 1000; // 5 minutos

// Valores iniciales por modo
const VALORES_INICIALES = {
  normal: { cloro: 2.0,  ph: 7.4, turbidez: 0.4 },
  lluvia: { cloro: 0.6,  ph: 6.9, turbidez: 2.8 },
};

class Scheduler {

  constructor(broadcast) {
    this.broadcast           = broadcast;
    this.injector            = new Injector();
    this.timerLectura        = null;
    this.corriendo           = false;
    this.pools               = [];
    this.sesionId            = null;
    this.ciclosHechos        = 0;
    this.estadoPools         = {};
    this.condicionesActuales = null;
  }

  // ── Arranque automático con todas las albercas ───────────────────
  async iniciar({ pools }) {
    if (this.corriendo) await this._detenerTimer();

    this.pools        = pools;
    this.ciclosHechos = 0;

    await this.injector.testConexion();

    const sesion = await this.injector.crearSesion(
      `Simulación ${new Date().toLocaleString('es-MX')}`,
      getModoActual(),
      pools.map(p => p.id),
      27,
      false
    );
    this.sesionId = sesion.id;

    this._inicializarEstadoPools(getModoActual());

    this.corriendo = true;
    this.condicionesActuales = getCondicionesHora();
    await this._ejecutarLectura();

    this.timerLectura = setInterval(async () => {
      this.condicionesActuales = getCondicionesHora();
      await this._ejecutarLectura();
    }, INTERVALO_LECTURA_MS);

    console.log(`\n[Scheduler] Iniciado — modo: ${getModoActual()} | lecturas cada 5 min\n`);
    this._broadcastEstado();
  }

  // ── Cambiar modo desde el panel (normal | lluvia) ────────────────
  async cambiarModo(modo) {
    if (modo !== 'normal' && modo !== 'lluvia') return;

    setModo(modo);
    this._inicializarEstadoPools(modo);
    this.condicionesActuales = getCondicionesHora();

    console.log(`[Scheduler] Modo cambiado → ${modo}`);

    // Insertar lectura inmediata con los nuevos valores
    await this._ejecutarLectura();
    this._broadcastEstado();
  }

  // ── Inicializar estado de pools según el modo ────────────────────
  _inicializarEstadoPools(modo) {
    const ini = VALORES_INICIALES[modo] || VALORES_INICIALES.normal;
    this.pools.forEach(pool => {
      this.estadoPools[pool.id] = {
        pool,
        cloro:    ini.cloro,
        ph:       ini.ph,
        turbidez: ini.turbidez,
      };
    });
  }

  // ── Ejecutar una lectura y enviar a Supabase ─────────────────────
  async _ejecutarLectura() {
    if (!this.corriendo) return;
    this.ciclosHechos++;
    const cond = this.condicionesActuales || getCondicionesHora();
    const deg  = cond.degradacion;

    console.log(`\n[Scheduler] Lectura ${this.ciclosHechos} | Modo: ${cond.modoClima} | T°amb: ${cond.tempAmbiente}°C | T°agua: ${cond.tempAgua}°C`);

    for (const pool of this.pools) {
      try {
        const e = this.estadoPools[pool.id];
        const r = () => (Math.random() * 0.02 - 0.01); // ruido mínimo ±0.01

        e.cloro    = Math.max(0,   Math.min(8,   e.cloro    + deg.cloro    + r()));
        e.ph       = Math.max(5.5, Math.min(9.0, e.ph       + deg.ph       + r() * 0.3));
        e.turbidez = Math.max(0,   Math.min(10,  e.turbidez + deg.turbidez + r()));

        const cloro    = Math.round(e.cloro    * 100) / 100;
        const ph       = Math.round(e.ph       * 100) / 100;
        const turbidez = Math.round(e.turbidez * 100) / 100;
        const tempAgua = cond.tempAgua;
        const tempAmb  = cond.tempAmbiente;

        const cicloData = {
          pool_id:       pool.id,
          temp_agua:     tempAgua,
          temp_ambiente: tempAmb,
          lecturas: {
            cloro:            { valor: cloro,    status: this._stCloro(cloro)    },
            ph:               { valor: ph,        status: this._stPh(ph)          },
            turbidez:         { valor: turbidez,  status: this._stTurb(turbidez)  },
            temperatura_agua: { valor: tempAgua,  status: 'optimo'                },
          },
        };

        const ok = await this.injector.insertarCiclo(cicloData);
        if (ok) {
          await this._procesarAlertas(pool, cicloData);
        }

      } catch (err) {
        console.error(`[Scheduler] Error pool ${pool.nombre}:`, err.message);
      }
    }

    this._broadcastEstado();
  }

  // ── Evaluar alertas ──────────────────────────────────────────────
  async _procesarAlertas(pool, { lecturas }) {
    const checks = [
      { param: 'cloro',    val: lecturas.cloro.valor,    st: lecturas.cloro.status    },
      { param: 'ph',       val: lecturas.ph.valor,        st: lecturas.ph.status        },
      { param: 'turbidez', val: lecturas.turbidez.valor,  st: lecturas.turbidez.status  },
    ];
    for (const { param, val, st } of checks) {
      if (st === 'optimo') continue;
      await this.injector.insertarAlerta({
        pool_id:         pool.id,
        parametro:       param,
        valor_detectado: val,
        nivel:           st,
        mensaje:         this._mensajeAlerta(param, val, st),
      });
    }
  }

  _mensajeAlerta(param, val, nivel) {
    const labels = { cloro: 'Cloro', ph: 'pH', turbidez: 'Turbidez / Alguicida' };
    const unidad = { cloro: ' ppm', ph: '', turbidez: ' NTU' };
    const prefix = nivel === 'critico' ? 'CRÍTICO' : 'Alerta';
    return `${prefix} — ${labels[param]}: ${val}${unidad[param]}`;
  }

  _stCloro(v) { return v < 0.5 || v > 5.0 ? 'critico' : v < 1.0 || v > 3.0 ? 'alerta' : 'optimo'; }
  _stPh(v)    { return v < 6.8 || v > 8.2 ? 'critico' : v < 7.2 || v > 7.8 ? 'alerta' : 'optimo'; }
  _stTurb(v)  { return v > 4.0 ? 'critico' : v > 1.0 ? 'alerta' : 'optimo'; }

  async _detenerTimer() {
    if (this.timerLectura) { clearInterval(this.timerLectura); this.timerLectura = null; }
  }

  async detener() {
    this.corriendo = false;
    await this._detenerTimer();
    await this.injector.finalizarSesion();
    console.log('[Scheduler] Detenido');
    this._broadcastEstado();
  }

  forzarValor(poolId, parametro, valor) {
    if (this.estadoPools[poolId]) {
      this.estadoPools[poolId][parametro] = parseFloat(valor);
    }
  }

  _broadcastEstado() { this.broadcast(this.getEstadoCompleto()); }

  getEstadoCompleto() {
    const cond = this.condicionesActuales || getCondicionesHora();
    return {
      corriendo:    this.corriendo,
      modo:         getModoActual(),
      bombas:       cond.bombas,
      escenario:    getNombreEscenario(),
      sesionId:     this.sesionId,
      ciclosHechos: this.ciclosHechos,
      condiciones: {
        modoClima:    cond.modoClima,
        modoNombre:   cond.modoNombre,
        tempAmbiente: cond.tempAmbiente,
        tempAgua:     cond.tempAgua,
        estaLloviendo:cond.estaLloviendo,
        bombas:       cond.bombas,
        desc:         cond.desc,
      },
      pools: Object.values(this.estadoPools).map(s => ({
        pool_id:       s.pool.id,
        nombre:        s.pool.nombre,
        ciclo:         this.ciclosHechos,
        cloro:         Math.round(s.cloro    * 100) / 100,
        ph:            Math.round(s.ph       * 100) / 100,
        turbidez:      Math.round(s.turbidez * 100) / 100,
        temp_agua:     cond.tempAgua,
        temp_ambiente: cond.tempAmbiente,
        bombas:        cond.bombas,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  async getInventario() {
    return this.injector.getInventario(this.pools.map(p => p.id));
  }
}

module.exports = Scheduler;