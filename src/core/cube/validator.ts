/**
 * Validatore del cubo — gli 8 controlli richiesti prima di chiamare il solver.
 *
 * Ogni controllo restituisce, oltre all'esito, i facelet "sospetti" e un
 * suggerimento su cosa probabilmente e' stato letto male. L'interfaccia per
 * bambini usa queste informazioni per dire "controlliamo questo quadratino",
 * mai per mostrare un errore tecnico.
 */

import {
  CORNER_COUNT,
  CORNER_FACE,
  CORNER_FACELET,
  EDGE_COUNT,
  EDGE_FACE,
  EDGE_FACELET,
  Face,
  FACE_ORDER,
  OPPOSITE_FACE,
} from './defs';
import { CubieCube, FaceletParseError, FaceletState, faceletToCubie } from './cubie';

export type CheckId =
  | 'stickers'
  | 'counts'
  | 'centers'
  | 'corners'
  | 'edges'
  | 'orientation'
  | 'permutation'
  | 'solvable';

export interface CheckResult {
  id: CheckId;
  /** Titolo mostrato al bambino durante l'animazione di controllo. */
  label: string;
  ok: boolean;
  /** Messaggio in linguaggio semplice, mostrato solo se `ok` e' falso. */
  message?: string;
  /** Facelet da evidenziare (0..53). */
  suspects?: number[];
  /** Suggerimento: facelet -> colore probabilmente corretto. */
  suggestion?: { facelet: number; shouldBe: Face }[];
}

export interface ValidationReport {
  valid: boolean;
  checks: CheckResult[];
  /** Presente solo se tutti i controlli passano. */
  cube?: CubieCube;
  /** Tutti i facelet sospetti, ordinati per "quanto e' probabile l'errore". */
  suspects: number[];
  /** Le facce (0..5) piu' probabilmente lette male: utile per "riscansiona questa faccia". */
  suspectFaces: Face[];
}

const CHECK_LABELS: Record<CheckId, string> = {
  stickers: 'Ci sono tutti i 54 quadratini',
  counts: 'Ogni colore compare 9 volte',
  centers: 'I 6 centri sono tutti diversi',
  corners: 'Gli angolini sono tutti giusti',
  edges: 'I pezzi laterali sono tutti giusti',
  orientation: 'I pezzi sono girati bene',
  permutation: 'I pezzi sono al posto giusto',
  solvable: 'Il cubo si puo davvero risolvere',
};

function pass(id: CheckId): CheckResult {
  return { id, label: CHECK_LABELS[id], ok: true };
}

function fail(
  id: CheckId,
  message: string,
  suspects: number[] = [],
  suggestion?: { facelet: number; shouldBe: Face }[],
): CheckResult {
  return { id, label: CHECK_LABELS[id], ok: false, message, suspects, suggestion };
}

/** Faccia (0..5) a cui appartiene un facelet. */
export function faceletFace(idx: number): Face {
  return Math.floor(idx / 9) as Face;
}

/**
 * Esegue tutti i controlli, fermandosi al primo che fallisce
 * (i controlli successivi non avrebbero senso su dati incoerenti).
 */
