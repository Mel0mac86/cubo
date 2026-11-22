/**
 * I controlli del cubo 4x4, prima di provare a risolverlo.
 *
 * Non sono gli stessi del 3x3, e le differenze contano:
 *
 *  - Ogni colore compare 16 volte, non 9.
 *  - I centri NON dicono di che faccia si tratta: sono quattro per faccia e si
 *    muovono. A dire lo schema dei colori sono gli angoli.
 *  - Le PARITA' SONO LECITE. Uno spigolo girato da solo, su un 3x3, e' la
 *    prova che il cubo e' stato letto male; su un 4x4 e' una situazione
 *    normalissima. Rifiutarla manderebbe il bambino a ricontrollare colori
 *    giusti all'infinito.
 *
 * Resta invece vero, e si controlla, che gli angoli non possano essere girati
 * in un modo impossibile: quello e' un invariante anche sul cubo grande.
 */

import { CubeColor } from '../cube/defs';
import { CheckId, CheckResult } from '../cube/validator';
import { ALETTE, ANGOLI, PER_FACCIA, QUADRATINI, Stato4, centriDi } from './cube4';
import { ANGOLI_ORARI, Schema4, coppieOpposte, schemaMigliore, schemiPossibili } from './schema4';

export type CheckId4 = 'stickers' | 'counts' | 'centri' | 'angoli' | 'alette' | 'orientation';

export interface Rapporto4 {
  valid: boolean;
  checks: CheckResult[];
  suspects: number[];
  schema: Schema4 | null;
}

const ETICHETTE: Record<CheckId4, string> = {
  stickers: 'Ci sono tutti i 96 quadratini',
  counts: 'Ogni colore compare 16 volte',
  centri: 'I quadratini in mezzo sono quattro per colore',
  angoli: 'Gli angolini esistono davvero',
  alette: 'I pezzi di lato esistono davvero',
  orientation: 'Gli angolini sono girati bene',
};

function ok(id: CheckId4): CheckResult {
  return { id: id as CheckId, label: ETICHETTE[id], ok: true };
}
function no(id: CheckId4, messaggio: string, sospetti: number[] = []): CheckResult {
  return { id: id as CheckId, label: ETICHETTE[id], ok: false, message: messaggio, suspects: sospetti };
}

