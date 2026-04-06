// ═══════════════════════════════════════════════════════════════════
// ESCENARIOS DE SIMULACIÓN — AquaSensors
// Cada escenario define condiciones ambientales y tasas de degradación
// ═══════════════════════════════════════════════════════════════════

const SCENARIOS = {

  // ── 1. DÍA NORMAL ───────────────────────────────────────────────
  normal: {
    nombre: 'Día Normal',
    descripcion: 'Condiciones típicas de operación en Colima (22-26°C)',
    temp_ambiente: { min: 22, max: 26, promedio: 24 },
    temp_agua:     { min: 24, max: 27, promedio: 25 },
    // Valores iniciales de químicos
    quimicos_iniciales: {
      cloro:       { valor: 2.0,  min: 0.5,  max: 3.0  },
      ph:          { valor: 7.4,  min: 7.2,  max: 7.8  },
      alcalinidad: { valor: 110,  min: 80,   max: 150  },
      turbidez:    { valor: 0.4,  min: 0.1,  max: 4.0  },
    },
    // Tasas de degradación por ciclo de 3 horas
    degradacion: {
      cloro:       { base: -0.25, varianza: 0.05 },  // ppm por ciclo
      ph:          { base:  0.05, varianza: 0.02 },  // sube lentamente
      alcalinidad: { base: -0.8,  varianza: 0.2  },  // ppm por ciclo
      turbidez:    { base:  0.05, varianza: 0.03 },  // NTU por ciclo
    },
    uso_intensivo_horas: [10, 11, 12, 16, 17], // horas del día de mayor uso
  },

  // ── 2. CALOR EXTREMO ─────────────────────────────────────────────
  calor_extremo: {
    nombre: 'Calor Extremo',
    descripcion: 'Verano intenso en Colima (35°C+) — cloro se degrada rápido',
    temp_ambiente: { min: 33, max: 40, promedio: 37 },
    temp_agua:     { min: 29, max: 33, promedio: 31 },
    quimicos_iniciales: {
      cloro:       { valor: 2.0,  min: 0.5,  max: 3.0  },
      ph:          { valor: 7.5,  min: 7.2,  max: 7.8  },
      alcalinidad: { valor: 105,  min: 80,   max: 150  },
      turbidez:    { valor: 0.6,  min: 0.1,  max: 4.0  },
    },
    degradacion: {
      cloro:       { base: -0.55, varianza: 0.10 }, // casi el doble que normal
      ph:          { base:  0.08, varianza: 0.03 },
      alcalinidad: { base: -1.5,  varianza: 0.3  },
      turbidez:    { base:  0.12, varianza: 0.05 }, // más algas con calor
    },
    uso_intensivo_horas: [9, 10, 11, 12, 16, 17, 18],
  },

  // ── 3. DÍA NUBLADO / FRÍO ────────────────────────────────────────
  nublado_frio: {
    nombre: 'Día Nublado / Frío',
    descripcion: 'Cielo cubierto, temperatura baja (18-20°C) — menor degradación UV',
    temp_ambiente: { min: 16, max: 21, promedio: 19 },
    temp_agua:     { min: 20, max: 23, promedio: 21 },
    quimicos_iniciales: {
      cloro:       { valor: 2.0,  min: 0.5,  max: 3.0  },
      ph:          { valor: 7.3,  min: 7.2,  max: 7.8  },
      alcalinidad: { valor: 115,  min: 80,   max: 150  },
      turbidez:    { valor: 0.3,  min: 0.1,  max: 4.0  },
    },
    degradacion: {
      cloro:       { base: -0.12, varianza: 0.03 }, // menos degradación UV
      ph:          { base:  0.02, varianza: 0.01 },
      alcalinidad: { base: -0.4,  varianza: 0.1  },
      turbidez:    { base:  0.02, varianza: 0.01 },
    },
    uso_intensivo_horas: [11, 12, 16],
  },

  // ── 4. LLUVIA ────────────────────────────────────────────────────
  lluvia: {
    nombre: 'Lluvia',
    descripcion: 'Lluvia intensa — diluye químicos, baja alcalinidad rápido',
    temp_ambiente: { min: 18, max: 24, promedio: 21 },
    temp_agua:     { min: 22, max: 25, promedio: 23 },
    quimicos_iniciales: {
      cloro:       { valor: 1.8,  min: 0.5,  max: 3.0  },
      ph:          { valor: 7.0,  min: 7.2,  max: 7.8  }, // lluvia baja pH
      alcalinidad: { valor: 90,   min: 80,   max: 150  },
      turbidez:    { valor: 1.2,  min: 0.1,  max: 4.0  }, // agua de lluvia
    },
    degradacion: {
      cloro:       { base: -0.35, varianza: 0.08 }, // dilución por lluvia
      ph:          { base: -0.08, varianza: 0.03 }, // lluvia BAJA el pH
      alcalinidad: { base: -2.5,  varianza: 0.5  }, // caída rápida
      turbidez:    { base:  0.20, varianza: 0.08 }, // partículas de lluvia
    },
    uso_intensivo_horas: [], // nadie nada cuando llueve
  },

  // ── 5. USO INTENSIVO ─────────────────────────────────────────────
  uso_intensivo: {
    nombre: 'Uso Intensivo',
    descripcion: 'Evento o competencia — muchos bañistas todo el día',
    temp_ambiente: { min: 26, max: 32, promedio: 29 },
    temp_agua:     { min: 26, max: 30, promedio: 28 },
    quimicos_iniciales: {
      cloro:       { valor: 2.5,  min: 0.5,  max: 4.0  },
      ph:          { valor: 7.4,  min: 7.2,  max: 7.8  },
      alcalinidad: { valor: 120,  min: 80,   max: 150  },
      turbidez:    { valor: 0.8,  min: 0.1,  max: 4.0  },
    },
    degradacion: {
      cloro:       { base: -0.70, varianza: 0.15 }, // bañistas consumen cloro
      ph:          { base:  0.12, varianza: 0.04 }, // sudor/orina sube pH
      alcalinidad: { base: -1.8,  varianza: 0.4  },
      turbidez:    { base:  0.25, varianza: 0.10 }, // muchos bañistas
    },
    uso_intensivo_horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  },

  // ── 6. QUÍMICO BAJO (prueba de alerta de inventario) ─────────────
  quimico_bajo: {
    nombre: 'Químico Bajo',
    descripcion: 'Simula recipientes casi vacíos — prueba alertas de reabastecimiento',
    temp_ambiente: { min: 24, max: 28, promedio: 26 },
    temp_agua:     { min: 25, max: 28, promedio: 26 },
    quimicos_iniciales: {
      cloro:       { valor: 0.8,  min: 0.5,  max: 3.0  }, // ya bajo
      ph:          { valor: 7.6,  min: 7.2,  max: 7.8  },
      alcalinidad: { valor: 85,   min: 80,   max: 150  },
      turbidez:    { valor: 1.5,  min: 0.1,  max: 4.0  },
    },
    degradacion: {
      cloro:       { base: -0.40, varianza: 0.08 },
      ph:          { base:  0.06, varianza: 0.02 },
      alcalinidad: { base: -1.2,  varianza: 0.3  },
      turbidez:    { base:  0.15, varianza: 0.06 },
    },
    uso_intensivo_horas: [10, 11, 16, 17],
    inventario_inicial_pct: 15, // todos los recipientes al 15%
  },

  // ── 7. CRISIS TOTAL (prueba todas las alertas simultáneas) ────────
  crisis_total: {
    nombre: 'Crisis Total',
    descripcion: 'Todos los parámetros en niveles críticos — prueba de estrés',
    temp_ambiente: { min: 36, max: 42, promedio: 39 },
    temp_agua:     { min: 31, max: 35, promedio: 33 },
    quimicos_iniciales: {
      cloro:       { valor: 0.3,  min: 0.5,  max: 3.0  }, // CRÍTICO
      ph:          { valor: 6.8,  min: 7.2,  max: 7.8  }, // CRÍTICO
      alcalinidad: { valor: 55,   min: 80,   max: 150  }, // CRÍTICO
      turbidez:    { valor: 4.5,  min: 0.1,  max: 4.0  }, // CRÍTICO
    },
    degradacion: {
      cloro:       { base: -0.80, varianza: 0.15 },
      ph:          { base: -0.10, varianza: 0.05 },
      alcalinidad: { base: -3.0,  varianza: 0.5  },
      turbidez:    { base:  0.35, varianza: 0.10 },
    },
    uso_intensivo_horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    inventario_inicial_pct: 10,
  },

};

