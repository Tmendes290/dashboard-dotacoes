const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');
const relatorio = require('./relatorio');
const milplanRoutes = require('./milplan/routes');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPA_URL = 'https://ehbiyqqpzqrluvuqrljp.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
const RELATORIO_TOKEN = (process.env.RELATORIO_TOKEN || '').trim();

// ── PGU (Projeto CPF): alerta de fim de turno via WhatsApp (WAME-API) ───────
// Chamado pelo pgu.js do site projeto-cpf (origem diferente, por isso libera CORS só nessa
// rota) sempre que o encarregado encerra o turno com atividade pendente. PGU_ALERTA_TOKEN é só
// um filtro anti-spam/uso acidental -- como o site é estático, qualquer token embutido no JS do
// cliente é visível a quem abrir o código-fonte, então não é segredo de verdade (a chave da
// WAME-API, essa sim, nunca sai do servidor).
const WAME_SERVER = (process.env.WAME_SERVER || '').trim();
const WAME_KEY = (process.env.WAME_KEY || '').trim();
const PGU_WHATSAPP_GRUPO = (process.env.PGU_WHATSAPP_GRUPO || '').trim();
const PGU_ALERTA_TOKEN = (process.env.PGU_ALERTA_TOKEN || '').trim();

// ── VERSÃO DO APP: hash do index.html calculado quando o servidor sobe ──────
// Muda a cada deploy (o Railway reinicia o processo e o arquivo vem
// atualizado do git). O cliente compara com isso periodicamente pra saber
// se tem uma versão nova no ar e avisar o usuário a atualizar a página.
function computeAppVersion() {
  try {
    const content = fs.readFileSync(path.join(__dirname, 'index.html'));
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  } catch (e) {
    return String(Date.now());
  }
}
const APP_VERSION = computeAppVersion();

// ── PROXY SUPABASE: contorna bloqueio de *.supabase.co em redes corporativas ──
// (ex.: rede da Vale faz inspeção SSL e derruba conexões diretas ao domínio do Supabase)
// O navegador passa a falar só com o domínio do Railway; este proxy repassa
// REST/Auth/Storage (HTTP) e Realtime (WebSocket) para o Supabase de verdade.
// Tem que vir ANTES de compression()/express.json() pra não interferir no streaming do body.
const supabaseProxy = createProxyMiddleware({
  target: SUPA_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/db': '' }
});
app.use('/db', supabaseProxy);

// Gzip compression — reduz o index.html de ~1.2MB para ~150KB
app.use(compression());

// Parse JSON bodies up to 50MB (medido data can be large)
app.use(express.json({ limit: '50mb' }));

// ── AUTH: exige sessão Supabase válida (Authorization: Bearer <access_token>) ──
// Usado nas rotas de Velocidade/Telemetria, que hoje são acessíveis direto por
// URL (velocidade.html não passa pela tela de login do index.html).
async function requireAuth(req, res, next) {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Não autenticado. Faça login para acessar estes dados.' });
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPA_SERVICE_KEY }
    });
    if (!r.ok) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    req.callerUser = await r.json();
    next();
  } catch (e) {
    res.status(401).json({ error: 'Falha ao validar sessão: ' + e.message });
  }
}

