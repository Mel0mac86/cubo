/**
 * Il risolutore del 4x4, per intero.
 *
 * La strada e' quella che usano le persone, e che si racconta bene a un
 * bambino: non si inventa un metodo nuovo per il 4x4, lo si RIDUCE a un cubo
 * che si sa gia' risolvere.
 *
 *   1. I quadrati in mezzo       -> i quattro pezzi centrali di ogni faccia
 *                                   tornano insieme
 *   2. Le coppie di lato         -> le 24 alette diventano 12 spigoli doppi
 *   3. Un caso speciale          -> solo a volte: il 4x4 permette situazioni
 *                                   che su un cubo normale non esistono
 *   4. Adesso e' un cubo normale -> ci pensa il motore del 3x3
 *
 * Alla fine la soluzione viene RIPROVATA sul cubo di partenza: se non lo
 * risolve davvero, il risolutore lo dice invece di restituire mosse che non
 * funzionano. Su un cubo vero in mano a un bambino e' l'unica garanzia che
 * conta.
 */

import { Face } from '../cube/defs';
import { CubieCube } from '../cube/cubie';
import { solveBeginner } from '../solver/beginner';
import { solveKociemba } from '../solver/kociemba';
import { validateFacelets } from '../cube/validator';
import { MOSSE4, Mossa4, Stato4, applicaTante, invertiMosse, leggiMosse, semplifica } from './cube4';
import { Schema4, schemaMigliore } from './schema4';
import { risolviCentri } from './centri';
import { aletteDaStato, appaiaAlette, punteggio, PUNTEGGIO_PIENO } from './alette';
import { libreria } from './macro';
import { come3x3, mosseDa3x3 } from './ponte3';

export type FaseId4 = 'centri' | 'alette' | 'parita' | 'cubo3';

export interface Fase4 {
  id: FaseId4;
  titolo: string;
  obiettivo: string;
  mosse: Mossa4[];
}

export interface Soluzione4 {
  mosse: Mossa4[];
  fasi: Fase4[];
  schema: Schema4;
  /** Vero se la soluzione, riprovata sul cubo di partenza, lo risolve davvero. */
  verificata: boolean;
}

export class NonRisolvibile4 extends Error {}

export interface Opzioni4 {
  /** Quale motore usare per l'ultima fase. */
  motore?: 'strati' | 'kociemba';
}

/** Il cubo e' finito? Ogni quadratino del colore che gli tocca. */
export function risolto(s: Stato4, schema: Schema4): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== schema.coloreDiFaccia[Math.floor(i / 16)]) return false;
  }
  return true;
}

/**
 * Le parita' del 4x4: situazioni che un 3x3 non puo' avere (uno spigolo girato
 * da solo, due spigoli scambiati) e che qui invece capitano. Si riconoscono
 * perche' il cubo ridotto, letto come un 3x3, non passa i controlli.
 *
 * Si risolvono con una mossa composta che tiene insieme centri e coppie ma
 * cambia il cubo "visto da 3x3" quanto basta a renderlo possibile.
 */
/**
 * Il "caso speciale" del 4x4.
 *
 * Su un cubo 3x3 certe situazioni non possono proprio esistere: uno spigolo
 * girato da solo, o due spigoli scambiati fra loro. Su un 4x4 invece capitano
 * eccome, perche' le due alette di uno spigolo possono essere appaiate in due
 * modi diversi. Quando succede, il cubo ridotto non passa i controlli del 3x3
 * e bisogna sistemarlo prima di poterlo risolvere.
 *
 * Due rimedi, per le due parita' diverse:
 *
 *  - SPIGOLO GIRATO: c'e' una sequenza nota che gira su se stesso un solo
 *    spigolo doppio senza toccare nient'altro. La si fa precedere da qualche
 *    mossa esterna per portare sotto quella giusta lo spigolo da girare: le
 *    mosse esterne non rovinano ne' i centri ne' le coppie, quindi sono
 *    gratis.
 *  - SPIGOLI SCAMBIATI: qui non serve una sequenza speciale. Si scuce qualche
 *    coppia e si riappaia: il secondo giro di appaiamento sceglie un abbinamento
 *    diverso e la situazione impossibile sparisce da sola.
 */
const GIRA_UNO_SPIGOLO = leggiMosse("Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2");

/**
 * L'altra parita': due spigoli doppi scambiati fra loro. Questa non si sistema
 * con nessuna preparazione, perche' non dipende da DOVE sono gli spigoli ma da
 * un conto che riguarda tutto il cubo insieme. Serve una sequenza che scambia
 * due spigoli doppi: rompe per un attimo centri e coppie e poi li rimette a
 * posto da sola.
 *
 * Scritta a fette: r2 u2 Rw2 u2 R2 u2. Qui e' scritta per esteso perche' il
 * motore conosce solo le mosse esterne e quelle larghe (una fetta interna e'
 * una mossa larga seguita dalla sua esterna al contrario).
 */
const SCAMBIA_DUE_SPIGOLI = leggiMosse("Rw2 R2 Uw2 U2 Rw2 Uw2 U2 R2 Uw2 U2");

/** Le mosse esterne: non spostano mai un pezzo centrale di un'altra faccia. */
const ESTERNE = MOSSE4.filter((m) => m.strati === 1);

