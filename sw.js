// Service worker: guarda a "casca" do app para abrir sem internet. Dados (notas, chamada) sempre vão à rede.
const V = 'painel-cempfb-v1';
const ARQ = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'vendor/jsQR.js', 'vendor/qrcode.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(ARQ); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API (Apps Script) passa direto
  e.respondWith(fetch(e.request).then(function (r) {
    const cp = r.clone(); caches.open(V).then(function (c) { c.put(e.request, cp); }); return r;
  }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
});
