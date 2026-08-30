/**
 * Test di integrazione end-to-end sulle API reali, con PostgreSQL vero.
 * Copre il percorso completo: registrazione → onboarding → paghetta → divisione
 * → lavori → approvazione → spese → simulatore → interesse → donazione → offline.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { pool, closePool } from '../src/db/pool.js';
import { euroToCents } from '../src/domain/money.js';
import { NOMI_JAR } from '../src/domain/etichette.js';

const app = createApp();

let token = '';
let parentToken = '';
let childId = '';

const REGISTRAZIONE = {
  familyName: 'Famiglia Test',
  parentName: 'Mamma',
  email: 'test@famiglia.it',
  password: 'password-sicura',
  pin: '4321',
  childName: 'Luca',
  childAge: 9,
};

async function sbloccaGenitore() {
  const r = await request(app).post('/api/auth/parent-mode').set('Authorization', `Bearer ${token}`).send({ pin: REGISTRAZIONE.pin });
  expect(r.status).toBe(200);
  return r.body.parentToken as string;
}

const conGenitore = (req: request.Test) => req.set('Authorization', `Bearer ${parentToken}`);
const conFamiglia = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await pool.query('TRUNCATE families RESTART IDENTITY CASCADE');
  const r = await request(app).post('/api/auth/register').send(REGISTRAZIONE);
  expect(r.status).toBe(201);
  token = r.body.token;
  childId = r.body.children[0].id;
  parentToken = await sbloccaGenitore();
});

describe('Autenticazione e sicurezza', () => {
  it('senza token non si accede a nulla', async () => {
    const r = await request(app).get(`/api/children/${childId}/state`);
    expect(r.status).toBe(401);
  });

  it('il token di famiglia NON apre la modalità genitore', async () => {
    const r = await conFamiglia(request(app).get('/api/parent/children'));
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/genitori/i);
  });

  it('un PIN sbagliato non sblocca la modalità genitore', async () => {
    const r = await conFamiglia(request(app).post('/api/auth/parent-mode')).send({ pin: '0000' });
    expect(r.status).toBe(401);
  });

  it('non si accede ai dati di un’altra famiglia', async () => {
    await request(app).post('/api/auth/register').send({ ...REGISTRAZIONE, email: 'altra@famiglia.it' });
    const altra = await request(app).post('/api/auth/login').send({ email: 'altra@famiglia.it', password: REGISTRAZIONE.password });
    const r = await request(app).get(`/api/children/${childId}/state`).set('Authorization', `Bearer ${altra.body.token}`);
    expect(r.status).toBe(404);
  });

  it('la registrazione crea sempre un profilo bambino, anche senza nome', async () => {
    // Senza profilo l'app resterebbe ferma sulla schermata di caricamento.
    await pool.query('TRUNCATE families RESTART IDENTITY CASCADE');
    const { childName, childAge, ...senzaBambino } = REGISTRAZIONE;
    const r = await request(app).post('/api/auth/register').send(senzaBambino);
    expect(r.status).toBe(201);
    expect(r.body.children).toHaveLength(1);

    const stato = await request(app)
      .get(`/api/children/${r.body.children[0].id}/state`)
      .set('Authorization', `Bearer ${r.body.token}`);
    expect(stato.status).toBe(200);
    expect(stato.body.child.onboardingCompleted).toBe(false);
  });

  it('ripara una famiglia rimasta senza bambino', async () => {
    // Le famiglie create prima della correzione non devono restare bloccate.
    await pool.query('DELETE FROM children WHERE id = $1', [childId]);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: REGISTRAZIONE.email, password: REGISTRAZIONE.password });
    expect(login.status).toBe(200);
    expect(login.body.children).toHaveLength(1);
  });

  it('rifiuta una registrazione con email già usata', async () => {
    const r = await request(app).post('/api/auth/register').send(REGISTRAZIONE);
    expect(r.status).toBe(409);
  });
});

describe('Entrate e divisione fra i tre salvadanai', () => {
  it('il genitore inserisce la paghetta e il bambino decide come dividerla', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({
      amountCents: euroToCents(10),
      description: 'Paghetta',
    });
    expect(entrata.status).toBe(201);
    const pendingId = entrata.body.pending.id;

    // Finché il bambino non sceglie, i salvadanai restano a zero.
    const prima = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    expect(prima.body.jars.totalCents).toBe(0);
    expect(prima.body.pendingIncomes).toHaveLength(1);

    const scelta = await conFamiglia(
      request(app).post(`/api/children/${childId}/pending-incomes/${pendingId}/allocate`),
    ).send({ split: { save: 60, spend: 30, give: 10 } });
    expect(scelta.status).toBe(201);
    expect(scelta.body.state.jars.SAVE).toBe(600);
    expect(scelta.body.state.jars.SPEND).toBe(300);
    expect(scelta.body.state.jars.GIVE).toBe(100);
    expect(scelta.body.state.jars.totalCents).toBe(1000);
  });

  it('SAVE + SPEND + GIVE fa sempre esattamente il totale dell’entrata', async () => {
    for (const importo of [1, 3, 7, 33, 99, 101, 1234, 999]) {
      const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({
        amountCents: importo,
        description: 'Prova',
      });
      const r = await conFamiglia(
        request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`),
      ).send({ split: { save: 33, spend: 33, give: 34 } });
      expect(r.status).toBe(201);
      const righe = r.body.transactions.reduce((a: number, t: any) => a + t.amountCents, 0);
      expect(righe).toBe(importo);
    }
    const integrita = await conFamiglia(request(app).get(`/api/children/${childId}/integrity`));
    expect(integrita.body.ok).toBe(true);
  });

  it('rifiuta una divisione che non fa 100%', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 1000 });
    const r = await conFamiglia(
      request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`),
    ).send({ split: { save: 60, spend: 30, give: 5 } });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/100%/);
  });

  it('impedisce al salvadanaio del dono di scendere sotto il minimo di famiglia', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 1000 });
    const r = await conFamiglia(
      request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`),
    ).send({ split: { save: 70, spend: 25, give: 5 } });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain(NOMI_JAR.GIVE);
  });

  it('la stessa entrata non può essere divisa due volte', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 1000 });
    const url = `/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`;
    const split = { split: { save: 60, spend: 30, give: 10 } };
    expect((await conFamiglia(request(app).post(url)).send(split)).status).toBe(201);
    expect((await conFamiglia(request(app).post(url)).send(split)).status).toBe(409);
  });

  it('l’anteprima degli slider normalizza e mostra gli importi', async () => {
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/split/preview`)).send({
      amountCents: 1000,
      split: { save: 60, spend: 40, give: 0 },
      changed: 'give',
    });
    expect(r.status).toBe(200);
    expect(r.body.split.give).toBeGreaterThanOrEqual(10);
    expect(r.body.rows.reduce((a: number, x: any) => a + x.amountCents, 0)).toBe(1000);
  });

  it('registra nello storico la scelta fatta dal bambino', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 2000 });
    await conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({
      split: { save: 20, spend: 70, give: 10 },
    });
    const { rows } = await pool.query('SELECT * FROM allocation_choices WHERE child_id = $1', [childId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].save_percent).toBe(20);
    expect(rows[0].spend_percent).toBe(70);
  });
});

describe('Obiettivi e simulatore', () => {
  async function preparaObiettivoESoldi() {
    const goal = await conFamiglia(request(app).post(`/api/children/${childId}/goals`)).send({
      name: 'Bicicletta',
      emoji: '🚲',
      targetCents: euroToCents(250),
    });
    for (let i = 0; i < 4; i++) {
      const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 2000 });
      await conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({
        split: { save: 60, spend: 30, give: 10 },
      });
    }
    return goal.body;
  }

  it('l’obiettivo si aggiorna da solo quando entrano soldi in SAVE', async () => {
    const goal = await preparaObiettivoESoldi();
    const stato = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    const principale = stato.body.primaryGoal;
    expect(principale.id).toBe(goal.id);
    expect(principale.progress.savedCents).toBe(4800);
    expect(principale.progress.remainingCents).toBe(euroToCents(250) - 4800);
    expect(principale.progress.percent).toBeCloseTo(19.2, 1);
  });

  it('il simulatore mostra due futuri senza bloccare l’acquisto', async () => {
    await preparaObiettivoESoldi();
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/simulate`)).send({
      amountCents: 800,
      jar: 'SPEND',
      label: 'uno slime',
    });
    expect(r.status).toBe(200);
    expect(r.body.senzaAcquisto).not.toBeNull();
    expect(r.body.conAcquisto).not.toBeNull();
    expect(r.body.affordable).toBe(true);
    // la spesa da SPEND non tocca l'obiettivo
    expect(r.body.deltaWeeks).toBe(0);
  });

  it('una spesa da SAVE allontana davvero l’obiettivo', async () => {
    await preparaObiettivoESoldi();
    const prima = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    const settimanePrima = prima.body.primaryGoal.progress.weeksRemaining;

    await conFamiglia(request(app).post(`/api/children/${childId}/purchases`)).send({
      amountCents: 4000,
      description: 'Videogioco',
      jar: 'SAVE',
    });
    const dopo = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    expect(dopo.body.primaryGoal.progress.savedCents).toBe(800);
    expect(dopo.body.primaryGoal.progress.weeksRemaining).toBeGreaterThan(settimanePrima);
  });

  it('non si può spendere più di quanto c’è nel salvadanaio', async () => {
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/purchases`)).send({
      amountCents: 5000,
      description: 'Troppo caro',
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('FONDI_INSUFFICIENTI');
  });

  it('completa l’obiettivo quando è pieno e preleva da SAVE', async () => {
    await conFamiglia(request(app).post(`/api/children/${childId}/goals`)).send({ name: 'Cuffie', emoji: '🎧', targetCents: 3000 });
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 5000 });
    await conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({
      split: { save: 80, spend: 10, give: 10 },
    });
    const stato = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    const goalId = stato.body.primaryGoal.id;
    expect(stato.body.primaryGoal.progress.completed).toBe(true);

    const r = await conFamiglia(request(app).post(`/api/children/${childId}/goals/${goalId}/complete`));
    expect(r.status).toBe(200);
    expect(r.body.celebrations).toContain('CONFETTI');
    expect(r.body.state.jars.SAVE).toBe(1000); // 4000 - 3000
    expect(r.body.state.goals.find((g: any) => g.id === goalId).status).toBe('COMPLETED');
  });

  it('non completa un obiettivo non ancora raggiunto', async () => {
    const goal = await conFamiglia(request(app).post(`/api/children/${childId}/goals`)).send({ name: 'Console', targetCents: 40000 });
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/goals/${goal.body.id}/complete`));
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/mancano/i);
  });
});

describe('Lavori: richiesta e approvazione', () => {
  async function creaLavoro(rewardCents = 300) {
    const r = await conGenitore(request(app).post('/api/parent/jobs')).send({
      title: 'Lavare la macchina',
      emoji: '🚗',
      rewardCents,
    });
    expect(r.status).toBe(201);
    return r.body;
  }

  it('il bambino richiede, il genitore approva e i soldi si dividono', async () => {
    const lavoro = await creaLavoro(300);
    const richiesta = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    expect(richiesta.status).toBe(201);
    expect(richiesta.body.status).toBe('PENDING');

    const inAttesa = await conGenitore(request(app).get('/api/parent/job-requests?status=PENDING'));
    expect(inAttesa.body).toHaveLength(1);

    const approvazione = await conGenitore(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/approve`)).send({});
    expect(approvazione.status).toBe(200);
    expect(approvazione.body.state.jars.SAVE).toBe(180);
    expect(approvazione.body.state.jars.SPEND).toBe(90);
    expect(approvazione.body.state.jars.GIVE).toBe(30);
    expect(approvazione.body.xp.length).toBeGreaterThan(0);
  });

  it('il genitore può modificare l’importo in fase di approvazione', async () => {
    const lavoro = await creaLavoro(300);
    const richiesta = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    const approvazione = await conGenitore(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/approve`)).send({
      approvedRewardCents: 500,
      parentNote: 'Hai fatto anche i cerchioni!',
    });
    expect(approvazione.body.state.jars.totalCents).toBe(500);
    expect(approvazione.body.request.approvedRewardCents).toBe(500);
  });

  it('il genitore può rifiutare con un messaggio gentile', async () => {
    const lavoro = await creaLavoro();
    const richiesta = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    const r = await conGenitore(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/reject`)).send({
      parentNote: 'Facciamolo sabato insieme!',
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REJECTED');
    const stato = await conFamiglia(request(app).get(`/api/children/${childId}/state`));
    expect(stato.body.jars.totalCents).toBe(0);
    expect(stato.body.notifications.some((n: any) => n.message.includes('sabato'))).toBe(true);
  });

  it('non si può chiedere due volte lo stesso lavoro', async () => {
    const lavoro = await creaLavoro();
    await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    expect(r.status).toBe(409);
  });

  it('una richiesta già gestita non si approva due volte', async () => {
    const lavoro = await creaLavoro();
    const richiesta = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    await conGenitore(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/approve`)).send({});
    const r = await conGenitore(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/approve`)).send({});
    expect(r.status).toBe(409);
  });

  it('il bambino non può approvare i propri lavori', async () => {
    const lavoro = await creaLavoro();
    const richiesta = await conFamiglia(request(app).post(`/api/children/${childId}/jobs/${lavoro.id}/request`)).send({});
    const r = await conFamiglia(request(app).post(`/api/parent/job-requests/${richiesta.body.id}/approve`)).send({});
    expect(r.status).toBe(403);
  });
});

describe('Interesse, donazioni e impostazioni', () => {
  async function metti(importoCents: number, split = { save: 100, spend: 0, give: 0 }) {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: importoCents });
    return conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({ split });
  }

  it('accredita l’interesse una sola volta al mese', async () => {
    await conGenitore(request(app).patch(`/api/parent/children/${childId}/settings`)).send({ minGivePercent: 0 });
    await metti(euroToCents(100));
    const primo = await conGenitore(request(app).post(`/api/parent/children/${childId}/interest`)).send({});
    expect(primo.body.interestCents).toBe(500);
    expect(primo.body.state.jars.SAVE).toBe(10500);

    const secondo = await conGenitore(request(app).post(`/api/parent/children/${childId}/interest`)).send({});
    expect(secondo.body.skipped).toBe('GIA_ACCREDITATO');
    expect(secondo.body.state.jars.SAVE).toBe(10500);
  });

  it('mostra la proiezione della crescita composta', async () => {
    await conGenitore(request(app).patch(`/api/parent/children/${childId}/settings`)).send({ minGivePercent: 0 });
    await metti(euroToCents(100));
    const r = await conGenitore(request(app).get(`/api/parent/children/${childId}/interest/projection?months=4`));
    expect(r.body.steps.map((s: any) => s.endCents)).toEqual([10500, 11025, 11576, 12155]);
  });

  it('la donazione esce dal salvadanaio del dono solo con la conferma del genitore', async () => {
    await metti(euroToCents(20), { save: 0, spend: 0, give: 100 });
    const obiettivo = await conFamiglia(request(app).post(`/api/children/${childId}/donation-goals`)).send({
      title: 'Rifugio animali',
      cause: 'ANIMALI',
      targetCents: euroToCents(20),
    });

    // Il bambino da solo non può far uscire i soldi: la rotta è solo del genitore.
    const tentativo = await conFamiglia(request(app).post(`/api/parent/children/${childId}/donations`)).send({
      amountCents: 500,
      cause: 'ANIMALI',
    });
    expect(tentativo.status).toBe(403);

    const r = await conGenitore(request(app).post(`/api/parent/children/${childId}/donations`)).send({
      amountCents: euroToCents(20),
      cause: 'ANIMALI',
      donationGoalId: obiettivo.body.id,
      note: 'Per i cani del rifugio',
    });
    expect(r.status).toBe(201);
    expect(r.body.state.jars.GIVE).toBe(0);
    expect(r.body.state.give.totalDonatedCents).toBe(2000);
    expect(r.body.messages.join(' ')).toContain(`OBIETTIVO ${NOMI_JAR.GIVE} COMPLETATO`);
  });

  it('cambiando la regola GIVE si adegua anche la divisione predefinita', async () => {
    const r = await conGenitore(request(app).patch(`/api/parent/children/${childId}/settings`)).send({ minGivePercent: 25 });
    expect(r.status).toBe(200);
    expect(r.body.minGivePercent).toBe(25);
    expect(r.body.defaultSplit.give).toBeGreaterThanOrEqual(25);
    expect(r.body.defaultSplit.save + r.body.defaultSplit.spend + r.body.defaultSplit.give).toBe(100);
  });

  it('il genitore può bloccare temporaneamente una funzione', async () => {
    await conGenitore(request(app).patch(`/api/parent/children/${childId}/settings`)).send({ lockedFeatures: ['SPESE'] });
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/purchases`)).send({ amountCents: 100, description: 'Gomma' });
    expect(r.status).toBe(423);
  });
});

describe('Lezioni, quiz e Money Coach', () => {
  it('le risposte corrette non vengono mai mandate al client prima del quiz', async () => {
    const r = await conFamiglia(request(app).get(`/api/children/${childId}/lessons/percentuali`));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/correctIndex/);
  });

  it('corregge il quiz e assegna XP', async () => {
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/lessons/percentuali/quiz`)).send({
      answers: [
        { id: 'p1', answerIndex: 1 },
        { id: 'p2', answerIndex: 1 },
        { id: 'p3', answerIndex: 0 },
        { id: 'p4', answerIndex: 0 },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.score).toBe(4);
    expect(r.body.perfetto).toBe(true);
    expect(r.body.state.child.xp).toBeGreaterThan(0);
    expect(r.body.state.lessons.find((l: any) => l.id === 'percentuali').completed).toBe(true);
  });

  it('non regala XP infiniti ripetendo lo stesso quiz', async () => {
    const risposte = { answers: [{ id: 'p1', answerIndex: 1 }, { id: 'p2', answerIndex: 1 }, { id: 'p3', answerIndex: 0 }, { id: 'p4', answerIndex: 0 }] };
    const primo = await conFamiglia(request(app).post(`/api/children/${childId}/lessons/percentuali/quiz`)).send(risposte);
    const secondo = await conFamiglia(request(app).post(`/api/children/${childId}/lessons/percentuali/quiz`)).send(risposte);
    expect(secondo.body.state.child.xp).toBe(primo.body.state.child.xp);
  });

  it('il Money Coach risponde con numeri veri e non decide al posto del bambino', async () => {
    await conFamiglia(request(app).post(`/api/children/${childId}/goals`)).send({ name: 'Bicicletta', emoji: '🚲', targetCents: 25000 });
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 5000 });
    await conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({
      split: { save: 60, spend: 30, give: 10 },
    });

    const r = await conFamiglia(request(app).post(`/api/children/${childId}/coach`)).send({ question: 'Posso comprare un gioco da 10 euro?' });
    expect(r.status).toBe(200);
    expect(r.body.intent).toBe('POSSO_COMPRARE');
    expect(r.body.options).toHaveLength(2);
    expect(r.body.simulation.amountCents).toBe(1000);
    expect(r.body.text).not.toMatch(/non devi comprare|non comprare/i);
  });

  it('risponde alla domanda "quanto tempo ci vuole"', async () => {
    await conFamiglia(request(app).post(`/api/children/${childId}/goals`)).send({ name: 'Bicicletta', emoji: '🚲', targetCents: 25000 });
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/coach`)).send({ question: 'Quanto tempo ci vuole per la bici?' });
    expect(r.body.intent).toBe('QUANTO_TEMPO');
    expect(r.body.text).toMatch(/Bicicletta/);
  });
});

describe('Storico e sincronizzazione offline', () => {
  it('filtra lo storico per categoria', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 2000 });
    await conFamiglia(request(app).post(`/api/children/${childId}/pending-incomes/${entrata.body.pending.id}/allocate`)).send({
      split: { save: 60, spend: 30, give: 10 },
    });
    await conFamiglia(request(app).post(`/api/children/${childId}/purchases`)).send({ amountCents: 200, description: 'Caramelle' });

    const tutte = await conFamiglia(request(app).get(`/api/children/${childId}/history`));
    expect(tutte.body.items.length).toBe(4);
    const spese = await conFamiglia(request(app).get(`/api/children/${childId}/history?filter=SPESE`));
    expect(spese.body.items).toHaveLength(1);
    expect(spese.body.items[0].description).toBe('Caramelle');
    const risparmio = await conFamiglia(request(app).get(`/api/children/${childId}/history?filter=RISPARMIO`));
    expect(risparmio.body.items).toHaveLength(1);
  });

  it('applica una coda di operazioni offline senza duplicare nulla', async () => {
    const entrata = await conGenitore(request(app).post(`/api/parent/children/${childId}/income`)).send({ amountCents: 2000 });
    const operazioni = [
      {
        kind: 'ALLOCATE',
        clientId: 'op-1',
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        payload: { pendingIncomeId: entrata.body.pending.id, split: { save: 60, spend: 30, give: 10 } },
      },
      {
        kind: 'PURCHASE',
        clientId: 'op-2',
        occurredAt: new Date().toISOString(),
        payload: { amountCents: 300, description: 'Gelato', jar: 'SPEND', emoji: '🍦' },
      },
    ];

    const primo = await conFamiglia(request(app).post(`/api/children/${childId}/sync`)).send({ operations: operazioni });
    expect(primo.status).toBe(200);
    expect(primo.body.results.every((r: any) => r.status === 'APPLICATA')).toBe(true);
    expect(primo.body.state.jars.SPEND).toBe(300);

    // stesso invio (retry dopo una connessione instabile): niente doppioni
    const secondo = await conFamiglia(request(app).post(`/api/children/${childId}/sync`)).send({ operations: operazioni });
    expect(secondo.body.results.every((r: any) => r.status === 'DUPLICATO')).toBe(true);
    expect(secondo.body.state.jars.SPEND).toBe(300);
    expect(secondo.body.state.jars.totalCents).toBe(1700);

    const integrita = await conFamiglia(request(app).get(`/api/children/${childId}/integrity`));
    expect(integrita.body.ok).toBe(true);
  });

  it('un’operazione non valida non blocca le altre', async () => {
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/sync`)).send({
      operations: [
        { kind: 'PURCHASE', clientId: 'ko', payload: { amountCents: 99999, description: 'Impossibile', jar: 'SPEND' } },
        { kind: 'QUIZ', clientId: 'ok', payload: { lessonId: 'denaro', answers: [{ id: 'd1', answerIndex: 0 }] } },
      ],
    });
    expect(r.body.results.find((x: any) => x.clientId === 'ko').status).toBe('ERRORE');
    expect(r.body.results.find((x: any) => x.clientId === 'ok').status).toBe('APPLICATA');
  });
});

describe('Onboarding e dati demo', () => {
  it('la prima esperienza crea profilo, obiettivo e divisione iniziale', async () => {
    const r = await conFamiglia(request(app).post(`/api/children/${childId}/onboarding`)).send({
      name: 'Sofia',
      age: 9,
      avatar: '🦄',
      avatarColor: '#FF7AC4',
      goal: { name: 'Bicicletta', emoji: '🚲', targetCents: 25000 },
      split: { save: 70, spend: 20, give: 10 },
    });
    expect(r.status).toBe(201);
    expect(r.body.child.name).toBe('Sofia');
    expect(r.body.child.onboardingCompleted).toBe(true);
    expect(r.body.child.settings.defaultSplit).toEqual({ save: 70, spend: 20, give: 10 });
    expect(r.body.primaryGoal.name).toBe('Bicicletta');
    expect(r.body.child.xp).toBeGreaterThan(0);
  });

  it('il profilo demo di Sofia è completo e coerente', async () => {
    const r = await request(app).post('/api/auth/demo');
    expect(r.status).toBe(200);
    const sofia = r.body.children[0];
    expect(sofia.name).toBe('Sofia');

    const stato = await request(app).get(`/api/children/${sofia.id}/state`).set('Authorization', `Bearer ${r.body.token}`);
    expect(stato.body.primaryGoal.name).toBe('Bicicletta');
    expect(stato.body.primaryGoal.targetCents).toBe(25000);
    expect(stato.body.jobs.length).toBeGreaterThanOrEqual(6);
    expect(stato.body.history.length).toBeGreaterThan(10);
    expect(stato.body.pendingIncomes).toHaveLength(1);
    expect(stato.body.pendingJobRequests).toBe(1);
    expect(stato.body.give.totalDonatedCents).toBe(900);

    const integrita = await request(app).get(`/api/children/${sofia.id}/integrity`).set('Authorization', `Bearer ${r.body.token}`);
    expect(integrita.body.ok).toBe(true);
  });
});
