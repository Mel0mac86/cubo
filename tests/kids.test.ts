import { describe, it, expect } from 'vitest';
import { Face } from '../src/core/cube/defs';
import { parseMoves, applyMoves, invertMoves } from '../src/core/cube/moves';
import { identityCube } from '../src/core/cube/cubie';
import {
  describeMove,
  describeMoves,
  presentStep,
  progressBar,
  faceProgressMessage,
} from '../src/core/kids/instructions';
import {
  emptyProgress,
  recordSolve,
  completeLevel,
  grantBadges,
  heroTitle,
  formatTime,
  BADGES,
} from '../src/core/kids/achievements';
import { LEARN_LEVELS, isLevelUnlocked } from '../src/core/kids/learn';
import {
  makeQuestion,
  MINI_GAMES,
  checkMemoryAnswer,
} from '../src/core/kids/minigames';
import { makeRng, randomMoveSequence, scrambledCube } from '../src/core/cube/scramble';

describe('linguaggio per bambini', () => {
  it('non usa mai la notazione tecnica nel testo principale in modalita facile', () => {
    for (const m of parseMoves("U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'")) {
      const step = presentStep(describeMove(m, 'facile'), 0, 10, 'facile', true);
      expect(step.main).not.toMatch(/\b[URFDLB][2']?\b/);
      expect(step.main.toLowerCase()).toContain('gira');
      expect(step.showNotation).toBe(false);
    }
  });

  it('in modalita esperto mostra direttamente la notazione', () => {
    const step = presentStep(describeMove(parseMoves("R'")[0], 'esperto'), 0, 5, 'esperto', true);
    expect(step.main).toBe("R'");
    expect(step.showNotation).toBe(true);
  });

  it('in modalita normale introduce la notazione accanto alla frase semplice', () => {
    const step = presentStep(describeMove(parseMoves('L2')[0], 'normale'), 2, 5, 'normale', false);
    expect(step.main.toLowerCase()).toContain('lato sinistro');
    expect(step.sub).toContain('L2');
  });

  it('la direzione descritta corrisponde davvero al movimento del cubo', () => {
    // Girando R in senso orario, il pezzo davanti-destra sale in alto:
    // quindi la frase deve dire "verso l alto".
    const r = describeMove(parseMoves('R')[0]);
    expect(r.text).toContain("verso l'alto");
    expect(r.arrow).toBe('su');

    const rPrime = describeMove(parseMoves("R'")[0]);
    expect(rPrime.text).toContain('verso il basso');
    expect(rPrime.arrow).toBe('giu');

    // U orario porta la fila davanti verso sinistra
    expect(describeMove(parseMoves('U')[0]).arrow).toBe('sinistra');
    // L orario porta la colonna davanti verso il basso
    expect(describeMove(parseMoves('L')[0]).arrow).toBe('giu');
    // F orario porta la fila di sopra verso destra
    expect(describeMove(parseMoves('F')[0]).arrow).toBe('destra');
    // D orario porta la fila davanti verso destra
    expect(describeMove(parseMoves('D')[0]).arrow).toBe('destra');
  });

  it('le mosse doppie sono descritte come due giri', () => {
    const d = describeMove(parseMoves('F2')[0]);
    expect(d.quarterTurns).toBe(2);
    expect(d.text).toContain('due volte');
    expect(d.arrow).toBe('giro');
  });

  it('descrive una soluzione intera senza perdere pezzi', () => {
    const moves = parseMoves("R U R' U' F2 L B'");
    const described = describeMoves(moves);
    expect(described).toHaveLength(moves.length);
    described.forEach((d, i) => expect(d.move).toEqual(moves[i]));
  });

  it('la barra di avanzamento riflette le facce inserite', () => {
    expect(progressBar(0)).toBe('⬜⬜⬜⬜⬜⬜');
    expect(progressBar(3)).toBe('🟩🟩🟩⬜⬜⬜');
    expect(progressBar(6)).toBe('🟩🟩🟩🟩🟩🟩');
    expect(faceProgressMessage(5)).toContain('solo una');
  });
});

describe('ricompense', () => {
  it('il primo cubo risolto da il badge Rubik Hero', () => {
    const p = emptyProgress();
    const fresh = recordSolve(p, { moves: 110, usedHelp: true });
    expect(fresh.map((f) => f.badge.id)).toContain('rubik-hero');
    expect(p.cubesSolved).toBe(1);
    expect(p.stars).toBeGreaterThan(0);
  });

  it('risolvere senza aiuto da anche Super Solver', () => {
    const p = emptyProgress();
    const fresh = recordSolve(p, { moves: 100, usedHelp: false });
    const ids = fresh.map((f) => f.badge.id);
    expect(ids).toContain('rubik-hero');
    expect(ids).toContain('super-solver');
  });

  it('un badge non viene mai assegnato due volte', () => {
    const p = emptyProgress();
    recordSolve(p, { moves: 100, usedHelp: false });
    const starsAfterFirst = p.stars;
    const again = grantBadges(p);
    expect(again).toHaveLength(0);
    expect(p.stars).toBe(starsAfterFirst);
    expect(new Set(p.badges).size).toBe(p.badges.length);
  });

  it('migliorare il tempo assegna il badge velocita', () => {
    const p = emptyProgress();
    recordSolve(p, { moves: 100, usedHelp: false, timeMs: 200_000 });
    const fresh = recordSolve(p, { moves: 95, usedHelp: false, timeMs: 161_000 });
    expect(fresh.map((f) => f.badge.id)).toContain('faster');
    expect(p.bestTimeMs).toBe(161_000);
  });

  it('completare tutti i livelli da il badge finale', () => {
    const p = emptyProgress();
    let last: string[] = [];
    for (const l of [1, 2, 3, 4, 5, 6]) last = completeLevel(p, l).map((f) => f.badge.id);
    expect(last).toContain('true-hero');
    expect(p.levelsCompleted).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('nessun badge premia il tempo passato nell app o le serie giornaliere', () => {
    for (const b of BADGES) {
      const text = `${b.id} ${b.title} ${b.how}`.toLowerCase();
      expect(text).not.toMatch(/giorn|ogni giorno|serie|streak|torna|accedi/);
    }
  });

  it('formatta i tempi in minuti e secondi', () => {
    expect(formatTime(161_000)).toBe('2:41');
    expect(formatTime(undefined)).toBe('--:--');
    expect(heroTitle({ ...emptyProgress(), stars: 12 })).toBe('Rubik Hero 3');
  });
});

describe('scuola di Rubi', () => {
  it('ha sei livelli in ordine, ciascuno con delle schede', () => {
    expect(LEARN_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const l of LEARN_LEVELS) expect(l.cards.length).toBeGreaterThan(0);
  });

  it('gli esercizi partono da mescolamenti validi', () => {
    for (const l of LEARN_LEVELS) {
      for (const c of l.cards) {
        if (c.kind === 'prova') {
          const moves = parseMoves(c.scramble);
          expect(moves.length).toBeGreaterThan(0);
          // il mescolamento deve essere annullabile: e' un cubo vero
          const cube = applyMoves(identityCube(), moves);
          const back = applyMoves(cube, invertMoves(moves));
          expect(Array.from(back.cp)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        }
        if (c.kind === 'domanda') {
          expect(c.options.length).toBeGreaterThanOrEqual(2);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(c.options.length);
        }
      }
    }
  });

  it('i livelli si sbloccano uno dopo l altro', () => {
    expect(isLevelUnlocked(1, [])).toBe(true);
    expect(isLevelUnlocked(2, [])).toBe(false);
    expect(isLevelUnlocked(2, [1])).toBe(true);
    expect(isLevelUnlocked(6, [1, 2, 3, 4, 5])).toBe(true);
  });
});

describe('mini giochi', () => {
  it('genera domande sensate per ogni gioco', () => {
    const rng = makeRng(5150);
    for (const g of MINI_GAMES) {
      for (let i = 0; i < 20; i++) {
        const q = makeQuestion(g.id, rng);
        expect(q.prompt.length).toBeGreaterThan(0);
        if (g.id === 'memory') {
          expect(q.sequence!.length).toBeGreaterThanOrEqual(3);
        } else {
          expect(q.options.length).toBe(4);
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThan(q.options.length);
          expect(new Set(q.options).size).toBe(q.options.length);
        }
      }
    }
  });

  it('la domanda sul colore non chiede mai un centro (sarebbe troppo facile)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 50; i++) {
      const q = makeQuestion('colore', rng);
      expect(q.focus! % 9).not.toBe(4);
    }
  });

  it('la mossa proposta risolve davvero il cubo mostrato', () => {
    const rng = makeRng(21);
    for (let i = 0; i < 30; i++) {
      const q = makeQuestion('mossa', rng);
      // la risposta indicata deve corrispondere alla mossa che risolve
      const solving = q.sequence![0];
      const expected = q.options[q.answer];
      const faceNames: Record<number, string> = {
        [Face.U]: 'lato di sopra',
        [Face.D]: 'lato di sotto',
        [Face.R]: 'lato destro',
        [Face.L]: 'lato sinistro',
        [Face.F]: 'lato davanti',
        [Face.B]: 'lato dietro',
      };
      expect(expected).toBe(faceNames[solving.face]);
    }
  });

  it('il memory accetta solo la sequenza esatta', () => {
    const seq = parseMoves("R U F'");
    expect(checkMemoryAnswer(seq, parseMoves("R U F'"))).toBe(true);
    expect(checkMemoryAnswer(seq, parseMoves('R U F'))).toBe(false);
    expect(checkMemoryAnswer(seq, parseMoves('R U'))).toBe(false);
  });
});

describe('robustezza: niente cicli infiniti', () => {
  /**
   * Questi test nascono da un difetto vero: la schermata iniziale chiedeva un
   * mescolamento fisso passando un generatore che restituiva sempre lo stesso
   * numero. La vecchia versione di randomMoveSequence scartava le mosse
   * ripetute e riprovava, quindi con quel generatore non usciva mai una mossa
   * accettabile: ciclo infinito, e l'app si bloccava all'avvio senza nemmeno
   * mostrare la schermata. Non lo vedeva nessun test perche' nessun test
   * eseguiva davvero il componente.
   *
   * Da qui in poi le funzioni che sorteggiano devono finire SEMPRE, qualunque
   * generatore ricevano.
   */
  const degeneri: [string, () => number][] = [
    ['sempre 0.42', () => 0.42],
    ['sempre 0', () => 0],
    ['sempre quasi 1', () => 0.999999],
  ];

  it.each(degeneri)('randomMoveSequence finisce con un generatore che dà %s', (_nome, rng) => {
    const moves = randomMoveSequence(20, rng);
    expect(moves).toHaveLength(20);
    // La regola resta rispettata: mai due mosse di fila sulla stessa faccia.
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i].face).not.toBe(moves[i - 1].face);
    }
  });

  it.each(degeneri)('i minigiochi si generano con un generatore che dà %s', (_nome, rng) => {
    for (const g of MINI_GAMES) {
      const q = makeQuestion(g.id, rng);
      expect(q.prompt.length).toBeGreaterThan(0);
      if (g.id !== 'memory') {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
      }
    }
  });

  it('scrambledCube funziona anche con un generatore costante', () => {
    const cube = scrambledCube(25, () => 0.42);
    expect(Array.from(cube.cp).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
