// Materiais SLB: guarda só os arquivos do app (abre rápido e sem sinal). Dados nunca passam por aqui:
// /api e /db vão direto para a rede; a cópia dos materiais para consulta offline fica no IndexedDB do app.
const CACHE = 'materiais-slb-v1';
const ARQUIVOS = ['/m/', '/m/index.html', '/m/app.css', '/m/app.js', '/m/manifest.webmanifest', '/m/icons/icon-192.png', '/m/icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/m/')) return;
  // rede primeiro (pega a versão nova logo após o deploy); sem sinal, usa a cópia guardada
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('/m/index.html'))));
});
