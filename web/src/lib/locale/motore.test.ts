/**
 * Test del motore che gira dentro il telefono (versione senza server).
 * Verifica le stesse garanzie dei test dell'API: divisione esatta, dono mai
 * sotto la soglia, saldi mai negativi, modalità genitore protetta dal PIN.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { richiestaLocale } from './motore';
import { azzeraArchivio, esportaBackup, importaBackup, leggiArchivio, modifica as modificaArchivio } from './archivio';
import { NOMI_JAR } from '@dominio/etichette.js';

const REGISTRAZIONE = {
  familyName: 'Famiglia Prova',
  parentName: 'Mamma',
  email: 'prova@famiglia.it',
  password: 'password-sicura',
  pin: '4321',
  childName: 'Luca',
  childAge: 9,
};

let childId = '';
let pin = '';

async function sbloccaGenitore() {
  const r = await richiestaLocale<{ parentToken: string }>('POST', '/auth/parent-mode', { pin: REGISTRAZIONE.pin });
  return r.parentToken;
}

const genitore = <T>(metodo: string, percorso: string, corpo?: unknown) =>
  richiestaLocale<T>(metodo, percorso, corpo, { parent: true }, pin);

beforeEach(async () => {
  azzeraArchivio();
  const r = await richiestaLocale<{ children: { id: string }[] }>('POST', '/auth/register', REGISTRAZIONE);
  childId = r.children[0].id;
  pin = await sbloccaGenitore();
});

describe('Accesso e protezione della modalità genitore', () => {
  it('crea la famiglia con il bambino', async () => {
    const stato = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    expect(stato.child.name).toBe('Luca');
    expect(stato.jars.totalCents).toBe(0);
    expect(stato.modalita).toBe('locale');
  });

  it('senza PIN le rotte del genitore sono chiuse', async () => {
    await expect(richiestaLocale('GET', '/parent/children', undefined, { parent: true }, 'token-inventato')).rejects.toThrow(/genitori/i);
  });

  it('un PIN sbagliato non sblocca niente', async () => {
    await expect(richiestaLocale('POST', '/auth/parent-mode', { pin: '0000' })).rejects.toThrow(/PIN non corretto/);
  });

  it('la password di famiglia viene verificata', async () => {
    await expect(richiestaLocale('POST', '/auth/login', { email: REGISTRAZIONE.email, password: 'sbagliata' })).rejects.toThrow();
    const ok = await richiestaLocale<any>('POST', '/auth/login', { email: REGISTRAZIONE.email, password: REGISTRAZIONE.password });
    expect(ok.children).toHaveLength(1);
  });

  it('la registrazione crea sempre un profilo bambino, anche senza nome', async () => {
    // Senza profilo l'app resterebbe ferma sulla schermata di caricamento.
    azzeraArchivio();
    const r = await richiestaLocale<any>('POST', '/auth/register', {
      familyName: 'Famiglia Rossi', parentName: 'Papà',
      email: 'rossi@email.it', password: 'password-sicura', pin: '4321',
    });
    expect(r.children).toHaveLength(1);
    const stato = await richiestaLocale<any>('GET', `/children/${r.children[0].id}/state`);
    expect(stato.child.onboardingCompleted).toBe(false);
    expect(stato.jars.totalCents).toBe(0);
  });

  it('ripara una famiglia rimasta senza bambino', async () => {
    // Le famiglie create prima della correzione non devono restare bloccate.
    azzeraArchivio();
    await richiestaLocale('POST', '/auth/register', {
      familyName: 'Famiglia Rossi', parentName: 'Papà',
      email: 'rossi@email.it', password: 'password-sicura', pin: '4321',
    });
    modificaArchivio((a) => { a.bambini = []; a.salvadanai = {}; });
    expect(leggiArchivio().bambini).toHaveLength(0);

    const login = await richiestaLocale<any>('POST', '/auth/login', { email: 'rossi@email.it', password: 'password-sicura' });
    expect(login.children).toHaveLength(1);

    const me = await richiestaLocale<any>('GET', '/auth/me');
    expect(me.children).toHaveLength(1);
  });

  it('password e PIN non restano in chiaro nei dati salvati', () => {
    const grezzo = JSON.stringify(leggiArchivio());
    expect(grezzo).not.toContain(REGISTRAZIONE.password);
    expect(grezzo).not.toContain(REGISTRAZIONE.pin);
  });
});

describe('Entrate e divisione', () => {
  async function nuovaEntrata(amountCents: number) {
    const r = await genitore<any>('POST', `/parent/children/${childId}/income`, { amountCents, description: 'Paghetta' });
    return r.pending.id;
  }

  it('il genitore inserisce e il bambino decide come dividere', async () => {
    const pendingId = await nuovaEntrata(1000);
    const prima = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    expect(prima.jars.totalCents).toBe(0);
    expect(prima.pendingIncomes).toHaveLength(1);

    const dopo = await richiestaLocale<any>('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, {
      split: { save: 60, spend: 30, give: 10 },
    });
    expect(dopo.state.jars.SAVE).toBe(600);
    expect(dopo.state.jars.SPEND).toBe(300);
    expect(dopo.state.jars.GIVE).toBe(100);
  });

  it('la somma delle tre parti è sempre l’importo, centesimi compresi', async () => {
    for (const importo of [1, 3, 7, 33, 99, 101, 999, 1234]) {
      const pendingId = await nuovaEntrata(importo);
      const r = await richiestaLocale<any>('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, {
        split: { save: 33, spend: 33, give: 34 },
      });
      expect(r.transactions.reduce((s: number, t: any) => s + t.amountCents, 0)).toBe(importo);
    }
    const integrita = await richiestaLocale<any>('GET', `/children/${childId}/integrity`);
    expect(integrita.ok).toBe(true);
  });

  it('rifiuta una divisione che non fa 100%', async () => {
    const pendingId = await nuovaEntrata(1000);
    await expect(
      richiestaLocale('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, { split: { save: 60, spend: 30, give: 5 } }),
    ).rejects.toThrow(/100%/);
  });

  it('il dono non può scendere sotto la regola di famiglia', async () => {
    const pendingId = await nuovaEntrata(1000);
    await expect(
      richiestaLocale('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, { split: { save: 70, spend: 25, give: 5 } }),
    ).rejects.toThrow(new RegExp(NOMI_JAR.GIVE));
  });

  it('la stessa entrata non si divide due volte', async () => {
    const pendingId = await nuovaEntrata(1000);
    const corpo = { split: { save: 60, spend: 30, give: 10 } };
    await richiestaLocale('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, corpo);
    await expect(richiestaLocale('POST', `/children/${childId}/pending-incomes/${pendingId}/allocate`, corpo)).rejects.toThrow(/già/);
  });
});

describe('Obiettivi, spese e simulatore', () => {
  async function conSoldi(saveCents: number) {
    const r = await genitore<any>('POST', `/parent/children/${childId}/income`, { amountCents: saveCents, mode: 'AUTO', split: { save: 100, spend: 0, give: 0 } });
    return r;
  }

  it('l’obiettivo si aggiorna quando entrano soldi nel risparmio', async () => {
    await richiestaLocale('POST', `/children/${childId}/goals`, { name: 'Bicicletta', emoji: '🚲', targetCents: 25000 });
    await genitore('PATCH', `/parent/children/${childId}/settings`, { minGivePercent: 0 });
    await conSoldi(5000);
    const stato = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    expect(stato.primaryGoal.progress.savedCents).toBe(5000);
    expect(stato.primaryGoal.progress.percent).toBe(20);
    expect(stato.primaryGoal.progress.remainingCents).toBe(20000);
  });

  it('non si può spendere più di quanto c’è', async () => {
    await expect(
      richiestaLocale('POST', `/children/${childId}/purchases`, { amountCents: 5000, description: 'Troppo caro' }),
    ).rejects.toThrow(/FONDI|ci sono/i);
  });

  it('il simulatore mostra i due futuri senza bloccare nulla', async () => {
    await richiestaLocale('POST', `/children/${childId}/goals`, { name: 'Bicicletta', emoji: '🚲', targetCents: 25000 });
    await genitore('PATCH', `/parent/children/${childId}/settings`, { minGivePercent: 0 });
    await genitore('POST', `/parent/children/${childId}/income`, { amountCents: 5000, mode: 'AUTO', split: { save: 50, spend: 50, give: 0 } });
    const r = await richiestaLocale<any>('POST', `/children/${childId}/simulate`, { amountCents: 800, jar: 'SPEND', label: 'uno slime' });
    expect(r.senzaAcquisto).not.toBeNull();
    expect(r.conAcquisto).not.toBeNull();
    expect(r.affordable).toBe(true);
    expect(r.deltaWeeks).toBe(0);
  });

  it('completa l’obiettivo e preleva dal risparmio', async () => {
    await genitore('PATCH', `/parent/children/${childId}/settings`, { minGivePercent: 0 });
    await richiestaLocale('POST', `/children/${childId}/goals`, { name: 'Cuffie', emoji: '🎧', targetCents: 3000 });
    await conSoldi(4000);
    const stato = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    expect(stato.primaryGoal.progress.completed).toBe(true);

    const r = await richiestaLocale<any>('POST', `/children/${childId}/goals/${stato.primaryGoal.id}/complete`);
    expect(r.celebrations).toContain('CONFETTI');
    expect(r.state.jars.SAVE).toBe(1000);
    expect(r.state.goals.find((g: any) => g.id === stato.primaryGoal.id).status).toBe('COMPLETED');
  });
});

describe('Lavori, interesse e donazioni', () => {
  it('richiesta, approvazione e accredito diviso', async () => {
    const lavoro = await genitore<any>('POST', '/parent/jobs', { title: 'Lavare la macchina', emoji: '🚗', rewardCents: 300 });
    const richiesta = await richiestaLocale<any>('POST', `/children/${childId}/jobs/${lavoro.id}/request`, {});
    expect(richiesta.status).toBe('PENDING');

    const inAttesa = await genitore<any[]>('GET', '/parent/job-requests?status=PENDING');
    expect(inAttesa).toHaveLength(1);

    const approvazione = await genitore<any>('POST', `/parent/job-requests/${richiesta.id}/approve`, {});
    expect(approvazione.state.jars.SAVE).toBe(180);
    expect(approvazione.state.jars.SPEND).toBe(90);
    expect(approvazione.state.jars.GIVE).toBe(30);
  });

  it('non si approva due volte la stessa richiesta', async () => {
    const lavoro = await genitore<any>('POST', '/parent/jobs', { title: 'Garage', rewardCents: 500 });
    const richiesta = await richiestaLocale<any>('POST', `/children/${childId}/jobs/${lavoro.id}/request`, {});
    await genitore('POST', `/parent/job-requests/${richiesta.id}/approve`, {});
    await expect(genitore('POST', `/parent/job-requests/${richiesta.id}/approve`, {})).rejects.toThrow(/già/);
  });

  it('l’interesse si accredita una sola volta al mese', async () => {
    await genitore('PATCH', `/parent/children/${childId}/settings`, { minGivePercent: 0 });
    await genitore('POST', `/parent/children/${childId}/income`, { amountCents: 10000, mode: 'AUTO', split: { save: 100, spend: 0, give: 0 } });
    const primo = await genitore<any>('POST', `/parent/children/${childId}/interest`, {});
    expect(primo.interestCents).toBe(500);
    expect(primo.state.jars.SAVE).toBe(10500);
    const secondo = await genitore<any>('POST', `/parent/children/${childId}/interest`, {});
    expect(secondo.skipped).toBe('GIA_ACCREDITATO');
    expect(secondo.state.jars.SAVE).toBe(10500);
  });

  it('la donazione esce dal dono solo con il permesso del genitore', async () => {
    await genitore('POST', `/parent/children/${childId}/income`, { amountCents: 2000, mode: 'AUTO', split: { save: 0, spend: 0, give: 100 } });
    const obiettivo = await richiestaLocale<any>('POST', `/children/${childId}/donation-goals`, {
      title: 'Rifugio animali', cause: 'ANIMALI', targetCents: 2000,
    });
    // senza permesso di genitore la rotta è chiusa
    await expect(
      richiestaLocale('POST', `/parent/children/${childId}/donations`, { amountCents: 500, cause: 'ANIMALI' }, { parent: true }, 'token-finto'),
    ).rejects.toThrow(/genitori/i);

    const r = await genitore<any>('POST', `/parent/children/${childId}/donations`, {
      amountCents: 2000, cause: 'ANIMALI', donationGoalId: obiettivo.id,
    });
    expect(r.state.jars.GIVE).toBe(0);
    expect(r.state.give.totalDonatedCents).toBe(2000);
    expect(r.messages.join(' ')).toContain(`OBIETTIVO ${NOMI_JAR.GIVE} COMPLETATO`);
  });
});

describe('Lezioni e Money Coach', () => {
  it('le risposte corrette non escono prima della consegna', async () => {
    const lezione = await richiestaLocale<any>('GET', `/children/${childId}/lessons/percentuali`);
    expect(JSON.stringify(lezione)).not.toMatch(/correctIndex/);
  });

  it('corregge il quiz e non regala XP ripetendolo', async () => {
    const risposte = { answers: [{ id: 'p1', answerIndex: 1 }, { id: 'p2', answerIndex: 1 }, { id: 'p3', answerIndex: 0 }, { id: 'p4', answerIndex: 0 }] };
    const primo = await richiestaLocale<any>('POST', `/children/${childId}/lessons/percentuali/quiz`, risposte);
    expect(primo.score).toBe(4);
    expect(primo.perfetto).toBe(true);
    const secondo = await richiestaLocale<any>('POST', `/children/${childId}/lessons/percentuali/quiz`, risposte);
    expect(secondo.state.child.xp).toBe(primo.state.child.xp);
  });

  it('il Coach risponde con i numeri veri e non decide', async () => {
    await richiestaLocale('POST', `/children/${childId}/goals`, { name: 'Bicicletta', emoji: '🚲', targetCents: 25000 });
    await genitore('POST', `/parent/children/${childId}/income`, { amountCents: 5000, mode: 'AUTO' });
    const r = await richiestaLocale<any>('POST', `/children/${childId}/coach`, { question: 'Posso comprare un gioco da 10 euro?' });
    expect(r.intent).toBe('POSSO_COMPRARE');
    expect(r.options).toHaveLength(2);
    expect(r.simulation.amountCents).toBe(1000);
    expect(r.text).not.toMatch(/non devi comprare/i);
  });
});

describe('Profilo demo e backup', () => {
  it('la demo di Sofia è completa e coerente', async () => {
    azzeraArchivio();
    const r = await richiestaLocale<any>('POST', '/auth/demo');
    const sofia = r.children[0];
    expect(sofia.name).toBe('Sofia');

    const stato = await richiestaLocale<any>('GET', `/children/${sofia.id}/state`);
    expect(stato.primaryGoal.name).toBe('Bicicletta');
    expect(stato.primaryGoal.targetCents).toBe(25000);
    expect(stato.jobs.length).toBeGreaterThanOrEqual(6);
    expect(stato.history.length).toBeGreaterThan(10);
    expect(stato.pendingIncomes).toHaveLength(1);
    expect(stato.pendingJobRequests).toBe(1);
    expect(stato.give.totalDonatedCents).toBe(900);

    const integrita = await richiestaLocale<any>('GET', `/children/${sofia.id}/integrity`);
    expect(integrita.ok).toBe(true);
  });

  it('il backup salva e ripristina tutto', async () => {
    await genitore('POST', `/parent/children/${childId}/income`, { amountCents: 1000, mode: 'AUTO' });
    const prima = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    const backup = esportaBackup();

    azzeraArchivio();
    expect(leggiArchivio().bambini).toHaveLength(0);

    const esito = importaBackup(backup.contenuto);
    expect(esito.ok).toBe(true);
    const dopo = await richiestaLocale<any>('GET', `/children/${childId}/state`);
    expect(dopo.jars.totalCents).toBe(prima.jars.totalCents);
    expect(dopo.history.length).toBe(prima.history.length);
  });

  it('rifiuta un file che non è un backup', () => {
    expect(importaBackup('non sono json')).toEqual({ ok: false, errore: expect.stringContaining('leggibile') });
    expect(importaBackup('{"altro": 1}').ok).toBe(false);
  });
});
