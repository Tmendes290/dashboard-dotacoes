// relatorio.js — cálculo do relatório diário de Produtividade (Node).
// Espelha a lógica das funções impXxx/_impBuildXxxChart da aba "Evolução" em index.html,
// mas trabalhando puro em memória (sem DOM) a partir das linhas já buscadas do Supabase —
// pra alimentar o e-mail automático que hoje é montado pelo sync-supabase.gs (Apps Script).
//
// Convenção: todo horário é "minutos desde 00:00" (mesmo formato de chegada_min/pts_min/etc
// já salvos no Supabase pela sync do Google Sheets).

const REF_MIN_DEFAULT = 480;  // 08:00
const FIM_MIN_DEFAULT = 1005; // 16:45

const DIA_NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function toRow(r) {
  return {
    dataSortKey: r.data_sort_key, dataStr: r.data_str, empresa: r.empresa || '', sap: r.sap || '',
    fiscal: (r.fiscal || '').trim(), chegadaMin: r.chegada_min, ptsMin: r.pts_min, inicioMin: r.inicio_min,
    almIniMin: r.alm_ini_min, almFimMin: r.alm_fim_min, terminoMin: r.termino_min, acao: r.acao || ''
  };
}

function dowOf(dataSortKey) { return new Date(dataSortKey + 'T12:00:00').getDay(); }
function isWeekend(dataSortKey) { const d = dowOf(dataSortKey); return d === 0 || d === 6; }
function isExcluido(d) { return d.acao === 'Desconsiderar'; }
function isAndaime(empresa) { return (empresa || '').toUpperCase().indexOf('ANDAIME') >= 0; }

function getTurno(inicioMin) {
  if (inicioMin === null || inicioMin === undefined) return 'adm';
  if (inicioMin >= 1380 || inicioMin <= 360) return 'noite';
  if (inicioMin >= 840 && inicioMin <= 1379) return 'tarde';
  return 'adm';
}

