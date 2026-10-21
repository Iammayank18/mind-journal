/* Shared files are loaded as common.js?v=N / theme.css?v=N. Bump N in the three
   HTML files and here together, so an old service worker can never pair a new page
   with an old common.js.

   Offline support. Pages and shared code: network first (so updates always arrive
   together), cache as fallback. Fonts/icons/hashed assets: cache first.
   Bump VERSION when you change the list of files below. */
const VERSION = "mj-v11";
// recorded meditation voice lives in its own cache, so app updates never wipe downloads
const AUDIO_CACHE = "mj-audio";
const ASSETS = [
  "./",
  "./index.html",
  "./planner.html",
  "./journal.html",
  "./meditate.html",
  "./meditate-content.js?v=9",
  "./common.js?v=9",
  "./theme.css?v=9",
  "./fonts/figtree-latin-wght-normal.woff2",
  "./fonts/figtree-latin-ext-wght-normal.woff2",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  const isPage = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  // Fonts, icons and hashed build files never change under the same name: cache first.
  const immutable = /\/(fonts|icons|assets)\//.test(url.pathname);

  // voice files are named by their content, so once saved they never change
  if (/\/audio\/voice\/.+\.mp3$/.test(url.pathname)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  if (immutable) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Pages, common.js, theme.css: network first so an update is never half-applied
  // (a new page with an old common.js), cache as the offline fallback.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (isPage ? caches.match("./journal.html") : undefined)))
  );
});
