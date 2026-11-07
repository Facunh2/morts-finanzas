// Service worker: deja la app instalable y abrible sin señal, y recibe los
// audios / capturas que se comparten a la app desde WhatsApp o la galería (Android).
const VERSION = 'finanzas-v2';
const ARCHIVOS = [
  './', './index.html', './css/aero.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/categorias.js', './js/calc.js', './js/lector.js', './js/config.js',
  './img/fondo-depto.jpg', './img/fondo-edificios.jpg', './img/fondo-balcon.jpg',
  './img/icono-192.png', './img/icono-512.png', './img/icono-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'compartidos').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Compartir a la app (Android): guardar los archivos y abrir la app para que los lea.
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartir')) {
    e.respondWith((async () => {
      const datos = await e.request.formData();
      const cache = await caches.open('compartidos');
      let n = 0;
      for (const f of datos.getAll('archivos')) {
        if (!(f instanceof File)) continue;
        await cache.put(`./compartido/${Date.now()}-${n++}`, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
      }
      const texto = [datos.get('titulo'), datos.get('texto')].filter(Boolean).join(' ');
      if (texto) await cache.put(`./compartido/${Date.now()}-texto`, new Response(texto, { headers: { 'Content-Type': 'text/plain' } }));
      return Response.redirect('./?compartido=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Red primero (para ver siempre lo último); si no hay señal, lo guardado.
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
