// Wrapper fino sobre a REST API do Supabase, no mesmo estilo já usado em server.js
// (fetch cru + service role key, sem o SDK — server.js:52-66, 552-601).
const SUPA_URL = 'https://ehbiyqqpzqrluvuqrljp.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;

function headers(prefer) {
  return {
    Authorization: `Bearer ${SUPA_SERVICE_KEY}`,
    apikey: SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function qs(filters) {
  return Object.entries(filters || {})
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join('&');
}

async function rpc(fnName, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(`RPC ${fnName} falhou: ${await r.text()}`);
  return r.json();
}

async function insert(table, rows, { returning } = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(returning ? 'return=representation' : 'return=minimal'),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Insert em ${table} falhou: ${await r.text()}`);
  return returning ? r.json() : null;
}

async function update(table, filters, patch) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs(filters)}`, {
    method: 'PATCH',
    headers: headers('return=minimal'),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Update em ${table} falhou: ${await r.text()}`);
}

async function remove(table, filters) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs(filters)}`, {
    method: 'DELETE',
    headers: headers('return=minimal'),
  });
  if (!r.ok) throw new Error(`Delete em ${table} falhou: ${await r.text()}`);
}

async function selectOne(table, filters, select) {
  const sel = select ? `&select=${select}` : '';
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs(filters)}${sel}`, { headers: headers() });
  if (!r.ok) throw new Error(`Select em ${table} falhou: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function selectMany(table, filters, select, order) {
  const sel = select ? `&select=${select}` : '';
  const ord = order ? `&order=${order}` : '';
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${qs(filters)}${sel}${ord}`, { headers: headers() });
  if (!r.ok) throw new Error(`Select em ${table} falhou: ${await r.text()}`);
  return r.json();
}

module.exports = { SUPA_URL, SUPA_SERVICE_KEY, rpc, insert, update, remove, selectOne, selectMany };