// ── SAVE MEDIDO (server-side, bypasses RLS via service role key) ──────────────
app.post('/api/save-medido', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPA_SERVICE_KEY não configurado no servidor. Adicione a variável no Railway.' });
  }

  const { rows } = req.body;
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Payload inválido — esperado { rows: [...] }' });
  }

  const headers = {
    'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
    'apikey': SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  try {
    // Step 1: delete all existing rows (service role bypasses RLS)
    const delRes = await fetch(`${SUPA_URL}/rest/v1/medido?chave=neq.__sentinel__`, {
      method: 'DELETE',
      headers
    });

    if (!delRes.ok) {
      const errText = await delRes.text();
      console.error('[save-medido] delete failed:', errText);
      return res.status(500).json({ error: 'Erro ao limpar tabela medido: ' + errText });
    }

    // Step 2: insert new rows in batches of 200
    let savedCount = 0;
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const insRes = await fetch(`${SUPA_URL}/rest/v1/medido`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch)
      });

      if (!insRes.ok) {
        const errText = await insRes.text();
        console.error(`[save-medido] insert batch ${i} failed:`, errText);
        return res.status(500).json({ error: `Erro ao inserir batch a partir da linha ${i}: ${errText}`, savedCount });
      }

      savedCount += batch.length;
    }

    console.log(`[save-medido] sucesso: ${savedCount} linhas salvas`);
    res.json({ ok: true, savedCount });
  } catch (e) {
    console.error('[save-medido] exception:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── ADMIN: EXCLUIR USUARIO DE VERDADE (Auth + perfil + bloqueio de email) ──────
app.post('/api/admin/delete-user', async (req, res) => {
  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPA_SERVICE_KEY não configurado no servidor.' });
  }

  const { targetUserId, targetEmail } = req.body;
  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!callerToken) return res.status(401).json({ error: 'Não autenticado.' });
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId obrigatório.' });

  const svcHeaders = {
    'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
    'apikey': SUPA_SERVICE_KEY,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Identifica quem está chamando, a partir do token dele
    const meRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${callerToken}`, 'apikey': SUPA_SERVICE_KEY }
    });
    if (!meRes.ok) return res.status(401).json({ error: 'Sessão inválida.' });
    const me = await meRes.json();

    if (me.id === targetUserId) {
      return res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });
    }

    // 2. Confirma que quem está chamando é admin
    const perfilRes = await fetch(`${SUPA_URL}/rest/v1/perfis?id=eq.${me.id}&select=role`, { headers: svcHeaders });
    const perfilData = await perfilRes.json();
    if (!perfilRes.ok || !perfilData[0] || perfilData[0].role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem excluir usuários.' });
    }

    // 3. Apaga a conta de login de verdade (Supabase Auth Admin API)
    const delAuthRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${targetUserId}`, {
      method: 'DELETE',
      headers: svcHeaders
    });
    if (!delAuthRes.ok) {
      const errText = await delAuthRes.text();
      console.error('[delete-user] auth delete failed:', errText);
      return res.status(500).json({ error: 'Erro ao excluir conta de login: ' + errText });
    }

    // 4. Apaga o perfil (caso não tenha cascata automática)
    await fetch(`${SUPA_URL}/rest/v1/perfis?id=eq.${targetUserId}`, {
      method: 'DELETE',
      headers: svcHeaders
    });

    // 5. Bloqueia o e-mail pra não recadastrar
    if (targetEmail) {
      await fetch(`${SUPA_URL}/rest/v1/emails_excluidos`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([{ email: targetEmail, excluido_por: me.email }])
      });
    }

    console.log(`[delete-user] ${targetEmail || targetUserId} excluído por ${me.email}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-user] exception:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── VELOCIDADE: IMPORTAR EXCEL (parse no servidor, salva no Supabase) ──
app.post('/api/import-velocidade', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { fileBase64 } = req.body;
  if (!fileBase64) return res.status(400).json({ error: 'no file' });

  try {
    const XLSX = require('xlsx');
    const buffer = Buffer.from(fileBase64, 'base64');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const headers = rawRows[0];

    const fc = (pat) => headers.findIndex(h => pat.test(String(h || '').trim()));
    const iDados = fc(/^dados$/i);
    const iData  = fc(/^data$/i);
    const iDur   = fc(/dura/i);
    const iNomeM = fc(/motorista/i);

    if (iDados < 0 || iData < 0 || iNomeM < 0) {
      return res.status(400).json({ error: 'Colunas não encontradas. Headers: ' + headers.slice(0, 8).join(', ') });
    }

    function parseDate(v) {
      if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      return String(v || '').slice(0, 10);
    }
    function parseDados(d) {
      const s = String(d || '');
      const mx = s.match(/max:([\d,]+)/i);
      const lm = s.match(/limite:([\d,]+)/i);
      return {
        maxV: mx ? parseFloat(String(mx[1]).replace(',', '.')) : 0,
        lim:  lm ? parseFloat(String(lm[1]).replace(',', '.')) : 0
      };
    }
    function getSev(pct) { return pct > 30 ? 'GV' : pct > 20 ? 'G' : pct > 10 ? 'M' : 'B'; }

    const map = {}, map12s = {}, driverSet = new Set();
    const eventosRaw = [];
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      const dt = parseDate(r[iData]);
      if (!dt || dt.length < 7) continue;
      const drv = String(r[iNomeM] || '').trim().toUpperCase();
      if (!drv) continue;
      const dur = Number(r[iDur]) || 0;
      const { maxV, lim } = parseDados(r[iDados]);
      if (!maxV || !lim) continue;
      const pct = Math.round((maxV / lim - 1) * 100);
      if (pct < 1) continue;
      const sev = getSev(pct);
      const key = dt + '|' + drv;
      // Evento individual (drill-down por dia na Telemetria)
      eventosRaw.push({ dt, motorista: drv, duracao: dur, velocidade: maxV, limite: lim });
      // % puro — todos os eventos
      if (!map[key]) map[key] = { dt, drv, b: 0, m: 0, g: 0, gv: 0, dur: 0, maxV: 0, limAtMax: 0 };
      const e = map[key];
      if (sev === 'B') e.b++; else if (sev === 'M') e.m++; else if (sev === 'G') e.g++; else e.gv++;
      e.dur += dur;
      if (maxV > e.maxV) { e.maxV = maxV; e.limAtMax = lim; }
      driverSet.add(drv);
      // regra 12s — só eventos com dur > 12s
      if (dur > 12) {
        if (!map12s[key]) map12s[key] = { dt, drv, b: 0, m: 0, g: 0, gv: 0, dur: 0, maxV: 0, limAtMax: 0 };
        const e2 = map12s[key];
        if (sev === 'B') e2.b++; else if (sev === 'M') e2.m++; else if (sev === 'G') e2.g++; else e2.gv++;
        e2.dur += dur;
        if (maxV > e2.maxV) { e2.maxV = maxV; e2.limAtMax = lim; }
      }
    }

    const rows = Object.values(map).sort((a, b) => a.dt < b.dt ? -1 : 1)
      .map(e => [e.dt, e.drv, e.b, e.m, e.g, e.gv, e.dur, e.maxV, e.limAtMax]);
    const rows12s = Object.values(map12s).sort((a, b) => a.dt < b.dt ? -1 : 1)
      .map(e => [e.dt, e.drv, e.b, e.m, e.g, e.gv, e.dur, e.maxV, e.limAtMax]);
    const drivers = [...driverSet].sort();
    let ranulfoName = null;
    rows.forEach(r => { if (r[1].includes('RANULFO') && r[1].includes('CARVALHO')) ranulfoName = r[1]; });
    const ranulfo = ranulfoName
      ? rows.filter(r => r[1] === ranulfoName).map(r => ({
          dt: r[0], ev: r[2]+r[3]+r[4]+r[5], maxV: r[7], lim: r[8],
          pct: Math.round((r[7]/r[8]-1)*100), dur: r[6]
        }))
      : [];

    // Salva no Supabase
    const payload = { rows, rows12s, drivers, ranulfo };
    const supa = await fetch(`${SUPA_URL}/rest/v1/vel_dados`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'apikey': SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: 'main', payload, atualizado_em: new Date().toISOString() }])
    });
    if (!supa.ok) {
      const err = await supa.text();
      return res.status(500).json({ error: 'Erro Supabase: ' + err });
    }

    // Substitui os eventos individuais (drill-down por dia) — apaga tudo e reinsere em lotes
    const evHeaders = {
      'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      'apikey': SUPA_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    const delEv = await fetch(`${SUPA_URL}/rest/v1/vel_eventos?id=gte.0`, { method: 'DELETE', headers: evHeaders });
    if (!delEv.ok) console.error('[import-velocidade] erro ao limpar vel_eventos:', await delEv.text());
    const evBatchSize = 500;
    for (let i = 0; i < eventosRaw.length; i += evBatchSize) {
      const batch = eventosRaw.slice(i, i + evBatchSize);
      const insEv = await fetch(`${SUPA_URL}/rest/v1/vel_eventos`, { method: 'POST', headers: evHeaders, body: JSON.stringify(batch) });
      if (!insEv.ok) { console.error(`[import-velocidade] erro ao inserir eventos (lote ${i}):`, await insEv.text()); break; }
    }

    console.log(`[import-velocidade] ${rows.length} rows, ${drivers.length} drivers, ${eventosRaw.length} eventos individuais`);
    res.json({ ok: true, rows: rows.length, drivers: drivers.length, ranulfo: ranulfo.length, eventos: eventosRaw.length });
  } catch (e) {
    console.error('[import-velocidade]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── VELOCIDADE: EVENTOS INDIVIDUAIS DE UM DIA (drill-down) ─────
app.get('/api/velocidade-eventos', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { motorista, dt } = req.query;
  if (!motorista || !dt) return res.status(400).json({ error: 'motorista e dt são obrigatórios' });
  try {
    const url = `${SUPA_URL}/rest/v1/vel_eventos?motorista=eq.${encodeURIComponent(motorista)}&dt=eq.${encodeURIComponent(dt)}&select=duracao,velocidade,limite&order=duracao.desc`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'apikey': SUPA_SERVICE_KEY } });
    if (!r.ok) return res.status(500).json({ error: await r.text() });
    const data = await r.json();
    res.json({ eventos: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── VELOCIDADE: GET (fetch saved data) ────────────────────────
app.get('/api/velocidade', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/vel_dados?chave=eq.main&select=payload,atualizado_em`, {
      headers: { 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'apikey': SUPA_SERVICE_KEY }
    });
    const data = await r.json();
    if (!data[0]) return res.status(404).json({ error: 'no data' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── VELOCIDADE: POST (save imported data) ─────────────────────
app.post('/api/velocidade', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { rows, drivers, ranulfo } = req.body;
  if (!rows || !drivers) return res.status(400).json({ error: 'payload inválido' });
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/vel_dados`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'apikey': SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{
        chave: 'main',
        payload: { rows, drivers, ranulfo: ranulfo || [] },
        atualizado_em: new Date().toISOString()
      }])
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    console.log(`[velocidade] ${rows.length} rows, ${drivers.length} drivers salvos`);
    res.json({ ok: true, rows: rows.length, drivers: drivers.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TELEMETRIA (status de tratamento de casos): IMPORTAR EXCEL ──
app.post('/api/import-telemetria', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { fileBase64 } = req.body;
  if (!fileBase64) return res.status(400).json({ error: 'no file' });

  try {
    const XLSX = require('xlsx');
    const buffer = Buffer.from(fileBase64, 'base64');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const headers = rawRows[0];

    const fc = (pat) => headers.findIndex(h => pat.test(String(h || '').trim()));
    const iId       = fc(/^id$/i);
    const iStatus   = fc(/^status$/i);
    const iEvento   = fc(/^evento$/i);
    const iHead     = fc(/head|gerente geral/i);
    const iGer      = fc(/ger[êe]ncia.*[áa]rea/i);
    const iComent   = fc(/coment[áa]rios/i);
    const iNome     = fc(/condutor|motorista/i);
    const iGrav     = fc(/gravidade/i);
    const iAcoes    = fc(/^a[çc][õo]es$/i);
    const iTempo    = fc(/tempo.*abert/i);
    const iDtEvento = fc(/data.*evento/i);

    if (iNome < 0 || iEvento < 0) {
      return res.status(400).json({ error: 'Colunas não encontradas. Headers: ' + headers.slice(0, 14).join(', ') });
    }

    function parseDate(v) {
      if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      const s = String(v || '');
      const m = s.match(/(\d{2})-(\d{2})-(\d{4})/) || s.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return '';
      return m[0].length === 10 && m[3].length === 4 ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10);
    }

    function normEmpresa(raw) {
      if (!raw) return 'Não identificada';
      let s = raw.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
      if (/^JSL/.test(s)) return 'JSL';
      if (s === 'VALE') return 'VALE';
      if (/^REDE/.test(s)) return 'REDE';
      if (/^OMEGA/.test(s)) return 'OMEGA SERVIÇOS E MONTAGENS';
      if (/^RCR/.test(s)) return 'RCR LOCAÇÃO';
      return raw.trim();
    }

    const casos = [];
    for (let i = 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      const nome = String(r[iNome] || '').trim().toUpperCase();
      const evento = String(r[iEvento] || '').trim();
      if (!nome || !evento) continue;

      const comentarios = String(r[iComent] || '');
      const empMatch = comentarios.match(/Empresa:\s*([^\r\n\/]+)/i);

      casos.push({
        id: iId >= 0 ? String(r[iId] || '') : String(i),
        nome,
        evento,
        dt: iDtEvento >= 0 ? parseDate(r[iDtEvento]) : '',
        grav: iGrav >= 0 ? String(r[iGrav] || '').trim() : '',
        ger: iGer >= 0 ? String(r[iGer] || '').trim() : '',
        head: iHead >= 0 ? String(r[iHead] || '').trim() : '',
        acao: iAcoes >= 0 ? String(r[iAcoes] || '').trim() : '',
        tempo: iTempo >= 0 ? String(r[iTempo] || '').trim() : '',
        status: iStatus >= 0 ? String(r[iStatus] || '').trim() : '',
        empresa: normEmpresa(empMatch ? empMatch[1] : '')
      });
    }

    const payload = { casos };
    const supa = await fetch(`${SUPA_URL}/rest/v1/telemetria_dados`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'apikey': SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: 'main', payload, atualizado_em: new Date().toISOString() }])
    });
    if (!supa.ok) {
      const err = await supa.text();
      return res.status(500).json({ error: 'Erro Supabase: ' + err });
    }

    console.log(`[import-telemetria] ${casos.length} casos`);
    res.json({ ok: true, casos: casos.length });
  } catch (e) {
    console.error('[import-telemetria]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── TELEMETRIA: GET (fetch saved data) ────────────────────────
app.get('/api/telemetria', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/telemetria_dados?chave=eq.main&select=payload,atualizado_em`, {
      headers: { 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'apikey': SUPA_SERVICE_KEY }
    });
    const data = await r.json();
    if (!data[0]) return res.status(404).json({ error: 'no data' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CJI3: SALVAR PAYLOAD JÁ AGREGADO (parse feito no browser) ────
app.post('/api/save-cji3', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { payload } = req.body;
  if (!payload || !payload.rows) return res.status(400).json({ error: 'payload inválido' });
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/cji3_dados`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'apikey': SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: 'main', payload, atualizado_em: new Date().toISOString() }])
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: 'Supabase: ' + err });
    }
    console.log(`[save-cji3] ${payload.rows.length} linhas, ${payload.months.length} meses`);
    res.json({ ok: true, rows: payload.rows.length, months: payload.months.length });
  } catch (e) {
    console.error('[save-cji3]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cji3', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/cji3_dados?chave=eq.main&select=payload,atualizado_em`, {
      headers: { 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'apikey': SUPA_SERVICE_KEY }
    });
    const data = await r.json();
    if (!data[0]) return res.status(404).json({ error: 'no data' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SAVE MATERIAIS (server-side, service role) ──────────────────────────────
// Um registro por item na tabela "materiais" (não mais um blob único em
// mat_config): grava sempre em lotes pequenos, então cada gravação é rápida
// independente de quanto o histórico total já cresceu. Guardar tudo como um
// JSON gigante numa linha só se tornou lento demais pro Postgres reescrever
// (estourava statement_timeout mesmo com a chave de serviço, porque o limite
// é da conexão física do "authenticator", não do papel usado depois).
// ── LÊ MATERIAIS (via service role key) ────────────────────────────────
// A leitura direto do navegador (papel "authenticated") usa até ~49 páginas
// sequenciais e vem estourando o statement_timeout curto desse papel desde que
// a tabela cresceu pros duplicados órfãos -- por isso a aba Materiais ficava
// mostrando "Nenhum dado" mesmo com o dado intacto no banco (ver revisão de
// 05/08/2026). A gravação já usava a service key por esse mesmo motivo; agora
// a leitura também.
app.get('/api/materiais', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const headers = { 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`, 'apikey': SUPA_SERVICE_KEY };
  try {
    const batchSize = 1000;
    let offset = 0, items = [];
    while (offset < 300000) {
      const r = await fetch(`${SUPA_URL}/rest/v1/materiais?select=item&order=chave&offset=${offset}&limit=${batchSize}`, { headers });
      if (!r.ok) { const err = await r.text(); throw new Error(err); }
      const rows = await r.json();
      items = items.concat(rows.map(row => row.item));
      if (rows.length < batchSize) break;
      offset += batchSize;
    }
    const metaRes = await fetch(`${SUPA_URL}/rest/v1/mat_meta?id=eq.1&select=*`, { headers });
    const metaRows = metaRes.ok ? await metaRes.json() : [];
    res.json({ items, meta: metaRows[0] || null });
  } catch (e) {
    console.error('[GET /api/materiais]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/save-materiais', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { data, import_file, import_date } = req.body;
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'payload inválido — esperado { data: [...] }' });

  const headers = {
    'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
    'apikey': SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };

  try {
    const batchSize = 500;
    let saved = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize).map(function (item) {
        return { chave: String(item._key || (item.pedido || '') + '|' + (item.rc || '') + '|' + i), item, updated_at: new Date().toISOString() };
      });
      const r = await fetch(`${SUPA_URL}/rest/v1/materiais?on_conflict=chave`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch)
      });
      if (!r.ok) {
        const err = await r.text();
        console.error(`[save-materiais] lote a partir do item ${i} falhou:`, err);
        return res.status(500).json({ error: `Erro no lote a partir do item ${i}: ` + err, saved });
      }
      saved += batch.length;
    }

    const metaRes = await fetch(`${SUPA_URL}/rest/v1/mat_meta?on_conflict=id`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ id: 1, import_file: import_file || '', import_date: import_date || '', updated_at: new Date().toISOString() }])
    });
    if (!metaRes.ok) {
      const err = await metaRes.text();
      console.error('[save-materiais] mat_meta falhou:', err);
      return res.status(500).json({ error: 'Itens salvos mas metadados (data/arquivo) falharam: ' + err, saved });
    }

    console.log(`[save-materiais] ${saved} itens salvos`);
    res.json({ ok: true, count: saved });
  } catch (e) {
    console.error('[save-materiais]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── REMOVE CHAVES ÓRFÃS DE MATERIAIS (limpeza de duplicados) ──────────────
// A chave de dedupe (_key) do import de materiais incluía a data de previsão de
// entrega, que muda entre importações -- toda vez que ela mudava, o item antigo
// ficava órfão em vez de ser atualizado (ver aba Materiais, revisão de 05/08/2026).
// Rota separada com a service role key porque não existe policy de delete pública
// pra "materiais" (só leitura) -- delete é sensível o bastante pra passar pelo
// servidor em vez de abrir RLS direto pro cliente.
app.post('/api/materiais-remover-chaves', requireAuth, async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const { chaves } = req.body;
  if (!chaves || !Array.isArray(chaves) || !chaves.length) return res.status(400).json({ error: 'payload inválido — esperado { chaves: [...] }' });

  const headers = {
    'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
    'apikey': SUPA_SERVICE_KEY,
    'Content-Type': 'application/json'
  };
  try {
    const batchSize = 200;
    let removed = 0;
    for (let i = 0; i < chaves.length; i += batchSize) {
      const batch = chaves.slice(i, i + batchSize);
      const filter = batch.map(function (c) { return encodeURIComponent(c); }).join(',');
      const r = await fetch(`${SUPA_URL}/rest/v1/materiais?chave=in.(${filter})`, { method: 'DELETE', headers });
      if (!r.ok) {
        const err = await r.text();
        console.error(`[materiais-remover-chaves] lote a partir do item ${i} falhou:`, err);
        return res.status(500).json({ error: `Erro no lote a partir do item ${i}: ` + err, removed });
      }
      removed += batch.length;
    }
    console.log(`[materiais-remover-chaves] ${removed} chaves removidas`);
    res.json({ ok: true, removed });
  } catch (e) {
    console.error('[materiais-remover-chaves]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── COPPER PRICE PROXY ─────────────────────────────────────────
// Busca cotação do cobre (HG=F) server-side para evitar CORS do browser
app.get('/api/copper', async (req, res) => {
  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) {
      return res.status(502).json({ error: 'no data from upstream' });
    }
    const price  = meta.regularMarketPrice;
    const prev   = meta.previousClose || meta.chartPreviousClose || price;
    const change = prev > 0 ? ((price - prev) / prev * 100) : 0;
    res.json({ price, change });
  } catch (e) {
    console.error('[copper] fetch error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── VERSÃO DO APP: cliente usa isso pra saber se tem deploy novo no ar ──────
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

// ── RELATÓRIO DIÁRIO DE PRODUTIVIDADE (chamado pelo sync-supabase.gs às 05h) ──
// Faz o cálculo pesado (aderência, evolução, composição do improdutivo) aqui em Node — o
// Apps Script só busca este HTML pronto e dispara o e-mail via GmailApp.
async function supaFetchAllPages(table, select) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
      headers: {
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'apikey': SUPA_SERVICE_KEY,
        'Range': `${from}-${from + PAGE - 1}`
      }
    });
    if (!r.ok) throw new Error(`Supabase ${table} ${r.status}: ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

app.get('/api/relatorio-diario', async (req, res) => {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'SUPA_SERVICE_KEY não configurado no servidor.' });
  if (!RELATORIO_TOKEN) return res.status(500).json({ error: 'RELATORIO_TOKEN não configurado no servidor.' });
  if (req.query.token !== RELATORIO_TOKEN) return res.status(401).json({ error: 'Token inválido.' });

  try {
    const [rows, refSquads, refFiscais] = await Promise.all([
      supaFetchAllPages('improdutividade', 'data_sort_key,empresa,sap,fiscal,chegada_min,pts_min,inicio_min,alm_ini_min,alm_fim_min,termino_min,acao'),
      supaFetchAllPages('ref_squads', 'pep,squad'),
      supaFetchAllPages('ref_fiscais', 'nome,squad')
    ]);

    const { html, dataFmt } = relatorio.montarRelatorioEmail(rows, refSquads, refFiscais);
    if (!html) return res.status(404).json({ error: 'Sem registros na tabela improdutividade.' });

    console.log(`[relatorio-diario] ${rows.length} registros, dataFmt=${dataFmt}`);
    res.json({ html, dataFmt });
  } catch (e) {
    console.error('[relatorio-diario]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── PGU (Projeto CPF): alerta de fim de turno via WhatsApp ─────────────────
// Chamada pelo pgu.js do projeto-cpf (origem diferente -> precisa de CORS liberado só aqui).
app.options('/api/pgu-alerta-turno', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

app.post('/api/pgu-alerta-turno', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (!WAME_SERVER || !WAME_KEY || !PGU_WHATSAPP_GRUPO) {
    return res.status(500).json({ error: 'WhatsApp não configurado no servidor (WAME_SERVER/WAME_KEY/PGU_WHATSAPP_GRUPO).' });
  }
  if (!PGU_ALERTA_TOKEN || req.body.token !== PGU_ALERTA_TOKEN) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const { turno, dia, produtividade, proximoTurno } = req.body;
  const atrasadas = Array.isArray(req.body.atrasadas) ? req.body.atrasadas : [];
  const porEncarregado = Array.isArray(req.body.porEncarregado) ? req.body.porEncarregado : [];
  if (!produtividade && !atrasadas.length && !porEncarregado.length) {
    return res.status(400).json({ error: 'Nada pra reportar.' });
  }

  function fmtHoras(h) {
    if (h === null || h === undefined) return '—';
    return Number(h).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'h';
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  // "07h–17h" -> "07H ÀS 17H" (só pro título -- o resto do texto usa o rótulo original).
  function turnoBonito(t) {
    const m = /^(\d{2})h.(\d{2})h$/.exec(t || '');
    return m ? `${m[1]}H ÀS ${m[2]}H` : (t || '—').toUpperCase();
  }

  const LINHA = '━━━━━━━━━━━━━━━━━━';
  const secoes = [];

  secoes.push(`📋 *REPORTE PGU — TURNO ${turnoBonito(turno)}*\n📅 *${dia || '—'}*`);

  // Produtividade = horas concluídas / horas planejadas pro turno -- >=100% é bom ritmo (deu
  // conta do previsto, ou mais), abaixo disso é sinal de questionar o motivo.
  if (produtividade && produtividade.horasPlanejadas > 0) {
    const pct = produtividade.pct;
    secoes.push(
      `📊 *INDICADOR GERAL DO TURNO*\n\n` +
      `🎯 *Produtividade:* *${pct}%*\n` +
      `📌 Planejado: *${produtividade.qtdPlanejada} atividades | ${fmtHoras(produtividade.horasPlanejadas)}*\n` +
      `✅ Concluído: *${produtividade.qtdConcluida} atividades | ${fmtHoras(produtividade.horasConcluidas)}*\n` +
      (pct >= 100
        ? `✅ *Resultado dentro do planejado.*\n\n👏 Bom ritmo geral do turno — manter o padrão nos próximos turnos.`
        : `⚠️ *Resultado abaixo do planejado.*\n\n🔎 Necessário avaliar os desvios e atuar nas pendências para evitar impactos nos próximos turnos.`)
    );
  }

  // Um bloco por encarregado x TR/ativo, com parabéns quando bate/passa da meta do turno.
  if (porEncarregado.length) {
    const blocos = porEncarregado.map((r) => {
      const pctPessoa = r.planejado > 0 ? Math.round((r.concluido / r.planejado) * 100) : 0;
      const bateuMeta = r.planejado > 0 && r.concluido >= r.planejado;
      return `👤 *${(r.encarregado || 'SEM ENCARREGADO').toUpperCase()} — ${r.area || '—'}*\n` +
        `${bateuMeta ? '✅' : '⚠️'} *${r.concluido}/${r.planejado} atividades concluídas*\n` +
        `📈 *${pctPessoa}% de atendimento ao planejado*\n\n` +
        (bateuMeta
          ? `👏 *Parabéns, ${r.encarregado}, pelo empenho e cumprimento integral da programação!*`
          : `🔎 Permanecer atento às atividades pendentes e aos impedimentos identificados durante o turno.`);
    }).join('\n\n---\n\n');
    secoes.push(`👷 *DESEMPENHO POR ENCARREGADO*\n\n${blocos}`);
  }

  // Pendências agrupadas por encarregado, numeradas globalmente, cada item narrando pra onde a
  // atividade vai e quem assume no próximo turno (se já tiver alguém escalado ali).
  if (atrasadas.length) {
    const porEnc = {}, ordem = [];
    atrasadas.slice(0, 60).forEach((a) => {
      const enc = a.encarregado || 'Sem encarregado';
      if (!porEnc[enc]) { porEnc[enc] = []; ordem.push(enc); }
      porEnc[enc].push(a);
    });
    let contador = 0;
    const blocosEnc = ordem.map((enc) => {
      const itens = porEnc[enc].map((a) => {
        contador++;
        let item = `🔴 *${pad2(contador)}. ${(a.nome || '—').toUpperCase()}*\n` +
          `📌 Impedimento: *${(a.motivo || '—').trim()}*\n` +
          `🕐 Status: *Não concluída no turno ${turno || '—'}.*\n` +
          `➡️ Programada para continuidade no turno *${proximoTurno || '—'}*.`;
        if (a.proximoEncarregado) item += `\n👤 *Responsável pela continuidade: ${a.proximoEncarregado}.*`;
        return item;
      }).join('\n\n---\n\n');
      return `👤 *ENCARREGADO: ${enc.toUpperCase()}*\n\n${itens}`;
    }).join('\n\n');
    const extra = atrasadas.length > 60 ? `\n\n… e mais ${atrasadas.length - 60} atividade(s).` : '';
    secoes.push(`⚠️ *PENDÊNCIAS / DESVIOS*\n\n${blocosEnc}${extra}`);

    secoes.push(
      `🚧 *PONTO DE ATENÇÃO*\n\n` +
      `As pendências acima devem receber *tratativa imediata*, evitando que os desvios avancem para os próximos turnos e possam impactar o caminho crítico da programação.\n\n` +
      `📌 *Solicita-se acompanhamento das ações no turno ${proximoTurno || '—'} e atualização do status das atividades pendentes.*`
    );
  }

  // Resumo final -- sempre fecha a mensagem, com ou sem pendência.
  const encarregadosUnicos = new Set(porEncarregado.map((r) => r.encarregado || 'Sem encarregado')).size;
  const resumoLinhas = [`✅ ${pad2(produtividade ? produtividade.qtdConcluida : 0)} atividades concluídas`];
  resumoLinhas.push(`⚠️ ${pad2(atrasadas.length)} atividades pendentes`);
  if (produtividade && produtividade.pct !== null && produtividade.pct !== undefined) resumoLinhas.push(`🎯 ${produtividade.pct}% de produtividade`);
  resumoLinhas.push(`👷 ${pad2(encarregadosUnicos)} encarregado(s) reportado(s)`);
  resumoLinhas.push(atrasadas.length ? `➡️ Continuidade das pendências no turno ${proximoTurno || '—'}` : '✅ Turno finalizado sem pendências.');
  secoes.push(`📊 *RESUMO DO TURNO*\n\n${resumoLinhas.join('\n')}`);

  const texto = secoes.join(`\n\n${LINHA}\n\n`);

  try {
    const r = await fetch(`${WAME_SERVER}/${WAME_KEY}/message/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ to: PGU_WHATSAPP_GRUPO, text: texto })
    });
    const bodyText = await r.text();
    if (!r.ok) {
      console.error('[pgu-alerta-turno] WAME-API respondeu', r.status, bodyText);
      return res.status(502).json({ error: `WAME-API recusou o envio (HTTP ${r.status}).` });
    }
    console.log(`[pgu-alerta-turno] enviado — turno ${turno}, ${atrasadas.length} pendência(s)`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[pgu-alerta-turno]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── MILPLAN FLOW WORK: rotas de SS (numeração, PDF, e-mail, Drive) ──────────
app.use('/api/milplan', milplanRoutes);

// Serve index.html from root (no subfolder needed)
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Dashboard de Dotacoes rodando na porta ${PORT}`);
});
server.on('upgrade', supabaseProxy.upgrade);
