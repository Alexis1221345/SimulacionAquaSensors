// ═══════════════════════════════════════════════════════════════════
// SCENARIOS v2 — Solo día normal y lluvia
// 4 químicos líquidos de marcas comerciales MX
// ═══════════════════════════════════════════════════════════════════

const SCENARIOS = {

  // ── DÍA NORMAL ──────────────────────────────────────────────────
  normal: {
    nombre:      'Día Normal',
    descripcion: 'Condiciones estables — parámetros dentro de rango óptimo',
    temp_ambiente: { min: 27, max: 27, promedio: 27 },
    temp_agua:     { min: 27, max: 27, promedio: 27 },
    quimicos_iniciales: {
      cloro:    { valor: 2.0, min: 1.0, max: 3.0 },
      ph:       { valor: 7.4, min: 7.2, max: 7.8 },
      turbidez: { valor: 0.4, min: 0.0, max: 1.0 },
    },
    degradacion: {
      cloro:    { base: -0.02, varianza: 0.005 },
      ph:       { base:  0.005,varianza: 0.002 },
      turbidez: { base:  0.005,varianza: 0.002 },
    },
    bombas: false,
  },

  // ── LLUVIA ───────────────────────────────────────────────────────
  lluvia: {
    nombre:      'Lluvia',
    descripcion: 'Lluvia — parámetros desestabilizados, bombas de dosificación ON',
    temp_ambiente: { min: 18, max: 20, promedio: 19 },
    temp_agua:     { min: 22, max: 24, promedio: 23 },
    quimicos_iniciales: {
      cloro:    { valor: 0.6, min: 1.0, max: 3.0 },  // bajo por dilución
      ph:       { valor: 6.9, min: 7.2, max: 7.8 },  // ácido por lluvia
      turbidez: { valor: 2.8, min: 0.0, max: 1.0 },  // partículas de lluvia
    },
    degradacion: {
      cloro:    { base: -0.08, varianza: 0.01 },
      ph:       { base: -0.04, varianza: 0.01 },
      turbidez: { base:  0.12, varianza: 0.02 },
    },
    bombas: true,
  },

};

// ── Umbrales de alerta ────────────────────────────────────────────
const UMBRALES = {
  cloro: {
    critico_bajo: 0.5,
    alerta_bajo:  1.0,
    optimo_min:   1.0,
    optimo_max:   3.0,
    alerta_alto:  4.0,
    critico_alto: 5.0,
  },
  ph: {
    critico_bajo: 6.8,
    alerta_bajo:  7.2,
    optimo_min:   7.2,
    optimo_max:   7.8,
    alerta_alto:  7.8,
    critico_alto: 8.2,
  },
  turbidez: {
    optimo_max:   1.0,
    alerta_alto:  2.0,
    critico_alto: 4.0,
  },
  temperatura_agua: {
    critico_bajo: 15,
    alerta_bajo:  18,
    optimo_min:   18,
    optimo_max:   28,
    alerta_alto:  30,
    critico_alto: 33,
  },
};

// ── 4 químicos líquidos ───────────────────────────────────────────
// Se activan automáticamente cuando llueve
const QUIMICOS = {
  cloro_liquido: {
    nombre:      'Cloro líquido',
    marca:       'Klor-In / Bio-Clor',
    presentacion:'Líquido 12–15%',
    corrige:     'cloro',
    activa_si:   (l) => l.cloro < 1.0,
    dosis_ml:    50,
  },
  alguicida: {
    nombre:      'Alguicida líquido',
    marca:       'Algicida Pool / Hidroclor',
    presentacion:'Líquido 40–60%',
    corrige:     'turbidez_algas',
    activa_si:   (l) => l.turbidez > 1.0,
    dosis_ml:    50,
  },
  clarificador: {
    nombre:      'Clarificador líquido',
    marca:       'Clarita / Pool Clear',
    presentacion:'Líquido policloruro de aluminio',
    corrige:     'turbidez_particulas',
    activa_si:   (l) => l.turbidez > 1.0,
    dosis_ml:    50,
  },
  carbonato_sodio: {
    nombre:      'Carbonato de sodio (pH+)',
    marca:       'pH Plus Pool / Biocrystal',
    presentacion:'Líquido / disuelta al 20%',
    corrige:     'ph',
    activa_si:   (l) => l.ph < 7.2,
    dosis_ml:    50,
  },
};

module.exports = { SCENARIOS, UMBRALES, QUIMICOS };