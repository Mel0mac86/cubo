import { describe, expect, it } from 'vitest';
import { Face, FACE_ORDER } from '../src/core/cube/defs';
import { cubieToFacelet } from '../src/core/cube/cubie';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { validateFacelets } from '../src/core/cube/validator';
import {
  lettureValide,
  recuperaOrientamento,
  ruotaFaccia,
  ruotaFacciaIn,
  scambiaFacce,
} from '../src/core/cube/orientation';

/**
 * Il bambino ha copiato bene i colori ma ha guardato una faccia girata.
 *
 * E' il difetto piu' insidioso dell'inserimento a mano: i colori sono contati
 * giusti, i centri pure, e l'app dice "gli angolini non sono giusti" senza che
 * ci sia niente da correggere nei colori. Qui verifichiamo che il motore sappia
 * riconoscere il caso e rimetterlo a posto da solo.
 */

describe('rotazione dei nove quadratini', () => {
  it('un quarto di giro in senso orario porta il primo in alto a destra', () => {
    const f = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(ruotaFaccia(f, 1)).toEqual([6, 3, 0, 7, 4, 1, 8, 5, 2]);
  });

  it('quattro quarti tornano al punto di partenza', () => {
    const f = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(ruotaFaccia(f, 4)).toEqual(f);
    expect(ruotaFaccia(ruotaFaccia(f, 1), 3)).toEqual(f);
    expect(ruotaFaccia(f, -1)).toEqual(ruotaFaccia(f, 3));
  });

  it('il centro non si muove mai', () => {
    for (let q = 0; q < 4; q++) expect(ruotaFaccia([0, 1, 2, 3, 4, 5, 6, 7, 8], q)[4]).toBe(4);
  });
});

describe('recupero della faccia guardata storta', () => {
  it('rimette a posto la faccia di sotto girata (il caso piu comune)', () => {
    const rng = makeRng(101);
    const vero = cubieToFacelet(scrambledCube(20, rng));
    // Il bambino guarda la faccia di sotto ribaltandola dalla parte sbagliata.
    const storto = ruotaFacciaIn(vero, Face.D, 2);

    // I controlli che NON se ne accorgono, ed e' proprio questo il problema:
    const report = validateFacelets(storto);
    expect(report.checks.find((c) => c.id === 'counts')!.ok).toBe(true);
    expect(report.checks.find((c) => c.id === 'centers')!.ok).toBe(true);
    expect(report.valid).toBe(false);

    const r = recuperaOrientamento(storto);
    expect(r.sicuro).toBe(true);
    expect(r.lettura!.facelets).toEqual(vero);
    expect(r.lettura!.storte).toEqual([Face.D]);
  });

  it('rimette a posto anche la faccia di sopra', () => {
    const rng = makeRng(7);
    const vero = cubieToFacelet(scrambledCube(18, rng));
    const r = recuperaOrientamento(ruotaFacciaIn(vero, Face.U, 3));
    expect(r.sicuro).toBe(true);
    expect(r.lettura!.facelets).toEqual(vero);
  });

  it('non tocca niente se il cubo era gia giusto', () => {
    const rng = makeRng(55);
    const vero = cubieToFacelet(scrambledCube(22, rng));
    const r = recuperaOrientamento(vero);
    expect(r.sicuro).toBe(true);
    expect(r.lettura!.storte).toEqual([]);
    expect(r.lettura!.facelets).toEqual(vero);
  });

  it('non inventa niente se i colori sono davvero sbagliati', () => {
    const rng = makeRng(9);
    const vero = cubieToFacelet(scrambledCube(20, rng));
    // Due quadratini scambiati fra facce diverse: i conti restano a nove per
    // colore, ma nessun modo di tenere il cubo puo' renderlo vero.
    const rotto = vero.slice();
    const a = 0;
    const b = 20;
    if (rotto[a] === rotto[b]) rotto[b] = ((rotto[b] + 1) % 6) as Face;
    [rotto[a], rotto[b]] = [rotto[b], rotto[a]];
    if (validateFacelets(rotto).valid) return; // scambio innocuo, caso non interessante
    const r = recuperaOrientamento(rotto);
    expect(r.lettura).toBeNull();
    expect(r.sicuro).toBe(false);
  });

  /**
   * La misura che decide se possiamo correggere in automatico.
   *
   * Se per un cubo storto esistesse spesso PIU' di una lettura valida, l'app
   * rischierebbe di "sistemarlo" nel modo sbagliato e dare al bambino una
   * soluzione che sul suo cubo non funziona. Meglio saperlo con dei numeri.
   */
  it('quanto e ambiguo il recupero: misura su 300 cubi', () => {
    const rng = makeRng(2026);
    let recuperati = 0;
    let ambigui = 0;
    let sbagliati = 0;
    const PROVE = 300;

    for (let t = 0; t < PROVE; t++) {
      const vero = cubieToFacelet(scrambledCube(25, rng));
      // Una o due facce guardate storte, come capita davvero.
      let storto = vero.slice();
      const quante = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < quante; k++) {
        const f = FACE_ORDER[Math.floor(rng() * 6)];
        storto = ruotaFacciaIn(storto, f, 1 + Math.floor(rng() * 3));
      }
      if (validateFacelets(storto).valid) continue; // giro innocuo

      const letture = lettureValide(storto);
      if (letture.length === 0) continue;
      recuperati++;
      if (letture.length > 1) ambigui++;
      if (letture[0].facelets.join('') !== vero.join('')) sbagliati++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n  cubi storti rimessi a posto: ${recuperati}/${PROVE}` +
        `\n  con piu di una lettura valida: ${ambigui}` +
        `\n  rimessi a posto nel modo SBAGLIATO: ${sbagliati}\n`,
    );

    // Il risultato deve essere quello vero: dare una soluzione che non funziona
    // sul cubo in mano e' il difetto peggiore possibile.
    expect(sbagliati).toBe(0);
    expect(recuperati).toBeGreaterThan(PROVE * 0.8);
  });

  it('capisce anche chi ha girato il cubo dalla parte sbagliata', () => {
    const rng = makeRng(31);
    let recuperati = 0;
    let sbagliati = 0;
    const PROVE = 60;

    for (let t = 0; t < PROVE; t++) {
      const vero = cubieToFacelet(scrambledCube(25, rng));
      // Girando verso destra invece che verso sinistra, il bambino vede le
      // facce nell'ordine giusto per lui ma l'app le registra a specchio.
      const storto = scambiaFacce(vero, Face.R, Face.L);
      if (validateFacelets(storto).valid) continue;
      const r = recuperaOrientamento(storto);
      if (!r.lettura) continue;
      recuperati++;
      if (r.lettura.facelets.join('') !== vero.join('')) sbagliati++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n  cubi girati dalla parte sbagliata rimessi a posto: ${recuperati}/${PROVE}` +
        ` (sbagliati: ${sbagliati})\n`,
    );
    expect(sbagliati).toBe(0);
    expect(recuperati).toBeGreaterThan(PROVE * 0.8);
  });

  it('ci mette poco: e sulla strada di un bambino che aspetta', () => {
    const rng = makeRng(3);
    const storto = ruotaFacciaIn(cubieToFacelet(scrambledCube(25, rng)), Face.D, 1);
    const t0 = Date.now();
    recuperaOrientamento(storto);
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  ricerca dell'orientamento: ${ms} ms\n`);
    expect(ms).toBeLessThan(3000);
  });
});
