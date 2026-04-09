// ═══════════════════════════════════════════════════════════════════
// DAY_CYCLE — Modo climático aleatorio fijo para todo el día
// Se sortea al arrancar el servidor y aplica las 24h con hora real
// ═══════════════════════════════════════════════════════════════════

const TEMP_MES = {
  1: 25, 2: 26, 3: 28, 4: 30,
  5: 33, 6: 34, 7: 33, 8: 33,
  9: 32, 10: 30, 11: 27, 12: 25,
};

// ── Modos climáticos disponibles ─────────────────────────────────
const MODOS_CLIMA = {
  soleado: {
    nombre:    'Soleado ☀️',
    tempExtra:  3,
    factorUV:   0.95,
    llueve:     false,
    desc:       'Día soleado',
  },
  nublado: {
    nombre:    'Nublado ⛅',
    tempExtra: -2,
    factorUV:   0.3,
    llueve:     false,
    desc:       'Nublado',
  },
  lluvia: {
    nombre:    'Lluvia 🌧',
    tempExtra: -5,
    factorUV:   0.0,
    llueve:     true,
    desc:       'Lluvia',
  },
  calor_extremo: {
    nombre:    'Calor extremo 🔥',
    tempExtra:  6,
    factorUV:   1.0,
    llueve:     false,
    desc:       'Calor extremo',
  },
  fresco: {
    nombre:    'Fresco 🌬️',
    tempExtra: -4,
    factorUV:   0.5,
    llueve:     false,
    desc:       'Día fresco',
  },
};

// Probabilidad de cada modo por mes (Colima)
const PROB_MODOS_MES = {
  1:  ['soleado','soleado','soleado','nublado','fresco'],
  2:  ['soleado','soleado','nublado','fresco','soleado'],
  3:  ['soleado','soleado','calor_extremo','nublado','soleado'],
  4:  ['calor_extremo','soleado','soleado','nublado','calor_extremo'],
  5:  ['calor_extremo','calor_extremo','soleado','lluvia','nublado'],
  6:  ['lluvia','lluvia','calor_extremo','soleado','nublado'],
  7:  ['lluvia','lluvia','lluvia','calor_extremo','nublado'],
  8:  ['lluvia','lluvia','calor_extremo','nublado','lluvia'],
  9:  ['lluvia','lluvia','nublado','soleado','calor_extremo'],
  10: ['soleado','nublado','lluvia','soleado','fresco'],
  11: ['soleado','fresco','nublado','soleado','soleado'],
  12: ['fresco','soleado','nublado','fresco','soleado'],
};

// ── Perfil de uso por hora del día ──────────────────────────────
const USO_HORAS = {
  0:0.03, 1:0.02, 2:0.01, 3:0.01, 4:0.01, 5:0.03,
  6:0.08, 7:0.18, 8:0.35, 9:0.55, 10:0.72, 11:0.85,
  12:0.90, 13:0.95, 14:1.00, 15:0.95, 16:0.90, 17:0.80,
  18:0.65, 19:0.45, 20:0.28, 21:0.18, 22:0.10, 23:0.05,
};

// ── Curva de temperatura por hora (delta sobre la base) ──────────
const TEMP_DELTA_HORA = {
  0:-6.0, 1:-6.5, 2:-7.0, 3:-7.2, 4:-7.0, 5:-6.5,
  6:-5.0, 7:-3.0, 8:-1.0, 9:1.0, 10:2.5, 11:3.5,
  12:4.0, 13:4.2, 14:4.5, 15:4.0, 16:3.5, 17:2.5,
  18:1.5, 19:0.0, 20:-1.5, 21:-3.0, 22:-4.0, 23:-5.0,
};

// ── Estado global del día (se sortea al arrancar) ────────────────
let _modoDia     = null;
let _tempBaseDia = null;
let _esFinde     = false;
let _ultimoDia   = -1;