// ── Umbrales de alerta (deben coincidir con los triggers de Supabase) ──
const UMBRALES = {
  cloro: {
    critico_bajo:  0.5,
    alerta_bajo:   1.0,
    optimo_min:    1.0,
    optimo_max:    3.0,
    alerta_alto:   4.0,
    critico_alto:  5.0,
  },
  ph: {
    critico_bajo:  6.8,
    alerta_bajo:   7.2,
    optimo_min:    7.2,
    optimo_max:    7.8,
    alerta_alto:   7.8,
    critico_alto:  8.2,
  },
  alcalinidad: {
    critico_bajo:  60,
    alerta_bajo:   80,
    optimo_min:    80,
    optimo_max:    150,
    alerta_alto:   150,
    critico_alto:  180,
  },
  turbidez: {
    optimo_max:    1.0,
    alerta_alto:   2.0,
    critico_alto:  4.0,
  },
  temperatura_agua: {
    critico_bajo:  15,
    alerta_bajo:   18,
    optimo_min:    18,
    optimo_max:    28,
    alerta_alto:   30,
    critico_alto:  33,
  },
  temperatura_ambiente: {
    referencia_min: 15,
    referencia_max: 40,
  },
};

// ── Porcentaje de inventario que dispara alerta de reabastecimiento ──
const INVENTARIO_ALERTA_PCT = 20;

module.exports = { SCENARIOS, UMBRALES, INVENTARIO_ALERTA_PCT };
