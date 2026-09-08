// Guarda la interfaz para que la app abra al instante y sin señal.
// Rutas relativas a propósito: GitHub Pages sirve el sitio bajo /mi-semestre/,
// no en la raíz del dominio, así que "/estilos.css" apuntaría al lugar
// equivocado.

const VERSION = "v1";
const CONCHA = [
  "./",
  "./index.html",
  "./estilos.css",
  "./app.js",
  "./calculo.js",
  "./almacenamiento.js",
  "./datos/semestre.json",
  "./datos/agenda.json",
  "./manifest.webmanifest",
  "./iconos/icono.svg",
  "./iconos/icono-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll falla entero si un archivo falta; los pedimos uno por uno para
      // que un agenda.json todavía inexistente no rompa la instalación.
      .then((c) => Promise.all(CONCHA.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== location.origin) return;

  // Red primero, caché de respaldo: un despliegue nuevo se ve enseguida, pero
  // la app sigue abriendo en el metro sin señal.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))),
  );
});
