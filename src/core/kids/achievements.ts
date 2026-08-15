/**
 * Stelle, medaglie e badge.
 *
 * Regola di progettazione: le ricompense premiano l'IMPARARE, non il tempo
 * passato nell'app. Non esistono premi per "gioca ogni giorno", ne' serie da
 * mantenere, ne' classifiche pubbliche: sono le meccaniche che spingono un
 * bambino a tornare in modo compulsivo. Qui si vince finendo qualcosa.
 */

export interface Progress {
  /** Soprannome scelto dal bambino: facoltativo e salvato solo sul telefono. */
  nickname?: string;
  cubesSolved: number;
  /** Millisecondi del tentativo piu' veloce (modalita' sfida). */
  bestTimeMs?: number;
  lastTimeMs?: number;
  totalMoves: number;
  /** Quante volte e' stato premuto "aiutami". */
  helpUsed: number;
  /** Risoluzioni completate senza premere "aiutami" nemmeno una volta. */
  solvedWithoutHelp: number;
  /** Livelli della modalita' "Impara" completati (1..6). */
  levelsCompleted: number[];
  /** Facce inserite a mano o scansionate, in totale. */
  facesEntered: number;
  badges: string[];
  stars: number;
  /** Minuti totali di utilizzo, per l'area genitore. */
  minutesUsed: number;
  /** Quante volte e' stata usata ogni modalita', per l'area genitore. */
  modeUsage: Record<string, number>;
}

export function emptyProgress(): Progress {
  return {
    cubesSolved: 0,
    totalMoves: 0,
    helpUsed: 0,
    solvedWithoutHelp: 0,
    levelsCompleted: [],
    facesEntered: 0,
    badges: [],
    stars: 0,
    minutesUsed: 0,
    modeUsage: {},
  };
}

