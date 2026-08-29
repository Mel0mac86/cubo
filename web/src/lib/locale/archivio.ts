/**
 * MODALITÀ LOCALE — l'archivio dei dati sul telefono.
 *
 * Quando l'app è pubblicata come sito statico (GitHub Pages) non c'è nessun
 * server: i dati vivono nel telefono, dentro localStorage. Le regole restano
 * le stesse, perché i calcoli arrivano dallo stesso dominio usato dal server.
 *
 * Conseguenze da conoscere (scritte anche nell'app):
 *  - i dati NON escono dal telefono e non si sincronizzano fra dispositivi;
 *  - se Safari cancella i dati dei siti, si perdono: per questo c'è il backup.
 */
import type { Cents } from '@dominio/money.js';
import type { DonationCause, JarType, Split, TransactionType } from '@dominio/types.js';

export const VERSIONE_ARCHIVIO = 1;
const CHIAVE = 'mma.locale.v1';

export interface BambinoLocale {
  id: string;
  familyId: string;
  name: string;
  age: number | null;
  avatar: string;
  avatarColor: string;
  xp: number;
  createdAt: string;
  onboardingCompleted: boolean;
  settings: {
    minGivePercent: number;
    defaultSplit: Split;
    interestCentsPerEuro: number;
    interestEnabled: boolean;
    allowanceCents: Cents;
    allowanceDay: number;
    lockedFeatures: string[];
    soundEnabled: boolean;
  };
}

export interface TransazioneLocale {
  id: string;
  childId: string;
  occurredAt: string;
  type: TransactionType;
  jar: JarType;
  amountCents: Cents;
  balanceBeforeCents: Cents;
  balanceAfterCents: Cents;
  description: string;
  source: string;
  goalId: string | null;
  groupId: string | null;
  clientId: string | null;
  metadata: Record<string, unknown>;
}

export interface ObiettivoLocale {
  id: string;
  childId: string;
  name: string;
  emoji: string;
  imageUrl: string | null;
  targetCents: Cents;
  savedAtCreationCents: Cents;
  targetDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  isPrimary: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface Archivio {
  versione: number;
  famiglia: { id: string; nome: string; email: string; passwordHash: string; passwordSalt: string; pinHash: string; pinSalt: string } | null;
  utenteGenitoreId: string;
  bambini: BambinoLocale[];
  salvadanai: Record<string, Record<JarType, Cents>>;
  transazioni: TransazioneLocale[];
  scelte: { id: string; childId: string; groupId: string; amountCents: Cents; save: number; spend: number; give: number; source: string; createdAt: string }[];
  obiettivi: ObiettivoLocale[];
  entrateInAttesa: { id: string; childId: string; amountCents: Cents; type: TransactionType; description: string; status: 'PENDING' | 'ALLOCATED' | 'CANCELLED'; createdAt: string }[];
  lavori: { id: string; familyId: string; title: string; emoji: string; rewardCents: Cents; description: string | null; active: boolean; createdAt: string }[];
  richieste: { id: string; jobId: string; childId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requestedRewardCents: Cents; approvedRewardCents: Cents | null; note: string | null; parentNote: string | null; requestedAt: string; decidedAt: string | null }[];
  obiettiviGive: { id: string; childId: string; title: string; cause: DonationCause; targetCents: Cents; donatedCents: Cents; status: 'ACTIVE' | 'COMPLETED'; note: string | null; photoUrl: string | null; createdAt: string; completedAt: string | null }[];
  donazioni: { id: string; childId: string; donationGoalId: string | null; amountCents: Cents; cause: DonationCause; note: string | null; photoUrl: string | null; createdAt: string }[];
  interessi: { id: string; childId: string; periodo: string; baseCents: Cents; centsPerEuro: number; interestCents: Cents; createdAt: string }[];
  xp: { id: string; childId: string; reason: string; amount: number; createdAt: string }[];
  badge: { id: string; childId: string; code: string; title: string; emoji: string; unlockedAt: string }[];
  notifiche: { id: string; childId: string; kind: string; emoji: string; message: string; createdAt: string; readAt: string | null }[];
  lezioni: { childId: string; lessonId: string; completedAt: string | null; bestScore: number; attempts: number }[];
  quiz: { id: string; childId: string; lessonId: string; score: number; total: number; createdAt: string }[];
  coach: { id: string; childId: string; role: 'child' | 'coach'; content: string; metadata: Record<string, unknown>; createdAt: string }[];
}

export function archivioVuoto(): Archivio {
  return {
    versione: VERSIONE_ARCHIVIO,
    famiglia: null,
    utenteGenitoreId: 'genitore',
    bambini: [],
    salvadanai: {},
    transazioni: [],
    scelte: [],
    obiettivi: [],
    entrateInAttesa: [],
    lavori: [],
    richieste: [],
    obiettiviGive: [],
    donazioni: [],
    interessi: [],
    xp: [],
    badge: [],
    notifiche: [],
    lezioni: [],
    quiz: [],
    coach: [],
  };
}

let cache: Archivio | null = null;

export function leggiArchivio(): Archivio {
  if (cache) return cache;
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (grezzo) {
      const dati = JSON.parse(grezzo) as Archivio;
      cache = { ...archivioVuoto(), ...dati, versione: VERSIONE_ARCHIVIO };
      return cache;
    }
  } catch {
    /* dati illeggibili: si riparte da un archivio vuoto invece di bloccare l'app */
  }
  cache = archivioVuoto();
  return cache;
}

