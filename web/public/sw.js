/**
 * Service worker: rende l'app utilizzabile anche senza connessione.
 *
 * - i file dell'app (guscio) vengono messi in cache e serviti offline;
 * - le chiamate GET alle API usano "network first" con copia in cache:
 *   se la rete manca si mostra l'ultimo dato conosciuto;
 * - le chiamate di scrittura NON vengono mai messe in cache: quando la rete
 *   manca l'app le accoda in locale e le rimanda con /sync.
 */
const VERSIONE = 'mma-v2';
const GUSCIO = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSIONE)
      // addAll fallisce in blocco se anche un solo file manca: meglio uno alla volta
      .then((c) => Promise.all(GUSCIO.map((url) => c.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const richiesta = event.request;
  const url = new URL(richiesta.url);
  if (richiesta.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(richiesta)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(VERSIONE).then((c) => c.put(richiesta, copia));
          return risposta;
        })
        .catch(() => caches.match(richiesta).then((c) => c ?? new Response(JSON.stringify({ offline: true }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        }))),
    );
    return;
  }

  event.respondWith(
    caches.match(richiesta).then((inCache) =>
      inCache ??
      fetch(richiesta)
        .then((risposta) => {
          if (risposta.ok && url.origin === location.origin) {
            const copia = risposta.clone();
            caches.open(VERSIONE).then((c) => c.put(richiesta, copia));
          }
          return risposta;
        })
        .catch(() => caches.match('/index.html')),
    ),
  );
});
