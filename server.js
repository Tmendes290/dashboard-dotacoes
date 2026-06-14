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
