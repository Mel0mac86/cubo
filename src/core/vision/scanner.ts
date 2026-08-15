/**
 * Il regista della scansione.
 *
 * Tiene il conto di quali facce abbiamo gia' visto, accumula piu' fotogrammi
 * per ciascuna faccia, decide quando la lettura e' abbastanza stabile da
 * essere accettata da sola, e dice al bambino come girare il cubo per la
 * faccia successiva.
 *
 * Non fa niente di grafico: e' una macchina a stati pura, quindi si puo'
 * provare con dei test senza fotocamera.
 */

import { CubeColor, COLOR_LABEL_IT, COLOR_EMOJI, Face, FACE_ORDER } from '../cube/defs';
import {
  Calibration,
  Rgb,
  StickerAssignment,
  assignAllStickers,
  classifySticker,
  defaultCalibration,
  learnReference,
} from './color';
import { CellSample, FrameAnalysis, QualityReport } from './frame';

/**
 * L'ordine in cui chiediamo le facce e come girare il cubo per passare alla
 * successiva. Le istruzioni sono fisiche ("gira il cubo verso sinistra"),
 * mai in notazione.
 */
export interface FaceStep {
  face: Face;
  /** Come si arriva a questa faccia partendo dalla precedente. */
  turn: string;
  turnSpeech: string;
  /** Direzione dell'animazione 3D di come girare il cubo. */
  gesture: 'inizio' | 'sinistra' | 'destra' | 'su' | 'giu';
}

/**
 * Percorso pensato per essere semplice da eseguire: quattro giri nello stesso
 * verso per la fascia centrale, poi sopra e sotto.
 */
export const SCAN_ORDER: FaceStep[] = [
  {
    face: Face.F,
    turn: 'Tieni il cubo davanti a te, come ti ho mostrato.',
    turnSpeech: 'Tieni il cubo davanti a te, con tutte e due le mani ai lati.',
    gesture: 'inizio',
  },
  {
    face: Face.R,
    turn: 'Gira il cubo verso sinistra, cosi! 👈',
    turnSpeech: 'Adesso gira tutto il cubo verso sinistra.',
    gesture: 'sinistra',
  },
  {
    face: Face.B,
    turn: 'Ancora verso sinistra! 👈',
    turnSpeech: 'Bravo! Gira ancora verso sinistra.',
    gesture: 'sinistra',
  },
  {
    face: Face.L,
    turn: 'Un altro giro verso sinistra! 👈',
    turnSpeech: 'Un altro giro verso sinistra e ci siamo.',
    gesture: 'sinistra',
  },
  {
    face: Face.U,
    turn: 'Adesso torna davanti e inclina il cubo in avanti, per farmi vedere il tetto. 👆',
    turnSpeech:
      'Adesso torna come prima e inclina il cubo in avanti, cosi vedo la faccia di sopra.',
    gesture: 'su',
  },
  {
    face: Face.D,
    turn: 'Ultima! Inclina il cubo indietro per farmi vedere il pavimento. 👇',
    turnSpeech: 'Ultima faccia! Inclina il cubo indietro cosi vedo quella di sotto.',
    gesture: 'giu',
  },
];

export interface CapturedFace {
  face: Face;
  /** Nove colori RGB, ordine: alto-sinistra ... basso-destra. */
  samples: Rgb[];
  /** Colori riconosciuti dal vivo (provvisori). */
  colors: CubeColor[];
  confidences: number[];
  /** Quanti fotogrammi hanno contribuito. */
  frames: number;
}

export type ScannerPhase =
  | 'spiegazione'
  | 'cerco'
  | 'stabilizzo'
  | 'conto-alla-rovescia'
  | 'acquisita'
  | 'gira-il-cubo'
  | 'completata';

