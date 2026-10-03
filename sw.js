/* Service worker: permite instalar la app y abrirla aunque no haya internet.
   Sube el número de versión (CACHE) cada vez que cambies los archivos. */
const CACHE = 'spe-v7';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/core.js', 'js/math.js', 'js/data.js', 'js/api.js', 'js/router.js', 'js/auth.js', 'js/dashboard.js', 'js/insights.js',
  'js/home.js', 'js/exam.js', 'js/results.js', 'js/images.js', 'js/admin.js', 'js/main.js'
];

self.addEventListener('install', e => {
  // 'no-store' en cada copia: el pre-cacheo nunca guarda un archivo viejo
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'no-store' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* Solo los archivos estáticos se sirven desde caché.
   Todo lo demás (la API: /examenes, /intentos, /auth, /admin, …) va SIEMPRE a la red
   para que nunca se sirvan respuestas viejas. */
const esArchivo = url => url.origin === location.origin &&
  (/\.(js|css|png|jpe?g|webp|svg|ico|woff2?|ttf)$/.test(url.pathname) || url.pathname === '/manifest.webmanifest');

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // 'no-store': la red manda SIEMPRE, sin pasar por la caché HTTP del navegador
  // (si no, el navegador puede devolver un JS viejo aunque el servidor ya esté actualizado)
  const irARed = () => fetch(req.url, { cache: 'no-store', credentials: req.credentials, redirect: 'follow' });
  if (req.mode === 'navigate') {                            // páginas: red primero; sin internet, la copia guardada
    e.respondWith(irARed().catch(() => caches.match('index.html')));
    return;
  }
  if (!esArchivo(url)) return;                              // API o externos: fuera del interceptor
  e.respondWith(                                            // archivos: red primero (siempre el último código)
    irARed().then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req))                       // sin internet: copia guardada
  );
});
