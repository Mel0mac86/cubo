import { describe, it, expect } from 'vitest';
import { analyzeFrame, detectGrid, sampleFace } from '../src/core/vision/frame';
import { classifySticker, defaultCalibration, learnReference } from '../src/core/vision/color';
import { CubeColor } from '../src/core/cube/defs';
import { centroQuad } from '../src/core/vision/homography';
import { makeRng } from '../src/core/cube/scramble';
import { DIFFICOLTA, renderScene, cornersFor } from './helpers/renderCube';
import { cubieToFacelet } from '../src/core/cube/cubie';
import { scrambledCube } from '../src/core/cube/scramble';
import { validateFacelets } from '../src/core/cube/validator';
import {
  SCAN_ORDER,
  colorsToFacelets,
  finalizeScan,
  newScanner,
  pushFrame,
  readyForNextFace,
} from '../src/core/vision/scanner';

/**
 * Misura del riconoscimento, non un test con esito.
 *
 * Serve per confrontare "prima" e "dopo" con dei numeri invece che a
 * sensazione. Si lancia con:  npx vitest run tests/bench-vision.test.ts
 */

const PROVE_PER_CASO = 60;

/** Nove colori a caso, ma con un centro definito (come su un cubo vero). */
function facciaCasuale(rng: () => number): CubeColor[] {
  return Array.from({ length: 9 }, () => Math.floor(rng() * 6) as CubeColor);
}