export function validaCubo4(colori: (CubeColor | null)[]): Rapporto4 {
  const checks: CheckResult[] = [];
  const sospetti = new Set<number>();
  const chiudi = (valido: boolean, schema: Schema4 | null = null): Rapporto4 => {
    const ordine: CheckId4[] = ['stickers', 'counts', 'centri', 'angoli', 'alette', 'orientation'];
    const fatti = new Set(checks.map((c) => c.id));
    for (const id of ordine) {
      if (!fatti.has(id as CheckId)) checks.push({ id: id as CheckId, label: ETICHETTE[id], ok: false });
    }
    checks.sort((a, b) => ordine.indexOf(a.id as CheckId4) - ordine.indexOf(b.id as CheckId4));
    return { valid: valido, checks, suspects: [...sospetti], schema };
  };
  const aggiungi = (r: CheckResult) => {
    checks.push(r);
    r.suspects?.forEach((x) => sospetti.add(x));
    return r.ok;
  };

  /* 1 — tutti i quadratini */
  if (colori.length !== QUADRATINI) {
    aggiungi(no('stickers', 'Mi mancano alcuni quadratini del cubo!'));
    return chiudi(false);
  }
  const mancanti: number[] = [];
  for (let i = 0; i < QUADRATINI; i++) if (colori[i] === null || colori[i] === undefined) mancanti.push(i);
  if (mancanti.length > 0) {
    aggiungi(
      no(
        'stickers',
        mancanti.length === 1 ? 'Manca il colore di un quadratino!' : `Mancano ancora ${mancanti.length} quadratini!`,
        mancanti,
      ),
    );
    return chiudi(false);
  }
  aggiungi(ok('stickers'));
  const s = Uint8Array.from(colori as CubeColor[]);

  /* 2 — sedici per colore */
  const conti = new Array(6).fill(0);
  for (const c of s) conti[c]++;
  if (conti.some((n) => n !== 16)) {
    const troppi = conti.map((n, c) => (n > 16 ? c : -1)).filter((c) => c >= 0);
    const sus: number[] = [];
    for (let i = 0; i < QUADRATINI; i++) if (troppi.includes(s[i])) sus.push(i);
    aggiungi(
      no(
        'counts',
        'Su un cubo grande ogni colore compare esattamente 16 volte: qui uno ce n e di piu e un altro di meno. Ricontiamoli insieme!',
        sus,
      ),
    );
    return chiudi(false);
  }
  aggiungi(ok('counts'));

  /* 3 — quattro pezzi centrali per colore */
  const contiCentri = new Array(6).fill(0);
  for (let f = 0; f < 6; f++) for (const i of centriDi(f)) contiCentri[s[i]]++;
  if (contiCentri.some((n) => n !== 4)) {
    const sus: number[] = [];
    for (let f = 0; f < 6; f++) for (const i of centriDi(f)) sus.push(i);
    aggiungi(
      no(
        'centri',
        'I quadratini in mezzo devono essere quattro per colore. Attento: sul cubo grande quelli in mezzo si spostano, quindi vanno guardati bene.',
        sus,
      ),
    );
    return chiudi(false);
  }
  aggiungi(ok('centri'));

  /* 4 — gli angoli devono poter esistere */
  const schemi = schemiPossibili(s);
  if (schemi.length === 0) {
    const sus = ANGOLI_ORARI.flatMap((t) => [...t]);
    aggiungi(
      no(
        'angoli',
        'Uno degli angolini ha una combinazione di colori che su un cubo vero non esiste.',
        sus,
      ),
    );
    return chiudi(false);
  }
  aggiungi(ok('angoli'));
  const schema = schemaMigliore(s)!;

  /* 5 — i pezzi di lato: ogni coppia di colori deve comparire due volte */
  const opposte = coppieOpposte(s);
  const eOpposti = (a: number, b: number) => !!opposte?.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const conteggio = new Map<string, number[]>();
  for (const al of ALETTE) {
    const a = s[al[0]];
    const b = s[al[1]];
    if (a === b || eOpposti(a, b)) {
      aggiungi(
        no(
          'alette',
          'Un pezzo di lato ha due colori che su un cubo vero non stanno mai insieme.',
          [...al],
        ),
      );
      return chiudi(false);
    }
    const k = `${Math.min(a, b)},${Math.max(a, b)}`;
    const l = conteggio.get(k) ?? [];
    l.push(...al);
    conteggio.set(k, l);
  }
  const sbagliate = [...conteggio.entries()].filter(([, l]) => l.length !== 4);
  if (sbagliate.length > 0) {
    aggiungi(
      no(
        'alette',
        'Ogni coppia di colori deve comparire su due pezzi di lato: qui qualcuna compare troppe volte e qualcun altra troppo poche.',
        sbagliate.flatMap(([, l]) => l),
      ),
    );
    return chiudi(false);
  }
  aggiungi(ok('alette'));

  /* 6 — gli angolini girati in modo possibile */
  const giroTotale = ANGOLI_ORARI.reduce((somma, tre) => {
    const facce = tre.map((i) => Math.floor(i / PER_FACCIA));
    // L'orientamento: a che posto, fra i tre, sta il colore che dovrebbe
    // guardare in su (o in giu). E' lo stesso conto del 3x3.
    const su = schema.coloreDiFaccia[0];
    const giu = schema.coloreDiFaccia[3];
    const k = tre.findIndex((i) => s[i] === su || s[i] === giu);
    // La posizione va confrontata con quella del quadratino che sta sulla
    // faccia di sopra o di sotto in questo angolo.
    const kFaccia = facce.findIndex((f) => f === 0 || f === 3);
    return somma + ((k - kFaccia + 3) % 3);
  }, 0);
  if (giroTotale % 3 !== 0) {
    aggiungi(
      no(
        'orientation',
        'Un angolino sembra girato in un modo impossibile: i suoi colori sono probabilmente scambiati fra loro.',
        ANGOLI_ORARI.flatMap((t) => [...t]),
      ),
    );
    return chiudi(false, schema);
  }
  aggiungi(ok('orientation'));

  return chiudi(true, schema);
}

export { ANGOLI, ALETTE };
