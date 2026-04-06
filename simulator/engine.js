// ═══════════════════════════════════════════════════════════════════
// ENGINE — Motor de físico-química
// Calcula los valores de cada ciclo basado en temperatura y escenario
// ═══════════════════════════════════════════════════════════════════

const { UMBRALES } = require('./scenarios');

class SimulatorEngine {

  constructor(scenario, pools) {
    this.scenario = scenario;
    this.pools = pools;

    // Estado actual de cada alberca
    this.state = {};
    pools.forEach(pool => {
      this.state[pool.id] = {
        pool,
        cloro:                scenario.quimicos_iniciales.cloro.valor,
        ph:                   scenario.quimicos_iniciales.ph.valor,
        alcalinidad:          scenario.quimicos_iniciales.alcalinidad.valor,
        turbidez:             scenario.quimicos_iniciales.turbidez.valor,
        temp_agua:            scenario.temp_agua.promedio,
        temp_ambiente:        scenario.temp_ambiente.promedio,
        ciclo:                0,
        hora_simulada:        6, // empieza a las 6am
      };
    });
  }

  // ── Varianza aleatoria controlada ───────────────────────────────
  _varianza(base, varianza) {
    return base + (Math.random() * varianza * 2 - varianza);
  }

  // ── Factor de temperatura sobre degradación de cloro ────────────
  // A mayor temperatura, mayor degradación (efecto Arrhenius simplificado)
  _factorTemperatura(tempAgua) {
    const tempRef = 25; // temperatura de referencia
    const factor = 1 + (tempAgua - tempRef) * 0.04; // +4% por cada °C
    return Math.max(0.5, Math.min(factor, 2.5));
  }

  // ── Factor de hora del día (UV solar) ───────────────────────────
  // El cloro se degrada más entre 10am y 2pm por radiación UV
  _factorUV(hora) {
    if (hora >= 10 && hora <= 14) return 1.4; // pico UV
    if (hora >= 8  && hora <= 16) return 1.2; // UV moderado
    return 0.8;                               // noche/madrugada
  }

  // ── Factor de uso (bañistas) ─────────────────────────────────────
  _factorUso(hora) {
    const horasIntensivas = this.scenario.uso_intensivo_horas || [];
    return horasIntensivas.includes(hora) ? 1.5 : 1.0;
  }

  // ── Calcular temperatura del ciclo ──────────────────────────────
  _calcularTemperaturas(hora) {
    const { temp_ambiente, temp_agua } = this.scenario;

    // Temperatura ambiente varía en el día (pico a las 2pm)
    const curvaTemp = Math.sin((hora - 6) * Math.PI / 12);
    const tAmb = temp_ambiente.min +
      (temp_ambiente.max - temp_ambiente.min) * Math.max(0, curvaTemp) +
      this._varianza(0, 0.5);

    // Temperatura del agua sigue con retraso
    const tAgua = temp_agua.min +
      (temp_agua.max - temp_agua.min) * Math.max(0, curvaTemp * 0.7) +
      this._varianza(0, 0.3);

    return {
      temp_ambiente: Math.round(tAmb * 10) / 10,
      temp_agua:     Math.round(tAgua * 10) / 10,
    };
  }

  // ── Calcular status de un parámetro ─────────────────────────────
  _calcularStatus(parametro, valor) {
    const u = UMBRALES[parametro];
    if (!u) return 'optimo';

    if (parametro === 'turbidez') {
      if (valor >= u.critico_alto) return 'critico';
      if (valor >= u.alerta_alto)  return 'alerta';
      return 'optimo';
    }

    if (valor <= u.critico_bajo || valor >= u.critico_alto) return 'critico';
    if (valor <= u.alerta_bajo  || valor >= u.alerta_alto)  return 'alerta';
    return 'optimo';
  }