describe('quanto e bravo a riconoscere il cubo', () => {
  it('misura per livello di difficolta', () => {
    const REGIONE = { x: 0, y: 0, w: 160, h: 160 };
    let totGriglia = 0;
    let totCelle = 0;
    let totGiuste = 0;

    // eslint-disable-next-line no-console
    console.log('\n  caso                                     griglia   colori giusti');
    // eslint-disable-next-line no-console
    console.log('  ' + '-'.repeat(66));

    for (const caso of DIFFICOLTA) {
      const rng = makeRng(20260815);
      let trovate = 0;
      let celle = 0;
      let giuste = 0;

      for (let i = 0; i < PROVE_PER_CASO; i++) {
        const colori = facciaCasuale(rng);
        const scena = renderScene(colori, caso.fai(rng));
        const griglia = detectGrid(scena, REGIONE);
        if (!griglia.found) continue;
        trovate++;

        const campioni = sampleFace(scena, griglia);
        const calib = defaultCalibration();
        // Come fa lo scanner: impara il riferimento dal centro.
        learnReference(calib, colori[4], campioni[4].color);
        const letti = campioni.map((c) => classifySticker(c.color, calib).color);
        for (let k = 0; k < 9; k++) {
          celle++;
          if (letti[k] === colori[k]) giuste++;
        }
      }

      totGriglia += trovate;
      totCelle += celle;
      totGiuste += giuste;

      const pctG = ((trovate / PROVE_PER_CASO) * 100).toFixed(0);
      const pctC = celle ? ((giuste / celle) * 100).toFixed(1) : '—';
      // eslint-disable-next-line no-console
      console.log(`  ${caso.nome.padEnd(40)} ${pctG.padStart(4)}%   ${String(pctC).padStart(8)}%`);
    }

    const nTot = DIFFICOLTA.length * PROVE_PER_CASO;
    // eslint-disable-next-line no-console
    console.log('  ' + '-'.repeat(66));
    // eslint-disable-next-line no-console
    console.log(
      `  ${'TOTALE'.padEnd(40)} ${((totGriglia / nTot) * 100).toFixed(0).padStart(4)}%   ` +
        `${(totCelle ? (totGiuste / totCelle) * 100 : 0).toFixed(1).padStart(8)}%\n`,
    );
  });

  it('quanto e lontana la griglia trovata da quella vera', () => {
    const rng = makeRng(7);
    const REGIONE = { x: 0, y: 0, w: 160, h: 160 };
    let somma = 0;
    let n = 0;
    let peggiore = 0;

    for (const caso of DIFFICOLTA) {
      for (let i = 0; i < 20; i++) {
        const opzioni = caso.fai(rng);
        const scena = renderScene(facciaCasuale(rng), opzioni);
        const griglia = detectGrid(scena, REGIONE);
        if (!griglia.found) continue;
        // Confronto il centro della griglia trovata con quello vero.
        const angoli = cornersFor(opzioni);
        const cxVero = angoli.reduce((s, a) => s + a[0], 0) / 4;
        const cyVero = angoli.reduce((s, a) => s + a[1], 0) / 4;
        const [cxTrov, cyTrov] = centroQuad(griglia.quad);
        const err = Math.hypot(cxVero - cxTrov, cyVero - cyTrov);
        somma += err;
        peggiore = Math.max(peggiore, err);
        n++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `  errore medio del centro: ${(somma / Math.max(1, n)).toFixed(1)} px, peggiore ${peggiore.toFixed(1)} px (su 160)\n`,
    );
  });
});

describe('scansione completa delle sei facce', () => {
  /**
   * La misura che conta davvero: dal cubo vero in mano al cubo validato,
   * passando per la regia della scansione. Se questa passa, il bambino arriva
   * alla soluzione senza dover correggere niente a mano.
   */
  it('legge tutti i 54 quadratini in condizioni difficili', () => {
    const rng = makeRng(2026);
    const PROVE = 12;
    let perfette = 0;
    let valide = 0;
    let quadratiniGiusti = 0;
    let quadratiniTotali = 0;
    let pericolosi = 0;

    for (let t = 0; t < PROVE; t++) {
      const facce = cubieToFacelet(scrambledCube(25, rng));
      const s = newScanner();

      for (const step of SCAN_ORDER) {
        readyForNextFace(s);
        const colori = Array.from(
          { length: 9 },
          (_, i) => facce[step.face * 9 + i] as unknown as CubeColor,
        );
        // Condizioni volutamente scomode, diverse per ogni faccia.
        const scena = renderScene(colori, {
          scala: 0.55 + rng() * 0.3,
          rotazione: (rng() - 0.5) * 20,
          prospettiva: rng() * 0.15,
          offset: { x: (rng() - 0.5) * 0.16, y: (rng() - 0.5) * 0.16 },
          luce: { r: 0.8 + rng() * 0.35, g: 0.85 + rng() * 0.2, b: 0.8 + rng() * 0.3 },
          gradiente: rng() * 0.3,
          rumore: 12,
          rng,
        });
        const analisi = analyzeFrame(scena, { region: { x: 0, y: 0, w: 160, h: 160 } });
        const obiettivo = SCAN_ORDER.indexOf(step) + 1;
        for (let i = 0; i < 14 && s.captured.length < obiettivo; i++) pushFrame(s, analisi);
      }

      if (s.captured.length !== 6) continue;
      const { assignment, colorToFace } = finalizeScan(s);
      const lette = colorsToFacelets(assignment.colors, colorToFace);

      let giuste = 0;
      for (let i = 0; i < 54; i++) if (lette[i] === facce[i]) giuste++;
      quadratiniGiusti += giuste;
      quadratiniTotali += 54;
      const accettato = validateFacelets(lette).valid;
      if (giuste === 54) perfette++;
      if (accettato) valide++;
      // Il caso pericoloso: un cubo SBAGLIATO che il validatore lascia passare.
      // Il bambino riceverebbe una soluzione che non funziona, senza capire
      // perche'. Questo non deve succedere mai.
      if (accettato && giuste !== 54) pericolosi++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n  scansioni perfette (54/54): ${perfette}/${PROVE}` +
        `\n  cubi accettati dal validatore: ${valide}/${PROVE}` +
        `\n  quadratini giusti: ${((quadratiniGiusti / quadratiniTotali) * 100).toFixed(1)}%` +
        `\n  cubi sbagliati accettati per errore: ${pericolosi}\n`,
    );

    // Tutte le scansioni devono arrivare in fondo: lasciare il bambino a girare
    // il cubo all'infinito e' il difetto peggiore di tutti.
    expect(quadratiniTotali).toBe(PROVE * 54);
    // La stragrande maggioranza deve essere perfetta...
    expect(perfette).toBeGreaterThanOrEqual(Math.ceil(PROVE * 0.8));
    // ...e soprattutto: nessun cubo sbagliato deve passare il validatore.
    expect(pericolosi).toBe(0);
  });
});
