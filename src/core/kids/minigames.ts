/**
 * I mini giochi.
 *
 * Non sono riempitivi: ognuno allena una competenza che serve davvero per
 * risolvere il cubo, e le domande sono generate DALLO STATO REALE di un cubo
 * mescolato, non da una lista scritta a mano.
 */

import { CubieCube, cubieToFacelet, identityCube } from '../cube/cubie';
import {
  COLOR_LABEL_IT,
  EDGE_FACE,
  Edge,
  Face,
  FACE_NAMES,
  SIDE_FACES,
  edgeByFaces,
} from '../cube/defs';
import { Move, applyMoves, invertMoves, moveToString, parseMoves } from '../cube/moves';
import { Rng, randomMoveSequence, scrambledCube } from '../cube/scramble';
import { SIDE_NAME_IT, describeMove } from './instructions';

export type MiniGameId = 'colore' | 'mossa' | 'pezzo' | 'memory';

export interface MiniGameInfo {
  id: MiniGameId;
  icon: string;
  title: string;
  /** Che cosa allena, spiegato al bambino. */
  what: string;
}

export const MINI_GAMES: MiniGameInfo[] = [
  {
    id: 'colore',
    icon: '🎨',
    title: 'Indovina il colore',
    what: 'Alleni l occhio a riconoscere i colori del cubo.',
  },
  {
    id: 'mossa',
    icon: '🔄',
    title: 'Trova la mossa',
    what: 'Impari a capire quale lato girare guardando il cubo.',
  },
  {
    id: 'pezzo',
    icon: '🧩',
    title: 'Trova il pezzo',
    what: 'Impari a cercare un pezzo preciso, come fanno i campioni.',
  },
  {
    id: 'memory',
    icon: '⚡',
    title: 'Memory delle mosse',
    what: 'Alleni la memoria a ricordare una sequenza di mosse.',
  },
];

