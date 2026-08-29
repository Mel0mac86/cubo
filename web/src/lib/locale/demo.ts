/**
 * MODALITÀ LOCALE — il profilo dimostrativo di Sofia.
 * Stessa storia della versione con server: nove settimane di movimenti veri,
 * così l'app si può provare subito senza inventare dati finti a schermo.
 */
import { euroToCents } from '@dominio/money.js';
import type { Split } from '@dominio/types.js';
import { nuovoId, type Archivio } from './archivio';
import { accreditaInteresse, aggiungiEntrata, correggiQuiz, dona, registra, registraSpesa } from './operazioni';

const GIORNO = 86_400_000;
const SETTIMANA = 7 * GIORNO;
const ABITUALE: Split = { save: 60, spend: 30, give: 10 };
const SETTIMANA_STRANA: Split = { save: 20, spend: 70, give: 10 };

function settimaneFa(n: number): Date {
  const d = new Date(Date.now() - n * SETTIMANA);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function creaDemo(a: Archivio, familyId: string): string {
  const childId = nuovoId();
  a.bambini.push({
    id: childId,
    familyId,
    name: 'Sofia',
    age: 9,
    avatar: '🦄',
    avatarColor: '#FF7AC4',
    xp: 0,
    createdAt: settimaneFa(9).toISOString(),
    onboardingCompleted: true,
    settings: {
      minGivePercent: 10,
      defaultSplit: ABITUALE,
      interestCentsPerEuro: 5,
      interestEnabled: true,
      allowanceCents: euroToCents(10),
      allowanceDay: 6,
      lockedFeatures: [],
      soundEnabled: true,
    },
  });
  a.salvadanai[childId] = { SAVE: 0, SPEND: 0, GIVE: 0 };

  // ------------------------------------------------------------ OBIETTIVO
  const biciId = nuovoId();
  a.obiettivi.push({
    id: biciId,
    childId,
    name: 'Bicicletta',
    emoji: '🚲',
    imageUrl: null,
    targetCents: euroToCents(250),
    savedAtCreationCents: 0,
    targetDate: new Date(Date.now() + 120 * GIORNO).toISOString().slice(0, 10),
    status: 'ACTIVE',
    isPrimary: true,
    createdAt: settimaneFa(9).toISOString(),
    completedAt: null,
  });

  // Quello che Sofia aveva già nel salvadanaio di casa quando è nata l'app.
  registra(
    a,
    childId,
    [
      { jar: 'SAVE', amountCents: euroToCents(80), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore', goalId: biciId },
      { jar: 'SPEND', amountCents: euroToCents(20), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore' },
      { jar: 'GIVE', amountCents: euroToCents(10), type: 'ADJUSTMENT', description: 'Saldo iniziale', source: 'genitore' },
    ],
    { occurredAt: settimaneFa(9) },
  );

  // ---------------------------------------------------------------- LAVORI
  const lavori = [
    { title: 'Lavare la macchina', emoji: '🚗', rewardCents: euroToCents(3) },
    { title: 'Diserbare il giardino', emoji: '🌱', rewardCents: euroToCents(2) },
    { title: 'Riordinare il garage', emoji: '🧹', rewardCents: euroToCents(5) },
    { title: 'Riordinare la camera', emoji: '🧺', rewardCents: euroToCents(1) },
    { title: 'Aiutare con il cane', emoji: '🐶', rewardCents: euroToCents(2) },
    { title: 'Riordinare i libri', emoji: '📚', rewardCents: euroToCents(1) },
  ].map((l) => {
    const lavoro = { id: nuovoId(), familyId, description: null, active: true, createdAt: new Date().toISOString(), ...l };
    a.lavori.push(lavoro);
    return lavoro;
  });

  // ------------------------------------------------- NOVE SETTIMANE DI VITA
  for (let s = 8; s >= 1; s--) {
    aggiungiEntrata(a, childId, {
      amountCents: euroToCents(10),
      split: s === 5 ? SETTIMANA_STRANA : ABITUALE,
      type: 'ALLOWANCE',
      description: 'Paghetta',
      source: 'genitore',
      occurredAt: settimaneFa(s),
    });
  }

  for (const [indice, quando] of [[0, 6], [1, 5], [2, 3]] as [number, number][]) {
    const lavoro = lavori[indice];
    aggiungiEntrata(a, childId, {
      amountCents: lavoro.rewardCents,
      split: ABITUALE,
      type: 'JOB',
      description: `${lavoro.emoji} ${lavoro.title}`,
      source: `lavoro:${lavoro.id}`,
      occurredAt: new Date(settimaneFa(quando).getTime() + GIORNO),
    });
    a.richieste.push({
      id: nuovoId(),
      jobId: lavoro.id,
      childId,
      status: 'APPROVED',
      requestedRewardCents: lavoro.rewardCents,
      approvedRewardCents: lavoro.rewardCents,
      note: null,
      parentNote: null,
      requestedAt: settimaneFa(quando).toISOString(),
      decidedAt: new Date(settimaneFa(quando).getTime() + GIORNO).toISOString(),
    });
  }

  // Il regalo della nonna: quella volta Sofia ha messo quasi tutto da parte.
  aggiungiEntrata(a, childId, {
    amountCents: euroToCents(20),
    split: { save: 80, spend: 10, give: 10 },
    type: 'GIFT',
    description: '🎁 Regalo della nonna',
    source: 'genitore',
    occurredAt: settimaneFa(7),
  });

  for (const s of [
    { importo: 8, cosa: 'Slime gigante', emoji: '🫠', settimane: 5 },
    { importo: 5.5, cosa: 'Figurine', emoji: '🃏', settimane: 3 },
    { importo: 3.5, cosa: 'Gelato con Anna', emoji: '🍦', settimane: 2 },
    { importo: 2.5, cosa: 'Adesivi', emoji: '✨', settimane: 1 },
  ]) {
    registraSpesa(a, childId, {
      amountCents: euroToCents(s.importo),
      description: s.cosa,
      emoji: s.emoji,
      jar: 'SPEND',
      occurredAt: new Date(settimaneFa(s.settimane).getTime() + 2 * GIORNO),
      simulated: s.importo >= 5,
    });
  }

  // ------------------------------------------------------------ DONAZIONI
  const rifugioId = nuovoId();
  a.obiettiviGive.push({
    id: rifugioId,
    childId,
    title: 'Rifugio degli animali',
    cause: 'ANIMALI',
    targetCents: euroToCents(20),
    donatedCents: 0,
    status: 'ACTIVE',
    note: 'Voglio aiutare i cani che non hanno una casa.',
    photoUrl: null,
    createdAt: settimaneFa(6).toISOString(),
    completedAt: null,
  });
  dona(a, childId, {
    amountCents: euroToCents(9),
    cause: 'ANIMALI',
    donationGoalId: rifugioId,
    note: 'Sono andata di persona con il papà a portare i soldi. 🐶',
  });

  accreditaInteresse(a, childId, { now: settimaneFa(4) });

  // --------------------------------------------- COSE DA FARE OGGI 👇
  a.entrateInAttesa.push({
    id: nuovoId(),
    childId,
    amountCents: euroToCents(10),
    type: 'ALLOWANCE',
    description: 'Paghetta della settimana',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  });
  a.richieste.unshift({
    id: nuovoId(),
    jobId: lavori[2].id,
    childId,
    status: 'PENDING',
    requestedRewardCents: lavori[2].rewardCents,
    approvedRewardCents: null,
    note: 'Ho già tolto le bici, posso finire domani!',
    parentNote: null,
    requestedAt: new Date().toISOString(),
    decidedAt: null,
  });

  correggiQuiz(a, childId, 'denaro', [
    { id: 'd1', answerIndex: 0 }, { id: 'd2', answerIndex: 1 }, { id: 'd3', answerIndex: 1 },
  ]);
  correggiQuiz(a, childId, 'risparmiare', [
    { id: 'r1', answerIndex: 1 }, { id: 'r2', answerIndex: 0 }, { id: 'r3', answerIndex: 1 },
  ]);

  return childId;
}
