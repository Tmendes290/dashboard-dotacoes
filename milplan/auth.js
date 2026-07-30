// Cópia independente do requireAuth de server.js:52-66 (mesma lógica: valida
// o Bearer token contra o Supabase Auth usando a service role key). Mantida
// separada pra não arriscar tocar no middleware já em produção usado pelas
// rotas de Velocidade/Telemetria.
const { SUPA_URL, SUPA_SERVICE_KEY } = require('./supa');

async function requireAuth(req, res, next) {
  if (!SUPA_SERVICE_KEY) return res.status(500).json({ error: 'no service key' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Não autenticado. Faça login para acessar estes dados.' });
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPA_SERVICE_KEY },
    });
    if (!r.ok) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    req.callerUser = await r.json();
    next();
  } catch (e) {
    res.status(401).json({ error: 'Falha ao validar sessão: ' + e.message });
  }
}

module.exports = { requireAuth };
