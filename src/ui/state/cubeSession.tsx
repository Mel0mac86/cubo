import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CubeColor, Face } from '../../core/cube/defs';
import {
  ColorOfFace,
  colorsToFaces,
  deriveColorOfFace,
  facesToColors,
} from '../../core/cube/scheme';
import { CubieCube } from '../../core/cube/cubie';
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
}

const SessionContext = createContext<SessionValue | null>(null);

function emptyColors(): (CubeColor | null)[] {
  return new Array(54).fill(null);
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
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession va usato dentro SessionProvider');
  return v;
}
