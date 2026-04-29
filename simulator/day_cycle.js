// ═══════════════════════════════════════════════════════════════════
// DAY_CYCLE v2 — Modo controlado manual
// Solo 2 modos: normal y lluvia. Temperaturas fijas sin curva horaria.
// El presentador cambia de modo desde el panel.
// ═══════════════════════════════════════════════════════════════════

const TEMPS_LLUVIA_AMB  = [18, 19, 20];
const TEMPS_LLUVIA_AGUA = [22, 23, 24];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let _modoActual = 'normal';
let _tempAmb    = 27;
let _tempAgua   = 27;

function setModo(modo) {
  _modoActual = modo;

  if (modo === 'normal') {
    _tempAmb  = 27;
    _tempAgua = 27;
  } else {
    _tempAmb  = pick(TEMPS_LLUVIA_AMB);
    _tempAgua = pick(TEMPS_LLUVIA_AGUA);
  }

  console.log(`\n[DayCycle] ══ Modo: ${modo.toUpperCase()} | T°amb: ${_tempAmb}°C | T°agua: ${_tempAgua}°C | Bombas: ${modo === 'lluvia' ? 'ON' : 'OFF'}`);
}

function getCondicionesHora() {
  const estaLloviendo = _modoActual === 'lluvia';

  const degradacion = _modoActual === 'normal'
    ? { cloro: -0.02, ph: 0.005, alcalinidad: -0.10, turbidez: 0.005 }
    : { cloro: -0.08, ph: -0.04, alcalinidad: -0.80, turbidez: 0.12  };

  return {
    modoClima:    _modoActual,
    modoNombre:   _modoActual === 'normal' ? 'Día normal' : 'Día lluvioso',
    tempAmbiente: _tempAmb,
    tempAgua:     _tempAgua,
    estaLloviendo,
    factorUV:     _modoActual === 'normal' ? 0.5 : 0,
    factorUso:    0,
    bombas:       estaLloviendo,
    desc:         _modoActual === 'normal' ? 'Día normal ☀' : 'Día lluvioso 🌧',
    degradacion,
  };
}

function getModoActual()     { return _modoActual; }
function getTempAmb()        { return _tempAmb;    }
function getTempAgua()       { return _tempAgua;   }
function getNombreEscenario(){ return _modoActual === 'normal' ? 'Día Normal' : 'Lluvia'; }

module.exports = { getCondicionesHora, getNombreEscenario, setModo, getModoActual, getTempAmb, getTempAgua };