/**
 * Journalisation simple et lisible (exigence 8 – Journalisation).
 * Niveau configurable via LOG_LEVEL : debug | info | warn | error.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold = LEVELS.info;

export function setLogLevel(level) {
  threshold = LEVELS[level] ?? LEVELS.info;
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function emit(level, args) {
  if (LEVELS[level] < threshold) return;
  const line = `[${stamp()}] [${level.toUpperCase().padEnd(5)}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(line, ...args);
}

export const log = {
  debug: (...a) => emit('debug', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
  /**
   * Log d'erreur enrichi d'une trace : évite de faire planter le bot tout en
   * gardant une trace exploitable (robustesse, exigence 8).
   */
  exception: (context, err) => emit('error', [context, err?.stack || err?.message || String(err)]),
};

export default log;