export function validateFacelets(f: (Face | null)[]): ValidationReport {
  const checks: CheckResult[] = [];
  const suspects = new Set<number>();

  const add = (r: CheckResult): boolean => {
    checks.push(r);
    r.suspects?.forEach((s) => suspects.add(s));
    return r.ok;
  };

  const finish = (valid: boolean, cube?: CubieCube): ValidationReport => {
    // Riempi i controlli non eseguiti come "non verificati" (ok=false, senza messaggio)
    const done = new Set(checks.map((c) => c.id));
    const order: CheckId[] = [
      'stickers',
      'counts',
      'centers',
      'corners',
      'edges',
      'orientation',
      'permutation',
      'solvable',
    ];
    for (const id of order) {
      if (!done.has(id)) checks.push({ id, label: CHECK_LABELS[id], ok: false });
    }
    checks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const suspectList = [...suspects];
    const faceScore = new Map<Face, number>();
    for (const s of suspectList) {
      const fc = faceletFace(s);
      faceScore.set(fc, (faceScore.get(fc) ?? 0) + 1);
    }
    const suspectFaces = [...faceScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fc]) => fc);
    return { valid, checks, cube, suspects: suspectList, suspectFaces };
  };

  /* CONTROLLO 1 — 54 sticker presenti */
  if (f.length !== 54) {
    add(fail('stickers', 'Mi mancano alcuni quadratini del cubo!'));
    return finish(false);
  }
  const missing: number[] = [];
  for (let i = 0; i < 54; i++) if (f[i] === null || f[i] === undefined) missing.push(i);
  if (missing.length > 0) {
    add(
      fail(
        'stickers',
        missing.length === 1
          ? 'Manca il colore di un quadratino!'
          : `Mancano ancora ${missing.length} quadratini!`,
        missing,
      ),
    );
    return finish(false);
  }
  add(pass('stickers'));
  const g = f as Face[];

  /* CONTROLLO 2 — 9 sticker per colore */
  const counts = new Array(6).fill(0);
  for (const c of g) counts[c]++;
  const wrongCounts = FACE_ORDER.filter((c) => counts[c] !== 9);
  if (wrongCounts.length > 0) {
    const tooMany = FACE_ORDER.filter((c) => counts[c] > 9);
    const tooFew = FACE_ORDER.filter((c) => counts[c] < 9);
    const sus: number[] = [];
    for (let i = 0; i < 54; i++) if (tooMany.includes(g[i])) sus.push(i);
    const suggestion = tooFew.length === 1 ? sus.map((i) => ({ facelet: i, shouldBe: tooFew[0] })) : undefined;
    add(
      fail(
        'counts',
        'Un colore compare troppe volte e un altro troppo poche. Ne abbiamo colorato uno di troppo!',
        sus,
        suggestion,
      ),
    );
    return finish(false);
  }
  add(pass('counts'));

  /* CONTROLLO 3 — 6 centri coerenti (tutti diversi) */
  const centers = FACE_ORDER.map((face) => g[face * 9 + 4]);
  const centerSet = new Set(centers);
  if (centerSet.size !== 6) {
    const sus: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (centers.filter((c) => c === centers[i]).length > 1) sus.push(i * 9 + 4);
    }
    add(fail('centers', 'Due facce hanno lo stesso colore al centro: una delle due non torna!', sus));
    return finish(false);
  }
  // I centri devono anche rispettare le coppie opposte del cubo reale:
  // il centro della faccia X e' per definizione il colore X, quindi qui
  // controlliamo che l'utente non abbia dichiarato un centro incoerente.
  const centerMismatch: number[] = [];
  for (const face of FACE_ORDER) {
    if (g[face * 9 + 4] !== face) centerMismatch.push(face * 9 + 4);
  }
  if (centerMismatch.length > 0) {
    add(
      fail(
        'centers',
        'I centri non corrispondono alle facce. I centri non si muovono mai: sono loro a dire di che colore e ogni faccia!',
        centerMismatch,
      ),
    );
    return finish(false);
  }
  add(pass('centers'));

  /* CONTROLLI 4 e 5 — angoli e spigoli esistenti e non ripetuti */
  let cube: CubieCube;
  try {
    cube = faceletToCubie(g);
  } catch (e) {
    if (e instanceof FaceletParseError) {
      const isCorner = e.code.startsWith('corner');
      const id: CheckId = isCorner ? 'corners' : 'edges';
      const msg = isCorner
        ? 'Uno degli angolini ha una combinazione di colori che su un vero cubo non esiste.'
        : 'Uno dei pezzi laterali ha due colori che su un vero cubo non stanno mai insieme.';
      add(fail(id, msg, e.suspects, suggestForImpossiblePiece(g, e.suspects, isCorner)));
      return finish(false);
    }
    throw e;
  }

  const cornerDupes = duplicates(Array.from(cube.cp));
  if (cornerDupes.length > 0) {
    const sus: number[] = [];
    for (let i = 0; i < CORNER_COUNT; i++) {
      if (cornerDupes.includes(cube.cp[i])) sus.push(...CORNER_FACELET[i]);
    }
    add(fail('corners', 'Ho trovato due angolini identici: uno dei due e stato letto male.', sus));
    return finish(false);
  }
  add(pass('corners'));

  const edgeDupes = duplicates(Array.from(cube.ep));
  if (edgeDupes.length > 0) {
    const sus: number[] = [];
    for (let i = 0; i < EDGE_COUNT; i++) {
      if (edgeDupes.includes(cube.ep[i])) sus.push(...EDGE_FACELET[i]);
    }
    add(fail('edges', 'Ho trovato due pezzi laterali identici: uno dei due e stato letto male.', sus));
    return finish(false);
  }
  add(pass('edges'));

  /* CONTROLLO 6 — orientamento */
  let coSum = 0;
  for (let i = 0; i < CORNER_COUNT; i++) coSum += cube.co[i];
  let eoSum = 0;
  for (let i = 0; i < EDGE_COUNT; i++) eoSum += cube.eo[i];

  const orientationProblems: string[] = [];
  const orientationSuspects: number[] = [];
  if (coSum % 3 !== 0) {
    orientationProblems.push('angolino');
    for (let i = 0; i < CORNER_COUNT; i++) if (cube.co[i] !== 0) orientationSuspects.push(...CORNER_FACELET[i]);
  }
  if (eoSum % 2 !== 0) {
    orientationProblems.push('pezzo laterale');
    for (let i = 0; i < EDGE_COUNT; i++) if (cube.eo[i] !== 0) orientationSuspects.push(...EDGE_FACELET[i]);
  }
  if (orientationProblems.length > 0) {
    add(
      fail(
        'orientation',
        `Un ${orientationProblems[0]} sembra girato in un modo impossibile: i suoi colori sono probabilmente scambiati fra loro.`,
        orientationSuspects,
      ),
    );
    return finish(false);
  }
  add(pass('orientation'));

  /* CONTROLLO 7 — permutazione (parita' uguale fra angoli e spigoli) */
  const cornerParity = permutationParity(Array.from(cube.cp));
  const edgeParity = permutationParity(Array.from(cube.ep));
  if (cornerParity !== edgeParity) {
    // Tipico di due sticker scambiati fra due pezzi diversi.
    add(
      fail(
        'permutation',
        'Sembra che due quadratini si siano scambiati di posto: cosi il cubo non potrebbe esistere davvero.',
        [],
      ),
    );
    return finish(false);
  }
  add(pass('permutation'));

  /* CONTROLLO 8 — risolvibilita' (garantita dai controlli 1-7 insieme) */
  add(pass('solvable'));
  return finish(true, cube);
}

