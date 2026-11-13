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
  podeCji3: false, podeCapex: false, podeProj: false,
  capex: [], capexPep: {}, squads: {}, cji3: null, cjAberto: {}, matModo: 'itens',
  fCji3: { anos: [], meses: [], projs: [], forns: [], gers: [], sites: [], busca: '' },
  fCap: { squad: [], pep: [], emp: [], soAlerta: false, busca: '' },
  fSaude: null, fUsu: { busca: '' }, usuarios: null,
  fMat: { busca: '', projeto: [], fornecedor: [], squad: [], status: [] },
  fPipe: { busca: '', etapa: null, disciplina: [], projeto: [], risco: [] },
};
function fSaudeVazio() { return { anos: [], pep: [], emp: [], grupo: [], squad: [], lider: [], plan: [], status: [], busca: '' }; }
S.fSaude = fSaudeVazio();
try { S.valores = localStorage.getItem('m.valores') !== '0'; S.aba = localStorage.getItem('m.aba') || 'materiais'; } catch (e) {}

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
const reais = n => S.valores ? (Math.abs(Number(n || 0)) < 0.005 ? 0 : Number(n || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ••••';
function reaisCurto(n) {
  if (!S.valores) return 'R$ ••••';
  n = Number(n || 0);
  if (Math.abs(n) >= 1e9) return 'R$ ' + (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi';
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
  cubo: '<path d="M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>', voltar: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arquivo: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>', sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  tabela: '<path d="M3 5h18v14H3zM3 10h18M3 15h18M9 5v14"/>', predio: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
  pasta: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>', direita: '<path d="M9 6l6 6-6 6"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>',
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
  S.podePipe = false; // o app tem só Materiais, Capex Projetos, CJI3, Saúde do PEP e Usuários (pedido do usuário)
  S.podeCji3 = S.admin || perms.includes('cji3');
  S.podeCapex = S.admin || perms.includes('alertas');
  S.podeProj = S.admin || perms.includes('saude-pep');
  // Modelos 3D: só o dono e quem tiver a permissão "3d" (administrador não ganha automaticamente)
  S.pode3d = String(user.email || '').toLowerCase() === 'tm0133929@gmail.com' || perms.includes('3d');
  $('#tela-login').hidden = true; $('#tela-app').hidden = false;
  if (!S.podeMat && !S.podeCji3 && !S.podeCapex && !S.podeProj) { carregando(false); $('#menu').innerHTML = ''; $('#conteudo').innerHTML = '<div class="vazio">Seu perfil não tem acesso a nenhuma tela do app.<br>Peça a liberação ao administrador do Dashboard.</div>'; return; }
  montaTopo(); montaMenu();
  sincroniza(); // liga o aviso do site antes de carregar, para não perder atualização feita durante a carga
  await carregaTudo();
  carregando(false);
}

// ---------- dados ----------
async function token() { const { data } = await supa.auth.getSession(); return data.session ? data.session.access_token : ''; }
// Versão atual de cada dado no servidor (consulta leve). Serve para o app saber se ficou para trás
// mesmo quando perdeu o aviso em tempo real do site (celular dormindo, sem sinal, app em segundo plano).
async function versaoServidor() {
  try {
    const r = await fetch('/api/sync-versao', { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
async function carregaTudo(forcar) {
  const pv = versaoServidor();
  pv.then(v => { if (v && v.capex) S.verCapex = v.capex; });
  const tarefas = [carregaWbs(), carregaSquads()];
  if (S.podeMat || S.podeProj) tarefas.push(carregaMats(forcar, pv));
  if (S.podeCapex || S.podeProj) tarefas.push(carregaCapex());
  if (S.podeCji3 || S.podeProj) tarefas.push(carregaCji3());
  if (S.admin) tarefas.push(carregaUsuarios());
  if (S.podePipe) tarefas.push(carregaPipe(), carregaCfg());
  // cada parte aparece assim que chega (os materiais demoram mais e não travam o resto)
  await Promise.all(tarefas.map(t => t.then(() => { render(true); carregando(false); })));
  render(true);
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
async function carregaMats(forcar, pv) {
  if (!S.mats.length) { // abre rápido com o que está guardado no aparelho
    const c = await IDB.get('mats');
    if (c && c.items) { S.mats = c.items; S.mats.forEach((r, i) => { r.__i = i; }); S.matMeta = c.meta; S.matDoCache = true; S.matVer = c.ver || null; S.matCacheEm = c.em || 0; render(); }
  }
  if (!navigator.onLine && S.mats.length) return;
  const v = pv ? await pv : await versaoServidor();
  const ver = v && v.mat ? v.mat : null;
  // a cópia do aparelho já é a mesma versão do site: não precisa baixar tudo de novo
  if (!forcar && ver && S.mats.length && S.matVer === ver) { if (S.matDoCache) { S.matDoCache = false; render(true); } return; }
  let erro = null;
  for (let t = 1; t <= 3; t++) { // a lista é grande: no 4G a primeira tentativa às vezes cai
    try {
      const r = await fetch('/api/materiais', { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
      if (r.status === 401) return sair();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const itens = (j.items || []).filter(Boolean);
      if (!itens.length && S.mats.length) throw new Error('resposta vazia'); // nunca troca a lista por uma vazia
      S.mats = itens; S.mats.forEach((r, i) => { r.__i = i; }); S.matMeta = j.meta || null; S.matDoCache = false; S.matVer = ver; S.matCacheEm = Date.now();
      IDB.set('mats', { items: S.mats, meta: S.matMeta, em: S.matCacheEm, ver });
      return;
    } catch (e) { erro = e; if (t < 3) await new Promise(ok => setTimeout(ok, 1500 * t)); }
  }
  console.warn('[materiais]', erro);
  const quando = S.matCacheEm ? ' de ' + new Date(S.matCacheEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  aviso(S.mats.length ? 'Sem conexão com o servidor: mostrando a cópia do aparelho' + quando + '. Toque em atualizar.' : 'Não foi possível carregar os materiais.', 'verm');
}
// Supabase corta em 1000 linhas: pagina com ordem fixa (sem ordem, páginas podem repetir ou pular linhas).
// Se alguma página falhar, devolve null e quem chamou mantém os dados que já tinha.
async function lerTudo(tabela, campos, ordem) {
  const out = []; let i = 0;
  for (;;) {
    const { data, error } = await supa.from(tabela).select(campos || '*').order(ordem).range(i, i + 999);
    if (error || !data) return null;
    out.push(...data); if (data.length < 1000) break; i += 1000;
  }
  return out;
}
async function carregaSquads() {
  const rows = await lerTudo('ref_squads', 'pep,squad,lider,planejador', 'pep'); if (!rows) return;
  const m = {}; rows.forEach(r => { m[r.pep] = { squad: r.squad || '', lider: r.lider || '', planejador: r.planejador || '' }; });
  S.squads = m;
}
async function carregaCapex() {
  const [cpx, cpp] = await Promise.all([lerTudo('capex', '*', 'id'), lerTudo('capex_por_pep', 'pep,valor', 'pep')]);
  if (!cpx || !cpp) { aviso('Não foi possível atualizar o CAPEX' + (S.capex.length ? ' (mostrando a última leitura)' : '') + '.', 'verm'); return; }
  const M = 1e6; // a planilha de CAPEX vem em milhões de reais (o site mostra "R$ 643,58M")
  S.capex = cpx.map(c => ({ pep: c.pep, empresa: c.empresa || '', grupo: c.grupo || 'SEM GRUPO', capex: (+c.capex || 0) * M, contratado: (+c.contratado || 0) * M, pago: (+c.pago || 0) * M, a_contratar: (+c.a_contratar || 0) * M, a_pagar: (+c.a_pagar || 0) * M }));
  const m = {}; cpp.forEach(c => { m[c.pep] = (+c.valor || 0) * M; }); S.capexPep = m;
}
async function carregaCji3() {
  const { data } = await supa.from('cji3_dados').select('payload,atualizado_em').eq('chave', 'main').maybeSingle();
  if (data && data.payload && data.payload.rows) {
    data.payload.rows.forEach((r, i) => { r.__i = i; }); // posição guardada: evita procurar a linha a cada toque
    S.cji3 = data.payload; S.cji3Em = data.atualizado_em;
  }
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
// ---------- sincronia com o site ----------
// O site avisa todo mundo pelo canal 'medido-sync' quando alguém sobe CJI3, CAPEX, materiais ou referências.
// O app escuta o mesmo canal e recarrega só o que mudou. Usuários: escuta a tabela perfis direto.
// Garantia extra: ao voltar para o app depois de 3 min em segundo plano, recarrega tudo.
let _sincT = {}, _ocultoEm = 0;
function depoisDe(chave, fn) { clearTimeout(_sincT[chave]); _sincT[chave] = setTimeout(async () => { await fn(); render(true); }, 800); }
let _sincLigado = false;
function sincroniza() {
  if (_sincLigado) return; _sincLigado = true; // liga uma vez só, mesmo saindo e entrando de novo
  supa.channel('medido-sync')
    .on('broadcast', { event: 'cji3-updated' }, () => { if (S.podeCji3 || S.podeProj) depoisDe('cji3', async () => { await carregaCji3(); aviso('CJI3 atualizada no site.', 'verd'); }); })
    .on('broadcast', { event: 'capex-updated' }, () => { if (S.podeCapex || S.podeProj) depoisDe('capex', async () => { await carregaCapex(); aviso('CAPEX atualizado no site.', 'verd'); }); })
    .on('broadcast', { event: 'mat-updated' }, () => { if (S.podeMat) depoisDe('mat', async () => { await carregaMats(true); aviso('Materiais atualizados no site.', 'verd'); }); })
    .on('broadcast', { event: 'refs-updated' }, () => depoisDe('refs', () => Promise.all([carregaWbs(), carregaSquads()])))
    .subscribe();
  if (S.admin) supa.channel('m-perfis').on('postgres_changes', { event: '*', schema: 'public', table: 'perfis' }, () => depoisDe('usu', async () => {
    const antes = new Set((S.usuarios || []).filter(aguardando).map(u => u.id)); await carregaUsuarios();
    const novos = (S.usuarios || []).filter(u => aguardando(u) && !antes.has(u.id)); if (novos.length) aviso('Novo usuário aguardando liberação: ' + (novos[0].nome || novos[0].email), 'verd');
    montaMenu();
  })).subscribe();
  // Sempre que o app volta para a frente, confere a versão no servidor (o aviso em tempo real
  // se perde com o celular dormindo). Depois de 3 min fora, recarrega também referências e usuários.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { _ocultoEm = Date.now(); return; }
    if (!navigator.onLine) return;
    if (_ocultoEm && Date.now() - _ocultoEm > 180000) carregaTudo(); else confereVersao();
  });
  window.addEventListener('online', () => confereVersao(true));
  window.addEventListener('pageshow', ev => { if (ev.persisted) confereVersao(true); });
  setInterval(() => { if (document.visibilityState === 'visible') confereVersao(); }, 60000);
}
let _confEm = 0, _conferindo = false;
async function confereVersao(agora) {
  if (_conferindo || !S.user || !navigator.onLine || (!agora && Date.now() - _confEm < 15000)) return;
  _conferindo = true; _confEm = Date.now();
  try {
    const v = await versaoServidor(); if (!v) return;
    const t = [];
    if ((S.podeMat || S.podeProj) && v.mat && v.mat !== S.matVer) t.push(carregaMats(true, Promise.resolve(v)).then(() => 'materiais'));
    if ((S.podeCji3 || S.podeProj) && v.cji3 && v.cji3 !== S.cji3Em) t.push(carregaCji3().then(() => 'CJI3'));
    if ((S.podeCapex || S.podeProj) && v.capex) {
      if (S.verCapex && v.capex !== S.verCapex) t.push(carregaCapex().then(() => { S.verCapex = v.capex; return 'CAPEX'; }));
      else S.verCapex = v.capex;
    }
    if (!t.length) return;
    const feitos = await Promise.all(t); render(true);
    aviso('Atualizado com o site: ' + feitos.join(', ') + '.', 'verd');
  } finally { _conferindo = false; }
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
function abasDisponiveis() {
  const a = [];
  if (S.podeMat) a.push(['materiais', 'Materiais', 'caixa']);
  if (S.podeCapex) a.push(['capex', 'Capex', 'predio']);
  if (S.podeCji3) a.push(['cji3', 'CJI3', 'tabela']);
  if (S.podeProj) a.push(['saude', 'Saúde PEP', 'pasta']);
  if (S.admin) a.push(['usuarios', 'Usuários', 'pessoa']);
  if (S.pode3d) a.push(['3d', '3D CPF', 'cubo']); // abre o visor em tela cheia, não é uma tela do app
  return a;
}
function montaMenu() {
  const abas = abasDisponiveis(); if (!abas.some(a => a[0] === S.aba)) S.aba = abas.length ? abas[0][0] : 'materiais';
  const pend = S.admin && S.usuarios ? S.usuarios.filter(aguardando).length : 0;
  $('#menu').innerHTML = abas.map(([id, l, ic]) => '<button data-aba="' + id + '" class="' + (S.aba === id ? 'ativo' : '') + '">' + svg(ic) + l + (id === 'usuarios' && pend ? '<i class="bolinha">' + pend + '</i>' : '') + '</button>').join('');
  $('#menu').onclick = e => { const b = e.target.closest('[data-aba]'); if (!b) return; if (b.dataset.aba === '3d') { window.open('https://cpf-3d.onrender.com/', '_blank', 'noopener'); return; } vaiPara(b.dataset.aba); };
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
  const t = { cji3: ['CJI3 Tabela', 'Execuções mensais (SAP)'], capex: ['Capex Projetos', 'Contratado, pago e desvios'], saude: ['Saúde do PEP', 'Comprometimento do CAPEX por projeto'], usuarios: ['Usuários', 'Liberar acesso e permissões'], materiais: ['Materiais', S.mats.length.toLocaleString('pt-BR') + ' itens' + (S.matDoCache ? ' · cópia do aparelho' : '')] }[S.aba] || ['App SLB', ''];
  $('#topo-titulo').textContent = t[0]; $('#topo-sub').textContent = t[1];
  const c = $('#conteudo');
  const telas = { materiais: telaMateriais, cji3: telaCji3, capex: telaCapex, saude: telaSaude, usuarios: telaUsuarios };
  c.innerHTML = (telas[S.aba] || telaMateriais)();
  ligaTela();
  if (manterRolagem) window.scrollTo(0, y);
  if (S.sel && largo()) S.sel.tipo === 'mat' ? detalheMat(S.sel.id, true) : detalheLm(S.sel.id, true);
}

function telaPainel() {
  let h = '';
  if (S.podeCapex && S.capex.length) {
    const t = totCapex(S.capex), cap = Object.values(S.capexPep).reduce((a, b) => a + b, 0), irr = S.capex.filter(alertaCapex).length;
    h += '<div class="sec">Financeiro</div><div class="kpis">'
      + kpi('CAPEX', reaisCurto(cap), 'aprovado nos PEPs', '', 'c:')
      + kpi('Contratado', reaisCurto(t.cont), cap ? Math.round(t.cont / cap * 100) + '% do CAPEX' : '', 'azul', 'c:')
      + kpi('Pago', reaisCurto(t.pago), t.cont ? Math.round(t.pago / t.cont * 100) + '% do contratado' : '', 'verd', 'c:')
      + kpi('Irregularidades', irr.toLocaleString('pt-BR'), 'pago acima ou sem contrato', irr ? 'verm' : '', 'c:alerta')
      + '</div>';
  }
  if (S.podeCji3 && S.cji3) {
    const ano = String(new Date().getFullYear()), ms = S.cji3.months.filter(m => m.startsWith(ano));
    const tot = S.cji3.rows.reduce((a, r) => a + ms.reduce((b, m) => b + (r.v[m] || 0), 0), 0);
    const ult = ms.filter(m => S.cji3.rows.some(r => r.v[m])).pop();
    const vUlt = ult ? S.cji3.rows.reduce((a, r) => a + (r.v[ult] || 0), 0) : 0;
    h += '<div class="kpis" style="margin-top:10px">' + kpi('CJI3 em ' + ano, reaisCurto(tot), 'realizado no ano', '', 'j:') + kpi(ult ? 'CJI3 ' + mesNome(ult) : 'CJI3 último mês', reaisCurto(vUlt), 'último mês com lançamento', '', 'j:') + '</div>';
  }
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
    + '<div class="chips">' + STATUS_MAT.map(s => { const n = S.mats.filter(r => matPassa(r, 'status') && statusMat(r) === s.k).length, on = f.status.includes(s.k); return '<button class="chip ' + s.c + (on ? ' on' : '') + '" data-st="' + s.k + '">' + s.l + ' <b>' + n.toLocaleString('pt-BR') + '</b></button>'; }).join('') + '</div>'
    + '<div class="seg"><button data-modo="itens" class="' + (S.matModo === 'itens' ? 'on' : '') + '">Itens</button><button data-modo="projeto" class="' + (S.matModo === 'projeto' ? 'on' : '') + '">Por projeto</button><button data-modo="squad" class="' + (S.matModo === 'squad' ? 'on' : '') + '">Por squad</button></div>'
    + '<div class="conta"><span>' + dados.length.toLocaleString('pt-BR') + ' itens · ' + reaisCurto(total) + '</span>' + (ativos ? '<button id="mat-limpa">Limpar filtros</button>' : '') + '</div>';
  if (!dados.length) return h + '<div class="vazio">Nenhum item com esses filtros.</div>';
  if (S.matModo !== 'itens') { // valores agrupados por projeto ou por squad
    const chave = S.matModo === 'projeto' ? projetoMat : (r => r.squad || 'Sem squad'), g = {};
    dados.forEach(r => { const k = chave(r), x = (g[k] = g[k] || { n: 0, v: 0, ab: 0, vab: 0, at: 0, sp: 0 }), st = statusMat(r), v = num(r.valorTotal); x.n++; x.v += v; if (st !== 'entregue') { x.ab++; x.vab += v; } if (st === 'atrasado') x.at++; if (st === 'semPrev') x.sp++; });
    const L = Object.entries(g).sort((a, b) => b[1].v - a[1].v), mx = Math.max(1, ...L.map(e => e[1].v));
    return h + '<div class="lista">' + L.map(([k, x]) => '<button class="item" data-grp="' + esc(k) + '"><div class="item-l1"><div class="item-tit">' + esc(k) + '</div><span class="valor">' + reaisCurto(x.v) + '</span></div>'
      + '<div class="item-sub"><span>' + x.n.toLocaleString('pt-BR') + ' itens</span><span>' + x.ab.toLocaleString('pt-BR') + ' em aberto · ' + reaisCurto(x.vab) + '</span></div>'
      + barra(x.v / mx * 100) + '<div class="item-sub" style="margin-top:8px">' + (x.at ? '<span class="tag t-perigo">' + x.at + ' atrasados</span>' : '') + (x.sp ? '<span class="tag t-cinza">' + x.sp + ' sem previsão</span>' : '') + '</div></button>').join('') + '</div>';
  }
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
  // materiais: situação em chips e agrupamento
  c.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { const k = b.dataset.st, a = S.fMat.status, i = a.indexOf(k); i < 0 ? a.push(k) : a.splice(i, 1); S.limite = 60; render(true); });
  c.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { S.matModo = b.dataset.modo; render(true); });
  c.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { S.fMat[S.matModo === 'projeto' ? 'projeto' : 'squad'] = [S.matModo === 'squad' && b.dataset.grp === 'Sem squad' ? '-' : b.dataset.grp]; S.matModo = 'itens'; S.limite = 60; render(); window.scrollTo(0, 0); });
  // CJI3
  c.querySelectorAll('[data-cj]').forEach(b => b.onclick = () => { const k = b.dataset.cj; S.cjAberto[k] = !S.cjAberto[k]; render(true); });
  c.querySelectorAll('[data-cjf]').forEach(b => b.onclick = () => detalheCji3(+b.dataset.cjf));
  // CAPEX e projetos
  c.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => detalheCapex(b.dataset.cap));
  // Saúde do PEP e Usuários
  c.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => detalheSaude(b.dataset.sp));
  c.querySelectorAll('[data-sps]').forEach(b => b.onclick = () => { const k = b.dataset.sps, a = S.fSaude.status, i = a.indexOf(k); i < 0 ? a.push(k) : a.splice(i, 1); render(true); });
  c.querySelectorAll('[data-usu]').forEach(b => b.onclick = () => detalheUsuario(b.dataset.usu));
  const ca = () => { S.fCap.soAlerta = !S.fCap.soAlerta; render(); }; if ($('#cap-alerta')) $('#cap-alerta').onclick = ca; if ($('#cap-alerta2')) $('#cap-alerta2').onclick = ca;
  const limpa = { 'cj-limpa': () => { S.fCji3 = { anos: [], meses: [], projs: [], forns: [], gers: [], sites: [], busca: '' }; }, 'cap-limpa': () => { S.fCap = { squad: [], pep: [], emp: [], soAlerta: false, busca: '' }; }, 'sp-limpa': () => { S.fSaude = fSaudeVazio(); } };
  Object.keys(limpa).forEach(id => { const b = $('#' + id); if (b) b.onclick = () => { limpa[id](); render(); }; });
  [['cj-q', v => { S.fCji3.busca = v; }], ['cap-q', v => { S.fCap.busca = v; }], ['sp-q', v => { S.fSaude.busca = v; }], ['usu-q', v => { S.fUsu.busca = v; }]].forEach(([id, set]) => {
    const q = $('#' + id); if (!q) return; let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { set(q.value.trim()); render(true); const n = $('#' + id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
  });
}
function irPara(alvo) {
  const [tipo, v] = alvo.split(/:(.*)/s);
  if (tipo === 'c') { S.fCap = { squad: [], pep: [], emp: [], soAlerta: v === 'alerta', busca: '' }; return vaiPara(S.podeCapex ? 'capex' : 'painel'); }
  if (tipo === 'j') return vaiPara(S.podeCji3 ? 'cji3' : 'painel');
  if (tipo === 'm' || tipo === 'mp') { S.fMat = { busca: '', projeto: tipo === 'mp' ? [v] : [], fornecedor: [], squad: [], status: tipo === 'm' && v ? (v === 'aberto' ? ['atrasado', 'semana', 'prazo', 'semPrev', 'semPedido'] : [v]) : [] }; vaiPara('materiais'); }
  else if (tipo === 'p' || tipo === 'pe') { S.fPipe = { busca: '', etapa: tipo === 'pe' ? v : null, disciplina: [], projeto: [], risco: tipo === 'p' && v ? [v] : [] }; vaiPara('pipeline'); }
}
function abreFiltro(campo) {
  if (S.aba === 'cji3') {
    const d = S.cji3, ms = cjMeses();
    let ops;
    if (campo === 'anos') ops = [...new Set(d.months.map(m => m.split('-')[0]))].sort().map(v => ({ v, l: v }));
    else if (campo === 'meses') ops = MESES_ORD.filter(m => d.months.some(k => k.split('-')[1] === m)).map(v => ({ v, l: v.charAt(0) + v.slice(1).toLowerCase() }));
    else { const k = { projs: 'proj', forns: 'forn', gers: 'ger', sites: 'site' }[campo]; ops = contaOpcoes(d.rows.filter(r => cjPassa(r, ms, campo)), r => r[k] || '-').map(([v, n]) => ({ v, l: v + (campo === 'projs' ? ' · ' + ((d.rows.find(r => r.proj === v) || {}).pname || '') : ''), n })); }
    const tit = { anos: 'Ano', meses: 'Mês', projs: 'Projeto', forns: 'Fornecedor', gers: 'Gerência', sites: 'Site' }[campo];
    return seletor(tit, ops, S.fCji3[campo], vals => { fechaFolha(); S.fCji3[campo] = vals; render(); });
  }
  if (S.aba === 'capex') {
    const base = S.capex.filter(r => r.pep && capPassa(r, campo));
    const ops = { squad: () => contaOpcoes(base, r => infoPep(r.pep).squad || '-'), pep: () => contaOpcoes(base, r => r.pep), emp: () => contaOpcoes(base, r => r.empresa || '-') }[campo]().map(([v, n]) => ({ v, l: v + (campo === 'pep' && nomePep(v) ? ' · ' + nomePep(v) : ''), n }));
    return seletor({ squad: 'Squad', pep: 'PEP', emp: 'Empresa' }[campo], ops, S.fCap[campo], vals => { fechaFolha(); S.fCap[campo] = vals; render(); });
  }
  if (S.aba === 'saude') {
    let ops;
    if (campo === 'anos') ops = S.cji3 ? [...new Set(S.cji3.months.map(m => m.split('-')[0]))].sort().map(v => ({ v, l: v })) : [];
    else if (campo === 'grupo') ops = SP_GRUPOS.map(v => ({ v, l: v }));
    else if (campo === 'emp') ops = contaOpcoes(S.capex.filter(r => r.pep && saudePassa(r.pep, 'emp')), r => r.empresa || '-').map(([v, n]) => ({ v, l: v, n }));
    else { const base = universoPeps().filter(p => saudePassa(p, campo)), k = { squad: 'squad', lider: 'lider', plan: 'planejador' }[campo];
      ops = campo === 'pep' ? base.map(p => ({ v: p, l: p + (nomePep(p) ? ' · ' + nomePep(p) : '') })) : contaOpcoes(base, p => infoPep(p)[k] || '-').map(([v, n]) => ({ v, l: v, n })); }
    const tit = { anos: 'Ano (medido CJI3)', pep: 'PEP', emp: 'Empresa', grupo: 'Grupo', squad: 'Squad', lider: 'Líder', plan: 'Planejador' }[campo];
    return seletor(tit, ops, S.fSaude[campo], vals => { fechaFolha(); S.fSaude[campo] = vals; render(); });
  }
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

// ---------- financeiro: utilidades ----------
const MESES_ORD = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const mesNome = m => { const [a, mo] = String(m).split('-'); return mo ? mo.charAt(0) + mo.slice(1).toLowerCase() + '/' + a.slice(2) : m; };
const infoPep = p => S.squads[p] || S.squads[String(p || '').split('.')[0]] || { squad: '', lider: '', planejador: '' };
const nomePep = p => (S.wbs[p] && S.wbs[p].desc) || '';
// mesma regra do site, que trabalha em milhões com tolerância de 0,001 (= R$ 1.000)
const alertaCapex = r => ((!r.contratado) && r.pago > 1000) || r.a_pagar < -1000;
const motivoCapex = r => (!r.contratado && r.pago > 1000) ? 'Sem contrato com pagamento' : (r.a_pagar < -1000 ? 'Pago acima do contratado' : '');
function totCapex(rows) { const t = { cont: 0, pago: 0, acont: 0, apagar: 0 }; rows.forEach(r => { t.cont += r.contratado; t.pago += r.pago; t.acont += r.a_contratar; t.apagar += r.a_pagar; }); return t; }
function farol(cont, cap) { // igual ao site: contratado / CAPEX
  if (!cap || cap <= 0) return '<span class="tag t-cinza">Sem CAPEX</span>';
  const p = cont / cap * 100, c = p >= 100 ? 't-perigo' : (p >= 80 ? 't-warn' : 't-ok');
  return '<span class="tag ' + c + '">' + Math.round(p) + '% contratado</span>';
}
const barra = (pct, cor) => '<i class="mbar"><u style="width:' + Math.max(0, Math.min(100, pct)) + '%' + (cor ? ';background:' + cor : '') + '"></u></i>';

// ---------- CJI3 (mesma lógica do site: Projeto > WBS > Fornecedor, por mês) ----------
function cjMeses() {
  const f = S.fCji3, d = S.cji3; let ms = f.anos.length ? d.months.filter(m => f.anos.includes(m.split('-')[0])) : d.months.slice();
  if (f.meses.length) ms = ms.filter(m => f.meses.includes(m.split('-')[1]));
  return ms;
}
function cjPassa(r, ms, pular) {
  const f = S.fCji3;
  // vazio vira '-', igual às opções do filtro
  if (pular !== 'gers' && f.gers.length && !f.gers.includes(r.ger || '-')) return false;
  if (pular !== 'sites' && f.sites.length && !f.sites.includes(r.site || '-')) return false;
  if (pular !== 'projs' && f.projs.length && !f.projs.includes(r.proj || '-')) return false;
  if (pular !== 'forns' && f.forns.length && !f.forns.includes(r.forn || '-')) return false;
  if (f.busca) { const q = norm(f.busca), a = norm([r.proj, r.pname, r.wbs, r.wname, r.forn].join(' ')); if (!q.split(/\s+/).every(p => a.includes(p))) return false; }
  return ms.some(m => (r.v[m] || 0) !== 0);
}
const somaR = (r, ms) => ms.reduce((a, m) => a + (r.v[m] || 0), 0);
function telaCji3() {
  if (!S.cji3) return '<div class="vazio">Carregando a CJI3...</div>';
  const f = S.fCji3, ms = cjMeses(), rows = S.cji3.rows.filter(r => cjPassa(r, ms));
  const tot = rows.reduce((a, r) => a + somaR(r, ms), 0), nf = f.anos.length + f.meses.length + f.projs.length + f.forns.length + f.gers.length + f.sites.length + (f.busca ? 1 : 0);
  const porMes = ms.map(m => rows.reduce((a, r) => a + (r.v[m] || 0), 0)), maxM = Math.max(1, ...porMes.map(Math.abs));
  let h = '<div class="busca">' + svg('busca') + '<input id="cj-q" type="search" placeholder="Projeto, WBS ou fornecedor" value="' + esc(f.busca) + '"></div>'
    + '<div class="filtros">' + fbtn('anos', 'Ano', f.anos.length) + fbtn('meses', 'Mês', f.meses.length) + fbtn('projs', 'Projeto', f.projs.length) + fbtn('forns', 'Fornecedor', f.forns.length) + fbtn('gers', 'Gerência', f.gers.length) + fbtn('sites', 'Site', f.sites.length) + '</div>'
    + '<div class="conta"><span>' + ms.length + ' meses · ' + rows.length.toLocaleString('pt-BR') + ' linhas</span>' + (nf ? '<button id="cj-limpa">Limpar filtros</button>' : '') + '</div>'
    + '<div class="resumo"><small>Realizado no período</small><b>' + reais(tot) + '</b>'
    + '<div class="colunas">' + ms.slice(-12).map((m, i) => { const v = porMes[ms.length - Math.min(12, ms.length) + i]; return '<div title="' + esc(mesNome(m)) + '"><i style="height:' + Math.max(2, Math.abs(v) / maxM * 100) + '%"></i><span>' + m.split('-')[1].charAt(0) + '</span></div>'; }).join('') + '</div></div>';
  const pm = {}; rows.forEach(r => { (pm[r.proj] = pm[r.proj] || { nome: r.pname, w: {} }); (pm[r.proj].w[r.wbs] = pm[r.proj].w[r.wbs] || { nome: r.wname, r: [] }).r.push(r); });
  const projs = Object.keys(pm).map(p => ({ p, t: Object.values(pm[p].w).reduce((a, w) => a + w.r.reduce((b, r) => b + somaR(r, ms), 0), 0) })).sort((a, b) => b.t - a.t);
  if (!projs.length) return h + '<div class="vazio">Nenhum lançamento com esses filtros.</div>';
  h += '<div class="sec">Por projeto<span>toque para abrir</span></div><div class="arvore">';
  projs.forEach(({ p, t }) => {
    const ab = S.cjAberto['p:' + p];
    h += '<button class="no n1" data-cj="p:' + esc(p) + '">' + svg(ab ? 'baixo' : 'direita') + '<span><b class="mono">' + esc(p) + '</b> ' + esc(pm[p].nome || '') + '</span><em>' + reaisCurto(t) + '</em></button>';
    if (!ab) return;
    Object.keys(pm[p].w).sort().forEach(w => {
      const wd = pm[p].w[w], wt = wd.r.reduce((a, r) => a + somaR(r, ms), 0), ab2 = S.cjAberto['w:' + p + '|' + w];
      h += '<button class="no n2" data-cj="w:' + esc(p + '|' + w) + '">' + svg(ab2 ? 'baixo' : 'direita') + '<span><b class="mono">' + esc(w) + '</b> ' + esc(wd.nome || '') + '</span><em>' + reaisCurto(wt) + '</em></button>';
      if (ab2) wd.r.slice().sort((a, b) => somaR(b, ms) - somaR(a, ms)).forEach(r => { h += '<button class="no n3" data-cjf="' + r.__i + '"><span>' + esc(r.forn || 'Sem fornecedor') + '</span><em>' + reaisCurto(somaR(r, ms)) + '</em></button>'; });
    });
  });
  return h + '</div>';
}
function detalheCji3(i) {
  const r = S.cji3.rows[i], ms = cjMeses(), com = ms.filter(m => r.v[m]);
  mostraDetalhe('<div class="d-tit">' + esc(r.forn || 'Sem fornecedor') + '</div><div class="d-sub mono">' + esc(r.proj + ' · ' + r.wbs) + '</div><div class="d-sub">' + esc(r.wname || r.pname || '') + '</div>'
    + '<div class="d-grade"><div><small>Total no período</small><span>' + reais(somaR(r, ms)) + '</span></div><div><small>Meses com lançamento</small><span>' + com.length + '</span></div>' + (r.ger ? '<div><small>Gerência</small><span>' + esc(r.ger) + '</span></div>' : '') + (r.site ? '<div><small>Site</small><span>' + esc(r.site) + '</span></div>' : '') + '</div>'
    + '<div class="sec" style="margin-top:4px">Mês a mês</div><div class="lista-l">' + (com.length ? com.map(m => '<div><span>' + mesNome(m) + '</span><b' + (r.v[m] < 0 ? ' style="color:var(--danger)"' : '') + '>' + reais(r.v[m]) + '</b></div>').join('') : '<div><span>Sem lançamentos no período</span></div>') + '</div>');
}

// ---------- CAPEX (mesma lógica do site: PEP > grupo > empresa, farol = contratado / CAPEX) ----------
function capPassa(r, pular) {
  const f = S.fCap, i = infoPep(r.pep);
  if (pular !== 'pep' && f.pep.length && !f.pep.includes(r.pep)) return false;
  if (pular !== 'emp' && f.emp.length && !f.emp.includes(r.empresa || '-')) return false;
  if (pular !== 'squad' && f.squad.length && !f.squad.includes(i.squad || '-')) return false;
  if (f.soAlerta && !alertaCapex(r)) return false;
  if (f.busca) { const q = norm(f.busca), a = norm([r.pep, nomePep(r.pep), r.empresa, r.grupo].join(' ')); if (!q.split(/\s+/).every(p => a.includes(p))) return false; }
  return true;
}
function telaCapex() {
  if (!S.capex.length) return '<div class="vazio">Carregando o CAPEX...</div>';
  const f = S.fCap, rows = S.capex.filter(r => r.pep && capPassa(r));
  const peps = {}; rows.forEach(r => { (peps[r.pep] = peps[r.pep] || []).push(r); });
  const cap = Object.keys(peps).reduce((a, p) => a + (S.capexPep[p] || 0), 0), t = totCapex(rows), irr = rows.filter(alertaCapex).length;
  const custo = t.cont + t.acont, desv = cap ? custo - cap : 0, nf = f.pep.length + f.emp.length + f.squad.length + (f.busca ? 1 : 0) + (f.soAlerta ? 1 : 0);
  let h = '<div class="busca">' + svg('busca') + '<input id="cap-q" type="search" placeholder="PEP, projeto, empresa ou grupo" value="' + esc(f.busca) + '"></div>'
    + '<div class="filtros"><button class="fbtn' + (f.soAlerta ? ' on' : '') + '" id="cap-alerta">' + svg('alerta') + 'Só irregularidades (' + S.capex.filter(alertaCapex).length + ')</button>' + fbtn('squad', 'Squad', f.squad.length) + fbtn('pep', 'PEP', f.pep.length) + fbtn('emp', 'Empresa', f.emp.length) + '</div>'
    + '<div class="conta"><span>' + Object.keys(peps).length + ' PEPs · ' + rows.length + ' linhas</span>' + (nf ? '<button id="cap-limpa">Limpar filtros</button>' : '') + '</div>'
    + '<div class="kpis">' + kpi('CAPEX', reaisCurto(cap), 'aprovado', '', 'c:') + kpi('Contratado', reaisCurto(t.cont), cap ? Math.round(t.cont / cap * 100) + '% do CAPEX' : '', 'azul', 'c:')
    + kpi('Pago', reaisCurto(t.pago), t.cont ? Math.round(t.pago / t.cont * 100) + '% do contratado' : '', 'verd', 'c:') + kpi('A pagar', reaisCurto(t.apagar), 'saldo dos contratos', '', 'c:')
    + kpi('A contratar', reaisCurto(t.acont), 'ainda sem contrato', '', 'c:') + kpi('Desvio', (desv > 0 ? '+' : '') + reaisCurto(desv), cap ? (desv / cap * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% (custo - CAPEX)' : 'sem CAPEX', desv > 0 ? 'verm' : 'verd', 'c:')
    + '</div>';
  if (irr && !f.soAlerta) h += '<button class="faixa-alerta" id="cap-alerta2">' + svg('alerta') + '<span><b>' + irr + ' irregularidades</b> pago acima do contratado ou pagamento sem contrato</span>' + svg('direita') + '</button>';
  const lista = Object.keys(peps).map(p => { const tt = totCapex(peps[p]); return { p, tt, cap: S.capexPep[p] || 0, irr: peps[p].filter(alertaCapex).length }; }).sort((a, b) => b.irr - a.irr || b.cap - a.cap);
  h += '<div class="sec">Por PEP<span>toque para ver grupos e empresas</span></div><div class="lista">' + lista.map(x => '<button class="item" data-cap="' + esc(x.p) + '"><div class="item-l1"><div class="item-tit">' + esc(nomePep(x.p) || x.p) + '</div>' + farol(x.tt.cont, x.cap) + '</div>'
    + '<div class="item-sub"><span class="mono">' + esc(x.p) + '</span>' + (infoPep(x.p).squad ? '<span>' + esc(infoPep(x.p).squad) + '</span>' : '') + (x.irr ? '<span style="color:var(--danger);font-weight:700">' + x.irr + ' irregulares</span>' : '') + '</div>'
    + '<div class="vals"><div><small>CAPEX</small><b>' + reaisCurto(x.cap) + '</b></div><div><small>Contratado</small><b>' + reaisCurto(x.tt.cont) + '</b></div><div><small>Pago</small><b>' + reaisCurto(x.tt.pago) + '</b></div></div>'
    + barra(x.cap ? x.tt.cont / x.cap * 100 : 0, x.cap && x.tt.cont >= x.cap ? 'var(--danger)' : '') + '</button>').join('') + '</div>';
  return h;
}
function detalheCapex(pep) {
  const rows = S.capex.filter(r => r.pep === pep && capPassa(r, 'pep')), cap = S.capexPep[pep] || 0, t = totCapex(rows), custo = t.cont + t.acont, i = infoPep(pep);
  const grupos = {}; rows.forEach(r => { (grupos[r.grupo] = grupos[r.grupo] || []).push(r); });
  let h = '<div class="d-tit">' + esc(nomePep(pep) || pep) + '</div><div class="d-sub"><span class="mono">' + esc(pep) + '</span>' + (i.squad ? ' · ' + esc(i.squad) : '') + (i.lider ? ' · ' + esc(i.lider) : '') + '</div>' + farol(t.cont, cap)
    + '<div class="d-grade"><div><small>CAPEX</small><span>' + reais(cap) + '</span></div><div><small>Contratado</small><span>' + reais(t.cont) + '</span></div><div><small>Pago</small><span>' + reais(t.pago) + '</span></div><div><small>A pagar</small><span>' + reais(t.apagar) + '</span></div>'
    + '<div><small>A contratar</small><span>' + reais(t.acont) + '</span></div><div><small>Custo previsto</small><span>' + reais(custo) + '</span></div><div class="lg"><small>Desvio (custo - CAPEX)</small><span' + (cap && custo > cap ? ' style="color:var(--danger)"' : '') + '>' + (cap ? reais(custo - cap) + ' (' + ((custo - cap) / cap * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%)' : '-') + '</span></div></div>';
  Object.keys(grupos).forEach(g => {
    const gt = totCapex(grupos[g]);
    h += '<div class="sec" style="margin-top:8px">' + esc(g) + '<span>' + reaisCurto(gt.cont) + ' contratado</span></div><div class="lista-l">' + grupos[g].map(r => '<div class="emp' + (alertaCapex(r) ? ' irr' : '') + '"><span><b>' + esc(r.empresa || '-') + '</b>' + (alertaCapex(r) ? '<em class="tag t-perigo">' + motivoCapex(r) + '</em>' : '') + '<small>Contratado ' + reais(r.contratado) + ' · Pago ' + reais(r.pago) + '</small></span><b>' + reais(r.a_pagar) + '<small>a pagar</small></b></div>').join('') + '</div>';
  });
  mostraDetalhe(h);
}

// ---------- Saúde do PEP (mesmas regras da aba do site: renderSaudePep) ----------
// Farol = contratado / CAPEX: Normal < 80%, Atenção 80% a 99%, Crítico >= 100%.
// Medido (FP&N CJI3) vem da própria CJI3, como no site.
const SP_GRUPOS = ['ENGENHARIA', 'FORNECIMENTO', 'MONTAGEM ELETROMECÂNICA', 'OBRAS CIVIS'];
const SP_STATUS = [{ k: 'normal', l: 'Normal', c: 't-ok' }, { k: 'atencao', l: 'Atenção', c: 't-warn' }, { k: 'critico', l: 'Crítico', c: 't-perigo' }];
const RUIDO_EMP = new Set(['LTDA', 'LTD', 'SA', 'S', 'A', 'ME', 'EPP', 'EIRELI', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'CIA', 'COMERCIO', 'SERVICOS', 'ENGENHARIA', 'INDUSTRIA', 'BRASIL']);
const normEmp = e => String(e || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.,\-\/&]/g, ' ').replace(/\s+/g, ' ').trim();
function empMatch(a, b) { // tolera nome truncado do SAP, pontuação e siglas
  const x = normEmp(a), y = normEmp(b); if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const px = x.split(' ').filter(w => w.length >= 4 && !RUIDO_EMP.has(w)), py = new Set(y.split(' ').filter(w => w.length >= 4 && !RUIDO_EMP.has(w)));
  return px.some(w => py.has(w));
}
const raizCji3 = r => String(r.proj || r.wbs || '').split('.')[0];
function cjAnos() { const f = S.fSaude; return f.anos.length ? S.cji3.months.filter(m => f.anos.includes(m.split('-')[0])) : S.cji3.months; }
function universoPeps() { const s = new Set(Object.keys(S.capexPep)); S.capex.forEach(r => { if (r.pep) s.add(r.pep); }); return [...s].sort(); }
function linhasPep(pep) { const f = S.fSaude; return S.capex.filter(r => r.pep === pep && (!f.emp.length || f.emp.some(e => empMatch(r.empresa, e))) && (!f.grupo.length || f.grupo.some(g => norm(r.grupo).includes(norm(g))))); }
function saudePep(pep, comMedido) { // medido só no detalhe (na lista não aparece e pesa)
  const L = linhasPep(pep), soma = k => L.reduce((a, r) => a + (r[k] || 0), 0);
  const cap = S.capexPep[pep] || soma('capex'), cont = soma('contratado'), pago = soma('pago'), acont = soma('a_contratar');
  const pct = cap > 0 ? Math.min(cont / cap * 100, 100) : 0, st = pct >= 100 ? 'critico' : (pct >= 80 ? 'atencao' : 'normal');
  let med = 0, cj = [];
  if (S.cji3 && comMedido) { const ms = cjAnos(), raiz = pep.split('.')[0]; cj = S.cji3.rows.filter(r => raizCji3(r) === raiz); med = cj.reduce((a, r) => a + somaR(r, ms), 0); }
  return { pep, L, cap, cont, pago, acont, saldo: cont - pago, pct, st, med, cj, sobre: L.filter(r => r.contratado > 0 && r.a_contratar < 0).length };
}
function saudePassa(pep, pular) {
  const f = S.fSaude, i = infoPep(pep);
  if (pular !== 'pep' && f.pep.length && !f.pep.includes(pep)) return false;
  if (pular !== 'squad' && f.squad.length && !f.squad.includes(i.squad || '-')) return false;
  if (pular !== 'lider' && f.lider.length && !f.lider.includes(i.lider || '-')) return false;
  if (pular !== 'plan' && f.plan.length && !f.plan.includes(i.planejador || '-')) return false;
  if (pular !== 'emp' && f.emp.length && !S.capex.some(r => r.pep === pep && f.emp.some(e => empMatch(r.empresa, e)))) return false;
  if (f.busca && !norm(pep + ' ' + nomePep(pep) + ' ' + i.squad + ' ' + i.lider + ' ' + i.planejador).includes(norm(f.busca))) return false;
  return true;
}
function telaSaude() {
  if (!S.capex.length) return '<div class="vazio">Carregando o CAPEX...</div>';
  const f = S.fSaude, peps = universoPeps().filter(p => saudePassa(p)).map(saudePep);
  const cont = k => peps.filter(x => x.st === k).length, L = peps.filter(x => !f.status.length || f.status.includes(x.st));
  const nf = f.anos.length + f.pep.length + f.emp.length + f.grupo.length + f.squad.length + f.lider.length + f.plan.length + f.status.length + (f.busca ? 1 : 0);
  let h = '<div class="busca">' + svg('busca') + '<input id="sp-q" type="search" placeholder="PEP, projeto, squad, líder ou planejador" value="' + esc(f.busca) + '"></div>'
    + '<div class="chips">' + SP_STATUS.map(s => '<button class="chip ' + s.c + (f.status.includes(s.k) ? ' on' : '') + '" data-sps="' + s.k + '">' + s.l + ' <b>' + cont(s.k) + '</b></button>').join('') + '</div>'
    + '<div class="filtros">' + fbtn('anos', 'Ano', f.anos.length) + fbtn('pep', 'PEP', f.pep.length) + fbtn('emp', 'Empresa', f.emp.length) + fbtn('grupo', 'Grupo', f.grupo.length) + fbtn('squad', 'Squad', f.squad.length) + fbtn('lider', 'Líder', f.lider.length) + fbtn('plan', 'Planejador', f.plan.length) + '</div>'
    + '<div class="conta"><span>' + L.length + ' projetos encontrados</span>' + (nf ? '<button id="sp-limpa">Limpar filtros</button>' : '') + '</div>';
  if (!L.length) return h + '<div class="vazio">Nenhum projeto com esses filtros.</div>';
  const cor = { normal: 'var(--ok)', atencao: '#f59e0b', critico: 'var(--danger)' }, cls = { normal: 't-ok', atencao: 't-warn', critico: 't-perigo' };
  h += '<div class="lista">' + L.map(x => { const i = infoPep(x.pep); return '<button class="item" data-sp="' + esc(x.pep) + '"><div class="item-l1"><div class="item-tit">' + esc(nomePep(x.pep) || x.pep) + '</div><span class="tag ' + cls[x.st] + '">' + Math.round(x.pct) + '%</span></div>'
    + '<div class="item-sub"><span class="mono">' + esc(x.pep) + '</span>' + (i.squad ? '<span>' + esc(i.squad) + '</span>' : '') + (i.planejador ? '<span>' + esc(i.planejador) + '</span>' : '') + '</div>'
    + '<div class="vals"><div><small>CAPEX</small><b>' + reaisCurto(x.cap) + '</b></div><div><small>Contratado</small><b>' + reaisCurto(x.cont) + '</b></div><div><small>Saldo (Cont-Pago)</small><b' + (x.saldo < 0 ? ' style="color:var(--danger)"' : '') + '>' + reaisCurto(x.saldo) + '</b></div></div>'
    + barra(x.pct, cor[x.st]) + (x.sobre ? '<div class="item-sub" style="margin-top:8px"><span class="tag t-warn">' + x.sobre + ' sobrecontratada' + (x.sobre > 1 ? 's' : '') + '</span></div>' : '') + '</button>'; }).join('') + '</div>';
  return h;
}
function detalheSaude(pep) {
  const x = saudePep(pep, true), i = infoPep(pep), cls = { normal: 't-ok', atencao: 't-warn', critico: 't-perigo' }, nome = { normal: 'Normal', atencao: 'Atenção', critico: 'Crítico' };
  const ms = S.cji3 ? cjAnos() : [], medEmp = emp => x.cj.filter(r => r.forn && r.forn !== '_' && empMatch(r.forn, emp)).reduce((a, r) => a + somaR(r, ms), 0);
  const vis = x.L.filter(r => r.contratado > 0 || r.pago > 0), realoc = x.L.filter(r => r.contratado <= 0 && r.pago <= 0 && r.a_contratar < 0);
  let h = '<div class="d-tit">' + esc(nomePep(pep) || pep) + '</div><div class="d-sub"><span class="mono">' + esc(pep) + '</span>' + (i.squad ? ' · ' + esc(i.squad) : '') + (i.planejador ? ' · ' + esc(i.planejador) : '') + '</div>'
    + '<span class="tag ' + cls[x.st] + '">' + nome[x.st] + ' · ' + x.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% comprometido</span>'
    + '<div class="d-grade"><div><small>CAPEX total</small><span>' + reais(x.cap) + '</span></div><div><small>Contratado</small><span>' + reais(x.cont) + '</span></div>'
    + '<div><small>Pago acumulado</small><span>' + reais(x.pago) + '</span></div><div><small>A contratar</small><span>' + reais(x.acont) + '</span></div>'
    + '<div><small>Med. FP&N CJI3</small><span>' + reais(x.med) + '</span></div><div><small>Saldo (Cont-Pago)</small><span' + (x.saldo < 0 ? ' style="color:var(--danger)"' : '') + '>' + reais(x.saldo) + '</span></div></div>';
  h += '<div class="sec" style="margin-top:4px">Empresas<span>' + vis.length + '</span></div><div class="lista-l">' + (vis.length ? vis.map(r => {
    const sobre = r.contratado > 0 && r.a_contratar < 0, sd = r.contratado - r.pago;
    return '<div class="emp' + (sobre ? ' sobre' : (sd < 0 ? ' irr' : '')) + '"><span><b>' + esc(r.empresa || '-') + '</b><small>' + esc(r.grupo) + '</small>' + (sobre ? '<em class="tag t-warn">Sobrecontratado</em>' : '')
      + '<small>Contratado ' + reais(r.contratado) + ' · Pago ' + reais(r.pago) + '</small><small>A pagar ' + reais(r.a_pagar) + ' · ' + (sobre ? 'Excesso s/ CAPEX ' + reais(Math.abs(r.a_contratar)) : 'A contratar ' + reais(r.a_contratar)) + '</small>'
      + '<small>Medido CJI3 ' + reais(medEmp(r.empresa)) + '</small></span><b' + (sd < 0 ? ' style="color:var(--danger)"' : '') + '>' + reaisCurto(sd) + '<small>saldo</small></b></div>';
  }).join('') : '<div><span>Nenhuma empresa com contrato ou pagamento</span></div>') + '</div>';
  if (realoc.length) h += '<div class="sec" style="margin-top:8px">Realocações de verba</div><div class="lista-l">' + realoc.map(r => '<div><span><b>' + esc(r.empresa || '-') + '</b><small>' + esc(r.grupo) + '</small></span><b>' + reais(Math.abs(r.a_contratar)) + '</b></div>').join('') + '</div>';
  mostraDetalhe(h);
}

// ---------- Usuários (só administrador; mesmas gravações da aba Usuários do site) ----------
const PERMS = [['overview', 'Visão Geral'], ['resumo', 'Resumo Sub PEP'], ['dotacoes', 'Dotações'], ['alertas', 'Capex Projetos'], ['nova', 'Nova Dotação'], ['regularizar', 'Regularizar Saldo'],
  ['analytics', 'Dashboard'], ['saude-pep', 'Saúde do PEP'], ['materiais', 'Materiais'], ['fpa', 'FP&A'], ['improdutividade', 'Produtividade'], ['indice-produtividade', 'Índice de Produtividade'],
  ['velocidade', 'Telemetria'], ['cji3', 'CJI3 Tabela'], ['histograma', 'Histograma CTT'], ['milplan', 'SS Milplan'], ['pipe', 'Pipeline de Materiais'], ['rac', 'Interdições RAC'], ['3d', 'Modelos 3D']];
const ROLES = [['admin', 'Administrador'], ['lider', 'Líder'], ['planejador', 'Planejador']];
const SQUADS = ['USINAS I E II', 'BRT+FILTRAGEM', 'GEOTECNIA', 'MINA', 'SLB III', 'CPF', 'BARRAGEM E DIQUES', 'PAULO FONTELES', 'IGARAPÉ BAHIA'];
// sem estado "pendente" no banco: quem se cadastra entra só com Visão Geral, até o administrador liberar as abas
const aguardando = u => u.ativo !== false && u.role !== 'admin' && (u.permissoes || []).filter(p => p !== 'overview').length === 0;
async function carregaUsuarios() {
  const { data, error } = await supa.from('perfis').select('*').order('criado_em', { ascending: false });
  if (!error && data) S.usuarios = data;
}
function telaUsuarios() {
  if (!S.usuarios) return '<div class="vazio">Carregando usuários...</div>';
  const q = norm(S.fUsu.busca), U = S.usuarios.filter(u => !q || norm((u.nome || '') + ' ' + (u.email || '') + ' ' + (u.squad || '')).includes(q));
  const grupos = [['Aguardando liberação', U.filter(aguardando)], ['Ativos', U.filter(u => u.ativo !== false && !aguardando(u))], ['Desativados', U.filter(u => u.ativo === false)]];
  const rotRole = r => (ROLES.find(x => x[0] === r) || [r, r || '-'])[1];
  let h = '<div class="busca">' + svg('busca') + '<input id="usu-q" type="search" placeholder="Nome, e-mail ou squad" value="' + esc(S.fUsu.busca) + '"></div>';
  grupos.forEach(([tit, L]) => {
    if (!L.length && tit !== 'Aguardando liberação') return;
    h += '<div class="sec">' + tit + '<span>' + L.length + '</span></div>';
    if (!L.length) { h += '<div class="vazio" style="padding:14px">Ninguém aguardando.</div>'; return; }
    h += '<div class="lista">' + L.map(u => { const eu = S.user && u.id === S.user.id, np = (u.permissoes || []).length;
      return '<button class="item" data-usu="' + esc(u.id) + '"><div class="item-l1"><div class="item-tit">' + esc(u.nome || 'Sem nome') + (eu ? ' (você)' : '') + '</div>' + (aguardando(u) ? '<span class="tag t-warn">Liberar</span>' : (u.ativo === false ? '<span class="tag t-cinza">Desativado</span>' : '<span class="tag t-ok">Ativo</span>')) + '</div>'
        + '<div class="item-sub"><span>' + esc(u.email || '') + '</span></div><div class="item-sub"><span>' + esc(rotRole(u.role)) + '</span><span>' + esc(u.squad || 'Todos os squads') + '</span><span>' + (u.role === 'admin' ? 'acesso total' : np + ' tela' + (np === 1 ? '' : 's')) + '</span>' + (u.criado_em ? '<span>desde ' + fmtISO(u.criado_em) + '</span>' : '') + '</div></button>'; }).join('') + '</div>';
  });
  return h;
}
function detalheUsuario(id) {
  const u = (S.usuarios || []).find(x => x.id === id); if (!u) return;
  const eu = S.user && u.id === S.user.id;
  let role = u.role || 'planejador', squad = u.squad || '', perms = new Set(u.permissoes && u.permissoes.length ? u.permissoes : ['overview']);
  perms.add('overview');
  const desenha = () => {
    let h = '<div class="d-tit">' + esc(u.nome || 'Sem nome') + '</div><div class="d-sub">' + esc(u.email || '') + (u.criado_em ? ' · cadastrado em ' + fmtISO(u.criado_em) : '') + '</div>';
    if (eu) { abreFolha(h + '<div class="vazio" style="padding:14px">Esta é a sua conta. Para mudar o seu próprio acesso, use o site.</div>'); return; }
    h += '<div class="sec" style="margin-top:6px">Perfil</div><div class="seg">' + ROLES.map(r => '<button data-role="' + r[0] + '" class="' + (role === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div>'
      + '<div class="sec">Squad</div><button class="fbtn' + (squad ? ' on' : '') + '" id="usu-squad">' + esc(squad || 'Todos os squads') + svg('baixo') + '</button>'
      + '<div class="sec">Telas liberadas<span>' + (role === 'admin' ? 'administrador vê todas' : perms.size + ' de ' + PERMS.length) + '</span></div>'
      + '<div class="opcoes" style="max-height:none">' + PERMS.map(p => '<label class="opc"><input type="checkbox" data-perm="' + p[0] + '"' + (perms.has(p[0]) ? ' checked' : '') + (p[0] === 'overview' ? ' disabled' : '') + '><span>' + p[1] + '</span></label>').join('') + '</div>'
      + '<div class="d-acoes"><button class="btn btn-pri cheio" id="usu-salva">' + (aguardando(u) ? 'Liberar acesso' : 'Salvar alterações') + '</button>'
      + '<button class="btn cheio ' + (u.ativo === false ? 'btn-ok' : 'btn-perigo') + '" id="usu-ativo">' + (u.ativo === false ? 'Reativar acesso' : 'Desativar acesso') + '</button></div>';
    abreFolha(h);
    const cx = $('#folha-caixa');
    cx.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { role = b.dataset.role; desenha(); });
    cx.querySelectorAll('[data-perm]').forEach(c => c.onchange = () => { c.checked ? perms.add(c.dataset.perm) : perms.delete(c.dataset.perm); });
    $('#usu-squad').onclick = () => seletor('Squad', [{ v: '', l: 'Todos os squads' }].concat(SQUADS.map(s => ({ v: s, l: s }))), [squad], vals => { squad = vals[0] || ''; desenha(); }, true);
    $('#usu-salva').onclick = () => gravaUsuario(u, { role, squad: squad || null, permissoes: [...perms] }, aguardando(u) ? 'Acesso liberado para ' + (u.nome || u.email) + '.' : 'Usuário atualizado.');
    $('#usu-ativo').onclick = () => {
      if (u.ativo !== false && !confirm('Desativar o acesso de ' + (u.nome || u.email) + '? A pessoa não consegue mais entrar até ser reativada.')) return;
      gravaUsuario(u, { ativo: u.ativo === false }, u.ativo === false ? 'Acesso reativado.' : 'Acesso desativado.');
    };
  };
  desenha();
}
async function gravaUsuario(u, campos, msg) {
  if (!S.admin || (S.user && u.id === S.user.id)) return aviso('Só o administrador muda o acesso de outras pessoas.', 'verm');
  carregando(true);
  const { data, error } = await supa.from('perfis').update(campos).eq('id', u.id).select('id');
  carregando(false);
  if (error) return aviso('Não foi possível salvar: ' + error.message, 'verm');
  if (!data || !data.length) return aviso('O banco não confirmou a gravação. Tente pelo site.', 'verm');
  Object.assign(u, campos); fechaFolha(); aviso(msg, 'verd'); render(true);
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
    + (() => { // todos os itens do mesmo pedido
      if (!r.pedido) return '';
      const it = S.mats.filter(x => String(x.pedido) === String(r.pedido));
      if (it.length < 2) return '';
      return '<div class="sec" style="margin-top:4px">Itens do pedido ' + esc(r.pedido) + '<span>' + it.length + ' itens · ' + reaisCurto(it.reduce((a, x) => a + num(x.valorTotal), 0)) + '</span></div><div class="lista-l">'
        + it.map(x => '<button class="ped' + (x === r ? ' atual' : '') + '" data-mat2="' + x.__i + '"><span><b>' + esc(x.descricao || 'Sem descrição') + '</b><small>' + esc((x.qtde || '') + ' ' + (x.unMedida || '')) + (x.prevEntrega ? ' · prev. ' + esc(x.prevEntrega) : '') + '</small></span>' + rotuloStatus(x) + '</button>').join('') + '</div>';
    })()
    + (lm && S.podePipe ? '<div class="d-acoes"><button class="btn cheio" data-abre-lm="' + esc(lm.id) + '">' + svg('link') + ' Ver a LM ' + esc(lm.numero_lm || lm.wbs) + ' no pipeline</button></div>' : '');
  mostraDetalhe(html);
  if (!soAtualiza) { document.querySelectorAll('.item.sel').forEach(e => e.classList.remove('sel')); const b = document.querySelector('[data-mat="' + idx + '"]'); if (b) b.classList.add('sel'); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-mat2]'); if (b) detalheMat(+b.dataset.mat2, true); });
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