export interface ScannerState {
  phase: ScannerPhase;
  /** Indice nella SCAN_ORDER: 0..5 */
  stepIndex: number;
  captured: CapturedFace[];
  calibration: Calibration;
  /** Fotogrammi buoni consecutivi accumulati per la faccia in corso. */
  goodFrames: number;
  /** Ultimo messaggio da mostrare/leggere. */
  message: string;
  /** Anteprima dal vivo dei nove colori (null finche' non vediamo la griglia). */
  preview: { colors: CubeColor[]; confidences: number[] } | null;
}

/** Quanti fotogrammi buoni servono prima di scattare da soli. */
export const FRAMES_TO_CAPTURE = 5;
/** Sotto questa sicurezza non accettiamo la faccia in automatico. */
export const MIN_CONFIDENCE = 0.55;

export function newScanner(): ScannerState {
  return {
    phase: 'spiegazione',
    stepIndex: 0,
    captured: [],
    calibration: defaultCalibration(),
    goodFrames: 0,
    message: SCAN_ORDER[0].turn,
    preview: null,
  };
}

/** Buffer dei fotogrammi accumulati per la faccia in corso. */
interface FaceBuffer {
  /** Per ciascuna delle nove celle, i campioni raccolti finora. */
  cells: Rgb[][];
}

const buffers = new WeakMap<ScannerState, FaceBuffer>();

function bufferFor(state: ScannerState): FaceBuffer {
  let b = buffers.get(state);
  if (!b) {
    b = { cells: Array.from({ length: 9 }, () => []) };
    buffers.set(state, b);
  }
  return b;
}

function resetBuffer(state: ScannerState): void {
  buffers.set(state, { cells: Array.from({ length: 9 }, () => []) });
}

