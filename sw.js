// Service worker: cachea la app para que abra sin internet.
// Solo maneja archivos propios: la conexión del escáner (otro dominio) pasa directo.
const CACHE = "aris-demo-v10";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./data.js", "./art.js", "./manifest.json",
  "./icons/logo.png", "./icons/icon-192.png", "./icons/icon-512.png",
  "./vendor/html5-qrcode.min.js", "./vendor/JsBarcode.all.min.js", "./vendor/qrcode.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
