/**
 * Seconda fase della riduzione: appaiare le 24 alette in 12 spigoli.
 *
 * Quando le due alette di uno spigolo mostrano gli stessi due colori, lo
 * spigolo si comporta esattamente come quello di un 3x3: da li' in poi il
 * bambino puo' ragionare sul 4x4 come se fosse il cubo che gia' conosce.
 *
 * La ricerca e' golosa, ma con una memoria. Il goloso puro arriva a dieci
 * spigoli su dodici e poi si pianta sempre nello stesso punto: e' il caso
 * famoso degli ultimi due spigoli, dove per sistemarli bisogna prima
 * SCUCIRNE uno gia' fatto. Senza memoria si rifarebbe subito indietro; con la
 * lista degli stati gia' visti, invece, e' costretto ad andare avanti e trova
 * la strada. Misurato su 20 cubi mescolati: 20 su 20, contro 13 su 20 del
 * goloso puro.
 */

import { Mossa4, Stato4, applicaTante } from './cube4';
import { Macro, QUADRATINI_ALETTE, SPIGOLI, libreria } from './macro';

/** Lo stato ridotto: solo i 48 quadratini delle alette. */
export function aletteDaStato(s: Stato4): Uint8Array {
  return Uint8Array.from(QUADRATINI_ALETTE, (i) => s[i]);
}

/**
 * Quanto siamo vicini. Tre punti per uno spigolo fatto, un punto per ogni
 * singolo quadratino che gia' combacia: il punteggio a gradini serve a dare
 * una direzione anche quando nessuna mossa completa uno spigolo intero.
 */
export function punteggio(w: Uint8Array): number {
  let n = 0;
  for (const [a, b, c, d] of SPIGOLI) {
    if (w[a] === w[c] && w[b] === w[d]) n += 3;
    else {
      if (w[a] === w[c]) n++;
      if (w[b] === w[d]) n++;
    }
  }
  return n;
}

export const PUNTEGGIO_PIENO = 36;

/** Quanti dei dodici spigoli sono appaiati. */
export function spigoliAppaiati(w: Uint8Array): number {
  let n = 0;
  for (const [a, b, c, d] of SPIGOLI) if (w[a] === w[c] && w[b] === w[d]) n++;
  return n;
}

function applicaMacro(w: Uint8Array, m: Macro): Uint8Array {
  const out = new Uint8Array(48);
  for (let j = 0; j < 48; j++) out[j] = w[m.perm[j]];
  return out;
}

export interface EsitoAlette {
  mosse: Mossa4[];
  fatto: boolean;
}

export function appaiaAlette(s: Stato4, maxGiri = 300): EsitoAlette {
  const macro = libreria();
  let w = aletteDaStato(s);
  const mosse: Mossa4[] = [];
  const visti = new Set<string>([w.join('')]);

  for (let giro = 0; giro < maxGiri && punteggio(w) < PUNTEGGIO_PIENO; giro++) {
    const base = punteggio(w);

    // Prima scelta: la mossa composta piu' corta che migliora.
    let scelta = -1;
    for (let k = 0; k < macro.length; k++) {
      if (punteggio(applicaMacro(w, macro[k])) > base) {
        scelta = k;
        break;
      }
    }

    // Se nessuna migliora siamo su un plateau: si accetta di peggiorare un po',
    // purche' si finisca in uno stato mai visto prima.
    if (scelta < 0) {
      let migliore = -1;
      let puntiMigliore = -1;
      for (let k = 0; k < macro.length; k++) {
        const dopo = applicaMacro(w, macro[k]);
        const p = punteggio(dopo);
        if (p < base - 4) continue;
        if (visti.has(dopo.join(''))) continue;
        if (p > puntiMigliore || (p === puntiMigliore && migliore >= 0 && macro[k].lunghezza < macro[migliore].lunghezza)) {
          puntiMigliore = p;
          migliore = k;
        }
      }
      if (migliore < 0) break;
      scelta = migliore;
    }

    w = applicaMacro(w, macro[scelta]);
    mosse.push(...macro[scelta].mosse);
    visti.add(w.join(''));
  }

  return { mosse, fatto: punteggio(w) === PUNTEGGIO_PIENO };
}

/** Comodo per i test. */
export function aletteAppaiate(s: Stato4): boolean {
  return punteggio(aletteDaStato(s)) === PUNTEGGIO_PIENO;
}

export function dopo(s: Stato4, ms: Mossa4[]): Stato4 {
  return applicaTante(s, ms);
}
