const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPA_URL = 'https://ehbiyqqpzqrluvuqrljp.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;

// Parse JSON bodies up to 50MB (medido data can be large)
app.use(express.json({ limit: '50mb' }));

// ── SAVE MEDIDO (server-side, bypasses RLS via service role key) ──────────────
app.post('/api/save-medido', async (req, res) => {
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
app.post('/api/import-velocidade', async (req, res) => {
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
    function getSev(pct, dur) {
      if (dur <= 12) return 'C'; // ≤ 12s = apenas conversa, não é infração formal
      return pct > 30 ? 'GV' : pct > 20 ? 'G' : pct > 10 ? 'M' : 'B';
    }

    const map = {}, driverSet = new Set();
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
      const sev = getSev(pct, dur);
      const key = dt + '|' + drv;
      if (!map[key]) map[key] = { dt, drv, c: 0, b: 0, m: 0, g: 0, gv: 0, dur: 0, maxV: 0, limAtMax: 0 };
      const e = map[key];
      if (sev === 'C') e.c++; else if (sev === 'B') e.b++; else if (sev === 'M') e.m++; else if (sev === 'G') e.g++; else e.gv++;
      e.dur += dur;
      if (maxV > e.maxV) { e.maxV = maxV; e.limAtMax = lim; }
      driverSet.add(drv);
    }

    const rows = Object.values(map).sort((a, b) => a.dt < b.dt ? -1 : 1)
      .map(e => [e.dt, e.drv, e.b, e.m, e.g, e.gv, e.dur, e.maxV, e.limAtMax, e.c]);
    const drivers = [...driverSet].sort();
    let ranulfoName = null;
    rows.forEach(r => { if (r[1].includes('RANULFO') && r[1].includes('CARVALHO')) ranulfoName = r[1]; });
    const ranulfo = ranulfoName
      ? rows.filter(r => r[1] === ranulfoName).map(r => ({
          dt: r[0], ev: r[2]+r[3]+r[4]+r[5]+(r[9]||0), maxV: r[7], lim: r[8],
          pct: Math.round((r[7]/r[8]-1)*100), dur: r[6]
        }))
      : [];

    // Salva no Supabase
    const payload = { rows, drivers, ranulfo };
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

    console.log(`[import-velocidade] ${rows.length} rows, ${drivers.length} drivers`);
    res.json({ ok: true, rows: rows.length, drivers: drivers.length, ranulfo: ranulfo.length });
  } catch (e) {
    console.error('[import-velocidade]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── VELOCIDADE: GET (fetch saved data) ────────────────────────
app.get('/api/velocidade', async (req, res) => {
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
app.post('/api/velocidade', async (req, res) => {
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

// Serve index.html from root (no subfolder needed)
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard de Dotacoes rodando na porta ${PORT}`);
});