/** Mediana per canale: butta via automaticamente i fotogrammi strani. */
function fuse(samples: Rgb[]): Rgb {
  const med = (get: (s: Rgb) => number) => {
    const v = samples.map(get).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return { r: med((s) => s.r), g: med((s) => s.g), b: med((s) => s.b) };
}

export interface ScanUpdate {
  state: ScannerState;
  /** Vero se in questo aggiornamento abbiamo acquisito una faccia. */
  capturedFace?: CapturedFace;
  /** Vero se abbiamo finito tutte e sei. */
  done?: boolean;
  /** Da leggere ad alta voce, se cambiato. */
  speak?: string;
}

/**
 * Passo della macchina a stati: si chiama a ogni fotogramma della fotocamera.
 * `analysis` viene da analyzeFrame().
 */
export function pushFrame(state: ScannerState, analysis: FrameAnalysis): ScanUpdate {
  if (state.phase === 'completata') return { state, done: true };

  // Durante la spiegazione o mentre il bambino gira il cubo non acquisiamo.
  if (state.phase === 'spiegazione' || state.phase === 'gira-il-cubo') {
    // Appena il cubo torna nitido e centrato ripartiamo da soli.
    if (analysis.quality.ok) {
      state.phase = 'cerco';
      state.goodFrames = 0;
      resetBuffer(state);
    }
    return { state };
  }

  const q: QualityReport = analysis.quality;

  if (!q.ok || !analysis.cells) {
    // Qualita' insufficiente: NON acquisiamo, spieghiamo perche'.
    state.goodFrames = Math.max(0, state.goodFrames - 1);
    state.phase = 'cerco';
    state.message = q.advice;
    state.preview = null;
    return { state, speak: q.advice };
  }

  // Fotogramma buono: accumuliamo.
  const buf = bufferFor(state);
  analysis.cells.forEach((c: CellSample, i: number) => {
    buf.cells[i].push(c.color);
    if (buf.cells[i].length > 9) buf.cells[i].shift();
  });
  state.goodFrames++;

  // Anteprima dal vivo con i colori fusi finora.
  const fused = buf.cells.map(fuse);
  const guesses = fused.map((s) => classifySticker(s, state.calibration));
  state.preview = {
    colors: guesses.map((g) => g.color),
    confidences: guesses.map((g) => g.confidence),
  };

  const weakest = Math.min(...guesses.map((g) => g.confidence));

  if (state.goodFrames < FRAMES_TO_CAPTURE) {
    state.phase = state.goodFrames >= 2 ? 'conto-alla-rovescia' : 'stabilizzo';
    state.message =
      state.phase === 'conto-alla-rovescia'
        ? `Perfetto! Tienilo fermo... ${FRAMES_TO_CAPTURE - state.goodFrames}`
        : 'Ci sono quasi, tienilo fermo!';
    return { state };
  }

  if (weakest < MIN_CONFIDENCE) {
    // Lettura instabile: non accettiamo, chiediamo di avvicinare.
    state.goodFrames = Math.max(0, state.goodFrames - 2);
    const worst = guesses.reduce((a, b) => (a.confidence <= b.confidence ? a : b));
    state.message = `Non sono sicuro di un colore: potrebbe essere ${COLOR_LABEL_IT[worst.color]} o ${COLOR_LABEL_IT[worst.runnerUp]}. Puoi avvicinare un po il cubo?`;
    return { state, speak: state.message };
  }

  return captureCurrentFace(state, fused, guesses.map((g) => g.confidence), guesses.map((g) => g.color));
}

function captureCurrentFace(
  state: ScannerState,
  samples: Rgb[],
  confidences: number[],
  colors: CubeColor[],
): ScanUpdate {
  const step = SCAN_ORDER[state.stepIndex];

  // Il centro ci dice qual e' questa faccia: non lo chiediamo al bambino.
  const centerColor = colors[4];
  learnReference(state.calibration, centerColor, samples[4]);

  const face: CapturedFace = {
    face: step.face,
    samples,
    colors,
    confidences,
    frames: state.goodFrames,
  };
  state.captured.push(face);
  resetBuffer(state);
  state.goodFrames = 0;
  state.preview = null;

  const recognised = `${COLOR_EMOJI[centerColor]} Faccia ${COLOR_LABEL_IT[centerColor]} riconosciuta!`;

  if (state.captured.length >= 6) {
    state.phase = 'completata';
    state.stepIndex = 5;
    state.message = 'Fatto! Ho visto tutte le 54 caselle! 🎉';
    return { state, capturedFace: face, done: true, speak: state.message };
  }

  state.stepIndex++;
  state.phase = 'gira-il-cubo';
  const next = SCAN_ORDER[state.stepIndex];
  state.message = `${recognised}\n${next.turn}`;
  return { state, capturedFace: face, speak: `${recognised} ${next.turnSpeech}` };
}

/** Il bambino ha visto l'animazione di come girare: si riparte. */
export function readyForNextFace(state: ScannerState): ScannerState {
  if (state.phase === 'gira-il-cubo' || state.phase === 'spiegazione') {
    state.phase = 'cerco';
    state.goodFrames = 0;
    resetBuffer(state);
  }
  return state;
}

/** Riscansiona una faccia gia' acquisita (dopo un controllo incrociato fallito). */
export function rescanFace(state: ScannerState, face: Face): ScannerState {
  state.captured = state.captured.filter((c) => c.face !== face);
  const idx = SCAN_ORDER.findIndex((s) => s.face === face);
  state.stepIndex = Math.max(0, idx);
  state.phase = 'gira-il-cubo';
  state.goodFrames = 0;
  resetBuffer(state);
  state.message = `Riproviamo con la faccia ${COLOR_LABEL_IT[centerOf(state, face) ?? CubeColor.White]}. ${SCAN_ORDER[state.stepIndex].turn}`;
  return state;
}

function centerOf(state: ScannerState, face: Face): CubeColor | undefined {
  return state.captured.find((c) => c.face === face)?.colors[4];
}

/* ------------------------------------------------------------------ */
/* Elenco delle facce fatte e ancora da fare                           */
/* ------------------------------------------------------------------ */

export interface FaceChecklistEntry {
  face: Face;
  done: boolean;
  emoji: string;
  label: string;
}

export function faceChecklist(state: ScannerState): FaceChecklistEntry[] {
  return SCAN_ORDER.map((step) => {
    const got = state.captured.find((c) => c.face === step.face);
    const color = got?.colors[4];
    return {
      face: step.face,
      done: !!got,
      emoji: color !== undefined ? COLOR_EMOJI[color] : '⬜',
      label: color !== undefined ? COLOR_LABEL_IT[color] : 'da fare',
    };
  });
}

/* ------------------------------------------------------------------ */
/* Controllo incrociato e ricostruzione dello stato                    */
/* ------------------------------------------------------------------ */

export interface CrossCheck {
  ok: boolean;
  /** Messaggio semplice se qualcosa non torna. */
  message?: string;
  /** Facce da far ricontrollare, la piu' sospetta per prima. */
  suspectFaces: Face[];
}

/**
 * Controlli che si possono fare gia' con due o piu' facce, senza aspettare la
 * fine: centri tutti diversi e nessun colore letto troppe volte.
 */
export function crossCheck(state: ScannerState): CrossCheck {
  const centers = state.captured.map((c) => ({ face: c.face, color: c.colors[4] }));
  const seen = new Map<CubeColor, Face[]>();
  for (const c of centers) {
    const list = seen.get(c.color) ?? [];
    list.push(c.face);
    seen.set(c.color, list);
  }
  for (const [color, faces] of seen) {
    if (faces.length > 1) {
      return {
        ok: false,
        message: `Ho visto due volte il centro ${COLOR_LABEL_IT[color]}: una delle due facce e stata letta male. Controlliamola!`,
        suspectFaces: faces,
      };
    }
  }

  const counts = new Map<CubeColor, number>();
  for (const c of state.captured) for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);
  for (const [color, n] of counts) {
    if (n > 9) {
      const worstFaces = state.captured
        .map((c) => ({
          face: c.face,
          // faccia piu' sospetta: quella con piu' quadratini di quel colore letti male
          score: c.colors.reduce(
            (acc, col, i) => acc + (col === color ? 1 - c.confidences[i] : 0),
            0,
          ),
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.face);
      return {
        ok: false,
        message: `Ho contato troppi quadratini ${COLOR_LABEL_IT[color]}. Credo che una faccia sia stata letta male: controlliamola insieme!`,
        suspectFaces: worstFaces,
      };
    }
  }

  return { ok: true, suspectFaces: [] };
}

/**
 * Riordina i 54 campioni nell'ordine dei facelet (U, R, F, D, L, B) e fa
 * l'assegnazione definitiva sfruttando il vincolo dei nove per colore.
 */
export function finalizeScan(state: ScannerState): {
  assignment: StickerAssignment;
  /** Mappa colore -> faccia, dedotta dai centri. */
  colorToFace: Map<CubeColor, Face>;
} {
  if (state.captured.length !== 6) throw new Error('Mancano ancora delle facce');

  const samples: Rgb[] = new Array(54);
  for (const cap of state.captured) {
    for (let i = 0; i < 9; i++) samples[cap.face * 9 + i] = cap.samples[i];
  }

  const assignment = assignAllStickers(samples, state.calibration);

  const colorToFace = new Map<CubeColor, Face>();
  for (const face of FACE_ORDER) colorToFace.set(assignment.colors[face * 9 + 4], face);

  return { assignment, colorToFace };
}

/**
 * Traduce i colori riconosciuti in "facce" (cioe' nel formato che vuole il
 * validatore): ogni colore diventa la faccia che ha quel colore al centro.
 */
export function colorsToFacelets(
  colors: CubeColor[],
  colorToFace: Map<CubeColor, Face>,
): (Face | null)[] {
  return colors.map((c) => colorToFace.get(c) ?? null);
}
