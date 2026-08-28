import { describe, it, expect } from 'vitest';
import {
  euroToCents, centsToEuro, formatCents, allocateByPercent, percentOf, sumCents, MoneyError, allocateByWeight,
} from '../src/domain/money.js';
import { validateSplit, normalizeSplit, previewSplit, SplitError, isValidSplit } from '../src/domain/split.js';
import { estimateWeeklySavingRate, computeGoalProgress, weeklyFromAllowance, describeWeeks } from '../src/domain/goals.js';
import { simulatePurchase } from '../src/domain/simulator.js';
import { computeMonthlyInterest, projectCompound, compareSimpleVsCompound, periodKey } from '../src/domain/interest.js';
import { levelFromXp, xpForSaving, LEVELS, levelUpHappened } from '../src/domain/xp.js';

describe('Denaro: aritmetica in centesimi', () => {
  it('converte gli euro in centesimi senza errori di virgola mobile', () => {
    expect(euroToCents(10)).toBe(1000);
    expect(euroToCents(0.1)).toBe(10);
    expect(euroToCents(1.005)).toBe(101);       // il classico caso che rompe i float
    expect(euroToCents(2.675)).toBe(268);
    expect(euroToCents('12,50')).toBe(1250);
    expect(euroToCents('€ 3,05')).toBe(305);
    expect(euroToCents(-4.2)).toBe(-420);
  });

  it('rifiuta importi non validi', () => {
    expect(() => euroToCents('abc')).toThrow(MoneyError);
    expect(() => euroToCents(Number.NaN)).toThrow(MoneyError);
  });

  it('formatta in stile italiano', () => {
    expect(formatCents(12345)).toBe('€ 123,45');
    expect(formatCents(5)).toBe('€ 0,05');
    expect(formatCents(-250)).toBe('-€ 2,50');
    expect(formatCents(100000, { simbolo: false })).toBe('1.000,00');
    expect(centsToEuro(1250)).toBe(12.5);
  });

  it('somma senza perdere centesimi', () => {
    const valori = Array.from({ length: 1000 }, () => 1);
    expect(sumCents(valori)).toBe(1000);
    expect(sumCents([10, -3, 5])).toBe(12);
  });

  it('applica una percentuale con arrotondamento half-up', () => {
    expect(percentOf(1000, 10)).toBe(100);
    expect(percentOf(333, 50)).toBe(167);   // 166,5 -> 167
    expect(percentOf(1000, 33.33)).toBe(333);
  });
});

