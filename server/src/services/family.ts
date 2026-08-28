/** Creazione di famiglie, genitori e bambini (usata da registrazione e dati demo). */
import type { PoolClient } from 'pg';
import { conflict, badRequest } from '../errors.js';
import { hashSecret, isValidPin } from '../auth/tokens.js';
import { SPLIT_DEFAULT, validateSplit } from '../domain/split.js';
import type { Split } from '../domain/types.js';
import { getChild } from './children.js';

export interface CreateFamilyInput {
  familyName: string;
  parentName: string;
  email: string;
  password: string;
  pin: string;
}

export async function createFamily(client: PoolClient, input: CreateFamilyInput) {
  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Inserisci un indirizzo email valido.');
  if (!input.password || input.password.length < 8) throw badRequest('La password di famiglia deve avere almeno 8 caratteri.');
  if (!isValidPin(input.pin)) throw badRequest('Il PIN genitore deve avere da 4 a 8 cifre.');

  const { rows: esistente } = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (esistente.length > 0) throw conflict('Esiste già un account con questa email.');

  const { rows: famiglia } = await client.query(
    `INSERT INTO families (name, password_hash) VALUES ($1,$2) RETURNING *`,
    [input.familyName?.trim() || 'La mia famiglia', await hashSecret(input.password)],
  );
  const { rows: utente } = await client.query(
    `INSERT INTO users (family_id, role, name, email) VALUES ($1,'PARENT',$2,$3) RETURNING *`,
    [famiglia[0].id, input.parentName?.trim() || 'Genitore', email],
  );
  await client.query(`INSERT INTO parents (user_id, family_id, pin_hash) VALUES ($1,$2,$3)`, [
    utente[0].id,
    famiglia[0].id,
    await hashSecret(input.pin),
  ]);

  return { family: famiglia[0], parentUser: utente[0] };
}

export interface CreateChildInput {
  name: string;
  age?: number | null;
  avatar?: string;
  avatarColor?: string;
  split?: Split;
  minGivePercent?: number;
  allowanceCents?: number;
  interestCentsPerEuro?: number;
}

export async function createChild(client: PoolClient, familyId: string, input: CreateChildInput) {
  const nome = input.name?.trim();
  if (!nome) throw badRequest('Come si chiama il bambino?');

  const minGive = input.minGivePercent ?? 10;
  const split = input.split ?? SPLIT_DEFAULT;
  validateSplit(split, minGive);

  const { rows: utente } = await client.query(
    `INSERT INTO users (family_id, role, name) VALUES ($1,'CHILD',$2) RETURNING *`,
    [familyId, nome],
  );
  const { rows: bambino } = await client.query(
    `INSERT INTO children (user_id, family_id, name, age, avatar, avatar_color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [utente[0].id, familyId, nome, input.age ?? null, input.avatar ?? '🦊', input.avatarColor ?? '#7C5CFF'],
  );
  await client.query(
    `INSERT INTO settings (child_id, min_give_percent, default_save_percent, default_spend_percent, default_give_percent,
                           allowance_cents, interest_cents_per_euro)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [bambino[0].id, minGive, split.save, split.spend, split.give, input.allowanceCents ?? 0, input.interestCentsPerEuro ?? 5],
  );
  for (const jar of ['SAVE', 'SPEND', 'GIVE']) {
    await client.query(`INSERT INTO jars (child_id, type) VALUES ($1,$2)`, [bambino[0].id, jar]);
  }
  return getChild(client, bambino[0].id);
}