function _sortearDia(fecha) {
  const mes      = fecha.getMonth() + 1;
  const diaSem   = fecha.getDay();
  const opciones = PROB_MODOS_MES[mes];
  const modo     = opciones[Math.floor(Math.random() * opciones.length)];

  _modoDia     = MODOS_CLIMA[modo];
  _tempBaseDia = TEMP_MES[mes] + _modoDia.tempExtra + (Math.random() * 4 - 2); // ±2°C
  _esFinde     = diaSem === 0 || diaSem === 6;
  _ultimoDia   = fecha.getDate();

  console.log(`\n[DayCycle] ══ Nuevo día ${fecha.toLocaleDateString('es-MX')} ══`);
  console.log(`[DayCycle] Modo: ${_modoDia.nombre} | TBase: ${_tempBaseDia.toFixed(1)}°C | Finde: ${_esFinde}`);
}

// ── Obtener condiciones para la hora real actual ──────────────────
function getCondicionesHora(fecha) {
  const dia = fecha.getDate();

  // Re-sortear si es un día nuevo
  if (dia !== _ultimoDia || !_modoDia) {
    _sortearDia(fecha);
  }

  const hora       = fecha.getHours();
  const deltaHora  = TEMP_DELTA_HORA[hora];
  const usoBase    = USO_HORAS[hora];

  // Temperatura con curva horaria + ruido pequeño por lectura
  let tempAmbiente = _tempBaseDia + deltaHora + (Math.random() * 1.0 - 0.5);
  if (_modoDia.llueve) tempAmbiente -= 1; // lluvia enfría un poco más en el momento
  tempAmbiente = Math.round(tempAmbiente * 10) / 10;

  // UV según modo + hora (sin UV en madrugada/noche)
  const hayLuz   = hora >= 6 && hora <= 19;
  const factorUV = hayLuz
    ? Math.round(_modoDia.factorUV * (0.9 + Math.random() * 0.2) * 100) / 100
    : 0;

  // Uso: fin de semana +30%, lluvia -40%
  let factorUso = usoBase * (_esFinde ? 1.3 : 1.0);
  if (_modoDia.llueve) factorUso *= 0.6;
  factorUso = Math.round(factorUso * 100) / 100;

  // Temperatura agua sigue a ambiente con inercia
  const tempAgua = Math.round((tempAmbiente * 0.65 + 10) * 10) / 10;

  // ── Degradación química basada en condiciones ─────────────────
  const factorTemp  = 1 + Math.max(0, tempAmbiente - 25) * 0.04;
  const degradCloro = -(0.06 + factorUV * 0.12 + factorUso * 0.10) * factorTemp;
  let   degradPh    = factorUso * 0.025;
  if (_modoDia.llueve) degradPh -= 0.05;
  let   degradAlc   = -0.20 - (_modoDia.llueve ? 2.0 : 0) - factorTemp * 0.12;
  let   degradTurb  = factorUso * 0.03 + (_modoDia.llueve ? 0.15 : 0);
  if (factorUV > 0.7) degradTurb += 0.015;

  const desc = `${_modoDia.desc}`;

  return {
    hora,
    modoClima:    Object.keys(MODOS_CLIMA).find(k => MODOS_CLIMA[k] === _modoDia),
    modoNombre:   _modoDia.nombre,
    tempAmbiente,
    tempAgua,
    estaLloviendo: _modoDia.llueve,
    factorUV,
    factorUso,
    esFinde:      _esFinde,
    desc,
    degradacion: {
      cloro:       Math.round(degradCloro * 1000) / 1000,
      ph:          Math.round(degradPh    * 1000) / 1000,
      alcalinidad: Math.round(degradAlc   * 1000) / 1000,
      turbidez:    Math.round(degradTurb  * 1000) / 1000,
    },
  };
}

function getNombreEscenario(condiciones) {
  return condiciones.modoNombre || condiciones.desc || 'normal';
}

module.exports = { getCondicionesHora, getNombreEscenario };