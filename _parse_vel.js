// Regenera vel_data.json a partir do Excel
// Rows: [date, driver, b, m, g, gv, durSec, maxV, limAtMaxV, c]
// c = eventos "Conversa" (duração ≤ 12s — não são infrações formais)
const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('Histórico em velocidade 2026.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, {header:1});
const headers = raw[0];

const iDados    = headers.findIndex(h => String(h) === 'Dados');
const iData     = headers.findIndex(h => String(h) === 'Data');
const iDur      = headers.findIndex(h => String(h) === 'Duração');
const iNomeM    = headers.findIndex(h => String(h) === 'Nome Motorista');

function parseDate(v) {
  if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function parseDados(dados) {
  const s = String(dados || '');
  const maxM = s.match(/max:([\d,]+)/i);
  const limM = s.match(/limite:([\d,]+)/i);
  const maxV = maxM ? parseFloat(String(maxM[1]).replace(',', '.')) : 0;
  const lim  = limM ? parseFloat(String(limM[1]).replace(',', '.')) : 0;
  return { maxV, lim };
}

function getSev(pct) {
  if (pct > 30) return 'GV';
  if (pct > 20) return 'G';
  if (pct > 10) return 'M';
  return 'B';
}

// Aggregate
const map = {};
const driverSet = new Set();

for (let i = 1; i < raw.length; i++) {
  const r = raw[i];
  const dt = parseDate(r[iData]);
  if (!dt || !dt.startsWith('2026')) continue;
  const drv = String(r[iNomeM] || '').trim().toUpperCase();
  if (!drv) continue;
  const dur = Number(r[iDur]) || 0;
  const { maxV, lim } = parseDados(r[iDados]);
  if (!maxV || !lim) continue;
  const pct = Math.round((maxV / lim - 1) * 100);
  if (pct < 1) continue; // não é violação
  if (dur <= 12) continue; // duração ≤ 12s não conta como desvio formal (PRO-025917 Rev.12)
  const sev = getSev(pct);

  const key = dt + '|' + drv;
  if (!map[key]) {
    map[key] = { dt, drv, b: 0, m: 0, g: 0, gv: 0, dur: 0, maxV: 0, limAtMax: 0 };
  }
  const e = map[key];
  if (sev === 'B') e.b++;
  else if (sev === 'M') e.m++;
  else if (sev === 'G') e.g++;
  else e.gv++;
  e.dur += dur;
  if (maxV > e.maxV) { e.maxV = maxV; e.limAtMax = lim; }

  driverSet.add(drv);
}

// Sort rows by date
const rows = Object.values(map).sort((a, b) => a.dt < b.dt ? -1 : 1).map(e => [
  e.dt, e.drv, e.b, e.m, e.g, e.gv, e.dur, e.maxV, e.limAtMax
]);

const drivers = [...driverSet].sort();

// Keep ranulfo key from existing JSON if present
let ranulfo = [];
try {
  const prev = JSON.parse(fs.readFileSync('vel_data.json', 'utf8'));
  if (prev.ranulfo) ranulfo = prev.ranulfo;
} catch(e) {}

// Rebuild ranulfo from rows for RANULFO SOARES DE CARVALHO
const ranulfoName = rows.find(r => r[1].includes('RANULFO') && r[1].includes('CARVALHO'));
if (ranulfoName) {
  const rn = ranulfoName[1];
  ranulfo = rows.filter(r => r[1] === rn).map(r => ({
    dt: r[0],
    ev: r[2] + r[3] + r[4] + r[5],
    maxV: r[7],
    lim: r[8],
    pct: Math.round((r[7] / r[8] - 1) * 100),
    dur: r[6]
  }));
}

const out = { rows, drivers, ranulfo };
fs.writeFileSync('vel_data.json', JSON.stringify(out));
console.log('OK:', rows.length, 'rows,', drivers.length, 'drivers, ranulfo:', ranulfo.length);
