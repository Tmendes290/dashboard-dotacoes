// Materiais SLB: app de celular e iPad da seção Materiais do Dashboard de Dotações.
// Mesmo login, permissões e banco do site (Supabase pelo proxy /db): o que muda aqui aparece no site e vice-versa.
// Materiais = consulta dos pedidos importados (/api/materiais). Pipeline = controle das LMs (material_pipeline),
// com as mesmas regras do site (etapas, campos ao avançar, histórico, risco pela data de necessidade do WBS).
'use strict';
const SUPA_URL = location.origin + '/db';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYml5cXFwenFybHV2dXFybGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjM3MTcsImV4cCI6MjA5NDg5OTcxN30.lW_Jdc7SC7FKh9OJPBCYdfN-QMXFTYGjterU3eWOFTc';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);

const ETAPAS = [
  { id: 'engenharia', label: 'Engenharia', cfg: 'engenharia' },
  { id: 'cotacao', label: 'Cotação', cfg: 'cotacao' },
  { id: 'rc', label: 'RC Emitida', cfg: 'rc' },
  { id: 'aprovacao', label: 'Aprovação', cfg: 'aprovacao' },
  { id: 'pedido_gerado', label: 'Pedido Gerado', cfg: 'pedido' },
];
const DISCIPLINAS = [{ v: 'eletrica', l: 'Elétrica' }, { v: 'eletromecanica', l: 'Eletromecânica' }, { v: 'mecanica', l: 'Mecânica' }];
const CFG_PADRAO = { disciplinas: {}, margem_seguranca_dias: 0 };
DISCIPLINAS.forEach(d => { CFG_PADRAO.disciplinas[d.v] = { engenharia: { min: 60, max: 90 }, cotacao: { min: 5, max: 10 }, rc: { min: 10, max: 20 }, aprovacao: { min: 5, max: 15 }, pedido: { min: 3, max: 10 } }; });
// iguais aos do site: pedidos ao AVANÇAR e editáveis a qualquer momento dentro da etapa
const CAMPOS_AVANCAR = {
  cotacao: [{ k: 'fornecedor', l: 'Fornecedor', t: 'text' }, { k: 'valor_aprovado', l: 'Valor aprovado (R$)', t: 'number' }],
  rc: [{ k: 'rc_numero', l: 'Nº da RC', t: 'text' }, { k: 'valor_aprovado', l: 'Valor da RC (R$)', t: 'number' }],
  aprovacao: [{ k: 'pedido_numero', l: 'Nº do Pedido', t: 'text' }],
};
const CAMPOS_ETAPA = {
  engenharia: [{ k: 'eng_empresa', l: 'Empresa', t: 'text' }, { k: 'eng_data_inicio_baseline', l: 'Início (linha de base)', t: 'date' }, { k: 'eng_data_termino_baseline', l: 'Término (linha de base)', t: 'date' }, { k: 'eng_data_termino_tendencia', l: 'Término (tendência)', t: 'date' }],
  cotacao: [{ k: 'cot_data_inicio', l: 'Início da cotação', t: 'date' }, { k: 'cot_prazo', l: 'Prazo da cotação', t: 'date' }],
};
const STATUS_MAT = [
  { k: 'atrasado', l: 'Atrasado', c: 't-perigo' }, { k: 'semana', l: 'Chega em até 7 dias', c: 't-warn' }, { k: 'prazo', l: 'No prazo', c: 't-info' },
  { k: 'semPrev', l: 'Sem previsão', c: 't-cinza' }, { k: 'semPedido', l: 'RC sem pedido', c: 't-roxo' }, { k: 'entregue', l: 'Entregue', c: 't-ok' },
];
const RISCOS = [{ k: 'vermelho', l: 'Em risco', c: 't-perigo' }, { k: 'amarelo', l: 'Atenção', c: 't-warn' }, { k: 'verde', l: 'No prazo', c: 't-ok' }, { k: 'cinza', l: 'Sem data de necessidade', c: 't-cinza' }, { k: 'concluido', l: 'Concluído', c: 't-cinza' }];

const S = {
  user: null, perfil: null, admin: false, podeMat: false, podePipe: false,
  mats: [], matMeta: null, matDoCache: false, wbs: {}, pipe: [], cfg: null, hist: {},
  aba: 'painel', limite: 60, sel: null, valores: true, travas: {},
  fMat: { busca: '', projeto: [], fornecedor: [], squad: [], status: [] },
  fPipe: { busca: '', etapa: null, disciplina: [], projeto: [], risco: [] },
};
try { S.valores = localStorage.getItem('m.valores') !== '0'; S.aba = localStorage.getItem('m.aba') || 'painel'; } catch (e) {}

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim(); if (!s) return 0;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s.replace(/[^\d.-]/g, '')) || 0;
}
const reais = n => S.valores ? Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ••••';
function reaisCurto(n) {
  if (!S.valores) return 'R$ ••••';
  n = Number(n || 0);
  if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (Math.abs(n) >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return reais(n);
}
const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function dataBR(s) { // "dd/mm/aaaa" -> Date
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || '')); if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d) ? null : d;
}
function dataISO(s) { // "aaaa-mm-dd..." -> Date
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d;
}
const fmt = d => d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '-';
const fmtISO = s => fmt(dataISO(s));
const isoHoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const diasEntre = (a, b) => Math.round((b - a) / 864e5);
function somaUteis(date, n) { const d = new Date(date); let r = Math.abs(Math.round(n)); const dir = n >= 0 ? 1 : -1; while (r > 0) { d.setDate(d.getDate() + dir); const w = d.getDay(); if (w !== 0 && w !== 6) r--; } return d; }
function uteisEntre(a, b) { if (!a || !b) return 0; const d = new Date(a); let c = 0; while (d < b) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) c++; } return c; }

