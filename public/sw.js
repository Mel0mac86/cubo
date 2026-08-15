/**
 * Service worker di Rubik Hero.
 *
 * Serve a una cosa sola: far funzionare l'app anche senza rete. Una volta
 * aperta la prima volta, il bambino puo' risolvere il cubo in macchina, in
 * aereo o dove il telefono non prende. Tutto il calcolo (solver, validatore,
 * riconoscimento colori) gira gia' sul dispositivo, quindi basta avere i file.
 *
 * Due strategie diverse, per due problemi diversi:
 *
 *  - I file con il nome che contiene l'impronta (index-<hash>.js) non cambiano
 *    mai a parita' di nome: si servono dalla cache senza nemmeno chiedere alla
 *    rete. E' quello che rende l'avvio istantaneo.
 *  - index.html e il manifest invece cambiano a ogni pubblicazione: si prova
 *    prima la rete e si usa la cache solo se non risponde. Senza questo, dopo
 *    un aggiornamento il telefono resterebbe con la versione vecchia.
 */

const VERSIONE = 'rubik-hero-v1';

/**
 * Quello che serve per mostrare qualcosa anche partendo da zero.
 *
 * Percorsi RELATIVI all'ambito del service worker: cosi funzionano sia se il
 * sito sta alla radice del dominio, sia se sta in una sottocartella come
 * accade su GitHub Pages (/cubo/).
 */
const BASE = new URL('./', self.location).pathname;
const GUSCIO = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'apple-touch-icon.png',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'icon-maskable-512.png',
  BASE + 'favicon.png',
];

/**
 * Trova il pacchetto JavaScript dell'app leggendolo da index.html.
 *
 * Non possiamo scriverne il nome qui dentro: contiene l'impronta del contenuto
 * e cambia a ogni pubblicazione. E non basta aspettare che lo chieda la pagina,
 * perche' alla PRIMA visita il pacchetto viene scaricato prima che il service
 * worker sia attivo, quindi non passerebbe mai di qui e non finirebbe in cache.
 * Risultato: chi apriva l'app e poi restava senza rete senza aver mai
 * ricaricato trovava una pagina vuota. Quindi ce lo andiamo a cercare da soli.
 */
async function trovaPacchetti() {
  const trovati = [];
  try {
    const res = await fetch(BASE + 'index.html', { cache: 'no-store' });
    const html = await res.text();
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      trovati.push(new URL(m[1], self.location).href);
    }
    for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) {
      trovati.push(new URL(m[1], self.location).href);
    }
  } catch {
    // Senza rete durante l'installazione non c'e' niente da fare: si riprovera'
    // alla prossima apertura.
  }
  return trovati;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSIONE);
      const tutto = [...GUSCIO, ...(await trovaPacchetti())];
      // addAll fallisce tutto insieme se manca un file: li aggiungiamo uno a
      // uno, cosi un'icona assente non impedisce l'installazione.
      await Promise.all(
        tutto.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Via le cache delle versioni precedenti.
      const nomi = await caches.keys();
      await Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Vero per i file il cui nome contiene gia' l'impronta del contenuto. */
function haImpronta(url) {
  return /\.[0-9a-f]{8,}\.(js|css|png|jpg|jpeg|svg|woff2?|ttf)$/i.test(url.pathname) ||
    /\/_expo\/static\//.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const richiesta = event.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);

  // Non tocchiamo le richieste verso altri siti (per esempio Gemini): devono
  // fallire subito quando non c'e' rete, non restare appese.
  if (url.origin !== self.location.origin) return;

  // Navigazione (l'utente apre l'app o ricarica): prima la rete, poi la cache.
  if (richiesta.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const risposta = await fetch(richiesta);
          const cache = await caches.open(VERSIONE);
          cache.put(BASE + 'index.html', risposta.clone());
          return risposta;
        } catch {
          const cache = await caches.open(VERSIONE);
          return (
            (await cache.match(BASE + 'index.html')) ??
            (await cache.match(BASE)) ??
            new Response(
              '<h1>Rubik Hero</h1><p>Apri l app almeno una volta con la rete, poi funzionera anche senza.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            )
          );
        }
      })(),
    );
    return;
  }

  // File con impronta nel nome: cache prima, e se manca si scarica e si salva.
  if (haImpronta(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSIONE);
        const salvato = await cache.match(richiesta);
        if (salvato) return salvato;
        const risposta = await fetch(richiesta);
        if (risposta.ok) cache.put(richiesta, risposta.clone());
        return risposta;
      })(),
    );
    return;
  }

  // Tutto il resto: rete, con la cache come rete di sicurezza.
  event.respondWith(
    (async () => {
      try {
        const risposta = await fetch(richiesta);
        if (risposta.ok) {
          const cache = await caches.open(VERSIONE);
          cache.put(richiesta, risposta.clone());
        }
        return risposta;
      } catch {
        const cache = await caches.open(VERSIONE);
        const salvato = await cache.match(richiesta);
        if (salvato) return salvato;
        throw new Error('Non disponibile senza rete');
      }
    })(),
  );
});
