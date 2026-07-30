const { rpc } = require('./supa');

// Chama a sequence atômica do Postgres (milplan_next_ss_numero, ver migration.sql).
// Nunca calcular isso como MAX(ss_numero)+1 no Node — teria race condition
// entre duas criações simultâneas.
async function nextSsNumero() {
  const result = await rpc('milplan_next_ss_numero');
  return typeof result === 'number' ? result : Number(result);
}

module.exports = { nextSsNumero };
