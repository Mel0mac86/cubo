/** Lettura/scrittura del profilo bambino e delle impostazioni di famiglia. */
import type { Db } from '../db/pool.js';
import { notFound, badRequest, locked } from '../errors.js';
import type { Child, ChildSettings, Split } from '../domain/types.js';
import { validateSplit } from '../domain/split.js';

export function mapSettings(row: Record<string, any>): ChildSettings {
  return {
    minGivePercent: row.min_give_percent,
    defaultSplit: {
      save: row.default_save_percent,
      spend: row.default_spend_percent,
      give: row.default_give_percent,
    },
    interestCentsPerEuro: row.interest_cents_per_euro,
    interestEnabled: row.interest_enabled,
    allowanceCents: row.allowance_cents,
    allowanceDay: row.allowance_day,
    lockedFeatures: row.locked_features ?? [],
    soundEnabled: row.sound_enabled,
  };
}

export function mapChild(row: Record<string, any>): Child {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    age: row.age,
    avatar: row.avatar,
    avatarColor: row.avatar_color,
    xp: row.xp,
    createdAt: new Date(row.created_at).toISOString(),
    onboardingCompleted: row.onboarding_completed,
    settings: mapSettings(row),
  };
}

const SELECT_CHILD = `
  SELECT c.*, s.min_give_percent, s.default_save_percent, s.default_spend_percent, s.default_give_percent,
         s.interest_cents_per_euro, s.interest_enabled, s.allowance_cents, s.allowance_day,
         s.locked_features, s.sound_enabled
    FROM children c
    JOIN settings s ON s.child_id = c.id`;

export async function getChild(db: Db, childId: string): Promise<Child> {
  const { rows } = await db.query(`${SELECT_CHILD} WHERE c.id = $1`, [childId]);
  if (rows.length === 0) throw notFound('Bambino non trovato.');
  return mapChild(rows[0]);
}

export async function listChildrenOfFamily(db: Db, familyId: string): Promise<Child[]> {
  const { rows } = await db.query(`${SELECT_CHILD} WHERE c.family_id = $1 ORDER BY c.created_at`, [familyId]);
  return rows.map(mapChild);
}

export interface UpdateChildInput {
  name?: string;
  age?: number | null;
  avatar?: string;
  avatarColor?: string;
  onboardingCompleted?: boolean;
}

export async function updateChild(db: Db, childId: string, input: UpdateChildInput): Promise<Child> {
  await db.query(
    `UPDATE children SET
       name = COALESCE($2, name),
       age = COALESCE($3, age),
       avatar = COALESCE($4, avatar),
       avatar_color = COALESCE($5, avatar_color),
       onboarding_completed = COALESCE($6, onboarding_completed)
     WHERE id = $1`,
    [
      childId,
      input.name ?? null,
      input.age ?? null,
      input.avatar ?? null,
      input.avatarColor ?? null,
      input.onboardingCompleted ?? null,
    ],
  );
  return getChild(db, childId);
}

export interface UpdateSettingsInput {
  minGivePercent?: number;
  defaultSplit?: Split;
  interestCentsPerEuro?: number;
  interestEnabled?: boolean;
  allowanceCents?: number;
  allowanceDay?: number;
  lockedFeatures?: string[];
  soundEnabled?: boolean;
}

/**
 * Aggiorna le impostazioni (solo genitore). Verifica che la ripartizione
 * predefinita resti valida rispetto alla nuova soglia minima di GIVE.
 */
export async function updateSettings(db: Db, childId: string, input: UpdateSettingsInput): Promise<ChildSettings> {
  const attuale = (await getChild(db, childId)).settings;
  const minGive = input.minGivePercent ?? attuale.minGivePercent;
  if (minGive < 0 || minGive > 100 || !Number.isInteger(minGive)) {
    throw badRequest('La percentuale minima di GIVE deve essere un numero intero fra 0 e 100.');
  }

  let split = input.defaultSplit ?? attuale.defaultSplit;
  if (split.give < minGive) {
    // La nuova regola di famiglia ha la precedenza: si alza GIVE prendendo da SPEND, poi da SAVE.
    const mancante = minGive - split.give;
    const daSpend = Math.min(mancante, split.spend);
    const daSave = mancante - daSpend;
    split = { save: split.save - daSave, spend: split.spend - daSpend, give: minGive };
  }
  validateSplit(split, minGive);

  const interesse = input.interestCentsPerEuro ?? attuale.interestCentsPerEuro;
  if (!Number.isInteger(interesse) || interesse < 0 || interesse > 100) {
    throw badRequest("L'interesse deve essere fra 0 e 100 centesimi per euro.");
  }
  const paghetta = input.allowanceCents ?? attuale.allowanceCents;
  if (!Number.isInteger(paghetta) || paghetta < 0) throw badRequest('Paghetta non valida.');

  const { rows } = await db.query(
    `UPDATE settings SET
       min_give_percent = $2,
       default_save_percent = $3, default_spend_percent = $4, default_give_percent = $5,
       interest_cents_per_euro = $6, interest_enabled = $7,
       allowance_cents = $8, allowance_day = $9,
       locked_features = $10, sound_enabled = $11,
       updated_at = now()
     WHERE child_id = $1
     RETURNING *`,
    [
      childId,
      minGive,
      split.save,
      split.spend,
      split.give,
      interesse,
      input.interestEnabled ?? attuale.interestEnabled,
      paghetta,
      input.allowanceDay ?? attuale.allowanceDay,
      input.lockedFeatures ?? attuale.lockedFeatures,
      input.soundEnabled ?? attuale.soundEnabled,
    ],
  );
  if (rows.length === 0) throw notFound('Impostazioni non trovate.');
  return mapSettings(rows[0]);
}

/** Verifica che una funzione non sia stata bloccata temporaneamente dal genitore. */
export function assertFeatureUnlocked(settings: ChildSettings, feature: string): void {
  if (!settings.lockedFeatures.includes(feature)) return;
  const nomi: Record<string, string> = {
    SPESE: 'registrare le spese',
    LAVORI: 'richiedere i lavori',
    DONAZIONI: 'fare donazioni',
    OBIETTIVI: 'creare obiettivi',
    COACH: 'parlare con il Money Coach',
  };
  throw locked(`In questo momento ${nomi[feature] ?? 'questa funzione'} non è disponibile. Parlane con un genitore!`);
}
