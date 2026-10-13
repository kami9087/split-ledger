const V = "tsl-v4";
const SHELL = ["./", "index.html", "manifest.webmanifest", "firebase-config.js", "firebase-shim.js", "icon-192.png", "icon-512.png"];
const EXTRA_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const same = u.origin === location.origin;
  if (same && u.pathname.startsWith("/__/")) return; // Firebase auth handler: never cache
  if (!same && !EXTRA_HOSTS.includes(u.hostname)) return; // Firestore/Auth API calls go straight to the network
  e.respondWith(
    fetch(r).then(res => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
