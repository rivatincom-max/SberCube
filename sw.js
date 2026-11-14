// Сначала сеть (чтобы приходили обновления), без интернета — из кэша телефона
const CACHE = "zvonki-v48";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon-light-180.png", "./icon-light-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/media/")) return;   // видео и файлы для скачивания — напрямую, без кэша приложения
  // no-cache: не брать устаревший HTTP-кэш (GitHub Pages кэширует на 10 минут)
  e.respondWith(fetch(e.request.url, { cache: "no-cache" }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
});
