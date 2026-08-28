/**
 * DATI DEMO — la famiglia di Sofia (9 anni), obiettivo 🚲 Bicicletta €250.
 *
 * Non e' una finzione grafica: viene creata una famiglia vera nel database,
 * con nove settimane di movimenti reali passati dal ledger. Ogni saldo mostrato
 * nell'app e' la somma effettiva di quelle transazioni.
 */
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db/pool.js';
import { createFamily, createChild } from '../services/family.js';
import { createGoal } from '../services/goals.js';
import { createJob, requestJob } from '../services/jobs.js';
import { createDonationGoal } from '../services/donations.js';
import { addIncome, registerPurchase, makeDonation, accrueInterest } from '../services/operations.js';
import { createPendingIncome } from '../services/pendingIncome.js';
import { postEntries } from '../services/ledger.js';
import { submitQuiz } from '../services/lessons.js';
import { getChildState } from '../services/state.js';
import { euroToCents } from '../domain/money.js';
import type { Split } from '../domain/types.js';

export const DEMO_EMAIL = 'famiglia.demo@mymoneyadventure.app';
export const DEMO_PASSWORD = 'paghetta2025';
export const DEMO_PIN = '1234';

const GIORNO = 86_400_000;
const SETTIMANA = 7 * GIORNO;

/** Data di N settimane fa (a mezzogiorno, per evitare sorprese sui fusi). */
function settimaneFa(n: number, base = new Date()): Date {
  const d = new Date(base.getTime() - n * SETTIMANA);
  d.setHours(12, 0, 0, 0);
  return d;
}

const SPLIT_ABITUALE: Split = { save: 60, spend: 30, give: 10 };
const SPLIT_SETTIMANA_STRANA: Split = { save: 20, spend: 70, give: 10 }; // la settimana in cui ha voluto spendere

export interface SeedResult {
  familyId: string;
  childId: string;
  email: string;
  password: string;
  pin: string;
  balances: { SAVE: number; SPEND: number; GIVE: number; totalCents: number };
}