const IC = {
  painel: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z"/>',
  caixa: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  pipe: '<path d="M3 5h8M6 10h9M9 15h9M3 20h18"/>',
  busca: '<path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>',
  olho: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z"/>',
  olhoOff: '<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c7 0 11 7 11 7a18 18 0 01-3 3.7M6.2 6.2A18.3 18.3 0 001 12s4 7 11 7a10.6 10.6 0 005.8-1.8M9.9 9.9a3 3 0 004.2 4.2"/>',
  atualizar: '<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>',
  pessoa: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>', voltar: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arquivo: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>', sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
};
const svg = (n, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + IC[n] + '</svg>';

let _avisoT;
function aviso(txt, tipo) {
  const a = $('#aviso'); a.textContent = txt; a.className = 'aviso' + (tipo ? ' ' + tipo : ''); a.hidden = false;
  clearTimeout(_avisoT); _avisoT = setTimeout(() => { a.hidden = true; }, 3200);
}
const carregando = on => { $('#carregando').hidden = !on; };

// ---------- cache local dos materiais (consulta sem sinal) ----------
const IDB = {
  abre() { return new Promise((ok, no) => { const r = indexedDB.open('materiais-slb', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async get(k) { try { const db = await this.abre(); return await new Promise(ok => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch (e) { return null; } },
  async set(k, v) { try { const db = await this.abre(); await new Promise(ok => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} },
  async limpa() { try { const db = await this.abre(); db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) {} },
};

// ---------- login ----------
async function inicio() {
  carregando(true);
  const { data } = await supa.auth.getSession();
  if (!data.session) { carregando(false); return mostraLogin(); }
  await entra(data.session.user);
}
function mostraLogin() { $('#tela-app').hidden = true; $('#tela-login').hidden = false; }
$('#form-login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const b = $('#lg-btn'), e = $('#lg-erro'); e.hidden = true; b.disabled = true; b.textContent = 'Entrando...';
  const { data, error } = await supa.auth.signInWithPassword({ email: $('#lg-email').value.trim(), password: $('#lg-senha').value });
  b.disabled = false; b.textContent = 'Entrar';
  if (error) { e.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message; e.hidden = false; return; }
  carregando(true); await entra(data.user);
});
async function entra(user) {
  S.user = user;
  const { data: p } = await supa.from('perfis').select('*').eq('id', user.id).maybeSingle();
  S.perfil = p || { role: 'planejador', permissoes: ['overview'], nome: user.email };
  if (S.perfil.ativo === false) { carregando(false); await supa.auth.signOut(); mostraLogin(); const e = $('#lg-erro'); e.textContent = 'Seu acesso está desativado. Fale com o administrador.'; e.hidden = false; return; }
  S.admin = S.perfil.role === 'admin';
  const perms = S.perfil.permissoes || [];
  S.podeMat = S.admin || perms.includes('materiais');
  S.podePipe = S.admin || perms.includes('pipe');
  $('#tela-login').hidden = true; $('#tela-app').hidden = false;
  if (!S.podeMat && !S.podePipe) { carregando(false); $('#menu').innerHTML = ''; $('#conteudo').innerHTML = '<div class="vazio">Seu perfil não tem acesso a Materiais nem ao Pipeline.<br>Peça a liberação ao administrador do Dashboard.</div>'; return; }
  montaTopo(); montaMenu();
  await carregaTudo();
  carregando(false);
  if (S.podePipe) tempoReal();
}

// ---------- dados ----------
async function token() { const { data } = await supa.auth.getSession(); return data.session ? data.session.access_token : ''; }
async function carregaTudo(forcar) {
  const tarefas = [carregaWbs()];
  if (S.podeMat) tarefas.push(carregaMats(forcar));
  if (S.podePipe) tarefas.push(carregaPipe(), carregaCfg());
  await Promise.all(tarefas);
  render();
}
async function carregaWbs() {
  const out = {}; let i = 0;
  for (;;) { // Supabase devolve no máximo 1000 linhas por leitura
    const { data, error } = await supa.from('ref_wbs').select('wbs,descricao,projeto,data_necessidade').order('wbs').range(i, i + 999);
    if (error || !data) break;
    data.forEach(r => { out[r.wbs] = { desc: r.descricao || '', proj: r.projeto || '', nec: r.data_necessidade || null }; });
    if (data.length < 1000) break; i += 1000;
  }
  if (Object.keys(out).length) S.wbs = out;
}
async function carregaMats(forcar) {
  if (!S.mats.length) { // abre rápido com o que está guardado no aparelho
    const c = await IDB.get('mats');
    if (c && c.items) { S.mats = c.items; S.mats.forEach((r, i) => { r.__i = i; }); S.matMeta = c.meta; S.matDoCache = true; render(); }
  }
  if (!navigator.onLine && S.mats.length) return;
  try {
    const r = await fetch('/api/materiais', { headers: { Authorization: 'Bearer ' + await token() } });
    if (r.status === 401) return sair();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    S.mats = (j.items || []).filter(Boolean); S.mats.forEach((r, i) => { r.__i = i; }); S.matMeta = j.meta || null; S.matDoCache = false;
    IDB.set('mats', { items: S.mats, meta: S.matMeta, em: Date.now() });
  } catch (e) { if (forcar || !S.mats.length) aviso('Não foi possível atualizar os materiais' + (S.mats.length ? ' (mostrando a última cópia)' : '') + '.', 'verm'); }
}
async function carregaPipe() {
  const { data, error } = await supa.from('material_pipeline').select('*').eq('arquivado', false).order('data_entrada_etapa');
  if (error) { aviso('Erro ao ler o pipeline: ' + error.message, 'verm'); return; }
  S.pipe = data || [];
}
async function carregaCfg() {
  const { data } = await supa.from('pipeline_config').select('payload').eq('chave', 'main').maybeSingle();
  S.cfg = data && data.payload ? data.payload : CFG_PADRAO;
}
async function carregaHist(id, forcar) {
  if (S.hist[id] && !forcar) return S.hist[id];
  const { data } = await supa.from('material_pipeline_historico').select('*').eq('pipeline_id', id).order('data_transicao');
  S.hist[id] = data || []; return S.hist[id];
}
let _rtT;
function tempoReal() {
  supa.channel('m-pipeline').on('postgres_changes', { event: '*', schema: 'public', table: 'material_pipeline' }, () => {
    clearTimeout(_rtT); _rtT = setTimeout(async () => { await carregaPipe(); S.hist = {}; render(true); }, 600);
  }).subscribe();
  setInterval(async () => { if (document.visibilityState === 'visible' && navigator.onLine) { await carregaPipe(); render(true); } }, 120000);
}

// ---------- regras ----------
function statusMat(r) {
  const sit = norm(r.situacao) + ' ' + norm(r.statusEntrega);
  if (r.dataEntregaReal || /entregue|recebid/.test(sit)) return 'entregue';
  if (!r.pedido || norm(r.situacao) === 'rc sem pedido') return 'semPedido';
  const p = dataBR(r.prevEntrega); if (!p) return 'semPrev';
  const d = diasEntre(hoje0(), p);
  return d < 0 ? 'atrasado' : (d <= 7 ? 'semana' : 'prazo');
}
function rotuloStatus(r) {
  const k = statusMat(r), st = STATUS_MAT.find(s => s.k === k);
  let l = st.l;
  if (k === 'atrasado') l = Math.abs(diasEntre(hoje0(), dataBR(r.prevEntrega))) + ' dias de atraso';
  if (k === 'semana') { const d = diasEntre(hoje0(), dataBR(r.prevEntrega)); l = d === 0 ? 'Chega hoje' : (d === 1 ? 'Chega amanhã' : 'Chega em ' + d + ' dias'); }
  return '<span class="tag ' + st.c + '">' + esc(l) + '</span>';
}
const projetoMat = r => r.projeto || r.pep || 'Sem projeto';
function cfgDisc(item) { const c = (S.cfg && S.cfg.disciplinas) || {}; return c[item.disciplina] || CFG_PADRAO.disciplinas[item.disciplina] || CFG_PADRAO.disciplinas.eletrica; }
function risco(item) { // mesmo cálculo do site (calcPipeRisco)
  const hoje = hoje0(); let i = ETAPAS.findIndex(s => s.id === item.etapa_atual); if (i < 0) i = 0;
  const dias = uteisEntre(dataISO(item.data_entrada_etapa) || hoje, hoje);
  if (item.etapa_atual === 'pedido_gerado') return { dias, bucket: 'concluido', label: 'Concluído', c: 't-cinza' };
  const cd = cfgDisc(item), sc = cd[ETAPAS[i].cfg] || { min: 0, max: 0 };
  const ritmo = dias <= sc.min ? 'ideal' : (dias <= sc.max ? 'faixa' : 'estourada');
  let rmin = Math.max(0, sc.min - dias), rmax = Math.max(0, sc.max - dias);
  for (let j = i + 1; j < ETAPAS.length; j++) { const c2 = cd[ETAPAS[j].cfg] || { min: 0, max: 0 }; rmin += c2.min; rmax += c2.max; }
  const pmin = somaUteis(hoje, rmin), pmax = somaUteis(hoje, rmax);
  const necS = S.wbs[item.wbs] && S.wbs[item.wbs].nec;
  if (!necS) return { dias, ritmo, bucket: 'cinza', label: 'Sem data de necessidade', c: 't-cinza', pmin, pmax };
  const nec = dataISO(necS), ef = new Date(nec); ef.setDate(ef.getDate() - ((S.cfg && S.cfg.margem_seguranca_dias) || 0));
  if (ritmo === 'estourada' || ef < hoje || ef < pmin) return { dias, ritmo, bucket: 'vermelho', label: 'Em risco', c: 't-perigo', pmin, pmax, nec };
  if (ef < pmax) return { dias, ritmo, bucket: 'amarelo', label: 'Atenção', c: 't-warn', pmin, pmax, nec };
  return { dias, ritmo, bucket: 'verde', label: 'No prazo', c: 't-ok', pmin, pmax, nec };
}
function trilho(item) {
  const i = ETAPAS.findIndex(s => s.id === item.etapa_atual), fim = item.etapa_atual === 'pedido_gerado' && item.pedido_numero;
  return '<div class="trilho">' + ETAPAS.map((s, j) => '<i class="' + (j < i || (j === i && fim) ? 'c' : (j === i ? 'a' : '')) + '"></i>').join('') + '</div>';
}
const nomeWbs = w => (S.wbs[w] && S.wbs[w].desc) || '';
const etapaLabel = id => (ETAPAS.find(s => s.id === id) || { label: id }).label;
const discLabel = v => (DISCIPLINAS.find(d => d.v === v) || { l: v || '-' }).l;

// ---------- filtros ----------
function matPassa(r, pular) {
  const f = S.fMat;
  if (pular !== 'projeto' && f.projeto.length && !f.projeto.includes(projetoMat(r))) return false;
  if (pular !== 'fornecedor' && f.fornecedor.length && !f.fornecedor.includes(r.fornecedor || '-')) return false;
  if (pular !== 'squad' && f.squad.length && !f.squad.includes(r.squad || '-')) return false;
  if (pular !== 'status' && f.status.length && !f.status.includes(statusMat(r))) return false;
  if (f.busca) {
    const q = norm(f.busca), alvo = norm([r.pedido, r.rc, r.descricao, r.fornecedor, r.pep, r.projeto, r.comentario].join(' '));
    if (!q.split(/\s+/).every(p => alvo.includes(p))) return false;
  }
  return true;
}
function pipePassa(it, pular) {
  const f = S.fPipe;
  if (pular !== 'etapa' && f.etapa && it.etapa_atual !== f.etapa) return false;
  if (pular !== 'disciplina' && f.disciplina.length && !f.disciplina.includes(it.disciplina)) return false;
  if (pular !== 'projeto' && f.projeto.length && !f.projeto.includes(it.wbs)) return false;
  if (pular !== 'risco' && f.risco.length && !f.risco.includes(risco(it).bucket)) return false;
  if (f.busca) {
    const q = norm(f.busca), alvo = norm([it.numero_lm, it.wbs, nomeWbs(it.wbs), it.descricao_lm, it.responsavel, it.fornecedor, it.rc_numero, it.pedido_numero].join(' '));
    if (!q.split(/\s+/).every(p => alvo.includes(p))) return false;
  }
  return true;
}
// seletor com caixas de seleção e pesquisa (padrão de todos os filtros do site)
function seletor(titulo, opcoes, marcados, aoAplicar, unico) {
  let sel = new Set(marcados);
  const lista = q => opcoes.filter(o => !q || norm(o.l).includes(norm(q))).slice(0, 400);
  const desenha = q => lista(q).map(o => '<label class="opc"><input type="' + (unico ? 'radio' : 'checkbox') + '" name="opc" value="' + esc(o.v) + '"' + (sel.has(o.v) ? ' checked' : '') + '><span>' + esc(o.l) + '</span>' + (o.n != null ? '<em>' + o.n + '</em>' : '') + '</label>').join('') || '<div class="vazio">Nada encontrado.</div>';
  abreFolha('<div class="d-tit">' + esc(titulo) + '</div>'
    + '<div class="busca">' + svg('busca') + '<input id="sel-q" type="search" placeholder="Pesquisar"></div>'
    + '<div class="opcoes" id="sel-op">' + desenha('') + '</div>'
    + '<div class="d-acoes"><button class="btn" id="sel-limpa">Limpar</button><button class="btn btn-pri" id="sel-ok">Aplicar</button></div>');
  const op = $('#sel-op');
  op.addEventListener('change', e => { if (unico) sel = new Set(); e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); });
  $('#sel-q').addEventListener('input', e => { op.innerHTML = desenha(e.target.value); });
  $('#sel-limpa').onclick = () => aoAplicar([]);
  $('#sel-ok').onclick = () => aoAplicar([...sel]);
}
function contaOpcoes(itens, chave) {
  const m = new Map(); itens.forEach(r => { const v = chave(r); m.set(v, (m.get(v) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const fbtn = (id, rotulo, n) => '<button class="fbtn' + (n ? ' on' : '') + '" data-f="' + id + '">' + esc(rotulo) + (n ? ' (' + n + ')' : '') + svg('baixo') + '</button>';

// ---------- folha (bottom sheet) / painel de detalhe ----------
let _folhaAberta = false, _ignoraPop = 0;
function abreFolha(html) {
  $('#folha-caixa').innerHTML = html; $('#folha').hidden = false;
  if (!_folhaAberta) { _folhaAberta = true; history.pushState({ folha: 1 }, ''); }
}
function fechaFolha(doVoltar) {
  if (!_folhaAberta) return; _folhaAberta = false; $('#folha').hidden = true; $('#folha-caixa').innerHTML = '';
  if (!doVoltar && history.state && history.state.folha) { _ignoraPop++; history.back(); }
}
$('#folha').addEventListener('click', e => { if (e.target.hasAttribute('data-fecha')) fechaFolha(); });
window.addEventListener('popstate', () => { if (_ignoraPop) { _ignoraPop--; return; } if (_folhaAberta) fechaFolha(true); else if (S.sel && !largo()) { S.sel = null; } });
const largo = () => window.matchMedia('(min-width: 900px)').matches;
function mostraDetalhe(html) {
  if (largo()) { const p = $('#painel-detalhe'); p.innerHTML = '<div style="display:flex;justify-content:flex-end"><button class="btn" data-fecha-det style="min-height:38px;padding:6px 10px">' + svg('fechar') + '</button></div>' + html; p.hidden = false; document.body.classList.add('com-detalhe'); p.scrollTop = 0; }
  else abreFolha(html);
}
function fechaDetalhe() { S.sel = null; $('#painel-detalhe').hidden = true; document.body.classList.remove('com-detalhe'); fechaFolha(); render(); }
document.addEventListener('click', e => { if (e.target.closest('[data-fecha-det]')) fechaDetalhe(); });

// ---------- topo e menu ----------
function montaTopo() {
  $('#bt-olho').innerHTML = svg(S.valores ? 'olho' : 'olhoOff');
  $('#bt-atualizar').innerHTML = svg('atualizar');
  $('#bt-perfil').innerHTML = svg('pessoa');
  $('#bt-olho').onclick = () => { S.valores = !S.valores; try { localStorage.setItem('m.valores', S.valores ? '1' : '0'); } catch (e) {} montaTopo(); render(true); };
  $('#bt-atualizar').onclick = async () => { carregando(true); await carregaTudo(true); carregando(false); aviso('Atualizado.', 'verd'); };
  $('#bt-perfil').onclick = () => abreFolha('<div class="d-tit">' + esc(S.perfil.nome || S.user.email) + '</div><div class="d-sub">' + esc(S.user.email) + ' · ' + esc(S.perfil.role || '') + '</div>'
    + '<div class="d-grade"><div><small>Materiais</small><span>' + (S.podeMat ? 'Liberado' : 'Sem acesso') + '</span></div><div><small>Pipeline</small><span>' + (S.podePipe ? 'Liberado' : 'Sem acesso') + '</span></div>'
    + '<div class="lg"><small>Base de materiais</small><span>' + (S.matMeta ? esc((S.matMeta.import_file || '') + ' · ' + (S.matMeta.import_date || '')) : '-') + '</span></div></div>'
    + '<div class="d-acoes"><a class="btn cheio" href="/" target="_blank" rel="noopener">Abrir o site completo</a><button class="btn btn-perigo cheio" id="bt-sair">' + svg('sair') + ' Sair</button></div>');
}
document.addEventListener('click', e => { if (e.target.closest('#bt-sair')) sair(); });
async function sair() { fechaFolha(); await supa.auth.signOut(); await IDB.limpa(); S.mats = []; S.pipe = []; mostraLogin(); }
function abasDisponiveis() { const a = [['painel', 'Painel', 'painel']]; if (S.podeMat) a.push(['materiais', 'Materiais', 'caixa']); if (S.podePipe) a.push(['pipeline', 'Pipeline', 'pipe']); return a; }
function montaMenu() {
  const abas = abasDisponiveis(); if (!abas.some(a => a[0] === S.aba)) S.aba = 'painel';
  $('#menu').innerHTML = abas.map(([id, l, ic]) => '<button data-aba="' + id + '" class="' + (S.aba === id ? 'ativo' : '') + '">' + svg(ic) + l + '</button>').join('');
  $('#menu').onclick = e => { const b = e.target.closest('[data-aba]'); if (b) vaiPara(b.dataset.aba); };
}
function vaiPara(aba) {
  S.aba = aba; S.limite = 60; S.sel = null; $('#painel-detalhe').hidden = true; document.body.classList.remove('com-detalhe');
  try { localStorage.setItem('m.aba', aba); } catch (e) {}
  montaMenu(); render(); window.scrollTo(0, 0);
}
function rede() { const s = $('#st-rede'); const on = navigator.onLine; s.className = 'st ' + (on ? 'on' : 'off'); s.textContent = on ? 'Ao vivo' : 'Sem sinal'; }
window.addEventListener('online', () => { rede(); carregaTudo(); });
window.addEventListener('offline', rede);

// ---------- telas ----------
function render(manterRolagem) {
  rede();
  const y = window.scrollY;
  const t = { painel: ['Painel', 'Materiais e Pipeline'], materiais: ['Materiais', S.mats.length.toLocaleString('pt-BR') + ' itens' + (S.matDoCache ? ' · cópia do aparelho' : '')], pipeline: [largo() ? 'Pipeline de Materiais' : 'Pipeline', S.pipe.length + ' LMs ativas'] }[S.aba];
  $('#topo-titulo').textContent = t[0]; $('#topo-sub').textContent = t[1];
  const c = $('#conteudo');
  c.innerHTML = S.aba === 'materiais' ? telaMateriais() : (S.aba === 'pipeline' ? telaPipeline() : telaPainel());
  ligaTela();
  if (manterRolagem) window.scrollTo(0, y);
  if (S.sel && largo()) S.sel.tipo === 'mat' ? detalheMat(S.sel.id, true) : detalheLm(S.sel.id, true);
}

function telaPainel() {
  let h = '';
  if (S.podeMat) {
    const ativos = S.mats.filter(r => statusMat(r) !== 'entregue');
    const cont = k => S.mats.filter(r => statusMat(r) === k).length;
    const valorAberto = ativos.reduce((s, r) => s + num(r.valorTotal), 0);
    const pedidos = new Set(S.mats.map(r => r.pedido).filter(Boolean)).size;
    h += '<div class="sec">Materiais' + (S.matMeta && S.matMeta.import_date ? '<span>base de ' + esc(S.matMeta.import_date) + '</span>' : '') + '</div><div class="kpis">'
      + kpi('Itens', S.mats.length.toLocaleString('pt-BR'), pedidos.toLocaleString('pt-BR') + ' pedidos', '', 'm:')
      + kpi('Atrasados', cont('atrasado').toLocaleString('pt-BR'), 'previsão vencida', 'verm', 'm:atrasado')
      + kpi('Chegam em 7 dias', cont('semana').toLocaleString('pt-BR'), 'acompanhar recebimento', 'amar', 'm:semana')
      + kpi('Sem previsão', cont('semPrev').toLocaleString('pt-BR'), 'cobrar o fornecedor', '', 'm:semPrev')
      + kpi('Em aberto', reaisCurto(valorAberto), ativos.length.toLocaleString('pt-BR') + ' itens a receber', 'azul', 'm:aberto')
      + kpi('Entregues', cont('entregue').toLocaleString('pt-BR'), S.mats.length ? Math.round(cont('entregue') / S.mats.length * 100) + '% do total' : '', 'verd', 'm:entregue')
      + '</div>';
    const porProj = contaOpcoes(ativos.filter(r => statusMat(r) === 'atrasado'), projetoMat).slice(0, 6);
    if (porProj.length) {
      const max = porProj[0][1];
      h += '<div class="sec">Atrasados por projeto</div><div class="barras">' + porProj.map(([p, n]) => '<div class="barra" data-ir="mp:' + esc(p) + '"><span>' + esc(p) + '</span><b>' + n + '</b><i><u style="width:' + Math.max(4, n / max * 100) + '%;background:var(--danger)"></u></i></div>').join('') + '</div>';
    }
  }
  if (S.podePipe) {
    const rs = S.pipe.map(risco);
    const cr = k => rs.filter(r => r.bucket === k).length;
    h += '<div class="sec">Pipeline de materiais</div><div class="kpis">'
      + kpi('LMs ativas', S.pipe.length, 'no pipeline', '', 'p:')
      + kpi('Em risco', cr('vermelho'), 'não chegam a tempo', 'verm', 'p:vermelho')
      + kpi('Atenção', cr('amarelo'), 'margem apertada', 'amar', 'p:amarelo')
      + kpi('No prazo', cr('verde'), 'dentro da necessidade', 'verd', 'p:verde')
      + '</div>';
    const max = Math.max(1, ...ETAPAS.map(s => S.pipe.filter(i => i.etapa_atual === s.id).length));
    h += '<div class="sec">LMs por etapa</div><div class="barras">' + ETAPAS.map(s => { const n = S.pipe.filter(i => i.etapa_atual === s.id).length; return '<div class="barra" data-ir="pe:' + s.id + '"><span>' + s.label + '</span><b>' + n + '</b><i><u style="width:' + (n / max * 100) + '%"></u></i></div>'; }).join('') + '</div>';
  }
  return h;
}
const kpi = (r, v, sub, cls, ir) => '<button class="kpi ' + cls + '" data-ir="' + ir + '"><small>' + r + '</small><b>' + v + '</b><em>' + esc(sub) + '</em></button>';

function telaMateriais() {
  const f = S.fMat, dados = S.mats.filter(r => matPassa(r));
  if (!S.mats.length) return '<div class="vazio">Carregando materiais...</div>';
  const total = dados.reduce((s, r) => s + num(r.valorTotal), 0);
  const ativos = f.projeto.length + f.fornecedor.length + f.squad.length + f.status.length + (f.busca ? 1 : 0);
  let h = '<div class="busca">' + svg('busca') + '<input id="mat-q" type="search" placeholder="Pedido, RC, descrição, fornecedor ou PEP" value="' + esc(f.busca) + '"></div>'
    + '<div class="filtros">' + fbtn('status', 'Situação', f.status.length) + fbtn('projeto', 'Projeto', f.projeto.length) + fbtn('fornecedor', 'Fornecedor', f.fornecedor.length) + fbtn('squad', 'Squad', f.squad.length) + '</div>'
    + '<div class="conta"><span>' + dados.length.toLocaleString('pt-BR') + ' itens · ' + reaisCurto(total) + '</span>' + (ativos ? '<button id="mat-limpa">Limpar filtros</button>' : '') + '</div>';
  if (!dados.length) return h + '<div class="vazio">Nenhum item com esses filtros.</div>';
  // ordena: atrasados primeiro (mais atrasado no topo), depois os que chegam antes
  const peso = { atrasado: 0, semana: 1, prazo: 2, semPrev: 3, semPedido: 4, entregue: 5 };
  const ord = dados.map(r => ({ r, k: statusMat(r), p: dataBR(r.prevEntrega) })).sort((a, b) => peso[a.k] - peso[b.k] || ((a.p ? a.p.getTime() : 9e15) - (b.p ? b.p.getTime() : 9e15)));
  h += '<div class="lista">' + ord.slice(0, S.limite).map(({ r }, i) => {
    const idx = r.__i, sel = S.sel && S.sel.tipo === 'mat' && S.sel.id === idx;
    return '<button class="item' + (sel ? ' sel' : '') + '" data-mat="' + idx + '"><div class="item-l1"><div class="item-tit">' + esc(r.descricao || 'Sem descrição') + '</div></div>'
      + '<div class="item-sub"><span class="mono">' + (r.pedido ? 'PED ' + esc(r.pedido) : 'RC ' + esc(r.rc || '-')) + '</span><span>' + esc(r.fornecedor || 'Sem fornecedor') + '</span><span>' + esc(projetoMat(r)) + '</span></div>'
      + '<div class="item-l3">' + rotuloStatus(r) + '<span class="valor">' + reais(num(r.valorTotal)) + '</span></div></button>';
  }).join('') + '</div>';
  if (ord.length > S.limite) h += '<button class="btn mais" id="mais">Mostrar mais (' + (ord.length - S.limite).toLocaleString('pt-BR') + ' restantes)</button>';
  return h;
}

function telaPipeline() {
  const f = S.fPipe, dados = S.pipe.filter(it => pipePassa(it));
  const base = S.pipe.filter(it => pipePassa(it, 'etapa'));
  let h = '<div class="etapas"><button class="etapa' + (!f.etapa ? ' on' : '') + '" data-etapa=""><small>Todas</small><b>' + base.length + '</b></button>'
    + ETAPAS.map(s => '<button class="etapa' + (f.etapa === s.id ? ' on' : '') + '" data-etapa="' + s.id + '"><small>' + s.label + '</small><b>' + base.filter(i => i.etapa_atual === s.id).length + '</b></button>').join('') + '</div>'
    + '<div class="busca">' + svg('busca') + '<input id="pipe-q" type="search" placeholder="LM, WBS, descrição, responsável, RC ou pedido" value="' + esc(f.busca) + '"></div>'
    + '<div class="filtros">' + fbtn('risco', 'Risco', f.risco.length) + fbtn('disciplina', 'Disciplina', f.disciplina.length) + fbtn('projeto', 'Projeto (WBS)', f.projeto.length) + '</div>'
    + '<div class="conta"><span>' + dados.length + ' LMs</span>' + ((f.risco.length + f.disciplina.length + f.projeto.length + (f.busca ? 1 : 0) + (f.etapa ? 1 : 0)) ? '<button id="pipe-limpa">Limpar filtros</button>' : '') + '</div>';
  if (!dados.length) h += '<div class="vazio">' + (S.pipe.length ? 'Nenhuma LM com esses filtros.' : 'Nenhuma LM ativa no pipeline.') + '</div>';
  else {
    const ordem = { vermelho: 0, amarelo: 1, cinza: 2, verde: 3, concluido: 4 };
    const ord = dados.map(it => ({ it, r: risco(it) })).sort((a, b) => ordem[a.r.bucket] - ordem[b.r.bucket] || b.r.dias - a.r.dias);
    h += '<div class="lista">' + ord.map(({ it, r }) => {
      const sel = S.sel && S.sel.tipo === 'lm' && S.sel.id === it.id, fim = it.etapa_atual === 'pedido_gerado';
      return '<button class="item' + (sel ? ' sel' : '') + '" data-lm="' + esc(it.id) + '"><div class="item-l1"><div class="item-tit">' + esc(it.descricao_lm || 'Sem descrição') + '</div><span class="tag ' + r.c + '">' + r.label + '</span></div>'
        + '<div class="item-sub"><span class="mono">' + esc(it.numero_lm || it.wbs) + '</span><span>' + esc(discLabel(it.disciplina)) + '</span>' + (it.responsavel ? '<span>' + esc(it.responsavel) + '</span>' : '') + '</div>'
        + trilho(it)
        + '<div class="item-l3"><span class="tag t-info">' + etapaLabel(it.etapa_atual) + '</span><span style="font-size:13px;color:var(--muted)">' + (fim ? (it.pedido_numero ? 'Pedido ' + esc(it.pedido_numero) : 'Sem nº do pedido') : r.dias + ' dias úteis na etapa') + '</span></div></button>';
    }).join('') + '</div>';
  }
  return h + '<button class="fab" id="nova-lm">' + svg('mais') + ' Nova LM</button>';
}

function ligaTela() {
  const c = $('#conteudo');
  c.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => irPara(b.dataset.ir));
  c.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => detalheMat(+b.dataset.mat));
  c.querySelectorAll('[data-lm]').forEach(b => b.onclick = () => detalheLm(b.dataset.lm));
  c.querySelectorAll('[data-etapa]').forEach(b => b.onclick = () => { S.fPipe.etapa = b.dataset.etapa || null; render(true); });
  const mq = $('#mat-q'); if (mq) { let t; mq.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.fMat.busca = mq.value.trim(); S.limite = 60; render(true); const n = $('#mat-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); }; }
  const pq = $('#pipe-q'); if (pq) { let t; pq.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.fPipe.busca = pq.value.trim(); render(true); const n = $('#pipe-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); }; }
  const mais = $('#mais'); if (mais) mais.onclick = () => { S.limite += 60; render(true); };
  const ml = $('#mat-limpa'); if (ml) ml.onclick = () => { S.fMat = { busca: '', projeto: [], fornecedor: [], squad: [], status: [] }; render(); };
  const pl = $('#pipe-limpa'); if (pl) pl.onclick = () => { S.fPipe = { busca: '', etapa: null, disciplina: [], projeto: [], risco: [] }; render(); };
  const nl = $('#nova-lm'); if (nl) nl.onclick = () => formLm(null);
  c.querySelectorAll('[data-f]').forEach(b => b.onclick = () => abreFiltro(b.dataset.f));
}
function irPara(alvo) {
  const [tipo, v] = alvo.split(/:(.*)/s);
  if (tipo === 'm' || tipo === 'mp') { S.fMat = { busca: '', projeto: tipo === 'mp' ? [v] : [], fornecedor: [], squad: [], status: tipo === 'm' && v ? (v === 'aberto' ? ['atrasado', 'semana', 'prazo', 'semPrev', 'semPedido'] : [v]) : [] }; vaiPara('materiais'); }
  else if (tipo === 'p' || tipo === 'pe') { S.fPipe = { busca: '', etapa: tipo === 'pe' ? v : null, disciplina: [], projeto: [], risco: tipo === 'p' && v ? [v] : [] }; vaiPara('pipeline'); }
}
function abreFiltro(campo) {
  if (S.aba === 'materiais') {
    const base = S.mats.filter(r => matPassa(r, campo));
    const def = {
      status: ['Situação', () => STATUS_MAT.map(s => ({ v: s.k, l: s.l, n: base.filter(r => statusMat(r) === s.k).length }))],
      projeto: ['Projeto', () => contaOpcoes(base, projetoMat).map(([v, n]) => ({ v, l: v, n }))],
      fornecedor: ['Fornecedor', () => contaOpcoes(base, r => r.fornecedor || '-').map(([v, n]) => ({ v, l: v, n }))],
      squad: ['Squad', () => contaOpcoes(base, r => r.squad || '-').map(([v, n]) => ({ v, l: v, n }))],
    }[campo];
    seletor(def[0], def[1](), S.fMat[campo], vals => { fechaFolha(); S.fMat[campo] = vals; S.limite = 60; render(); });
  } else {
    const base = S.pipe.filter(it => pipePassa(it, campo));
    const def = {
      risco: ['Risco', () => RISCOS.map(r => ({ v: r.k, l: r.l, n: base.filter(it => risco(it).bucket === r.k).length }))],
      disciplina: ['Disciplina', () => DISCIPLINAS.map(d => ({ v: d.v, l: d.l, n: base.filter(it => it.disciplina === d.v).length }))],
      projeto: ['Projeto (WBS)', () => contaOpcoes(base, it => it.wbs).map(([v, n]) => ({ v, l: v + (nomeWbs(v) ? ' · ' + nomeWbs(v) : ''), n }))],
    }[campo];
    seletor(def[0], def[1](), S.fPipe[campo], vals => { fechaFolha(); S.fPipe[campo] = vals; render(); });
  }
}

// ---------- detalhe de material ----------
function detalheMat(idx, soAtualiza) {
  const r = S.mats[idx]; if (!r) return;
  S.sel = { tipo: 'mat', id: idx };
  const lm = S.pipe.find(it => it.pedido_numero && r.pedido && String(it.pedido_numero) === String(r.pedido));
  const g = (l, v, lg) => '<div' + (lg ? ' class="lg"' : '') + '><small>' + l + '</small><span>' + (v === '' || v == null ? '-' : esc(v)) + '</span></div>';
  const html = '<div class="d-tit">' + esc(r.descricao || 'Sem descrição') + '</div><div class="d-sub">' + esc(projetoMat(r)) + '</div>' + rotuloStatus(r)
    + '<div class="d-grade">' + g('Pedido', r.pedido) + g('RC', r.rc) + g('Fornecedor', r.fornecedor, true)
    + g('Quantidade', (r.qtde || '') + ' ' + (r.unMedida || '')) + '<div><small>Valor total</small><span>' + reais(num(r.valorTotal)) + '</span></div>'
    + g('Previsão de entrega', r.prevEntrega) + g('Linha de base', r.baselineEntrega) + g('Remessa', r.dataRemessa) + g('Faturamento', r.dataFaturamento)
    + g('Recebido em', r.dataEntregaReal) + g('Situação do item', r.situacao) + g('Status da entrega', r.statusEntrega, true)
    + g('PEP', r.pep) + g('Squad', r.squad) + g('Líder', r.lider || r.liderItem) + g('Planejador', r.planejador)
    + (r.observacao ? g('Observação', r.observacao, true) : '') + (r.comentario ? g('Comentário', r.comentario, true) : '') + '</div>'
    + (lm && S.podePipe ? '<div class="d-acoes"><button class="btn cheio" data-abre-lm="' + esc(lm.id) + '">' + svg('link') + ' Ver a LM ' + esc(lm.numero_lm || lm.wbs) + ' no pipeline</button></div>' : '');
  mostraDetalhe(html);
  if (!soAtualiza) { document.querySelectorAll('.item.sel').forEach(e => e.classList.remove('sel')); const b = document.querySelector('[data-mat="' + idx + '"]'); if (b) b.classList.add('sel'); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-abre-lm]'); if (b) { const id = b.dataset.abreLm; fechaFolha(); S.fPipe = { busca: '', etapa: null, disciplina: [], projeto: [], risco: [] }; vaiPara('pipeline'); detalheLm(id); } });

// ---------- detalhe de LM (pipeline) ----------
async function detalheLm(id, soAtualiza) {
  const it = S.pipe.find(x => x.id === id); if (!it) { if (S.sel && S.sel.id === id) fechaDetalhe(); return; }
  S.sel = { tipo: 'lm', id };
  const desenha = hist => {
    const r = risco(it), i = ETAPAS.findIndex(s => s.id === it.etapa_atual), fim = i === ETAPAS.length - 1;
    const inicio = {}, termino = {};
    (hist || []).forEach(h => { inicio[h.etapa_nova] = new Date(h.data_transicao); termino[h.etapa_anterior] = new Date(h.data_transicao); });
    const cd = cfgDisc(it); let cur = hoje0(), curMax = hoje0();
    const linhas = ETAPAS.map((s, j) => {
      let cls = '', txt = '';
      if (j < i || (j === i && fim && it.pedido_numero)) { cls = 'c'; txt = 'Concluída' + (termino[s.id] ? ' em ' + fmt(termino[s.id]) : ''); }
      else if (j === i) { cls = 'a'; txt = 'Em andamento desde ' + fmtISO(it.data_entrada_etapa) + ' · ' + r.dias + ' dias úteis'; }
      else { const c = cd[s.cfg] || { min: 0, max: 0 }; const ini = new Date(cur); cur = somaUteis(cur, c.min); curMax = somaUteis(curMax, c.max); txt = 'Prevista de ' + fmt(ini) + ' a ' + fmt(curMax); }
      const extra = extraEtapa(it, s.id);
      return '<div class="lt"><i class="' + cls + '"></i><div><b>' + s.label + '</b><small>' + txt + '</small>' + (extra ? '<small>' + extra + '</small>' : '')
        + (CAMPOS_ETAPA[s.id] && j <= i ? '<button class="ed" data-ed-etapa="' + s.id + '">Editar dados de ' + s.label + '</button>' : '') + '</div></div>';
    }).join('');
    const nec = S.wbs[it.wbs] && S.wbs[it.wbs].nec;
    const g = (l, v, lg) => '<div' + (lg ? ' class="lg"' : '') + '><small>' + l + '</small><span>' + (v === '' || v == null ? '-' : esc(v)) + '</span></div>';
    return '<div class="d-tit">' + esc(it.descricao_lm || 'Sem descrição') + '</div><div class="d-sub mono">' + esc(it.numero_lm || '') + ' · ' + esc(it.wbs) + (nomeWbs(it.wbs) ? ' · ' + esc(nomeWbs(it.wbs)) : '') + '</div>'
      + '<span class="tag t-info">' + etapaLabel(it.etapa_atual) + '</span> <span class="tag ' + r.c + '">' + r.label + '</span>'
      + '<div class="d-grade">' + g('Disciplina', discLabel(it.disciplina)) + g('Responsável', it.responsavel)
      + g('Necessidade (WBS)', nec ? fmtISO(nec) : 'sem data') + g('Previsão do pedido', fim ? '-' : (r.pmin ? fmt(r.pmin) + ' a ' + fmt(r.pmax) : '-'))
      + '<div><small>Valor estimado</small><span>' + (it.valor_estimado != null ? reais(it.valor_estimado) : '-') + '</span></div><div><small>Valor aprovado</small><span>' + (it.valor_aprovado != null ? reais(it.valor_aprovado) : '-') + '</span></div>'
      + g('Fornecedor', it.fornecedor) + g('RC', it.rc_numero) + g('Pedido', it.pedido_numero, true) + (it.observacoes ? g('Observações', it.observacoes, true) : '') + '</div>'
      + '<div class="sec" style="margin-top:6px">Prazos por etapa</div><div class="linha-tempo">' + linhas + '</div>'
      + '<div class="d-acoes">'
      + (fim ? '<button class="btn cheio" data-acao="arquivar">' + svg('arquivo') + ' Arquivar LM</button>' : '<button class="btn btn-ok cheio" data-acao="avancar">' + svg('seta') + ' ' + ETAPAS[i].label + ' concluída: avançar</button>')
      + (i > 0 ? '<button class="btn" data-acao="voltar">' + svg('voltar') + ' Voltar etapa</button>' : '')
      + '<button class="btn" data-acao="editar"' + (i > 0 ? '' : ' style="grid-column:1/-1"') + '>' + svg('lapis') + ' Editar LM</button>'
      + (it.pedido_numero && S.podeMat ? '<button class="btn cheio" data-acao="pedido">' + svg('link') + ' Ver pedido ' + esc(it.pedido_numero) + ' em Materiais</button>' : '')
      + '<button class="btn btn-perigo cheio" data-acao="excluir">' + svg('lixo') + ' Excluir LM</button></div>';
  };
  mostraDetalhe(desenha(S.hist[id]));
  if (!soAtualiza) { document.querySelectorAll('.item.sel').forEach(e => e.classList.remove('sel')); const b = document.querySelector('[data-lm="' + CSS.escape(id) + '"]'); if (b) b.classList.add('sel'); }
  if (!S.hist[id]) { const h = await carregaHist(id); if (S.sel && S.sel.id === id) mostraDetalhe(desenha(h)); }
}
function extraEtapa(it, etapa) {
  const p = [];
  if (etapa === 'engenharia') { if (it.eng_empresa) p.push(esc(it.eng_empresa)); if (it.eng_data_inicio_baseline || it.eng_data_termino_baseline) p.push('Base: ' + fmtISO(it.eng_data_inicio_baseline) + ' a ' + fmtISO(it.eng_data_termino_baseline)); if (it.eng_data_termino_tendencia) p.push('Tendência: ' + fmtISO(it.eng_data_termino_tendencia)); }
  if (etapa === 'cotacao') { if (it.fornecedor) p.push(esc(it.fornecedor)); if (it.cot_data_inicio || it.cot_prazo) p.push('Cotação: ' + fmtISO(it.cot_data_inicio) + ' a ' + fmtISO(it.cot_prazo)); }
  if (etapa === 'rc' && it.rc_numero) p.push('RC ' + esc(it.rc_numero));
  if (etapa === 'pedido_gerado' && it.pedido_numero) p.push('Pedido ' + esc(it.pedido_numero));
  return p.join(' · ');
}
document.addEventListener('click', e => {
  const ed = e.target.closest('[data-ed-etapa]'); if (ed && S.sel && S.sel.tipo === 'lm') return formDadosEtapa(S.sel.id, ed.dataset.edEtapa);
  const a = e.target.closest('[data-acao]'); if (!a || !S.sel || S.sel.tipo !== 'lm') return;
  const id = S.sel.id, it = S.pipe.find(x => x.id === id); if (!it) return;
  ({ avancar: () => formAvancar(it), voltar: () => voltarEtapa(it), editar: () => formLm(it), arquivar: () => arquivar(it), excluir: () => excluir(it),
    pedido: () => { fechaFolha(); S.fMat = { busca: String(it.pedido_numero), projeto: [], fornecedor: [], squad: [], status: [] }; vaiPara('materiais'); } })[a.dataset.acao]();
});

// ---------- ações do pipeline (mesmas gravações do site) ----------
const campoHtml = (c, val) => '<label class="campo">' + c.l + '<input type="' + c.t + '"' + (c.t === 'number' ? ' step="0.01" inputmode="decimal"' : '') + ' id="f-' + c.k + '" value="' + esc(val == null ? '' : val) + '"></label>';
function lerCampos(campos) {
  const o = {}; campos.forEach(c => { const el = $('#f-' + c.k); if (!el) return; const v = el.value; o[c.k] = c.t === 'number' ? (v ? parseFloat(v) : null) : ((v || '').trim() || null); }); return o;
}
async function comTrava(id, fn) {
  if (S.travas[id]) return; S.travas[id] = true;
  try { await fn(); } catch (e) { aviso('Erro: ' + (e.message || e), 'verm'); } finally { delete S.travas[id]; }
}
async function depoisDeGravar(id, msg) {
  delete S.hist[id]; fechaFolha(); aviso(msg, 'verd'); await carregaPipe(); render(true);
  if (S.pipe.find(x => x.id === id)) { if (!largo()) return; detalheLm(id, true); } else fechaDetalhe();
}
function formAvancar(it) {
  const i = ETAPAS.findIndex(s => s.id === it.etapa_atual); if (i < 0 || i >= ETAPAS.length - 1) return;
  const campos = CAMPOS_AVANCAR[it.etapa_atual] || [];
  abreFolha('<div class="d-tit">' + ETAPAS[i].label + ' concluída</div><div class="d-sub">' + (campos.length ? 'Confirme os dados antes de avançar para ' : 'Confirma que a etapa terminou e avança para ') + '<b>' + ETAPAS[i + 1].label + '</b>. ' + esc(it.numero_lm || it.wbs) + '</div>'
    + campos.map(c => campoHtml(c, it[c.k])).join('')
    + '<div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-ok" id="f-ok">Avançar</button></div>');
  $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
  $('#f-ok').onclick = () => comTrava(it.id, async () => {
    $('#f-ok').disabled = true;
    const anterior = it.etapa_atual, prox = ETAPAS[i + 1].id, payload = Object.assign({ etapa_atual: prox, data_entrada_etapa: isoHoje() }, lerCampos(campos));
    const { error } = await supa.from('material_pipeline').update(payload).eq('id', it.id); if (error) throw error;
    await supa.from('material_pipeline_historico').insert({ pipeline_id: it.id, etapa_anterior: anterior, etapa_nova: prox, usuario: S.user.email || '' });
    await depoisDeGravar(it.id, 'Etapa avançada para ' + ETAPAS[i + 1].label + '.');
  });
}
function voltarEtapa(it) {
  const i = ETAPAS.findIndex(s => s.id === it.etapa_atual); if (i <= 0) return;
  abreFolha('<div class="d-tit">Voltar etapa?</div><div class="d-sub">' + esc(it.numero_lm || it.wbs) + ' volta de <b>' + ETAPAS[i].label + '</b> para <b>' + ETAPAS[i - 1].label + '</b>. Fica registrado no histórico.</div>'
    + '<div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-pri" id="f-ok">Voltar etapa</button></div>');
  $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
  $('#f-ok').onclick = () => comTrava(it.id, async () => {
    const ant = ETAPAS[i - 1].id, atual = it.etapa_atual;
    const { error } = await supa.from('material_pipeline').update({ etapa_atual: ant, data_entrada_etapa: isoHoje() }).eq('id', it.id); if (error) throw error;
    await supa.from('material_pipeline_historico').insert({ pipeline_id: it.id, etapa_anterior: atual, etapa_nova: ant, usuario: S.user.email || '' });
    await depoisDeGravar(it.id, 'Etapa retornada para ' + ETAPAS[i - 1].label + '.');
  });
}
function formDadosEtapa(id, etapa) {
  const it = S.pipe.find(x => x.id === id), campos = CAMPOS_ETAPA[etapa]; if (!it || !campos) return;
  abreFolha('<div class="d-tit">Dados de ' + etapaLabel(etapa) + '</div><div class="d-sub">' + esc(it.numero_lm || it.wbs) + '. Atualize quando precisar, sem avançar de etapa.</div>'
    + campos.map(c => campoHtml(c, it[c.k])).join('') + '<div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-pri" id="f-ok">Salvar</button></div>');
  $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
  $('#f-ok').onclick = () => comTrava(id, async () => {
    const { error } = await supa.from('material_pipeline').update(lerCampos(campos)).eq('id', id); if (error) throw error;
    await depoisDeGravar(id, 'Dados salvos.');
  });
}
function formLm(it) {
  let wbsNovo = '';
  if (it && it.__novo) { wbsNovo = it.wbs; it = null; }
  const ed = !!it;
  let wbsSel = ed ? it.wbs : wbsNovo;
  const nomeW = w => w ? w + (nomeWbs(w) ? ' · ' + nomeWbs(w) : '') : 'Selecione o WBS';
  const necTxt = w => { const n = w && S.wbs[w] && S.wbs[w].nec; return w ? (n ? 'Data de necessidade (WBS): ' + fmtISO(n) : 'WBS sem data de necessidade cadastrada') : ''; };
  abreFolha('<div class="d-tit">' + (ed ? 'Editar LM' : 'Nova LM') + '</div>'
    + '<label class="campo">WBS *<button type="button" class="btn" id="f-wbs" style="width:100%;justify-content:space-between;margin-top:6px;font-weight:500">' + esc(nomeW(wbsSel)) + svg('baixo') + '</button></label><div class="d-sub" id="f-nec">' + esc(necTxt(wbsSel)) + '</div>'
    + '<div class="dupla"><label class="campo">Número da LM<input id="f-numero_lm" value="' + esc(ed ? it.numero_lm || '' : '') + '" placeholder="Ex.: LM-014-ELE"></label>'
    + '<label class="campo">Disciplina *<select id="f-disciplina">' + DISCIPLINAS.map(d => '<option value="' + d.v + '"' + (ed && it.disciplina === d.v ? ' selected' : '') + '>' + d.l + '</option>').join('') + '</select></label></div>'
    + '<label class="campo">Descrição / escopo da LM *<input id="f-descricao_lm" value="' + esc(ed ? it.descricao_lm || '' : '') + '"></label>'
    + '<div class="dupla"><label class="campo">Etapa atual *<select id="f-etapa_atual">' + ETAPAS.map(s => '<option value="' + s.id + '"' + ((ed ? it.etapa_atual : 'engenharia') === s.id ? ' selected' : '') + '>' + s.label + '</option>').join('') + '</select></label>'
    + '<label class="campo">Entrada na etapa *<input type="date" id="f-data_entrada_etapa" value="' + esc(ed ? it.data_entrada_etapa : isoHoje()) + '"></label></div>'
    + '<div class="dupla"><label class="campo">Valor estimado (R$)<input type="number" step="0.01" inputmode="decimal" id="f-valor_estimado" value="' + esc(ed && it.valor_estimado != null ? it.valor_estimado : '') + '"></label>'
    + '<label class="campo">Responsável<input id="f-responsavel" value="' + esc(ed ? it.responsavel || '' : '') + '"></label></div>'
    + '<label class="campo">Observações<textarea id="f-observacoes" rows="3">' + esc(ed ? it.observacoes || '' : '') + '</textarea></label>'
    + (ed ? '<div class="d-sub">Fornecedor, RC, valor aprovado e nº do pedido são preenchidos ao avançar cada etapa.</div>' : '')
    + '<div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-pri" id="f-ok">' + (ed ? 'Salvar' : 'Criar LM') + '</button></div>');
  const guarda = () => ({ numero_lm: $('#f-numero_lm').value, disciplina: $('#f-disciplina').value, descricao_lm: $('#f-descricao_lm').value, etapa_atual: $('#f-etapa_atual').value, data_entrada_etapa: $('#f-data_entrada_etapa').value, valor_estimado: $('#f-valor_estimado').value, responsavel: $('#f-responsavel').value, observacoes: $('#f-observacoes').value });
  const restaura = v => Object.keys(v).forEach(k => { const el = $('#f-' + k); if (el) el.value = v[k]; });
  const liga = () => {
    $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
    $('#f-wbs').onclick = () => { // escolhe o WBS com pesquisa e volta ao formulário preservando o que foi digitado
      const v = guarda();
      const opcoes = Object.keys(S.wbs).sort().map(w => ({ v: w, l: w + (S.wbs[w].desc ? ' · ' + S.wbs[w].desc : '') }));
      seletor('WBS', opcoes, wbsSel ? [wbsSel] : [], vals => { if (vals[0]) wbsSel = vals[0]; formLmReabre(v); }, true);
    };
    $('#f-ok').onclick = () => salvar();
  };
  const formLmReabre = v => { formLm(it ? Object.assign({}, it, { wbs: wbsSel }) : { __novo: true, wbs: wbsSel }); restaura(v); };
  liga();
  async function salvar() {
    const desc = $('#f-descricao_lm').value.trim(), dt = $('#f-data_entrada_etapa').value;
    if (!wbsSel) return aviso('Selecione o WBS.', 'verm');
    if (!desc) return aviso('Informe a descrição da LM.', 'verm');
    if (!dt) return aviso('Informe a data de entrada na etapa.', 'verm');
    const v = $('#f-valor_estimado').value;
    // fornecedor, RC, valor aprovado e pedido NÃO entram aqui (como no site): só no fluxo de avançar
    const row = { wbs: wbsSel, numero_lm: $('#f-numero_lm').value.trim() || null, descricao_lm: desc, disciplina: $('#f-disciplina').value, etapa_atual: $('#f-etapa_atual').value, data_entrada_etapa: dt,
      valor_estimado: v ? parseFloat(v) : null, responsavel: $('#f-responsavel').value.trim() || null, observacoes: $('#f-observacoes').value.trim() || null };
    const chave = it && it.id ? it.id : 'nova';
    await comTrava(chave, async () => {
      $('#f-ok').disabled = true;
      if (it && it.id) row.id = it.id;
      const { data, error } = await supa.from('material_pipeline').upsert(row).select('id').maybeSingle(); if (error) throw error;
      const novoId = (data && data.id) || (it && it.id);
      fechaFolha(); aviso(it && it.id ? 'LM atualizada.' : 'LM criada.', 'verd'); await carregaPipe(); render(true);
      if (novoId && S.pipe.find(x => x.id === novoId)) detalheLm(novoId);
    });
  }
}
function arquivar(it) {
  abreFolha('<div class="d-tit">Arquivar LM?</div><div class="d-sub">' + esc(it.numero_lm || it.wbs) + ' sai da lista ativa do pipeline. O histórico é mantido.</div><div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-pri" id="f-ok">Arquivar</button></div>');
  $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
  $('#f-ok').onclick = () => comTrava(it.id, async () => {
    const { error } = await supa.from('material_pipeline').update({ arquivado: true }).eq('id', it.id); if (error) throw error;
    await depoisDeGravar(it.id, 'LM arquivada.');
  });
}
function excluir(it) {
  abreFolha('<div class="d-tit">Excluir LM?</div><div class="d-sub">"' + esc(it.descricao_lm || it.numero_lm || it.wbs) + '" será apagada do pipeline. Essa ação não pode ser desfeita. Para só tirar da lista, use Arquivar na última etapa.</div><div class="d-acoes"><button class="btn" data-fecha>Cancelar</button><button class="btn btn-perigo" id="f-ok">Excluir definitivamente</button></div>');
  $('#folha-caixa [data-fecha]').onclick = () => fechaFolha();
  $('#f-ok').onclick = () => comTrava(it.id, async () => {
    const { error } = await supa.from('material_pipeline').delete().eq('id', it.id); if (error) throw error;
    await depoisDeGravar(it.id, 'LM excluída.');
  });
}

// ---------- instalação (ícone na tela) ----------
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
window.addEventListener('resize', () => { if (!largo() && document.body.classList.contains('com-detalhe')) { $('#painel-detalhe').hidden = true; document.body.classList.remove('com-detalhe'); } });
inicio();