describe('Ripartizione: la somma delle parti è sempre il totale', () => {
  it('divide 10 € in 60/30/10', () => {
    expect(allocateByPercent(1000, [60, 30, 10])).toEqual([600, 300, 100]);
  });

  it('gestisce i centesimi residui senza crearli né perderli', () => {
    const parti = allocateByPercent(1000, [33, 33, 34]);
    expect(parti.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parti).toEqual([330, 330, 340]);
  });

  it('non perde mai un centesimo su 1000 importi casuali', () => {
    for (let i = 1; i <= 1000; i++) {
      const totale = i * 7 + (i % 13);
      const parti = allocateByPercent(totale, [55, 35, 10]);
      expect(parti.reduce((a, b) => a + b, 0)).toBe(totale);
      expect(parti.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it('è deterministica a parità di input', () => {
    expect(allocateByPercent(101, [33, 33, 34])).toEqual(allocateByPercent(101, [33, 33, 34]));
  });

  it('rifiuta percentuali che non fanno 100', () => {
    expect(() => allocateByPercent(1000, [50, 30, 10])).toThrow(MoneyError);
  });

  it('ripartisce anche per pesi arbitrari', () => {
    const parti = allocateByWeight(1000, [1, 1, 2]);
    expect(parti.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parti).toEqual([250, 250, 500]);
  });
});

describe('Regole SAVE / SPEND / GIVE', () => {
  it('accetta solo ripartizioni che fanno 100%', () => {
    expect(() => validateSplit({ save: 60, spend: 30, give: 10 }, 10)).not.toThrow();
    expect(() => validateSplit({ save: 60, spend: 30, give: 5 }, 10)).toThrow(SplitError);
    expect(() => validateSplit({ save: 50, spend: 30, give: 10 }, 10)).toThrow(/100%/);
  });

  it('impedisce a GIVE di scendere sotto la soglia della famiglia', () => {
    expect(isValidSplit({ save: 70, spend: 25, give: 5 }, 10)).toBe(false);
    expect(() => validateSplit({ save: 70, spend: 25, give: 5 }, 10)).toThrow(/10%/);
    expect(isValidSplit({ save: 70, spend: 20, give: 10 }, 10)).toBe(true);
  });

  it('normalizza gli slider mantenendo ferma la leva che il bambino sta muovendo', () => {
    const risultato = normalizeSplit({ save: 80, spend: 30, give: 10 }, 10, 'save');
    expect(risultato.save).toBe(80);
    expect(risultato.save + risultato.spend + risultato.give).toBe(100);
    expect(risultato.give).toBeGreaterThanOrEqual(10);
  });

  it('rialza GIVE se il bambino prova a scendere sotto il minimo', () => {
    const risultato = normalizeSplit({ save: 60, spend: 40, give: 0 }, 10, 'give');
    expect(risultato.give).toBe(10);
    expect(risultato.save + risultato.spend + risultato.give).toBe(100);
  });

  it('produce sempre un totale di 100 partendo da valori qualsiasi', () => {
    for (const s of [
      { save: 0, spend: 0, give: 0 },
      { save: 100, spend: 100, give: 100 },
      { save: 33, spend: 33, give: 33 },
      { save: 90, spend: 5, give: 5 },
    ]) {
      const n = normalizeSplit(s, 10);
      expect(n.save + n.spend + n.give).toBe(100);
      expect(n.give).toBeGreaterThanOrEqual(10);
    }
  });

  it('l’anteprima mostra importi che ricompongono il totale', () => {
    const righe = previewSplit(1000, { save: 60, spend: 30, give: 10 });
    expect(righe.map((r) => r.amountCents)).toEqual([600, 300, 100]);
    expect(righe.reduce((a, r) => a + r.amountCents, 0)).toBe(1000);
  });
});

describe('Obiettivi: progresso e previsione', () => {
  const oggi = new Date('2026-03-01T12:00:00Z');

  it('calcola percentuale, mancante e settimane', () => {
    const p = computeGoalProgress({
      targetCents: 25000,
      savedCents: 12000,
      rate: { weeklyCents: 1600, sampleWeeks: 8, source: 'STORICO' },
      now: oggi,
    });
    expect(p.percent).toBe(48);
    expect(p.remainingCents).toBe(13000);
    expect(p.weeksRemaining).toBe(9);   // 13000 / 1600 = 8,125 -> 9 settimane intere
    expect(p.completed).toBe(false);
    expect(p.projectedDate).toBe('2026-05-03');
  });

  it('riconosce un obiettivo raggiunto', () => {
    const p = computeGoalProgress({ targetCents: 8000, savedCents: 8000, now: oggi });
    expect(p.completed).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.weeksRemaining).toBe(0);
  });

  it('non promette date se non conosce il ritmo', () => {
    const p = computeGoalProgress({ targetCents: 25000, savedCents: 0, now: oggi });
    expect(p.weeksRemaining).toBeNull();
    expect(p.projectedDate).toBeNull();
    expect(describeWeeks(null)).toMatch(/non lo so ancora/i);
  });

  it('stima il ritmo settimanale dallo storico', () => {
    const rate = estimateWeeklySavingRate(
      [
        { occurredAt: '2026-02-01T12:00:00Z', amountCents: 600 },
        { occurredAt: '2026-02-08T12:00:00Z', amountCents: 600 },
        { occurredAt: '2026-02-15T12:00:00Z', amountCents: 600 },
        { occurredAt: '2026-02-22T12:00:00Z', amountCents: 600 },
      ],
      { now: oggi, windowWeeks: 8 },
    );
    expect(rate.source).toBe('STORICO');
    expect(rate.weeklyCents).toBeGreaterThan(500);
    expect(rate.weeklyCents).toBeLessThanOrEqual(800);
  });

  it('usa la paghetta prevista quando lo storico non basta', () => {
    const rate = estimateWeeklySavingRate([], { now: oggi, fallbackWeeklyCents: 600 });
    expect(rate.source).toBe('PAGHETTA');
    expect(rate.weeklyCents).toBe(600);
  });

  it('calcola la quota SAVE di una paghetta ricorrente', () => {
    expect(weeklyFromAllowance(1000, 60, 30, 10)).toBe(600);
    expect(weeklyFromAllowance(0, 60, 30, 10)).toBe(0);
  });
});

describe('Simulatore delle scelte', () => {
  const rate = { weeklyCents: 1000, sampleWeeks: 8, source: 'STORICO' as const };
  const goal = { name: 'Bicicletta', emoji: '🚲', targetCents: 25000, savedCents: 19000 };

  it('una spesa da SPEND non allontana l’obiettivo ma mostra il costo-opportunità', () => {
    const r = simulatePurchase({ amountCents: 1500, jar: 'SPEND', jarBalanceCents: 2000, goal, rate, label: 'uno slime' });
    expect(r.affordable).toBe(true);
    expect(r.deltaWeeks).toBe(0);
    expect(r.senzaAcquisto?.weeksRemaining).toBe(6);
    expect(r.opportunitaWeeks).toBe(1);
    expect(r.impact).toBe('COSTO_OPPORTUNITA');
    expect(r.balanceAfterCents).toBe(500);
  });

  it('una spesa da SAVE sposta davvero l’obiettivo', () => {
    const r = simulatePurchase({ amountCents: 2000, jar: 'SAVE', jarBalanceCents: 19000, goal, rate, label: 'una console' });
    expect(r.senzaAcquisto?.weeksRemaining).toBe(6);
    expect(r.conAcquisto?.weeksRemaining).toBe(8);
    expect(r.deltaWeeks).toBe(2);
    expect(r.impact).toBe('RITARDO');
    expect(r.message).toMatch(/Decidi tu/);
  });

  it('non blocca mai l’acquisto, segnala solo i fondi insufficienti', () => {
    const r = simulatePurchase({ amountCents: 5000, jar: 'SPEND', jarBalanceCents: 1000, goal, rate });
    expect(r.affordable).toBe(false);
    expect(r.headline).toMatch(/mancano/i);
    expect(r.recuperoWeeks).toBe(5);
  });

  it('funziona anche senza obiettivo attivo', () => {
    const r = simulatePurchase({ amountCents: 500, jar: 'SPEND', jarBalanceCents: 2000, goal: null, rate });
    expect(r.impact).toBe('NESSUN_OBIETTIVO');
    expect(r.affordable).toBe(true);
  });
});

describe('Interesse educativo', () => {
  it('5 centesimi per euro su 100 € danno 5 €', () => {
    const r = computeMonthlyInterest(10000, 5);
    expect(r.interestCents).toBe(500);
    expect(r.newBalanceCents).toBe(10500);
    expect(r.euriInteri).toBe(100);
  });

  it('segue la progressione composta del capitolato', () => {
    const passi = projectCompound(10000, 5, 4);
    expect(passi.map((p) => p.endCents)).toEqual([10500, 11025, 11576, 12155]);
  });

  it('mostra la differenza fra interesse semplice e composto', () => {
    const c = compareSimpleVsCompound(10000, 5, 12);
    expect(c.compostoFinaleCents).toBeGreaterThan(c.sempliceFinaleCents);
    expect(c.differenzaCents).toBe(c.compostoFinaleCents - c.sempliceFinaleCents);
  });

  it('non genera interesse su un salvadanaio vuoto', () => {
    expect(computeMonthlyInterest(0, 5).interestCents).toBe(0);
    expect(computeMonthlyInterest(10000, 0).interestCents).toBe(0);
  });

  it('tiene conto anche del versamento mensile', () => {
    const passi = projectCompound(10000, 5, 2, 1000);
    expect(passi[0].endCents).toBe(11500);   // 10000 + 500 + 1000
    expect(passi[1].endCents).toBe(13075);   // 11500 + 575 + 1000
  });

  it('usa una chiave mese per non accreditare due volte', () => {
    expect(periodKey(new Date('2026-03-15T10:00:00'))).toBe('2026-03');
  });
});

describe('XP e livelli', () => {
  it('assegna i livelli secondo le soglie', () => {
    expect(levelFromXp(0).name).toBe('Money Explorer');
    expect(levelFromXp(150).name).toBe('Smart Saver');
    expect(levelFromXp(399).level).toBe(2);
    expect(levelFromXp(400).name).toBe('Money Builder');
    expect(levelFromXp(5000).isMax).toBe(true);
    expect(LEVELS).toHaveLength(5);
  });

  it('mostra quanto manca al livello successivo', () => {
    const s = levelFromXp(200);
    expect(s.xpForNextLevel).toBe(200);
    expect(s.progressPercent).toBeGreaterThan(0);
    expect(s.progressPercent).toBeLessThan(100);
  });

  it('non premia solo l’accumulo: gli XP da risparmio hanno un tetto', () => {
    expect(xpForSaving(500)).toBe(5);
    expect(xpForSaving(100000)).toBe(20);
    expect(xpForSaving(0)).toBe(0);
  });

  it('riconosce il passaggio di livello', () => {
    expect(levelUpHappened(140, 160)).toBe(true);
    expect(levelUpHappened(160, 170)).toBe(false);
  });
});
