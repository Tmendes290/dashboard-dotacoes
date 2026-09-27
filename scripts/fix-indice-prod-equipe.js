// Corrige data/indice-produtividade.json: composições com "Prod. Equipe" > 1 estavam com o índice
// POR HORA DE EQUIPE, e o app tratava como POR UNIDADE (ex.: desmatamento 14,57 HH/m² em vez de
// 14,57 ÷ 170 = 0,086 HH/m²). Divide TODAS as linhas da composição (mão de obra, equipamento, material)
// pela Prod. Equipe, igual à coluna "Qtde Total no Item" das planilhas de composição.
//
// Prod. Equipe usada, nesta ordem:
//   1) planilha de composição (11 HHMETRIA/indice) quando Indice ÷ PE dela bate com o índice da base;
//   2) aba PU_Indices de "Análise produtividade.xlsx" (mesma revisão dos índices da base).
// Roda uma vez só: grava o que aplicou em json.ajustes.prodEquipe e não reaplica.
// Uso: node scripts/fix-indice-prod-equipe.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HH = path.join(ROOT, '..', '11 HHMETRIA');
const XLSX = require(path.join(HH, 'lib', 'xlsx.full.min.js'));
const ARQ = path.join(ROOT, 'data', 'indice-produtividade.json');

const j = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
if (j.ajustes && j.ajustes.prodEquipe) { console.log('Já aplicado em', j.ajustes.prodEquipe.em, '— nada a fazer.'); process.exit(0); }

const sheet = (f, aba) => { const wb = XLSX.read(fs.readFileSync(f), aba ? { sheets: [aba] } : {}); return XLSX.utils.sheet_to_json(wb.Sheets[aba || wb.SheetNames[0]], { header: 1, defval: '' }); };

// HH de mão de obra da base por código (1ª ocorrência de cada função, como o app lê)
const base = new Map();
j.rows.forEach(r => { if (r[9] !== 'M') return; const k = r[2] || r[1]; const o = base.get(k) || { vistos: new Set(), hh: 0 }; if (!o.vistos.has(r[6])) { o.vistos.add(r[6]); o.hh += r[8]; } base.set(k, o); });

// 1) planilha de composição civil: PE + soma do "Indice" da mão de obra
const civ = new Map(); let cur = null;
sheet(path.join(HH, 'indice', 'Composição Civil_Vale (version 1) (3).xlsx')).slice(1).forEach(r => {
  if (String(r[1]).trim()) { cur = { pe: Number(r[6]) || 1, idx: 0 }; civ.set(String(r[2]).trim() || String(r[1]).trim(), cur); }
  if (cur && /^IH/.test(String(r[8]).trim())) cur.idx += Number(r[13]) || 0;
});
// 2) PU_Indices
const pu = new Map(); let cod = '';
sheet(path.join(ROOT, 'Análise produtividade.xlsx'), 'PU_Indices').slice(1).forEach(r => {
  if (String(r[3]).trim()) cod = String(r[3]).trim();
  const v = Number(r[6]); if (cod && v > 0 && !pu.has(cod)) pu.set(cod, v);
});

const perto = (a, b) => Math.abs(a - b) <= 0.02 * Math.max(a, b) + 1e-9;
const aplicar = {}, origem = { planilha: 0, pu: 0 }, conflito = {};
base.forEach((o, k) => {
  const c = civ.get(k);
  if (c && c.pe > 1 && perto(c.idx, o.hh)) { aplicar[k] = c.pe; origem.planilha++; return; }
  const p = pu.get(k);
  // as duas planilhas se contradizem (composição diz PE = 1): não mexe, fica listado p/ conferência
  if (p > 1 && c && c.pe === 1) { conflito[k] = { puIndices: p, planilhaComposicao: 1 }; return; }
  if (p > 1) { aplicar[k] = p; origem.pu++; }
});

let linhas = 0;
j.rows.forEach(r => { const pe = aplicar[r[2] || r[1]]; if (pe) { r[8] = Math.round(r[8] / pe * 1e7) / 1e7; linhas++; } });
j.ajustes = { prodEquipe: { em: new Date().toISOString().slice(0, 10), nota: 'índice dividido pela Prod. Equipe (estava por hora de equipe)', porCodigo: aplicar, conflitoNaoAplicado: conflito } };
fs.writeFileSync(ARQ, JSON.stringify(j));
console.log(Object.keys(aplicar).length + ' composições corrigidas (' + origem.planilha + ' pela planilha de composição, ' + origem.pu + ' pela PU_Indices) · ' + linhas + ' linhas · ' + Object.keys(conflito).length + ' em conflito (não alteradas): ' + Object.keys(conflito).join(', '));