/** Tutte le preparazioni corte fatte di sole mosse esterne. */
function preparazioni(max: number): Mossa4[][] {
  let fronte: Mossa4[][] = [[]];
  const out: Mossa4[][] = [[]];
  for (let d = 0; d < max; d++) {
    const nuovo: Mossa4[][] = [];
    for (const p of fronte) {
      const ultima = p.length ? p[p.length - 1].faccia : -1;
      for (const m of ESTERNE) {
        if (m.faccia === ultima) continue;
        nuovo.push([...p, m]);
      }
    }
    out.push(...nuovo);
    fronte = nuovo;
  }
  return out;
}

let PREPARAZIONI: Mossa4[][] | null = null;

function ridotto(s: Stato4): boolean {
  return punteggio(aletteDaStato(s)) === PUNTEGGIO_PIENO;
}

function sistemaParita(s: Stato4, schema: Schema4): { mosse: Mossa4[]; stato: Stato4 } | null {
  PREPARAZIONI ??= preparazioni(3);

  // Le parita' sono due e indipendenti: si possono presentare da sole o
  // insieme. Si prova prima senza lo scambio, poi con.
  for (const prima of [[] as Mossa4[], SCAMBIA_DUE_SPIGOLI]) {
    const dopoPrima = applicaTante(s, prima);
    if (ridotto(dopoPrima) && validateFacelets(come3x3(dopoPrima, schema)).valid) {
      return { mosse: prima, stato: dopoPrima };
    }
    // Lo spigolo girato va cercato: la sequenza ne gira uno ben preciso, e le
    // mosse esterne servono a portarci sotto quello giusto. Sono gratis,
    // perche' non toccano ne' i centri ne' le coppie.
    for (const setup of PREPARAZIONI) {
      const mosse = [...prima, ...setup, ...GIRA_UNO_SPIGOLO];
      const dopo = applicaTante(s, mosse);
      if (!ridotto(dopo)) continue;
      if (validateFacelets(come3x3(dopo, schema)).valid) return { mosse, stato: dopo };
    }
  }
  return null;
}

/**
 * Un quarto di giro della fetta interna. Serve a cambiare "classe di parita":
 * e' l'unica cosa che rimette in gioco la situazione degli spigoli scambiati,
 * che nessuna sequenza fatta di coniugati o commutatori puo' sistemare (quelle
 * usano sempre le mosse larghe a coppie, e restano dalla stessa parte).
 */
const FETTA_INTERNA: Mossa4[] = leggiMosse("Rw R'");

function tentativo(partenza: Stato4, schema: Schema4, prefisso: Mossa4[], opzioni: Opzioni4): Soluzione4 | null {
  const fasi: Fase4[] = [];
  let s = applicaTante(partenza, prefisso);

  /* 1 — i quadrati in mezzo */
  const centri = risolviCentri(s, schema.coloreDiFaccia, 4);
  if (!centri.fatto) return null;
  s = applicaTante(s, centri.mosse);
  fasi.push({
    id: 'centri',
    titolo: 'I quadrati in mezzo',
    obiettivo: 'Ogni faccia deve avere i suoi quattro quadratini centrali tutti dello stesso colore.',
    mosse: semplifica([...prefisso, ...centri.mosse]),
  });

  /* 2 — le coppie di lato */
  const alette = appaiaAlette(s);
  if (!alette.fatto) return null;
  s = applicaTante(s, alette.mosse);
  fasi.push({
    id: 'alette',
    titolo: 'Le coppie di lato',
    obiettivo: 'Ogni pezzo di lato deve diventare una coppia di due quadratini uguali.',
    mosse: semplifica(alette.mosse),
  });

  /* 3 — il caso speciale, se c'e' */
  let report = validateFacelets(come3x3(s, schema));
  if (!report.valid) {
    const fix = sistemaParita(s, schema);
    if (!fix) return null;
    s = fix.stato;
    report = validateFacelets(come3x3(s, schema));
    fasi.push({
      id: 'parita',
      titolo: 'Un caso speciale',
      obiettivo:
        'Sul cubo grande puo capitare una situazione che sul cubo piccolo non esiste. Si sistema con una sequenza sola.',
      mosse: semplifica(fix.mosse),
    });
  }
  if (!report.valid || !report.cube) return null;

  /* 4 — adesso e' un cubo normale */
  const mosse3 =
    opzioni.motore === 'kociemba'
      ? solveKociemba(report.cube, { timeoutMs: 8000 }).moves
      : solveBeginner(report.cube).moves;
  const finali = mosseDa3x3(mosse3);
  fasi.push({
    id: 'cubo3',
    titolo: 'Adesso e un cubo normale!',
    obiettivo: 'Da qui in poi e esattamente il cubo che sai gia risolvere.',
    mosse: semplifica(finali),
  });

  const mosse = semplifica(fasi.flatMap((f) => f.mosse));
  const verificata = risolto(applicaTante(partenza, mosse), schema);
  return { mosse, fasi, schema, verificata };
}

export function risolvi4(partenza: Stato4, opzioni: Opzioni4 = {}): Soluzione4 {
  const schema = schemaMigliore(partenza);
  if (!schema) throw new NonRisolvibile4('Gli angoli di questo cubo non possono esistere davvero.');

  // Si prova prima la strada diretta. Se si finisce con due spigoli scambiati
  // non c'e' sequenza che tenga: bisogna rifare la riduzione partendo da un
  // quarto di giro interno, che porta dall'altra parte della parita'.
  for (const prefisso of [[], FETTA_INTERNA, invertiMosse(FETTA_INTERNA)]) {
    const sol = tentativo(partenza, schema, prefisso, opzioni);
    if (sol && sol.verificata) return sol;
  }
  throw new NonRisolvibile4('Non riesco a risolvere questo cubo.');
}

export { come3x3 };
export type { Face };
