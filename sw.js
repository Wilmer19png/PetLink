/* Service worker de PetLink
   - Guarda la app en caché para abrirla sin conexión (RNF-08)
   - Abre la pantalla correcta al tocar una notificación (11.2) */
const CACHE = "petlink-v1";
const SHELL = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest", "assets/icon.svg",
  "js/config.js", "js/core/utils.js", "js/core/ui.js", "js/core/router.js", "js/core/http.js",
  "js/backend/db.js", "js/backend/seed.js", "js/backend/server.js",
  "js/services/breeds.js", "js/services/ai.js", "js/services/qr.js", "js/services/maps.js",
  "js/services/messaging.js", "js/services/notifications.js",
  "js/views/auth.js", "js/views/vet.js", "js/views/owner.js", "js/views/pet.js",
  "js/views/calendar.js", "js/views/map.js", "js/views/learn.js", "js/views/admin.js", "js/app.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Archivos propios: red primero y caché como respaldo. APIs externas: siempre red.
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match("index.html")))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "#/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const client = list[0];
      if (client) {
        client.postMessage({ type: "open", link });
        return client.focus();
      }
      return self.clients.openWindow("./index.html" + link);
    })
  );
});