export interface Question {
  prompt: string;
  /** Letto ad alta voce da Rubi. */
  speech: string;
  options: string[];
  answer: number;
  /** Spiegazione mostrata dopo la risposta. */
  why: string;
  /** Stato del cubo da mostrare in 3D (facelet). */
  facelets?: Face[];
  /** Quadratino da nascondere/evidenziare (indice 0..53). */
  focus?: number;
  /** Solo per il memory: la sequenza da ricordare. */
  sequence?: Move[];
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function shuffleWithAnswer(correct: string, others: string[], rng: Rng): { options: string[]; answer: number } {
  const pool = [correct, ...others];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { options: pool, answer: pool.indexOf(correct) };
}

/** 🎨 Quale colore manca? Un quadratino viene coperto, il bambino indovina. */
export function makeColorQuestion(rng: Rng): Question {
  const cube = scrambledCube(12, rng);
  const facelets = cubieToFacelet(cube);
  // Evitiamo i centri: sarebbe troppo facile (basta guardare la faccia).
  let idx = Math.floor(rng() * 54);
  while (idx % 9 === 4) idx = Math.floor(rng() * 54);

  const correct = COLOR_LABEL_IT[facelets[idx] as unknown as keyof typeof COLOR_LABEL_IT];
  const wrong = Object.values(COLOR_LABEL_IT)
    .filter((c) => c !== correct)
    .slice(0, 5);
  // tre alternative sbagliate scelte a caso
  const picks: string[] = [];
  while (picks.length < 3) {
    const w = pick(wrong, rng);
    if (!picks.includes(w)) picks.push(w);
  }
  const { options, answer } = shuffleWithAnswer(correct, picks, rng);

  return {
    prompt: 'Quale colore manca?',
    speech: 'Guarda bene il cubo. Quale colore manca nel quadratino coperto?',
    options,
    answer,
    why: `Quel quadratino era ${correct}.`,
    facelets,
    focus: idx,
  };
}

/** 🔄 Quale lato dobbiamo girare? Mostriamo un cubo a una mossa dalla soluzione. */
export function makeMoveQuestion(rng: Rng): Question {
  const seq = randomMoveSequence(1, rng);
  const move = seq[0];
  const cube = applyMoves(identityCube(), seq);
  const facelets = cubieToFacelet(cube);
  const solution = invertMoves(seq)[0];
  const correct = SIDE_NAME_IT[solution.face];
  const others = Object.values(SIDE_NAME_IT).filter((s) => s !== correct);
  const picks: string[] = [];
  while (picks.length < 3) {
    const w = pick(others, rng);
    if (!picks.includes(w)) picks.push(w);
  }
  const { options, answer } = shuffleWithAnswer(correct, picks, rng);
  const desc = describeMove(solution, 'facile');

  return {
    prompt: 'A questo cubo manca una sola mossa. Quale lato dobbiamo girare?',
    speech: 'A questo cubo manca una sola mossa. Quale lato dobbiamo girare?',
    options,
    answer,
    why: `${desc.text} I grandi la chiamano ${desc.notation}.`,
    facelets,
    sequence: [solution],
  };
}

/** 🧩 Trova il pezzo con due colori: dove si trova adesso? */
export function makePieceQuestion(rng: Rng): Question {
  const cube = scrambledCube(15, rng);
  const facelets = cubieToFacelet(cube);
  const edge = Math.floor(rng() * 12) as Edge;
  const [fa, fb] = EDGE_FACE[edge];
  const nameA = COLOR_LABEL_IT[fa as unknown as keyof typeof COLOR_LABEL_IT];
  const nameB = COLOR_LABEL_IT[fb as unknown as keyof typeof COLOR_LABEL_IT];

  // Dove si trova adesso quel pezzo?
  let slot = -1;
  for (let i = 0; i < 12; i++) if (cube.ep[i] === edge) slot = i;

  const slotName = (i: number): string => {
    const [x, y] = EDGE_FACE[i];
    return `fra il ${SIDE_NAME_IT[x]} e il ${SIDE_NAME_IT[y]}`;
  };

  const correct = slotName(slot);
  const picks: string[] = [];
  while (picks.length < 3) {
    const j = Math.floor(rng() * 12);
    const cand = slotName(j);
    if (cand !== correct && !picks.includes(cand)) picks.push(cand);
  }
  const { options, answer } = shuffleWithAnswer(correct, picks, rng);

  return {
    prompt: `Trova il pezzo ${nameA}-${nameB}. Dove si trova adesso?`,
    speech: `Cerca il pezzo ${nameA} e ${nameB}. Dove si trova adesso?`,
    options,
    answer,
    why: `Il pezzo ${nameA}-${nameB} si trova ${correct}.`,
    facelets,
  };
}

/** ⚡ Memory: ricorda la sequenza di mosse e ripetila. */
export function makeMemoryQuestion(rng: Rng, length = 3): Question {
  const seq = randomMoveSequence(length, rng);
  const asText = seq.map((m) => describeMove(m, 'facile').text).join(' ');
  return {
    prompt: 'Guarda bene la sequenza, poi ripetila!',
    speech: 'Guarda bene: adesso faccio delle mosse. Poi tocca a te ripeterle.',
    options: [],
    answer: -1,
    why: asText,
    sequence: seq,
    facelets: cubieToFacelet(identityCube()),
  };
}

export function makeQuestion(game: MiniGameId, rng: Rng, level = 1): Question {
  switch (game) {
    case 'colore':
      return makeColorQuestion(rng);
    case 'mossa':
      return makeMoveQuestion(rng);
    case 'pezzo':
      return makePieceQuestion(rng);
    case 'memory':
      return makeMemoryQuestion(rng, Math.min(2 + level, 6));
  }
}

/** Verifica la risposta del memory confrontando le mosse rifatte dal bambino. */
export function checkMemoryAnswer(expected: Move[], given: Move[]): boolean {
  if (expected.length !== given.length) return false;
  return expected.every((m, i) => m.face === given[i].face && m.power === given[i].power);
}
