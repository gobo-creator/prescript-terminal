const CACHE_NAME = "prescript-terminal-v14-portrait";
const APP_SHELL = [
  "./",
  "./index.html",
  "./iphone.html",
  "./style_iphone_fixed.css",
  "./iphone.css",
  "./script.js",
  "./manifest.json",
  "./iphone-manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("prescript-terminal-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            const url = new URL(event.request.url);
            return caches.match(url.pathname.endsWith("iphone.html") ? "./iphone.html" : "./index.html");
          }
        })
      )
  );
});
