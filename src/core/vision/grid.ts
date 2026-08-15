/**
 * Trovare il cubo dentro la fotografia.
 *
 * La versione precedente dava per scontato che il cubo riempisse la cornice di
 * guida e fosse dritto: campionava i nove quadratini a un terzo e due terzi
 * della cornice. Bastava che il bambino tenesse il cubo un po' inclinato, o
 * piu' lontano, o non centrato, e i punti campionati finivano sui quadratini
 * vicini o sullo sfondo — con il risultato peggiore possibile: colori sbagliati
 * dichiarati con sicurezza. Misurato: il 25% di letture corrette con il cubo
 * lontano e spostato, pur "trovando la griglia" quasi sempre.
 *
 * Qui il cubo viene cercato davvero, in tre passi:
 *
 *  1. INCLINAZIONE. Gli spazi neri fra gli adesivi formano due famiglie di
 *     rette parallele. Proiettando il gradiente lungo direzioni ruotate, la
 *     proiezione ha picchi netti solo quando la direzione e' allineata a quelle
 *     rette: l'angolo migliore e' l'inclinazione del cubo.
 *  2. POSIZIONE E DIMENSIONE. Lungo ciascun asse ci sono esattamente QUATTRO
 *     rette equidistanti (i due bordi e le due separazioni interne). Le
 *     cerchiamo con un "pettine": si prova ogni combinazione di posizione e
 *     passo e si tiene quella che raccoglie piu' gradiente. Cosi il cubo viene
 *     trovato ovunque sia e di qualunque dimensione.
 *  3. PROSPETTIVA. I quattro angoli trovati vengono aggiustati uno alla volta
 *     per far cadere le rette interne dove il gradiente e' piu' forte: cosi
 *     anche un cubo inclinato in avanti viene seguito correttamente.
 */

import { Mat3, Quad, applyMat, centroQuad, latoMedio, quadFromUnitSquare } from './homography';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridResult {
  found: boolean;
  /** I quattro angoli del cubo nella fotografia. */
  quad: Quad;
  /** Omografia dal quadrato unitario al cubo trovato. */
  H: Mat3;
  /** Quanto sono nette le separazioni fra gli adesivi (0..1). */
  strength: number;
  /** Quanto della cornice di guida e' occupato dal cubo (0..1). */
  coverage: number;
  /** Inclinazione stimata, in gradi. */
  rotation: number;
  /**
   * Come e' stato trovato: serve al fotogramma successivo per ripartire da qui
   * invece che da zero.
   */
  params?: {
    theta: number;
    uA: number;
    vA: number;
    passoU: number;
    passoV: number;
    punteggio: number;
  };
}

/** Griglia "di ripiego" che occupa tutta la regione, quando non troviamo niente. */
function grigliaVuota(r: Rect): GridResult {
  const quad: Quad = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
  return { found: false, quad, H: quadFromUnitSquare(quad), strength: 0, coverage: 0, rotation: 0 };
}

/* ------------------------------------------------------------------ */
/* Gradienti                                                           */
/* ------------------------------------------------------------------ */

export interface Gradienti {
  gx: Float32Array;
  gy: Float32Array;
  w: number;
  h: number;
}

export function gradienti(gray: Float32Array, w: number, h: number): Gradienti {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = (gray[i + 1] - gray[i - 1]) * 0.5;
      gy[i] = (gray[i + w] - gray[i - w]) * 0.5;
    }
  }
  return { gx, gy, w, h };
}

/**
 * Proietta il gradiente lungo la direzione `theta`, accumulando in celle di un
 * pixel. I picchi del profilo sono le rette perpendicolari a quella direzione.
 */
function profilo(
  g: Gradienti,
  regione: Rect,
  theta: number,
  origine: number,
  lunghezza: number,
): Float32Array {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const out = new Float32Array(lunghezza);
  const x0 = Math.max(1, Math.floor(regione.x));
  const y0 = Math.max(1, Math.floor(regione.y));
  const x1 = Math.min(g.w - 1, Math.ceil(regione.x + regione.w));
  const y1 = Math.min(g.h - 1, Math.ceil(regione.y + regione.h));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * g.w + x;
      // Componente del gradiente nella direzione considerata: e' grande solo
      // sulle rette perpendicolari a quella direzione.
      const d = Math.abs(g.gx[i] * cos + g.gy[i] * sin);
      if (d < 4) continue; // il rumore non ci interessa
      const u = Math.round(x * cos + y * sin - origine);
      if (u >= 0 && u < lunghezza) out[u] += d;
    }
  }
  return out;
}

/** Massimo del profilo in una finestra, per tollerare qualche pixel di errore. */
function massimoIntorno(p: Float32Array, pos: number, raggio: number): number {
  let m = 0;
  const a = Math.max(0, Math.round(pos - raggio));
  const b = Math.min(p.length - 1, Math.round(pos + raggio));
  for (let i = a; i <= b; i++) if (p[i] > m) m = p[i];
  return m;
}