function fmtHM(min) {
  if (min === null || min === undefined || isNaN(min)) return '--';
  const h = Math.floor(min / 60), m = Math.abs(Math.round(min % 60));
  return h + 'h' + String(m).padStart(2, '0');
}
function fmtDMY(dataSortKey) { const p = dataSortKey.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtDM(dataSortKey) { const p = dataSortKey.split('-'); return p[2] + '/' + p[1]; }

// Segunda-a-domingo, ancorada em 4/jan — mesma âncora de _impWeekKey no index.html.
function mondayOf(dateObj) {
  const dow = dateObj.getDay() || 7;
  const d = new Date(dateObj);
  d.setDate(d.getDate() - (dow - 1));
  return d;
}
function weekKey(dataSortKey) {
  const d = new Date(dataSortKey + 'T00:00:00');
  const y = d.getFullYear();
  const jan4Mon = mondayOf(new Date(y, 0, 4));
  const dMon = mondayOf(d);
  const w = Math.round((dMon - jan4Mon) / (7 * 86400000)) + 1;
  return y + '-W' + String(w).padStart(2, '0');
}
function weekMondayDate(wKey) {
  const [yStr, wStr] = wKey.split('-W');
  const y = parseInt(yStr, 10), w = parseInt(wStr, 10);
  const jan4Mon = mondayOf(new Date(y, 0, 4));
  const mon = new Date(jan4Mon);
  mon.setDate(mon.getDate() + (w - 1) * 7);
  return mon;
}
function weekLabel(wKey) {
  const mon = weekMondayDate(wKey);
  const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  const w = wKey.split('-W')[1];
  return 'S' + parseInt(w, 10) + ' (' + fmtDM2(mon) + '–' + fmtDM2(fri) + ')';
}
function fmtDM2(dateObj) { return String(dateObj.getDate()).padStart(2, '0') + '/' + String(dateObj.getMonth() + 1).padStart(2, '0'); }

// Lista de dias úteis (seg-sex) do início da semana ISO (âncora 4/jan) de `dataAlvo` até `dataAlvo`.
function diasUteisSemanaAtual(dataAlvo) {
  const alvo = new Date(dataAlvo + 'T00:00:00');
  const mon = mondayOf(alvo);
  const dias = [];
  for (let d = new Date(mon); d <= alvo; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    dias.push(y + '-' + m + '-' + dd);
  }
  return dias;
}

// ── Squad / tribo (mesma regra de sync-supabase.gs + impGetSquad simplificado) ──
function buildSquadMaps(refSquads, refFiscais) {
  const bySap = {}; // sap ou pep → squad
  (refSquads || []).forEach(function (r) { if (r.pep) bySap[String(r.pep).trim()] = r.squad || 'Sem vínculo'; });
  const byFiscal = {};
  (refFiscais || []).forEach(function (r) { if (r.nome) byFiscal[r.nome.trim()] = r.squad || ''; });
  function normSquad(sq) {
    if (!sq) return sq;
    return sq.toUpperCase().indexOf('TELAMENTO') >= 0 ? 'MINA' : sq.toUpperCase();
  }
  function getSquad(sap) {
    if (!sap) return '';
    if (bySap[sap]) return normSquad(bySap[sap]);
    const pep = sap.split('.')[0];
    if (bySap[pep]) return normSquad(bySap[pep]);
    return '';
  }
  function getSquadByFiscal(nome) {
    if (!nome) return '';
    const sq = byFiscal[nome.trim()];
    return sq ? normSquad(sq) : '';
  }
  return { getSquad: getSquad, getSquadByFiscal: getSquadByFiscal };
}
function getTribo(squadName) {
  const s = (squadName || '').toLowerCase();
  if (/usina|br\s|slb|cpf|filtragem|flotac/.test(s)) return 'TRIBO USINA';
  if (/mina|geo|geotec|dique/.test(s)) return 'TRIBO MINA';
  return 'S/ VÍNCULO';
}
function triboColor(t) {
  if (t === 'TRIBO USINA') return { txt: '#1d4ed8', brd: '#3b82f6' };
  if (t === 'TRIBO MINA') return { txt: '#16a34a', brd: '#22c55e' };
  return { txt: '#64748b', brd: '#94a3b8' };
}

// ── KPIs + cards por squad (mesma regra do enviarRelatorio antigo) ─────────────
function getDelayMin(d, refMin) {
  const base = d.inicioMin !== null ? d.inicioMin : (d.chegadaMin !== null ? d.chegadaMin : d.ptsMin);
  return base !== null && base !== undefined ? Math.max(0, base - refMin) : null;
}
function calcKpis(rows, refMin) {
  const total = rows.length;
  const atrasados = rows.filter(function (r) { const dm = getDelayMin(r, refMin); return dm !== null && dm > 0; });
  const totalImprodMin = atrasados.reduce(function (s, r) { return s + getDelayMin(r, refMin); }, 0);
  const pctAtraso = total ? Math.round(atrasados.length / total * 100) : 0;
  return { total: total, atrasados: atrasados.length, totalImprodMin: totalImprodMin, pctAtraso: pctAtraso };
}
function calcSquadCards(rows, refMin, squadMaps) {
  const map = {};
  rows.forEach(function (r) {
    const sq = squadMaps.getSquad(r.sap) || 'Sem vínculo';
    if (!map[sq]) map[sq] = { squad: sq, tribo: getTribo(sq), reg: 0, perf: 0, parc: 0, nao: 0, chegArr: [], iniArr: [] };
    const e = map[sq];
    e.reg++;
    const dm = getDelayMin(r, refMin);
    if (dm === null || dm === 0) e.perf++; else if (dm <= 60) e.parc++; else e.nao++;
    if (r.chegadaMin !== null) e.chegArr.push(r.chegadaMin);
    if (r.inicioMin !== null) e.iniArr.push(r.inicioMin);
  });
  const cards = Object.values(map).sort(function (a, b) { return b.reg - a.reg; });
  cards.forEach(function (e) {
    const avgC = e.chegArr.length ? Math.round(e.chegArr.reduce(function (a, b) { return a + b; }, 0) / e.chegArr.length) : null;
    const avgI = e.iniArr.length ? Math.round(e.iniArr.reduce(function (a, b) { return a + b; }, 0) / e.iniArr.length) : null;
    e.chegada = avgC !== null ? fmtHM(avgC) : '--';
    e.inicio = avgI !== null ? fmtHM(avgI) : '--';
    e.mob = (avgC !== null && avgI !== null && avgI > avgC) ? (avgI - avgC) + 'm' : '--';
  });
  return cards;
}

// ── Aderência dos Fiscais (mesma regra de impRenderAderenciaFiscais) ───────────
function calcAderencia(rows, squadMaps, periodKeyFn) {
  const preRecs = rows.filter(function (d) { return d.fiscal && d.dataSortKey && !isWeekend(d.dataSortKey); });
  if (!preRecs.length) return { fiscais: [], periods: [] };

  const fiscalSquadCanon = {};
  preRecs.forEach(function (d) {
    const byName = squadMaps.getSquadByFiscal(d.fiscal);
    if (byName) fiscalSquadCanon[d.fiscal] = byName;
    else if (!fiscalSquadCanon[d.fiscal]) fiscalSquadCanon[d.fiscal] = squadMaps.getSquad(d.sap) || '(sem squad)';
  });

  const periodSet = {};
  preRecs.forEach(function (d) { periodSet[periodKeyFn(d.dataSortKey)] = 1; });
  const periods = Object.keys(periodSet).sort();
  const periodDays = {}; periods.forEach(function (p) { periodDays[p] = {}; });
  preRecs.forEach(function (d) { const p = periodKeyFn(d.dataSortKey); periodDays[p][d.dataSortKey] = 1; });

  const fiscalSet = {};
  preRecs.forEach(function (d) { fiscalSet[d.fiscal] = 1; });
  const fiscais = Object.keys(fiscalSet);
  const fiscalData = {};
  fiscais.forEach(function (f) { fiscalData[f] = {}; periods.forEach(function (p) { fiscalData[f][p] = {}; }); });
  preRecs.forEach(function (d) {
    const p = periodKeyFn(d.dataSortKey);
    if (fiscalData[d.fiscal] && fiscalData[d.fiscal][p]) fiscalData[d.fiscal][p][d.dataSortKey] = 1;
  });

  function getPct(f, p) {
    const totalDias = Object.keys(periodDays[p]).length;
    if (!totalDias) return null;
    return Math.round(Object.keys(fiscalData[f][p]).length / totalDias * 100);
  }
  function getTotalPct(f) {
    let allD = 0, fiscD = 0;
    periods.forEach(function (p) { allD += Object.keys(periodDays[p]).length; fiscD += Object.keys(fiscalData[f][p]).length; });
    return allD ? Math.round(fiscD / allD * 100) : 0;
  }

  const result = fiscais.map(function (f) {
    return {
      fiscal: f,
      squad: fiscalSquadCanon[f] || '(sem squad)',
      porPeriodo: periods.map(function (p) { return getPct(f, p); }),
      total: getTotalPct(f)
    };
  }).sort(function (a, b) { return b.total - a.total; });

  return { fiscais: result, periods: periods };
}

// ── Evolução (chegada / horas trabalhadas / produtivo x improdutivo) ──────────
// população base compartilhada pelas 3 tabelas: exclui fim de semana, "Desconsiderar",
// e turno diferente do promovido pela referência (com 08:00 o turno promovido é sempre 'adm').
function basePopulacao(rows, refMin) {
  const turnoPromovido = getTurno(refMin);
  return rows.filter(function (d) {
    if (!d.dataSortKey || isWeekend(d.dataSortKey)) return false;
    if (isExcluido(d)) return false;
    const t = getTurno(d.inicioMin);
    return t === 'adm' || t === turnoPromovido;
  });
}

function calcEvolucao(rows, opts) {
  const refMin = opts.refMin, fimMin = opts.fimMin, periodKeyFn = opts.periodKeyFn, periodLabelFn = opts.periodLabelFn, maxPeriods = opts.maxPeriods || 12;
  const base = basePopulacao(rows, refMin).filter(function (d) { return !isAndaime(d.empresa); });
  const andaimeBase = basePopulacao(rows, refMin).filter(function (d) { return isAndaime(d.empresa); });
  const W_base = Math.max(0, fimMin - refMin - 60); // 7h45 por padrão

  // 1) Chegada
  const chegadaPop = base.filter(function (d) { return d.chegadaMin !== null; });
  const porPeriodoCheg = {};
  chegadaPop.forEach(function (d) {
    const p = periodKeyFn(d.dataSortKey);
    if (!porPeriodoCheg[p]) porPeriodoCheg[p] = { t: 0, n: 0 };
    porPeriodoCheg[p].t += d.chegadaMin; porPeriodoCheg[p].n++;
  });

  // 2) Horas trabalhadas + 3) Produtivo x Improdutivo (mesma população: início e término non-null)
  const horasPop = base.filter(function (d) { return d.inicioMin !== null && d.terminoMin !== null; });
  const porPeriodoHoras = {};
  const porPeriodoProdImp = {};
  horasPop.forEach(function (d) {
    const almPausa = (d.almIniMin !== null && d.almFimMin !== null) ? Math.max(0, d.almFimMin - d.almIniMin) : 0;
    const horasTrab = d.terminoMin - d.inicioMin - almPausa;
    const p = periodKeyFn(d.dataSortKey);
    if (!porPeriodoHoras[p]) porPeriodoHoras[p] = { t: 0, n: 0 };
    porPeriodoHoras[p].t += Math.max(0, horasTrab); porPeriodoHoras[p].n++;

    if (!porPeriodoProdImp[p]) porPeriodoProdImp[p] = { atraso: 0, saida: 0, almoco: 0, prod: 0, n: 0, pts: 0, ptsN: 0 };
    const e = porPeriodoProdImp[p];
    e.atraso += Math.max(0, d.inicioMin - refMin);
    e.saida += Math.max(0, fimMin - d.terminoMin);
    e.almoco += Math.max(0, almPausa - 60);
    e.prod += Math.max(0, horasTrab);
    e.n++;
    if (d.chegadaMin !== null && d.ptsMin !== null) { e.pts += Math.max(0, d.ptsMin - d.chegadaMin); e.ptsN++; }
  });

  // Andaime: mesma população (início/término non-null), mas por fora — só entra na "Composição do improdutivo"
  const andaimeHorasPop = andaimeBase.filter(function (d) { return d.inicioMin !== null && d.terminoMin !== null; });
  let andaimeSoma = 0, andaimeN = 0;
  andaimeHorasPop.forEach(function (d) {
    const almPausa = (d.almIniMin !== null && d.almFimMin !== null) ? Math.max(0, d.almFimMin - d.almIniMin) : 0;
    const atraso = Math.max(0, d.inicioMin - refMin);
    const saida = Math.max(0, fimMin - d.terminoMin);
    const almoco = Math.max(0, almPausa - 60);
    const pts = (d.chegadaMin !== null && d.ptsMin !== null) ? Math.max(0, d.ptsMin - d.chegadaMin) : 0;
    andaimeSoma += atraso + saida + almoco + pts; andaimeN++;
  });
  const mAndaime = andaimeN ? andaimeSoma / andaimeN : 0;

  const allPeriods = Object.keys(Object.assign({}, porPeriodoCheg, porPeriodoHoras, porPeriodoProdImp)).sort().slice(-maxPeriods);

  const chegadaRows = allPeriods.map(function (p) {
    const e = porPeriodoCheg[p];
    const avg = e && e.n ? Math.round(e.t / e.n) : null;
    return { periodo: p, label: periodLabelFn(p), avg: avg, cor: avg === null ? null : (avg <= REF_MIN_DEFAULT ? 'verde' : 'vermelho') };
  });

  const metaHoras = W_base, metaAmarelo = Math.max(0, W_base - 60);
  const horasRows = allPeriods.map(function (p) {
    const e = porPeriodoHoras[p];
    const avg = e && e.n ? Math.round(e.t / e.n) : null;
    let cor = null;
    if (avg !== null) cor = avg >= metaHoras ? 'verde' : (avg >= metaAmarelo ? 'amarelo' : 'vermelho');
    return { periodo: p, label: periodLabelFn(p), avg: avg, cor: cor };
  });

  const avgAtrasoArr = [], avgSaidaArr = [], avgAlmocoArr = [], ptsStackArr = [];
  const prodImpRows = allPeriods.map(function (p) {
    const e = porPeriodoProdImp[p];
    if (!e || !e.n) return { periodo: p, label: periodLabelFn(p), prod: null, pts: null, imp: null, pct: null };
    const avgAtraso = Math.round(e.atraso / e.n), avgSaida = Math.round(e.saida / e.n), avgAlmoco = Math.round(e.almoco / e.n);
    const avgProd = Math.round(e.prod / e.n);
    const avgPts = e.ptsN ? Math.round(e.pts / e.ptsN) : 0;
    const impTotal = Math.max(0, W_base - avgProd);
    const pts = Math.min(avgPts, impTotal);
    const imp = impTotal - pts;
    const pct = (avgProd + pts + imp) ? Math.round(avgProd / (avgProd + pts + imp) * 100) : null;
    avgAtrasoArr.push(avgAtraso); avgSaidaArr.push(avgSaida); avgAlmocoArr.push(avgAlmoco); ptsStackArr.push(pts);
    return { periodo: p, label: periodLabelFn(p), prod: avgProd, pts: pts, imp: imp, pct: pct };
  });

  function mean(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
  const mA = mean(avgAtrasoArr), mS = mean(avgSaidaArr), mAl = mean(avgAlmocoArr), mPts = mean(ptsStackArr);
  const somaCausas = mA + mS + mAl + mPts + mAndaime;
  const composicao = [
    { label: 'Espera pelo PTS', valor: mPts },
    { label: 'Atraso na entrada', valor: mA },
    { label: 'Saída antecipada', valor: mS },
    { label: 'Excesso de almoço', valor: mAl },
    { label: 'Andaime (terceirizado)', valor: mAndaime }
  ].filter(function (c) { return c.valor > 0.4; })
    .map(function (c) { return Object.assign({}, c, { pct: somaCausas ? Math.round(c.valor / somaCausas * 100) : 0 }); })
    .sort(function (a, b) { return b.valor - a.valor; });

  return { chegadaRows: chegadaRows, horasRows: horasRows, prodImpRows: prodImpRows, composicao: composicao, metaHoras: metaHoras };
}

// ══════════════════════════════════════════════════════════════════
// RENDERIZAÇÃO HTML (sem JS/gráfico — e-mail não roda script; tudo em
// tabelas/barras via CSS inline, mesmo estilo do template atual)
// ══════════════════════════════════════════════════════════════════

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderKpiRow(kpis) {
  const taxa = 100 - kpis.pctAtraso;
  return '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>'
    + '<td style="padding:4px;width:25%"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid #2563eb;border-radius:8px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:900;color:#1e3a5f">' + kpis.total + '</div><div style="font-size:10px;color:#64748b;margin-top:4px">Registros</div></div></td>'
    + '<td style="padding:4px;width:25%"><div style="background:#fef2f2;border:1px solid #fecaca;border-top:3px solid #dc2626;border-radius:8px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:900;color:#dc2626">' + kpis.atrasados + '</div><div style="font-size:10px;color:#64748b;margin-top:4px">Com atraso</div><div style="font-size:9px;color:#94a3b8">' + kpis.pctAtraso + '% do total</div></div></td>'
    + '<td style="padding:4px;width:25%"><div style="background:#fff7ed;border:1px solid #fed7aa;border-top:3px solid #f59e0b;border-radius:8px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:900;color:#d97706">' + fmtHM(kpis.totalImprodMin) + '</div><div style="font-size:10px;color:#64748b;margin-top:4px">Improdutivo</div></div></td>'
    + '<td style="padding:4px;width:25%"><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-top:3px solid #16a34a;border-radius:8px;padding:12px;text-align:center"><div style="font-size:26px;font-weight:900;color:#16a34a">' + taxa + '%</div><div style="font-size:10px;color:#64748b;margin-top:4px">Taxa produtiva</div></div></td>'
    + '</tr></table>';
}

function renderSquadCards(cards) {
  const cells = cards.map(function (sq) {
    const c = triboColor(sq.tribo);
    return '<td style="padding:4px;vertical-align:top;width:33%"><div style="background:#fff;border:1px solid #e2e8f0;border-top:3px solid ' + c.brd + ';border-radius:8px;padding:12px">'
      + '<div style="font-size:9px;font-weight:700;color:' + c.txt + ';text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">' + sq.tribo + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
      + '<div style="font-size:13px;font-weight:800;color:#1a2a40;line-height:1.2">' + esc(sq.squad) + '</div>'
      + '<div style="font-size:18px;font-weight:900;color:' + c.txt + '">' + sq.reg + '<span style="font-size:9px;color:#64748b;font-weight:600"> reg</span></div>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><tr>'
      + '<td style="text-align:center"><div style="font-size:13px;font-weight:700;color:#1a2a40">' + sq.chegada + '</div><div style="font-size:9px;color:#64748b">Chegada</div></td>'
      + '<td style="text-align:center"><div style="font-size:13px;font-weight:700;color:#1a2a40">' + sq.inicio + '</div><div style="font-size:9px;color:#64748b">Início</div></td>'
      + '<td style="text-align:center"><div style="font-size:13px;font-weight:700;color:#64748b">' + sq.mob + '</div><div style="font-size:9px;color:#64748b">Mob.</div></td>'
      + '</tr></table>'
      + '<div style="font-size:11px;font-weight:700">'
      + '<span style="color:#16a34a">✓ ' + sq.perf + ' perf</span>'
      + '<span style="color:#d97706;margin:0 6px">~ ' + sq.parc + ' parc</span>'
      + '<span style="color:#dc2626">✗ ' + sq.nao + ' não</span>'
      + '</div>'
      + '</div></td>';
  });
  let tbl = '';
  for (let j = 0; j < cells.length; j += 3) tbl += '<tr>' + (cells[j] || '<td></td>') + (cells[j + 1] || '<td></td>') + (cells[j + 2] || '<td></td>') + '</tr>';
  return '<table style="width:100%;border-collapse:collapse">' + tbl + '</table>';
}

function pctColor(pct) {
  if (pct === null || pct === undefined) return { bg: '#f8fafc', text: '#64748b', brd: '#e2e8f0' };
  if (pct === 0) return { bg: '#fef2f2', text: '#dc2626', brd: '#fecaca' };
  if (pct < 50) return { bg: '#fff7ed', text: '#c2410c', brd: '#fed7aa' };
  if (pct < 75) return { bg: '#fefce8', text: '#a16207', brd: '#fef08a' };
  if (pct < 90) return { bg: '#eff6ff', text: '#1d4ed8', brd: '#bfdbfe' };
  return { bg: '#f0fdf4', text: '#15803d', brd: '#bbf7d0' };
}

function renderAderenciaTable(aderencia, tituloPeriodos) {
  if (!aderencia.fiscais.length) return '<div style="font-size:11px;color:#94a3b8;padding:8px 0">Sem coluna "Fiscal" preenchida no período.</div>';
  const periods = aderencia.periods;
  const th = '<th style="padding:6px 8px;font-size:9px;text-transform:uppercase;color:#fff;background:#1e3a5f;text-align:center">';
  let head = '<tr><th style="padding:6px 8px;font-size:9px;text-transform:uppercase;color:#fff;background:#1e3a5f;text-align:left">Fiscal</th>'
    + periods.map(function (p) { return th + esc(tituloPeriodos(p)) + '</th>'; }).join('')
    + '<th style="padding:6px 8px;font-size:9px;text-transform:uppercase;color:#fff;background:#1e3a5f;text-align:center">Total</th></tr>';
  let body = aderencia.fiscais.map(function (f) {
    const cells = f.porPeriodo.map(function (pct) {
      const c = pctColor(pct);
      return '<td style="padding:5px;text-align:center;font-size:10.5px;font-weight:700;background:' + c.bg + ';color:' + c.text + ';border:1px solid ' + c.brd + '">' + (pct === null ? '—' : pct + '%') + '</td>';
    }).join('');
    const cTot = pctColor(f.total);
    return '<tr><td style="padding:5px 8px;font-size:10.5px;color:#1a2a40;border-bottom:1px solid #f1f5f9">' + esc(f.fiscal) + '<div style="font-size:8.5px;color:#94a3b8">' + esc(f.squad) + '</div></td>'
      + cells
      + '<td style="padding:5px;text-align:center;font-size:11px;font-weight:800;background:' + cTot.bg + ';color:' + cTot.text + ';border:1px solid ' + cTot.brd + '">' + f.total + '%</td></tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">' + head + body + '</table>';
}

function renderChegadaEvolucao(rows) {
  const body = rows.map(function (r) {
    if (r.avg === null) return '<tr><td style="padding:5px 8px;font-size:10.5px;color:#94a3b8">' + esc(r.label) + '</td><td colspan="2" style="font-size:10.5px;color:#cbd5e1">sem dado</td></tr>';
    const cor = r.cor === 'verde' ? '#16a34a' : '#dc2626';
    const pctBar = Math.min(100, Math.round((r.avg / (10 * 60)) * 100)); // escala visual até 10:00
    return '<tr>'
      + '<td style="padding:5px 8px;font-size:10.5px;color:#1a2a40;white-space:nowrap">' + esc(r.label) + '</td>'
      + '<td style="padding:5px 8px;width:100%"><div style="background:#f1f5f9;border-radius:4px;height:10px;width:100%"><div style="background:' + cor + ';height:10px;border-radius:4px;width:' + pctBar + '%"></div></div></td>'
      + '<td style="padding:5px 8px;font-size:11px;font-weight:800;color:' + cor + ';white-space:nowrap;text-align:right">' + fmtHM(r.avg) + '</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse">' + body + '</table>';
}

function renderHorasEvolucao(rows) {
  const body = rows.map(function (r) {
    if (r.avg === null) return '<tr><td style="padding:5px 8px;font-size:10.5px;color:#94a3b8">' + esc(r.label) + '</td><td colspan="2" style="font-size:10.5px;color:#cbd5e1">sem dado</td></tr>';
    const cor = r.cor === 'verde' ? '#16a34a' : (r.cor === 'amarelo' ? '#d97706' : '#dc2626');
    const pctBar = Math.min(100, Math.round((r.avg / (8 * 60)) * 100));
    return '<tr>'
      + '<td style="padding:5px 8px;font-size:10.5px;color:#1a2a40;white-space:nowrap">' + esc(r.label) + '</td>'
      + '<td style="padding:5px 8px;width:100%"><div style="background:#f1f5f9;border-radius:4px;height:10px;width:100%"><div style="background:' + cor + ';height:10px;border-radius:4px;width:' + pctBar + '%"></div></div></td>'
      + '<td style="padding:5px 8px;font-size:11px;font-weight:800;color:' + cor + ';white-space:nowrap;text-align:right">' + fmtHM(r.avg) + '</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse">' + body + '</table>';
}

function renderProdImpEvolucao(rows, metaHoras) {
  const body = rows.map(function (r) {
    if (r.pct === null) return '<tr><td style="padding:5px 8px;font-size:10.5px;color:#94a3b8">' + esc(r.label) + '</td><td colspan="2" style="font-size:10.5px;color:#cbd5e1">sem dado</td></tr>';
    const total = Math.max(1, r.prod + r.pts + r.imp);
    const wProd = Math.round(r.prod / total * 100), wPts = Math.round(r.pts / total * 100), wImp = Math.max(0, 100 - wProd - wPts);
    return '<tr>'
      + '<td style="padding:5px 8px;font-size:10.5px;color:#1a2a40;white-space:nowrap">' + esc(r.label) + '</td>'
      + '<td style="padding:5px 8px;width:100%"><div style="border-radius:4px;height:12px;width:100%;overflow:hidden;white-space:nowrap;font-size:0"><div style="display:inline-block;height:12px;background:#16a34a;width:' + wProd + '%"></div><div style="display:inline-block;height:12px;background:#3b82f6;width:' + wPts + '%"></div><div style="display:inline-block;height:12px;background:#dc2626;width:' + wImp + '%"></div></div></td>'
      + '<td style="padding:5px 8px;font-size:11px;font-weight:800;color:#16a34a;white-space:nowrap;text-align:right">' + r.pct + '%</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse">' + body + '</table>'
    + '<div style="font-size:9px;color:#94a3b8;margin-top:4px">🟢 Produtivo &nbsp; 🔵 PTS (espera) &nbsp; 🔴 Improdutivo &nbsp;·&nbsp; meta: ' + fmtHM(metaHoras) + '/dia</div>';
}

function renderComposicao(composicao) {
  if (!composicao.length) return '<div style="font-size:10.5px;color:#94a3b8">Sem improdutividade relevante no período.</div>';
  return composicao.map(function (c) {
    return '<div style="margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#1a2a40;margin-bottom:2px"><span>' + esc(c.label) + '</span><span style="font-weight:700">' + fmtHM(c.valor) + ' · ' + c.pct + '%</span></div>'
      + '<div style="background:#f1f5f9;border-radius:4px;height:8px;width:100%"><div style="background:#d97706;height:8px;border-radius:4px;width:' + c.pct + '%"></div></div>'
      + '</div>';
  }).join('');
}

function secHeader(titulo, sub, cor) {
  return '<div style="background:' + cor + ';border-radius:6px;padding:10px 14px;margin:16px 0 10px">'
    + '<div style="font-size:13px;font-weight:800;color:#fff">' + titulo + '</div>'
    + '<div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:2px">' + sub + '</div>'
    + '</div>';
}
function subHeader(titulo) {
  return '<div style="font-size:11.5px;font-weight:800;color:#1e3a5f;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">' + titulo + '</div>';
}

// ── Monta as 4 seções novas (Aderência + 3 evoluções) pra um recorte (dia/semana atual OU
// acumulado) — devolve o HTML já pronto pra encaixar dentro de "DO DIA" ou "ACUMULADO" ──
function renderBlocoEvolucao(rowsRecorte, squadMaps, refMin, fimMin, periodKeyFn, periodLabelFn, tituloPeriodos, maxPeriods) {
  const aderencia = calcAderencia(rowsRecorte, squadMaps, periodKeyFn);
  const evo = calcEvolucao(rowsRecorte, { refMin: refMin, fimMin: fimMin, periodKeyFn: periodKeyFn, periodLabelFn: periodLabelFn, maxPeriods: maxPeriods });
  return subHeader('👷 Aderência dos Fiscais')
    + renderAderenciaTable(aderencia, tituloPeriodos)
    + subHeader('🕐 Evolução da média de chegada <span style="font-weight:400;color:#64748b">(meta 08:00)</span>')
    + renderChegadaEvolucao(evo.chegadaRows)
    + subHeader('⏱️ Média de horas trabalhadas <span style="font-weight:400;color:#64748b">(meta ' + fmtHM(evo.metaHoras) + ')</span>')
    + renderHorasEvolucao(evo.horasRows)
    + subHeader('📊 Produtivo x Improdutivo')
    + renderProdImpEvolucao(evo.prodImpRows, evo.metaHoras)
    + subHeader('🔎 Composição do improdutivo <span style="font-weight:400;color:#64748b">(média do período)</span>')
    + renderComposicao(evo.composicao);
}

// ── Função principal — recebe as linhas já buscadas do Supabase (formato snake_case) e as
// referências de squad/fiscal, devolve { html, dataFmt } pronto pro Apps Script emailar ──
function montarRelatorioEmail(rawRows, refSquads, refFiscais, opts) {
  opts = opts || {};
  const refMin = opts.refMin != null ? opts.refMin : REF_MIN_DEFAULT;
  const fimMin = opts.fimMin != null ? opts.fimMin : FIM_MIN_DEFAULT;
  const rows = rawRows.map(toRow).filter(function (r) { return r.dataSortKey; });
  const squadMaps = buildSquadMaps(refSquads, refFiscais);

  const datas = Array.from(new Set(rows.map(function (r) { return r.dataSortKey; }))).sort();
  if (!datas.length) return { html: null, dataFmt: null };
  const dataAlvo = datas[datas.length - 1];
  const dataFmt = fmtDMY(dataAlvo);
  const regDoDia = rows.filter(function (r) { return r.dataSortKey === dataAlvo; });

  const periodoStr = datas.length > 1 ? fmtDMY(datas[0]) + ' a ' + fmtDMY(dataAlvo) : dataFmt;

  // DO DIA — recorte: semana atual (seg..dataAlvo), evolução por DIA
  const diasSemana = diasUteisSemanaAtual(dataAlvo);
  const rowsSemanaAtual = rows.filter(function (r) { return diasSemana.indexOf(r.dataSortKey) >= 0; });
  const blocoDoDia = renderBlocoEvolucao(
    rowsSemanaAtual, squadMaps, refMin, fimMin,
    function (d) { return d; }, // período = o próprio dia
    function (d) { const dn = DIA_NOMES[new Date(d + 'T12:00:00').getDay()]; return dn + ' ' + fmtDM(d); },
    function (d) { const dn = DIA_NOMES[new Date(d + 'T12:00:00').getDay()]; return dn + ' ' + fmtDM(d); },
    7
  );

  // ACUMULADO — recorte: tudo, evolução por SEMANA (até 12 mais recentes)
  const blocoAcumulado = renderBlocoEvolucao(
    rows, squadMaps, refMin, fimMin,
    weekKey, weekLabel, weekLabel, 12
  );

  const kpisDia = calcKpis(regDoDia, refMin);
  const cardsDia = calcSquadCards(regDoDia, refMin, squadMaps);
  const kpisAcc = calcKpis(rows, refMin);
  const cardsAcc = calcSquadCards(rows, refMin, squadMaps);

  const html = '<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;background:#f1f5f9;padding:16px">'
    + '<div style="background:#1e3a5f;border-radius:10px 10px 0 0;padding:18px 22px">'
    + '<div style="font-size:18px;font-weight:800;color:#fff">Produtividade Projetos Salobo</div>'
    + '<div style="font-size:11px;color:#94a3b8;margin-top:3px">Registro de chegada e atraso das equipes &nbsp;·&nbsp; Gerado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Manaus' }) + '</div>'
    + '</div>'
    + '<div style="background:#fff;border-radius:0 0 10px 10px;padding:18px 22px;border:1px solid #e2e8f0;border-top:none">'
    + secHeader('📅 DO DIA &nbsp;—&nbsp; ' + dataFmt, 'Referência de entrada: 08:00', '#2563eb')
    + renderKpiRow(kpisDia)
    + renderSquadCards(cardsDia)
    + blocoDoDia
    + secHeader('📊 ACUMULADO &nbsp;—&nbsp; ' + periodoStr, rows.length + ' registros no total', '#7c3aed')
    + renderKpiRow(kpisAcc)
    + renderSquadCards(cardsAcc)
    + blocoAcumulado
    + '<p style="margin:16px 0 0;font-size:10px;color:#94a3b8;text-align:center">Gerado automaticamente · Dashboard: projetossalobo.onrender.com</p>'
    + '</div></div>';

  return { html: html, dataFmt: dataFmt };
}

module.exports = {
  REF_MIN_DEFAULT, FIM_MIN_DEFAULT, DIA_NOMES, MES_NOMES,
  toRow, isWeekend, isExcluido, isAndaime, getTurno, fmtHM, fmtDMY, fmtDM,
  weekKey, weekLabel, diasUteisSemanaAtual,
  buildSquadMaps, getTribo, triboColor,
  getDelayMin, calcKpis, calcSquadCards, calcAderencia, calcEvolucao,
  montarRelatorioEmail
};
