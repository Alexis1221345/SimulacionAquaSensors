// ═══════════════════════════════════════════════════════════════════
// DAY_CYCLE — Ciclo diario automático
// Determina las condiciones de cada hora del día (0-23)
// basándose en la hora real del sistema + variación aleatoria diaria
// ═══════════════════════════════════════════════════════════════════

// ── Perfil base por hora del día ─────────────────────────────────
// Cada hora tiene: temp_ambiente, factor_uv, factor_uso, factor_lluvia
// Colima, México — clima típico

const PERFIL_HORAS = {
  0:  { temp_base: -6.0, uv: 0.0, uso: 0.05, desc: 'Madrugada'      },
  1:  { temp_base: -6.5, uv: 0.0, uso: 0.03, desc: 'Madrugada'      },
  2:  { temp_base: -7.0, uv: 0.0, uso: 0.02, desc: 'Madrugada'      },
  3:  { temp_base: -7.2, uv: 0.0, uso: 0.02, desc: 'Madrugada'      },
  4:  { temp_base: -7.0, uv: 0.0, uso: 0.02, desc: 'Madrugada'      },
  5:  { temp_base: -6.5, uv: 0.0, uso: 0.05, desc: 'Amanecer'       },
  6:  { temp_base: -5.0, uv: 0.1, uso: 0.10, desc: 'Amanecer'       },
  7:  { temp_base: -3.0, uv: 0.3, uso: 0.20, desc: 'Mañana temprana'},
  8:  { temp_base: -1.0, uv: 0.5, uso: 0.35, desc: 'Mañana'         },
  9:  { temp_base:  1.0, uv: 0.7, uso: 0.50, desc: 'Mañana'         },
  10: { temp_base:  2.5, uv: 0.9, uso: 0.70, desc: 'Media mañana'   },
  11: { temp_base:  3.5, uv: 1.0, uso: 0.85, desc: 'Pico UV'        },
  12: { temp_base:  4.0, uv: 1.0, uso: 0.90, desc: 'Mediodía'       },
  13: { temp_base:  4.2, uv: 1.0, uso: 0.95, desc: 'Mediodía — pico'},
  14: { temp_base:  4.5, uv: 0.9, uso: 1.00, desc: 'Tarde — pico'   },
  15: { temp_base:  4.0, uv: 0.8, uso: 0.95, desc: 'Tarde'          },
  16: { temp_base:  3.5, uv: 0.6, uso: 0.90, desc: 'Tarde'          },
  17: { temp_base:  2.5, uv: 0.4, uso: 0.80, desc: 'Tarde-noche'    },
  18: { temp_base:  1.5, uv: 0.2, uso: 0.65, desc: 'Atardecer'      },
  19: { temp_base:  0.0, uv: 0.0, uso: 0.45, desc: 'Noche'          },
  20: { temp_base: -1.5, uv: 0.0, uso: 0.30, desc: 'Noche'          },
  21: { temp_base: -3.0, uv: 0.0, uso: 0.20, desc: 'Noche'          },
  22: { temp_base: -4.0, uv: 0.0, uso: 0.10, desc: 'Noche'          },
  23: { temp_base: -5.0, uv: 0.0, uso: 0.07, desc: 'Noche'          },
};

// ── Temperatura base por mes (Colima) ────────────────────────────
const TEMP_MES = {
  1: 25, 2: 26, 3: 28, 4: 30,
  5: 33, 6: 34, 7: 33, 8: 33,
  9: 32, 10: 30, 11: 27, 12: 25,
};

// ── Probabilidad de lluvia por mes en Colima ─────────────────────
const PROB_LLUVIA_MES = {
  1: 0.03, 2: 0.03, 3: 0.05, 4: 0.08,
  5: 0.15, 6: 0.35, 7: 0.50, 8: 0.55,
  9: 0.45, 10: 0.25, 11: 0.10, 12: 0.05,
};

// ── Estado persistente del día ────────────────────────────────────
// Se recalcula cada vez que cambia el día del mes
let _estadoDia = null;
let _ultimoDia = -1;

function _calcularEstadoDia(fecha) {
  const mes = fecha.getMonth() + 1;
  const diaSemana = fecha.getDay(); // 0=dom, 6=sab

  // Temperatura base del mes con variación aleatoria diaria (±3°C)
  const tempBaseHoy = TEMP_MES[mes] + (Math.random() * 6 - 3);

  // ¿Llueve hoy? Probabilidad por mes
  const probLluvia = PROB_LLUVIA_MES[mes];
  const llueveHoy  = Math.random() < probLluvia;

  // Si llueve, ¿a qué hora empieza y termina?
  const horaInicioLluvia = llueveHoy ? 12 + Math.floor(Math.random() * 8) : -1;
  const duracionLluvia   = llueveHoy ? 2 + Math.floor(Math.random() * 4) : 0;

  // ¿Es día de mucho uso? (finde + verano)
  const esFinde    = diaSemana === 0 || diaSemana === 6;
  const esVerano   = mes >= 6 && mes <= 9;
  const factorDia  = esFinde ? 1.3 : (esVerano ? 1.1 : 1.0);

  // Variación aleatoria del día (±10% en todos los parámetros)
  const variacionDia = 0.9 + Math.random() * 0.2;

  return {
    tempBaseHoy,
    llueveHoy,
    horaInicioLluvia,
    duracionLluvia,
    esFinde,
    esVerano,
    factorDia,
    variacionDia,
    mes,
  };
}