/**
 * Il "pettine": cerca quattro rette equidistanti che raccolgano piu' gradiente
 * possibile. Restituisce la posizione della prima e il passo.
 */
function pettine(
  p: Float32Array,
  passoMin: number,
  passoMax: number,
  passoStep = 0.5,
  inizioMin = 0,
  inizioMax = Number.POSITIVE_INFINITY,
): { inizio: number; passo: number; punteggio: number } {
  let best = { inizio: 0, passo: passoMin, punteggio: -1 };
  const raggio = 1.5;
  for (let passo = passoMin; passo <= passoMax; passo += passoStep) {
    const estensione = passo * 3;
    const da = Math.max(0, Math.floor(inizioMin));
    const a = Math.min(p.length - estensione - 1, Math.ceil(inizioMax));
    for (let inizio = da; inizio <= a; inizio += 1) {
      const s =
        massimoIntorno(p, inizio, raggio) +
        massimoIntorno(p, inizio + passo, raggio) +
        massimoIntorno(p, inizio + 2 * passo, raggio) +
        massimoIntorno(p, inizio + 3 * passo, raggio);
      if (s > best.punteggio) best = { inizio, passo, punteggio: s };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Ricerca completa                                                    */
/* ------------------------------------------------------------------ */

export interface DetectOptions {
  /** Inclinazione massima cercata, in gradi. */
  inclinazioneMax?: number;
  /** Passo della ricerca dell'inclinazione, in gradi. */
  passoAngolo?: number;
  /** Quanto piccolo puo' essere il cubo rispetto al lato della regione. */
  minLato?: number;
  maxLato?: number;
  /** Quanti giri di aggiustamento degli angoli. */
  giriRifinitura?: number;
  /**
   * Risultato del fotogramma precedente. Se c'e', la ricerca parte da li' ed e'
   * molto piu' veloce: fra un fotogramma e l'altro il cubo si sposta di poco.
   */
  precedente?: GridResult;
}

export function trovaCubo(
  gray: Float32Array,
  w: number,
  h: number,
  regione: Rect,
  opt: DetectOptions = {},
): GridResult {
  const inclMax = opt.inclinazioneMax ?? 20;
  const passoAng = opt.passoAngolo ?? 2.5;
  const minLato = opt.minLato ?? 0.34;
  const maxLato = opt.maxLato ?? 1.05;

  const g = gradienti(gray, w, h);
  const lato = Math.min(regione.w, regione.h);
  const passoMin = (lato * minLato) / 3;
  const passoMax = (lato * maxLato) / 3;

  // La proiezione puo' uscire dai bordi: teniamo un intervallo generoso.
  const diag = Math.ceil(Math.hypot(w, h)) + 2;

  type Trovato = {
    theta: number;
    u: { inizio: number; passo: number; punteggio: number };
    v: { inizio: number; passo: number; punteggio: number };
    punteggio: number;
  };

  const cerca = (
    gradiDa: number,
    gradiA: number,
    passoGradi: number,
    pMin: number,
    pMax: number,
    pStep: number,
    finestra?: { u: number; v: number; raggio: number },
  ): Trovato | null => {
    let best: Trovato | null = null;
    for (let gradi = gradiDa; gradi <= gradiA + 1e-6; gradi += passoGradi) {
      const theta = (gradi * Math.PI) / 180;
      const pu = profilo(g, regione, theta, -diag, diag * 2);
      const pv = profilo(g, regione, theta + Math.PI / 2, -diag, diag * 2);
      const cu = pettine(
        pu,
        pMin,
        pMax,
        pStep,
        finestra ? finestra.u - finestra.raggio : 0,
        finestra ? finestra.u + finestra.raggio : Number.POSITIVE_INFINITY,
      );
      const cv = pettine(
        pv,
        pMin,
        pMax,
        pStep,
        finestra ? finestra.v - finestra.raggio : 0,
        finestra ? finestra.v + finestra.raggio : Number.POSITIVE_INFINITY,
      );
      // Il cubo e' (quasi) quadrato: penalizziamo passi molto diversi fra i due assi.
      const rapporto = Math.min(cu.passo, cv.passo) / Math.max(cu.passo, cv.passo);
      const punteggio = (cu.punteggio + cv.punteggio) * Math.pow(rapporto, 3);
      if (!best || punteggio > best.punteggio) best = { theta, u: cu, v: cv, punteggio };
    }
    return best;
  };

  /*
   * Ricerca in due passate invece che una sola fitta: prima si guarda largo e
   * grossolano, poi si stringe intorno al migliore. A parita' di risultato
   * costa circa un quinto, e su un telefono la differenza si sente tutta.
   *
   * Se il fotogramma precedente aveva trovato il cubo, partiamo da li': fra un
   * fotogramma e l'altro il cubo non si teleporta, quindi basta guardare un
   * intorno stretto. E' il caso piu' frequente durante una scansione.
   */
  let migliore: Trovato | null = null;
  const prec = opt.precedente;

  if (prec?.found && prec.params) {
    const gradi = (prec.params.theta * 180) / Math.PI;
    migliore = cerca(
      gradi - 5,
      gradi + 5,
      2.5,
      Math.max(passoMin, prec.params.passoU * 0.85),
      Math.min(passoMax, prec.params.passoU * 1.15),
      0.5,
      { u: prec.params.uA + diag, v: prec.params.vA + diag, raggio: 12 },
    );
    // Se l'inseguimento non convince, si riparte da capo.
    if (migliore && migliore.punteggio < (prec.params.punteggio ?? 0) * 0.5) migliore = null;
  }

  if (!migliore) {
    const grossolano = cerca(-inclMax, inclMax, passoAng * 2, passoMin, passoMax, 2);
    if (grossolano) {
      const gradi = (grossolano.theta * 180) / Math.PI;
      migliore =
        cerca(
          gradi - passoAng * 2,
          gradi + passoAng * 2,
          passoAng,
          Math.max(passoMin, grossolano.u.passo - 3),
          Math.min(passoMax, grossolano.u.passo + 3),
          0.5,
        ) ?? grossolano;
    }
  }

  if (!migliore || migliore.punteggio <= 0) return grigliaVuota(regione);

  // Dalle due famiglie di rette ricaviamo i quattro angoli.
  const { theta, u, v } = migliore;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const uA = u.inizio - diag;
  const uB = uA + u.passo * 3;
  const vA = v.inizio - diag;
  const vB = vA + v.passo * 3;

  // Punto che ha coordinata `a` lungo l'asse u e `b` lungo l'asse v.
  const punto = (a: number, b: number): [number, number] => [
    a * cos - b * sin,
    a * sin + b * cos,
  ];

  let quad: Quad = [punto(uA, vA), punto(uB, vA), punto(uB, vB), punto(uA, vB)];

  // Aggiustamento degli angoli: recupera la prospettiva.
  quad = rifinisci(g, quad, opt.giriRifinitura ?? 3);

  const H = quadFromUnitSquare(quad);
  const forza = punteggioGriglia(g, H);
  const l = latoMedio(quad);
  const coverage = Math.min(1, l / lato);

  // Il cubo deve stare (quasi) dentro la regione inquadrata.
  const [cx, cy] = centroQuad(quad);
  const dentro =
    cx > regione.x - l * 0.25 &&
    cx < regione.x + regione.w + l * 0.25 &&
    cy > regione.y - l * 0.25 &&
    cy < regione.y + regione.h + l * 0.25;

  const found = dentro && forza > 0.12 && coverage > 0.25;

  return {
    found,
    quad,
    H,
    strength: Math.min(1, forza),
    coverage,
    rotation: (theta * 180) / Math.PI,
    params: {
      theta,
      uA,
      vA,
      passoU: u.passo,
      passoV: v.passo,
      punteggio: migliore.punteggio,
    },
  };
}

/**
 * Quanto gradiente cade sulle otto rette della griglia (i due bordi e le due
 * separazioni interne, per ciascuna direzione). E' il punteggio da massimizzare.
 */
function punteggioGriglia(g: Gradienti, H: Mat3): number {
  let somma = 0;
  let n = 0;
  const campiona = (u: number, v: number) => {
    const [x, y] = applyMat(H, u, v);
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 1 || yi < 1 || xi >= g.w - 1 || yi >= g.h - 1) return;
    const i = yi * g.w + xi;
    somma += Math.hypot(g.gx[i], g.gy[i]);
    n++;
  };
  for (const t of [0, 1 / 3, 2 / 3, 1]) {
    for (let k = 1; k < 20; k++) {
      const s = k / 20;
      campiona(t, s);
      campiona(s, t);
    }
  }
  // Normalizziamo: 60 e' un valore di gradiente robusto su un bordo netto.
  return n === 0 ? 0 : somma / n / 60;
}

/** Sposta i quattro angoli finche' le rette della griglia non cadono meglio. */
function rifinisci(g: Gradienti, quad: Quad, giri: number): Quad {
  let corrente: [number, number][] = quad.map((p) => [p[0], p[1]]);
  let meglio = punteggioGriglia(g, quadFromUnitSquare(corrente as unknown as Quad));

  for (let giro = 0; giro < giri; giro++) {
    const passo = giro === 0 ? 3 : giro === 1 ? 2 : 1;
    let migliorato = false;
    for (let i = 0; i < 4; i++) {
      for (const [dx, dy] of [
        [passo, 0],
        [-passo, 0],
        [0, passo],
        [0, -passo],
      ]) {
        const prova = corrente.map((p, k) =>
          k === i ? ([p[0] + dx, p[1] + dy] as [number, number]) : p,
        );
        const s = punteggioGriglia(g, quadFromUnitSquare(prova as unknown as Quad));
        if (s > meglio) {
          meglio = s;
          corrente = prova;
          migliorato = true;
        }
      }
    }
    if (!migliorato && passo === 1) break;
  }
  return corrente as unknown as Quad;
}