export function salvaArchivio(archivio: Archivio): void {
  cache = archivio;
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(archivio));
  } catch (err) {
    // Spazio esaurito: quasi sempre per le foto degli obiettivi.
    console.warn('[locale] impossibile salvare:', err);
    throw new Error('La memoria del telefono è piena. Prova a togliere le foto degli obiettivi.');
  }
}

/** Modifica l'archivio in modo atomico: o va a buon fine tutta, o non cambia nulla. */
export function modifica<T>(fn: (archivio: Archivio) => T): T {
  const copia = structuredClone(leggiArchivio());
  const risultato = fn(copia);
  salvaArchivio(copia);
  return risultato;
}

export function azzeraArchivio(): void {
  cache = archivioVuoto();
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    /* niente da fare */
  }
}

export function nuovoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ------------------------------------------------------------------ SEGRETI
/**
 * Password di famiglia e PIN genitore non vengono salvati in chiaro: chi ha
 * accesso al telefono (cioè il bambino) non deve poter leggere il PIN
 * curiosando nei dati del sito. PBKDF2 rende anche costoso indovinarlo.
 */
const ITERAZIONI = 120_000;

function esadecimale(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nuovoSale(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function derivaHash(segreto: string, sale: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Contesto non sicuro (http semplice): si degrada senza bloccare l'app.
    let h = 0;
    for (const c of `${sale}:${segreto}`) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return `debole-${(h >>> 0).toString(16)}`;
  }
  const codificatore = new TextEncoder();
  const chiave = await subtle.importKey('raw', codificatore.encode(segreto), 'PBKDF2', false, ['deriveBits']);
  const bit = await subtle.deriveBits(
    { name: 'PBKDF2', salt: codificatore.encode(sale), iterations: ITERAZIONI, hash: 'SHA-256' },
    chiave,
    256,
  );
  return esadecimale(bit);
}

export async function verificaSegreto(segreto: string, sale: string, hash: string): Promise<boolean> {
  return (await derivaHash(segreto, sale)) === hash;
}

// ------------------------------------------------------------------ BACKUP
/** Esporta tutto in un file JSON: è l'unico modo per non perdere i dati. */
export function esportaBackup(): { nomeFile: string; contenuto: string } {
  const archivio = leggiArchivio();
  const data = new Date().toISOString().slice(0, 10);
  return {
    nomeFile: `money-adventure-backup-${data}.json`,
    contenuto: JSON.stringify({ ...archivio, esportatoIl: new Date().toISOString() }, null, 2),
  };
}

/** Ripristina un backup. Restituisce un messaggio d'errore se il file non va bene. */
export function importaBackup(testo: string): { ok: true } | { ok: false; errore: string } {
  let dati: Partial<Archivio>;
  try {
    dati = JSON.parse(testo);
  } catch {
    return { ok: false, errore: 'Il file non è leggibile: assicurati di aver scelto il backup giusto.' };
  }
  if (typeof dati !== 'object' || dati === null || !Array.isArray(dati.bambini) || !Array.isArray(dati.transazioni)) {
    return { ok: false, errore: 'Questo file non sembra un backup di My Money Adventure.' };
  }
  if (typeof dati.versione === 'number' && dati.versione > VERSIONE_ARCHIVIO) {
    return { ok: false, errore: 'Il backup arriva da una versione più recente dell’app. Aggiorna l’app e riprova.' };
  }
  salvaArchivio({ ...archivioVuoto(), ...(dati as Archivio), versione: VERSIONE_ARCHIVIO });
  return { ok: true };
}