/** Crea (o riusa) la famiglia dimostrativa. */
export async function seedDemoFamily(opts: { reuseExisting?: boolean } = {}): Promise<SeedResult> {
  const { rows: esistente } = await pool.query(
    `SELECT u.family_id, c.id AS child_id FROM users u
       JOIN children c ON c.family_id = u.family_id
      WHERE u.email = $1 LIMIT 1`,
    [DEMO_EMAIL],
  );
  if (esistente.length > 0) {
    if (opts.reuseExisting) {
      const stato = await getChildState(pool, esistente[0].child_id);
      return {
        familyId: esistente[0].family_id,
        childId: esistente[0].child_id,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        pin: DEMO_PIN,
        balances: { SAVE: stato.jars.SAVE, SPEND: stato.jars.SPEND, GIVE: stato.jars.GIVE, totalCents: stato.jars.totalCents },
      };
    }
    await pool.query(`DELETE FROM families WHERE id = $1`, [esistente[0].family_id]);
  }

  return withTransaction(async (client) => {
    const { family, parentUser } = await createFamily(client, {
      familyName: 'Famiglia Demo',
      parentName: 'Papà',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      pin: DEMO_PIN,
    });

    const sofia = await createChild(client, family.id, {
      name: 'Sofia',
      age: 9,
      avatar: '🦄',
      avatarColor: '#FF7AC4',
      split: SPLIT_ABITUALE,
      minGivePercent: 10,
      allowanceCents: euroToCents(10),
      interestCentsPerEuro: 5,
    });
    await client.query(`UPDATE children SET onboarding_completed = TRUE WHERE id = $1`, [sofia.id]);

    // ------------------------------------------------------------ OBIETTIVO
    const bici = await createGoal(client, sofia.id, {
      name: 'Bicicletta',
      emoji: '🚲',
      targetCents: euroToCents(250),
      targetDate: new Date(Date.now() + 120 * GIORNO).toISOString().slice(0, 10),
      makePrimary: true,
    });

    // ------------------------------------------------------- SALDO INIZIALE
    // Quello che Sofia aveva già nel salvadanaio di casa quando è nata l'app.
    await postEntries(
      client,
      { childId: sofia.id, createdByUserId: parentUser.id, occurredAt: settimaneFa(9) },
      [
        { jar: 'SAVE', amountCents: euroToCents(80), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore', goalId: bici.id },
        { jar: 'SPEND', amountCents: euroToCents(20), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore' },
        { jar: 'GIVE', amountCents: euroToCents(10), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore' },
      ],
    );

    // ---------------------------------------------------------------- LAVORI
    const lavori = [];
    for (const l of [
      { title: 'Lavare la macchina', emoji: '🚗', rewardCents: euroToCents(3) },
      { title: 'Diserbare il giardino', emoji: '🌱', rewardCents: euroToCents(2) },
      { title: 'Riordinare il garage', emoji: '🧹', rewardCents: euroToCents(5) },
      { title: 'Riordinare la camera', emoji: '🧺', rewardCents: euroToCents(1) },
      { title: 'Aiutare con il cane', emoji: '🐶', rewardCents: euroToCents(2) },
      { title: 'Riordinare i libri', emoji: '📚', rewardCents: euroToCents(1) },
    ]) {
      lavori.push(await createJob(client, family.id, l));
    }
    const [lavaMacchina, diserba, garage] = lavori;

    // ------------------------------------------------- NOVE SETTIMANE DI VITA
    // Paghetta settimanale: quasi sempre 60/30/10, una settimana 20/70/10.
    for (let s = 8; s >= 1; s--) {
      await addIncome(client, sofia.id, {
        amountCents: euroToCents(10),
        split: s === 5 ? SPLIT_SETTIMANA_STRANA : SPLIT_ABITUALE,
        type: 'ALLOWANCE',
        description: 'Paghetta',
        source: 'genitore',
        createdByUserId: parentUser.id,
        occurredAt: settimaneFa(s),
      });
    }

    // Lavoretti extra approvati dal papà.
    const lavoriFatti: [typeof lavaMacchina, number][] = [
      [lavaMacchina, 6],
      [diserba, 5],
      [garage, 3],
    ];
    for (const [lavoro, quandoSettimane] of lavoriFatti) {
      await addIncome(client, sofia.id, {
        amountCents: lavoro.rewardCents,
        split: SPLIT_ABITUALE,
        type: 'JOB',
        description: `${lavoro.emoji} ${lavoro.title}`,
        source: `lavoro:${lavoro.id}`,
        createdByUserId: parentUser.id,
        occurredAt: new Date(settimaneFa(quandoSettimane).getTime() + GIORNO),
      });
      await client.query(
        `INSERT INTO job_requests (job_id, child_id, status, requested_reward_cents, approved_reward_cents,
                                   requested_at, decided_at, decided_by_user_id)
         VALUES ($1,$2,'APPROVED',$3,$3,$4,$5,$6)`,
        [
          lavoro.id,
          sofia.id,
          lavoro.rewardCents,
          settimaneFa(quandoSettimane),
          new Date(settimaneFa(quandoSettimane).getTime() + GIORNO),
          parentUser.id,
        ],
      );
    }

    // Regalo della nonna: quella volta Sofia ha deciso di mettere quasi tutto da parte.
    await addIncome(client, sofia.id, {
      amountCents: euroToCents(20),
      split: { save: 80, spend: 10, give: 10 },
      type: 'GIFT',
      description: '🎁 Regalo della nonna',
      source: 'genitore',
      createdByUserId: parentUser.id,
      occurredAt: settimaneFa(7),
    });

    // Le sue spese (registrate da lei, nessuna è "sbagliata").
    const spese: { importo: number; cosa: string; emoji: string; settimane: number }[] = [
      { importo: 8, cosa: 'Slime gigante', emoji: '🫠', settimane: 5 },
      { importo: 5.5, cosa: 'Figurine', emoji: '🃏', settimane: 3 },
      { importo: 3.5, cosa: 'Gelato con Anna', emoji: '🍦', settimane: 2 },
      { importo: 2.5, cosa: 'Adesivi', emoji: '✨', settimane: 1 },
    ];
    for (const s of spese) {
      await registerPurchase(client, sofia.id, {
        amountCents: euroToCents(s.importo),
        description: s.cosa,
        emoji: s.emoji,
        jar: 'SPEND',
        occurredAt: new Date(settimaneFa(s.settimane).getTime() + 2 * GIORNO),
        simulated: s.importo >= 5,
      });
    }

    // ------------------------------------------------------------ DONAZIONI
    const rifugio = await createDonationGoal(client, sofia.id, {
      title: 'Rifugio degli animali',
      cause: 'ANIMALI',
      targetCents: euroToCents(20),
      note: 'Voglio aiutare i cani che non hanno una casa.',
    });
    await makeDonation(client, sofia.id, {
      amountCents: euroToCents(9),
      cause: 'ANIMALI',
      donationGoalId: rifugio.id,
      note: 'Sono andata di persona con il papà a portare i soldi. 🐶',
      confirmedByUserId: parentUser.id,
    });

    // ------------------------------------------------------------ INTERESSE
    // Il papà ha accreditato l'interesse del mese scorso: 5 centesimi per euro.
    await accrueInterest(client, sofia.id, {
      now: settimaneFa(4),
      createdByUserId: parentUser.id,
    });

    // ------------------------------------------------ COSE DA FARE OGGI 👇
    // 1) Una paghetta appena arrivata che aspetta la divisione di Sofia.
    await createPendingIncome(client, sofia.id, {
      amountCents: euroToCents(10),
      type: 'ALLOWANCE',
      description: 'Paghetta della settimana',
      createdByUserId: parentUser.id,
    });
    // 2) Una richiesta di lavoro in attesa di approvazione del genitore.
    await requestJob(client, sofia.id, garage.id, 'Ho già tolto le bici, posso finire domani!');

    // ------------------------------------------------------------- LEZIONI
    // Sofia ha già fatto le prime due lezioni con il quiz perfetto.
    await submitQuiz(client, sofia.id, 'denaro', [
      { id: 'd1', answerIndex: 0 },
      { id: 'd2', answerIndex: 1 },
      { id: 'd3', answerIndex: 1 },
    ]);
    await submitQuiz(client, sofia.id, 'risparmiare', [
      { id: 'r1', answerIndex: 1 },
      { id: 'r2', answerIndex: 0 },
      { id: 'r3', answerIndex: 1 },
    ]);

    const stato = await getChildState(client, sofia.id);
    return {
      familyId: family.id,
      childId: sofia.id,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      pin: DEMO_PIN,
      balances: { SAVE: stato.jars.SAVE, SPEND: stato.jars.SPEND, GIVE: stato.jars.GIVE, totalCents: stato.jars.totalCents },
    };
  });
}