  // ── Calcular siguiente ciclo para una alberca ───────────────────
  calcularCiclo(poolId) {
    const s = this.state[poolId];
    const deg = this.scenario.degradacion;

    // Calcular temperaturas del momento
    const temps = this._calcularTemperaturas(s.hora_simulada);
    s.temp_agua     = temps.temp_agua;
    s.temp_ambiente = temps.temp_ambiente;

    const factorTemp = this._factorTemperatura(s.temp_agua);
    const factorUV   = this._factorUV(s.hora_simulada);
    const factorUso  = this._factorUso(s.hora_simulada);

    // ── Cloro — más afectado por temperatura y UV ──────────────────
    const deltaCl = this._varianza(deg.cloro.base, deg.cloro.varianza)
      * factorTemp * factorUV * factorUso;
    s.cloro = Math.max(0, Math.min(8, s.cloro + deltaCl));

    // ── pH ─────────────────────────────────────────────────────────
    const deltaPh = this._varianza(deg.ph.base, deg.ph.varianza) * factorUso;
    s.ph = Math.max(5.5, Math.min(9.0, s.ph + deltaPh));

    // ── Alcalinidad ────────────────────────────────────────────────
    const deltaAlc = this._varianza(deg.alcalinidad.base, deg.alcalinidad.varianza)
      * factorTemp;
    s.alcalinidad = Math.max(0, Math.min(300, s.alcalinidad + deltaAlc));

    // ── Turbidez ───────────────────────────────────────────────────
    // Alta temperatura + bajo cloro = más turbidez
    const factorCloroTurbidez = s.cloro < 1.0 ? 1.8 : 1.0;
    const deltaTurb = this._varianza(deg.turbidez.base, deg.turbidez.varianza)
      * factorUso * factorCloroTurbidez;
    s.turbidez = Math.max(0, Math.min(10, s.turbidez + deltaTurb));

    // ── Avanzar hora simulada ──────────────────────────────────────
    s.hora_simulada = (s.hora_simulada + 3) % 24;
    s.ciclo++;

    // ── Construir lectura con status ───────────────────────────────
    return {
      pool_id:          poolId,
      ciclo:            s.ciclo,
      hora_simulada:    s.hora_simulada,
      temp_ambiente:    s.temp_ambiente,
      temp_agua:        s.temp_agua,
      lecturas: {
        cloro: {
          valor:  Math.round(s.cloro * 100) / 100,
          status: this._calcularStatus('cloro', s.cloro),
        },
        ph: {
          valor:  Math.round(s.ph * 100) / 100,
          status: this._calcularStatus('ph', s.ph),
        },
        alcalinidad: {
          valor:  Math.round(s.alcalinidad * 10) / 10,
          status: this._calcularStatus('alcalinidad', s.alcalinidad),
        },
        turbidez: {
          valor:  Math.round(s.turbidez * 100) / 100,
          status: this._calcularStatus('turbidez', s.turbidez),
        },
        temperatura_agua: {
          valor:  s.temp_agua,
          status: this._calcularStatus('temperatura_agua', s.temp_agua),
        },
      },
    };
  }

  // ── Forzar valor manual (desde el panel) ────────────────────────
  forzarValor(poolId, parametro, valor) {
    if (this.state[poolId]) {
      this.state[poolId][parametro] = valor;
    }
  }

  // ── Obtener estado actual de todas las albercas ──────────────────
  getEstado() {
    return Object.values(this.state).map(s => ({
      pool_id:       s.pool.id,
      nombre:        s.pool.nombre,
      ciclo:         s.ciclo,
      hora_simulada: s.hora_simulada,
      cloro:         Math.round(s.cloro * 100) / 100,
      ph:            Math.round(s.ph * 100) / 100,
      alcalinidad:   Math.round(s.alcalinidad * 10) / 10,
      turbidez:      Math.round(s.turbidez * 100) / 100,
      temp_agua:     s.temp_agua,
      temp_ambiente: s.temp_ambiente,
    }));
  }

  // ── Resetear estado al inicial del escenario ────────────────────
  resetear() {
    this.pools.forEach(pool => {
      this.state[pool.id] = {
        pool,
        cloro:         this.scenario.quimicos_iniciales.cloro.valor,
        ph:            this.scenario.quimicos_iniciales.ph.valor,
        alcalinidad:   this.scenario.quimicos_iniciales.alcalinidad.valor,
        turbidez:      this.scenario.quimicos_iniciales.turbidez.valor,
        temp_agua:     this.scenario.temp_agua.promedio,
        temp_ambiente: this.scenario.temp_ambiente.promedio,
        ciclo:         0,
        hora_simulada: 6,
      };
    });
  }
}

module.exports = SimulatorEngine;