export interface BadgeDef {
  id: string;
  icon: string;
  title: string;
  /** Come si ottiene, spiegato al bambino. */
  how: string;
  /** Frase di Rubi quando lo si conquista. */
  celebration: string;
  stars: number;
  earned: (p: Progress, ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  /** Vero se la risoluzione appena finita e' stata fatta senza aiuti. */
  usedHelpThisSolve?: boolean;
  /** Tempo dell'ultimo tentativo, se in modalita' sfida. */
  improvedByMs?: number;
}

export const BADGES: BadgeDef[] = [
  {
    id: 'first-face',
    icon: '🏅',
    title: 'Primo passo!',
    how: 'Completa la tua prima faccia.',
    celebration: 'Hai finito la tua prima faccia! Questo e solo l inizio.',
    stars: 1,
    earned: (p) => p.facesEntered >= 1,
  },
  {
    id: 'all-faces',
    icon: '🎨',
    title: 'Occhio di falco',
    how: 'Inserisci tutte e sei le facce del cubo.',
    celebration: 'Sei facce su sei! Hai visto tutto il cubo.',
    stars: 1,
    earned: (p) => p.facesEntered >= 6,
  },
  {
    id: 'rubik-hero',
    icon: '🏆',
    title: 'Rubik Hero!',
    how: 'Risolvi il tuo primo cubo.',
    celebration: 'Hai risolto il tuo primo cubo! Sei ufficialmente un Rubik Hero!',
    stars: 3,
    earned: (p) => p.cubesSolved >= 1,
  },
  {
    id: 'super-solver',
    icon: '🥇',
    title: 'Super Solver!',
    how: 'Risolvi un cubo intero senza chiedere aiuto.',
    celebration: 'Tutto da solo, senza aiuto! Sei bravissimo.',
    stars: 3,
    earned: (p) => p.solvedWithoutHelp >= 1,
  },
  {
    id: 'second-time',
    icon: '🔥',
    title: 'Stai diventando velocissimo!',
    how: 'Risolvi il cubo una seconda volta.',
    celebration: 'Due cubi risolti! Si vede che stai imparando.',
    stars: 2,
    earned: (p) => p.cubesSolved >= 2,
  },
  {
    id: 'five-cubes',
    icon: '🎖️',
    title: 'Collezionista',
    how: 'Risolvi cinque cubi.',
    celebration: 'Cinque cubi! Ormai sei un esperto.',
    stars: 2,
    earned: (p) => p.cubesSolved >= 5,
  },
  {
    id: 'faster',
    icon: '⚡',
    title: 'Piu veloce di prima',
    how: 'Migliora il tuo tempo nella sfida.',
    celebration: 'Hai battuto il tuo record! Guarda che tempo.',
    stars: 2,
    earned: (_p, ctx) => (ctx.improvedByMs ?? 0) > 0,
  },
  {
    id: 'level-cross',
    icon: '✚',
    title: 'Maestro della croce',
    how: 'Completa il livello 2: la croce.',
    celebration: 'La croce non ha piu segreti per te!',
    stars: 1,
    earned: (p) => p.levelsCompleted.includes(2),
  },
  {
    id: 'level-first',
    icon: '🧱',
    title: 'Primo piano finito',
    how: 'Completa il livello 3: il primo lato.',
    celebration: 'Primo piano completato! Che soddisfazione.',
    stars: 1,
    earned: (p) => p.levelsCompleted.includes(3),
  },
  {
    id: 'level-second',
    icon: '🏗️',
    title: 'Costruttore',
    how: 'Completa il livello 4: il piano di mezzo.',
    celebration: 'Anche il piano di mezzo! Manca solo il tetto.',
    stars: 2,
    earned: (p) => p.levelsCompleted.includes(4),
  },
  {
    id: 'level-last',
    icon: '👑',
    title: 'Re dell ultimo piano',
    how: 'Completa il livello 5: l ultimo lato.',
    celebration: 'Ultimo piano finito! Sei arrivato in cima.',
    stars: 3,
    earned: (p) => p.levelsCompleted.includes(5),
  },
  {
    id: 'true-hero',
    icon: '🌟',
    title: 'Vero Rubik Hero',
    how: 'Completa tutti e sei i livelli della scuola di Rubi.',
    celebration: 'Hai finito tutta la scuola di Rubi! Sono orgoglioso di te.',
    stars: 5,
    earned: (p) => [1, 2, 3, 4, 5, 6].every((l) => p.levelsCompleted.includes(l)),
  },
];

export interface BadgeAward {
  badge: BadgeDef;
  /** Stelle guadagnate con questo badge. */
  stars: number;
}

/**
 * Calcola i badge appena conquistati e aggiorna stelle e lista.
 * Restituisce solo le NOVITA', cosi l'app puo' mostrare l'animazione.
 */
export function grantBadges(progress: Progress, ctx: BadgeContext = {}): BadgeAward[] {
  const fresh: BadgeAward[] = [];
  for (const badge of BADGES) {
    if (progress.badges.includes(badge.id)) continue;
    if (!badge.earned(progress, ctx)) continue;
    progress.badges.push(badge.id);
    progress.stars += badge.stars;
    fresh.push({ badge, stars: badge.stars });
  }
  return fresh;
}

/** Titolo mostrato nel riepilogo: "Rubik Hero 3". */
export function heroTitle(p: Progress): string {
  const level = 1 + Math.floor(p.stars / 5);
  return `Rubik Hero ${level}`;
}

export function formatTime(ms?: number): string {
  if (ms === undefined) return '--:--';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Registra una risoluzione completata e assegna i premi. */
export function recordSolve(
  progress: Progress,
  opts: { moves: number; usedHelp: boolean; timeMs?: number },
): BadgeAward[] {
  progress.cubesSolved += 1;
  progress.totalMoves += opts.moves;
  if (!opts.usedHelp) progress.solvedWithoutHelp += 1;

  let improvedByMs = 0;
  if (opts.timeMs !== undefined) {
    if (progress.bestTimeMs !== undefined && opts.timeMs < progress.bestTimeMs) {
      improvedByMs = progress.bestTimeMs - opts.timeMs;
    }
    progress.lastTimeMs = opts.timeMs;
    if (progress.bestTimeMs === undefined || opts.timeMs < progress.bestTimeMs) {
      progress.bestTimeMs = opts.timeMs;
    }
  }
  return grantBadges(progress, { usedHelpThisSolve: opts.usedHelp, improvedByMs });
}

/** Messaggio finale della sfida a tempo. */
export function challengeMessage(p: Progress, improvedByMs: number): string {
  if (improvedByMs > 0) {
    const secs = Math.round(improvedByMs / 1000);
    return `Fantastico! Hai migliorato il tuo tempo di ${secs} second${secs === 1 ? 'o' : 'i'}!`;
  }
  if (p.bestTimeMs !== undefined && p.lastTimeMs !== undefined) {
    return `Bel tentativo! Il tuo record resta ${formatTime(p.bestTimeMs)}.`;
  }
  return 'Bravo, primo tempo registrato! Adesso puoi provare a batterlo.';
}

export function completeLevel(progress: Progress, level: number): BadgeAward[] {
  if (!progress.levelsCompleted.includes(level)) {
    progress.levelsCompleted.push(level);
    progress.levelsCompleted.sort((a, b) => a - b);
    progress.stars += 1;
  }
  return grantBadges(progress);
}
