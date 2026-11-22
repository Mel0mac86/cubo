import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CubeColor, Face } from '../../core/cube/defs';
import {
  ColorOfFace,
  colorsToFaces,
  deriveColorOfFace,
  facesToColors,
} from '../../core/cube/scheme';
import { CubieCube } from '../../core/cube/cubie';
import { QUADRATINI } from '../../core/cube4/cube4';
import { Soluzione4 } from '../../core/cube4/solver4';
import { SolutionStage } from '../../core/solver/beginner';
import { Move } from '../../core/cube/moves';

/**
 * Il cubo su cui stiamo lavorando adesso.
 *
 * Nota importante sul modello: il bambino inserisce COLORI (bianco, rosso...),
 * mentre il motore matematico ragiona per FACCE (sopra, destra, davanti...).
 * Le due cose non coincidono: quale colore sta "sopra" dipende da come il
 * bambino ha tenuto il cubo. Il ponte fra i due mondi sono i sei centri, che
 * non si spostano mai: il colore del centro di una faccia DEFINISCE quella
 * faccia. Qui teniamo i colori grezzi e la mappa colore <-> faccia dedotta
 * dai centri, cosi la conversione avviene in un posto solo.
 */

export interface Solution {
  moves: Move[];
  stages: SolutionStage[];
  engine: 'strati' | 'kociemba';
}

interface SessionValue {
  /** 54 colori scelti dal bambino, null dove non ha ancora deciso. */
  colors: (CubeColor | null)[];
  setColors: (c: (CubeColor | null)[]) => void;
  setColor: (index: number, color: CubeColor | null) => void;
  setFaceColors: (face: Face, colors: (CubeColor | null)[]) => void;
  clear: () => void;

  /** Mappa dedotta dai sei centri; null finche' non sono tutti inseriti. */
  colorOfFace: ColorOfFace | null;

  cube: CubieCube | null;
  setCube: (c: CubieCube | null) => void;

  solution: Solution | null;
  setSolution: (s: Solution | null) => void;

  helpUsed: number;
  addHelp: () => void;
  resetHelp: () => void;

  startedAt: number | null;
  startTimer: () => void;
  stopTimer: () => number | null;

  /* --- il cubo grande (4x4) ---------------------------------------
   * Tenuto a parte dal 3x3 e non al suo posto: i due cubi hanno numeri di
   * quadratini diversi (54 contro 96) e regole diverse, e mescolarli in un
   * campo solo vorrebbe dire controllare la taglia a ogni riga di codice. */
  colori4: (CubeColor | null)[];
  setColore4: (index: number, color: CubeColor | null) => void;
  setFaccia4: (face: Face, cells: (CubeColor | null)[]) => void;
  soluzione4: Soluzione4 | null;
  setSoluzione4: (s: Soluzione4 | null) => void;
  clear4: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function emptyColors(): (CubeColor | null)[] {
  return new Array(54).fill(null);
}

function emptyColors4(): (CubeColor | null)[] {
  return new Array(QUADRATINI).fill(null);
}

/** Ri-esportate per comodita' delle schermate. */
export { colorsToFaces, facesToColors, deriveColorOfFace };
export type { ColorOfFace };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColorsState] = useState<(CubeColor | null)[]>(emptyColors);
  const [cube, setCube] = useState<CubieCube | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [helpUsed, setHelpUsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [colori4, setColori4] = useState<(CubeColor | null)[]>(emptyColors4);
  const [soluzione4, setSoluzione4] = useState<Soluzione4 | null>(null);

  const setColors = useCallback((c: (CubeColor | null)[]) => setColorsState([...c]), []);

  const setColor = useCallback((index: number, color: CubeColor | null) => {
    setColorsState((prev) => {
      const next = [...prev];
      next[index] = color;
      return next;
    });
  }, []);

  const setFaceColors = useCallback((face: Face, cells: (CubeColor | null)[]) => {
    setColorsState((prev) => {
      const next = [...prev];
      for (let i = 0; i < 9; i++) next[face * 9 + i] = cells[i] ?? null;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setColorsState(emptyColors());
    setCube(null);
    setSolution(null);
    setHelpUsed(0);
    setStartedAt(null);
  }, []);

  const addHelp = useCallback(() => setHelpUsed((h) => h + 1), []);
  const resetHelp = useCallback(() => setHelpUsed(0), []);
  const startTimer = useCallback(() => setStartedAt(Date.now()), []);
  const stopTimer = useCallback(() => {
    if (startedAt === null) return null;
    const ms = Date.now() - startedAt;
    setStartedAt(null);
    return ms;
  }, [startedAt]);

  const setColore4 = useCallback((index: number, color: CubeColor | null) => {
    setColori4((prev) => {
      const next = [...prev];
      next[index] = color;
      return next;
    });
  }, []);

  const setFaccia4 = useCallback((face: Face, cells: (CubeColor | null)[]) => {
    setColori4((prev) => {
      const next = [...prev];
      for (let i = 0; i < 16; i++) next[face * 16 + i] = cells[i] ?? null;
      return next;
    });
  }, []);

  const clear4 = useCallback(() => {
    setColori4(emptyColors4());
    setSoluzione4(null);
  }, []);

  const colorOfFace = useMemo(() => deriveColorOfFace(colors), [colors]);

  const value = useMemo(
    () => ({
      colors,
      setColors,
      setColor,
      setFaceColors,
      clear,
      colorOfFace,
      cube,
      setCube,
      solution,
      setSolution,
      helpUsed,
      addHelp,
      resetHelp,
      startedAt,
      startTimer,
      stopTimer,
      colori4,
      setColore4,
      setFaccia4,
      soluzione4,
      setSoluzione4,
      clear4,
    }),
    [
      colors,
      setColors,
      setColor,
      setFaceColors,
      clear,
      colorOfFace,
      cube,
      solution,
      helpUsed,
      addHelp,
      resetHelp,
      startedAt,
      startTimer,
      stopTimer,
      colori4,
      setColore4,
      setFaccia4,
      soluzione4,
      clear4,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession va usato dentro SessionProvider');
  return v;
}
