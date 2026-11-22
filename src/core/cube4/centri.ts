/**
 * Prima fase della riduzione: rimettere insieme i sei centri.
 *
 * Su un 4x4 ogni faccia ha quattro pezzi centrali sparsi per il cubo. Finche'
 * non sono raggruppati non ha senso parlare di "faccia bianca": il cubo non si
 * puo' ancora trattare come un 3x3.
 *
 * Come procede: a ogni passo cerca la sequenza PIU' CORTA che mette a posto
 * almeno un pezzo centrale in piu' senza rovinarne nessuno di quelli gia'
 * sistemati. E' goloso, quindi non da' la soluzione piu' breve possibile, ma e'
 * corretto per costruzione: ogni passo migliora, e si ferma solo quando sono
 * tutti e ventiquattro al loro posto.
 *
 * La ricerca lavora su una versione ridotta dello stato: solo i 24 pezzi
 * centrali invece dei 96 quadratini. E' la differenza fra una ricerca che dura
 * un secondo e una che dura un minuto sul telefono di un bambino.
 */

import { CENTRI, MOSSE4, Mossa4, PERM, PER_FACCIA, Stato4, applicaTante } from './cube4';

/** I 24 pezzi centrali, ordinati per faccia. */
const SLOT: number[] = [];
for (let f = 0; f < 6; f++) for (const k of [5, 6, 9, 10]) SLOT.push(f * PER_FACCIA + k);

const SLOT_DI_FACELET = new Map<number, number>();
SLOT.forEach((facelet, j) => SLOT_DI_FACELET.set(facelet, j));

/** Le 36 mosse ristrette ai soli pezzi centrali. */
const PERM_C: Int8Array[] = PERM.map((p) => {
  const out = new Int8Array(24);
  for (let j = 0; j < 24; j++) {
    const sorgente = SLOT_DI_FACELET.get(p[SLOT[j]]);
    if (sorgente === undefined) throw new Error('un pezzo centrale non arriva da un pezzo centrale');
    out[j] = sorgente;
  }
  return out;
});

const FACCIA_DI_SLOT = SLOT.map((i) => Math.floor(i / PER_FACCIA));

export function centriDaStato(s: Stato4): Uint8Array {
  return Uint8Array.from(SLOT, (i) => s[i]);
}

function applicaC(c: Uint8Array, m: number): Uint8Array {
  const p = PERM_C[m];
  const out = new Uint8Array(24);
  for (let j = 0; j < 24; j++) out[j] = c[p[j]];
  return out;
}

function punti(c: Uint8Array, bersaglio: number[]): number {
  let n = 0;
  for (let j = 0; j < 24; j++) if (c[j] === bersaglio[FACCIA_DI_SLOT[j]]) n++;
  return n;
}

/**
 * La sequenza piu' corta (fino a `maxProf` mosse) che migliora il punteggio.
 * Restituisce null se a quella profondita' non c'e' niente da fare.
 */
function cercaMiglioramento(
  c: Uint8Array,
  bersaglio: number[],
  base: number,
  maxProf: number,
): number[] | null {
  const cammino: number[] = [];

  const dfs = (stato: Uint8Array, restanti: number, ultimaFaccia: number): number[] | null => {
    for (let m = 0; m < MOSSE4.length; m++) {
      const faccia = MOSSE4[m].faccia;
      // Due mosse di fila sulla stessa faccia sono sempre riscrivibili in una.
      if (faccia === ultimaFaccia) continue;
      const dopo = applicaC(stato, m);
      cammino.push(m);
      if (punti(dopo, bersaglio) > base) {
        const out = cammino.slice();
        cammino.pop();
        return out;
      }
      if (restanti > 1) {
        const giu = dfs(dopo, restanti - 1, faccia);
        if (giu) {
          cammino.pop();
          return giu;
        }
      }
      cammino.pop();
    }
    return null;
  };

  for (let prof = 1; prof <= maxProf; prof++) {
    const r = dfs(c, prof, -1);
    if (r) return r;
  }
  return null;
}

export interface EsitoCentri {
  mosse: Mossa4[];
  /** Vero se tutti e 24 i pezzi centrali sono al loro posto. */
  fatto: boolean;
}

/**
 * Rimette insieme i sei centri. `bersaglio[f]` e' il colore che deve finire
 * sulla faccia f (lo decide lo schema ricavato dagli angoli).
 */
export function risolviCentri(s: Stato4, bersaglio: number[], maxProf = 5): EsitoCentri {
  let c = centriDaStato(s);
  const mosse: Mossa4[] = [];
  let punteggio = punti(c, bersaglio);

  // Al massimo 24 miglioramenti: oltre, qualcosa non va e meglio fermarsi che
  // girare a vuoto.
  for (let giro = 0; giro < 30 && punteggio < 24; giro++) {
    const passo = cercaMiglioramento(c, bersaglio, punteggio, maxProf);
    if (!passo) break;
    for (const m of passo) {
      c = applicaC(c, m);
      mosse.push(MOSSE4[m]);
    }
    punteggio = punti(c, bersaglio);
  }

  return { mosse, fatto: punteggio === 24 };
}

/** Comodo per i test: i centri di uno stato sono tutti al loro posto? */
export function centriAPosto(s: Stato4, bersaglio: number[]): boolean {
  return punti(centriDaStato(s), bersaglio) === 24;
}

export { SLOT as SLOT_CENTRI };
export function statoDopo(s: Stato4, mosse: Mossa4[]): Stato4 {
  return applicaTante(s, mosse);
}