// ── Obtener condiciones para una hora específica ──────────────────
function getCondicionesHora(fecha) {
  const hora = fecha.getHours();
  const dia  = fecha.getDate();

  // Recalcular estado del día si cambió
  if (dia !== _ultimoDia) {
    _estadoDia = _calcularEstadoDia(fecha);
    _ultimoDia = dia;
    console.log(`\n[DayCycle] ── Nuevo día: ${fecha.toLocaleDateString('es-MX')} ──`);
    console.log(`[DayCycle] Temp base: ${_estadoDia.tempBaseHoy.toFixed(1)}°C | Lluvia: ${_estadoDia.llueveHoy ? `Sí (${_estadoDia.horaInicioLluvia}h-${_estadoDia.horaInicioLluvia + _estadoDia.duracionLluvia}h)` : 'No'} | Finde: ${_estadoDia.esFinde}`);
  }

  const perfil  = PERFIL_HORAS[hora];
  const estado  = _estadoDia;

  // ¿Está lloviendo en esta hora?
  const estaLloviendo = estado.llueveHoy &&
    hora >= estado.horaInicioLluvia &&
    hora <  estado.horaInicioLluvia + estado.duracionLluvia;

  // Temperatura ambiente en esta hora
  let tempAmbiente = estado.tempBaseHoy + perfil.temp_base;
  if (estaLloviendo) tempAmbiente -= 4; // lluvia baja temp
  tempAmbiente += (Math.random() * 2 - 1); // ±1°C de ruido

  // Factor UV (cero si llueve o nublado)
  const factorUV = estaLloviendo
    ? 0
    : perfil.uv * (0.85 + Math.random() * 0.3);

  // Factor de uso de la alberca
  const factorUso = perfil.uso * estado.factorDia * estado.variacionDia;

  // ── Tasas de degradación según condiciones ────────────────────
  // Más calor + más UV = más degradación de cloro
  const factorTemp  = 1 + Math.max(0, tempAmbiente - 25) * 0.04;
  const degradCloro = -(0.08 + factorUV * 0.15 + factorUso * 0.12) * factorTemp;

  // pH: bañistas suben pH, lluvia lo baja
  let degradPh = factorUso * 0.03;
  if (estaLloviendo) degradPh -= 0.06;

  // Alcalinidad: lluvia la baja rápido, calor la baja gradual
  let degradAlc = -0.25 - (estaLloviendo ? 2.5 : 0) - factorTemp * 0.15;

  // Turbidez: bañistas + lluvia la suben
  let degradTurb = factorUso * 0.04 + (estaLloviendo ? 0.18 : 0);
  if (factorUV > 0.7 && !estaLloviendo) degradTurb += 0.02; // algas con sol

  // Temperatura del agua: sigue a ambiente con inercia
  const tempAgua = tempAmbiente * 0.65 + 10; // agua más estable

  return {
    hora,
    tempAmbiente: Math.round(tempAmbiente * 10) / 10,
    tempAgua:     Math.round(tempAgua * 10) / 10,
    estaLloviendo,
    factorUV:     Math.round(factorUV * 100) / 100,
    factorUso:    Math.round(factorUso * 100) / 100,
    desc: perfil.desc + (estaLloviendo ? ' 🌧' : ''),
    degradacion: {
      cloro:       Math.round(degradCloro * 1000) / 1000,
      ph:          Math.round(degradPh    * 1000) / 1000,
      alcalinidad: Math.round(degradAlc   * 1000) / 1000,
      turbidez:    Math.round(degradTurb  * 1000) / 1000,
    },
    esFinde:  estado.esFinde,
    esVerano: estado.esVerano,
    mes:      estado.mes,
  };
}

// ── Nombre legible del escenario actual ──────────────────────────
function getNombreEscenario(condiciones) {
  const { tempAmbiente, estaLloviendo, factorUso, esVerano, esFinde } = condiciones;
  if (estaLloviendo)       return 'lluvia';
  if (tempAmbiente > 35)   return 'calor_extremo';
  if (tempAmbiente < 20)   return 'nublado_frio';
  if (factorUso > 0.85)    return 'uso_intensivo';
  if (esVerano && esFinde) return 'calor_extremo';
  return 'normal';
}

module.exports = { getCondicionesHora, getNombreEscenario };