/** Comodo per lo stato completo gia' noto come Face[]. */
export function validate(f: FaceletState): ValidationReport {
  return validateFacelets(f);
}

/* ------------------------------------------------------------------ */
/* Utilita'                                                            */
/* ------------------------------------------------------------------ */

function duplicates(arr: number[]): number[] {
  const seen = new Map<number, number>();
  for (const v of arr) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([v]) => v);
}

/** Parita' di una permutazione (0 = pari, 1 = dispari). */
export function permutationParity(p: number[]): number {
  let parity = 0;
  const a = p.slice();
  for (let i = 0; i < a.length; i++) {
    while (a[i] !== i) {
      const j = a[i];
      [a[i], a[j]] = [a[j], a[i]];
      parity ^= 1;
    }
  }
  return parity;
}

/**
 * Quando un pezzo ha una combinazione impossibile, prova a indovinare quale
 * sticker e' quello sbagliato: e' quello il cui colore, se cambiato, rende il
 * pezzo esistente. Restituisce i candidati piu' plausibili.
 */
function suggestForImpossiblePiece(
  g: Face[],
  suspects: number[],
  isCorner: boolean,
): { facelet: number; shouldBe: Face }[] {
  const out: { facelet: number; shouldBe: Face }[] = [];
  const pieces = isCorner ? CORNER_FACE : EDGE_FACE;
  const current = suspects.map((s) => g[s]);

  // Un errore ricorrente: due colori opposti sullo stesso pezzo (impossibile).
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      if (OPPOSITE_FACE[current[i]] === current[j]) {
        // Uno dei due e' sbagliato: proponi i colori che renderebbero il pezzo valido.
        for (const [idx, other] of [
          [i, current[j]],
          [j, current[i]],
        ] as [number, Face][]) {
          const keep = current.filter((_, k) => k !== idx);
          for (const p of pieces) {
            const set = new Set(p as readonly Face[]);
            if (keep.every((c) => set.has(c))) {
              for (const cand of p) {
                if (!keep.includes(cand)) out.push({ facelet: suspects[idx], shouldBe: cand });
              }
            }
          }
        }
      }
    }
  }
  // Deduplica
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.facelet}:${s.shouldBe}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
