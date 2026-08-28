import type { Cents } from './money.js';

/** I tre salvadanai. */
export const JARS = ['SAVE', 'SPEND', 'GIVE'] as const;
export type JarType = (typeof JARS)[number];

/** Tipi di movimento registrati nello storico. */
export const TRANSACTION_TYPES = [
  'ALLOWANCE',   // paghetta
  'JOB',         // lavoro extra approvato
  'GIFT',        // regalo / entrata straordinaria
  'PURCHASE',    // spesa
  'DONATION',    // donazione
  'INTEREST',    // interesse educativo su SAVE
  'TRANSFER_IN', // giroconto in entrata
  'TRANSFER_OUT',// giroconto in uscita
  'ADJUSTMENT',  // correzione del genitore
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Categorie usate dai filtri dello storico. */
export const HISTORY_FILTERS = [
  'TUTTO',
  'ENTRATE',
  'SPESE',
  'RISPARMIO',
  'DONAZIONI',
  'INTERESSI',
  'LAVORI',
] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

export interface Split {
  save: number;
  spend: number;
  give: number;
}

export interface JarBalances {
  SAVE: Cents;
  SPEND: Cents;
  GIVE: Cents;
}

export interface Transaction {
  id: string;
  childId: string;
  occurredAt: string; // ISO 8601
  type: TransactionType;
  jar: JarType;
  amountCents: Cents;        // positivo = entra nel salvadanaio, negativo = esce
  balanceBeforeCents: Cents;
  balanceAfterCents: Cents;
  description: string;
  source: string;            // 'paghetta', 'lavoro:<id>', 'genitore', 'sistema'...
  createdByUserId: string | null;
  groupId: string | null;    // lega fra loro le 3 righe di una ripartizione
  metadata: Record<string, unknown>;
}

export interface Goal {
  id: string;
  childId: string;
  name: string;
  emoji: string;
  imageUrl: string | null;
  targetCents: Cents;
  savedAtCreationCents: Cents; // quanto era gia' stato messo da parte fuori app
  targetDate: string | null;   // YYYY-MM-DD
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  isPrimary: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface Job {
  id: string;
  familyId: string;
  title: string;
  emoji: string;
  rewardCents: Cents;
  description: string | null;
  active: boolean;
  createdAt: string;
}

export type JobRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface JobRequest {
  id: string;
  jobId: string;
  childId: string;
  status: JobRequestStatus;
  requestedRewardCents: Cents;
  approvedRewardCents: Cents | null;
  note: string | null;
  parentNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
}

export const DONATION_CAUSES = ['ANIMALI', 'AMBIENTE', 'PERSONE', 'ISTRUZIONE', 'EMERGENZE'] as const;
export type DonationCause = (typeof DONATION_CAUSES)[number];

export interface DonationGoal {
  id: string;
  childId: string;
  title: string;
  cause: DonationCause;
  targetCents: Cents;
  donatedCents: Cents;
  status: 'ACTIVE' | 'COMPLETED';
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Achievement {
  id: string;
  childId: string;
  code: string;
  title: string;
  emoji: string;
  unlockedAt: string;
}

export interface ChildSettings {
  minGivePercent: number;        // regola famiglia: GIVE non scende sotto questa soglia
  defaultSplit: Split;           // ripartizione proposta all'arrivo di una entrata
  interestCentsPerEuro: number;  // "5 centesimi per ogni euro" -> 5
  interestEnabled: boolean;
  allowanceCents: Cents;         // paghetta ricorrente
  allowanceDay: number;          // 0=domenica ... 6=sabato
  lockedFeatures: string[];      // funzioni temporaneamente bloccate dal genitore
  soundEnabled: boolean;
}

export interface Child {
  id: string;
  familyId: string;
  name: string;
  age: number | null;
  avatar: string;         // emoji o id avatar
  avatarColor: string;
  xp: number;
  createdAt: string;
  onboardingCompleted: boolean;
  settings: ChildSettings;
}

export interface Family {
  id: string;
  name: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  childId: string;
  kind: 'RISPARMIO' | 'OBIETTIVO' | 'INTERESSE' | 'LEZIONE' | 'LIVELLO' | 'LAVORO' | 'DONAZIONE';
  emoji: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
