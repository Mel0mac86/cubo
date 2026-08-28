import { describe, it, expect } from 'vitest';
import { formatCents, parseEuroToCents, settimaneTesto, formatDate } from './format';

describe('Formattazione degli importi', () => {
  it('mostra gli euro in stile italiano', () => {
    expect(formatCents(12345)).toBe('€ 123,45');
    expect(formatCents(5)).toBe('€ 0,05');
    expect(formatCents(0)).toBe('€ 0,00');
    expect(formatCents(100000)).toBe('€ 1.000,00');
    expect(formatCents(-250)).toBe('−€ 2,50');
    expect(formatCents(1250, { simbolo: false })).toBe('12,50');
  });

  it('legge quello che scrive l’utente', () => {
    expect(parseEuroToCents('3,50')).toBe(350);
    expect(parseEuroToCents('3.5')).toBe(350);
    expect(parseEuroToCents('€ 10')).toBe(1000);
    expect(parseEuroToCents('0,05')).toBe(5);
    expect(parseEuroToCents('1,005')).toBeNull(); // più di due decimali: non valido
    expect(parseEuroToCents('abc')).toBeNull();
    expect(parseEuroToCents('')).toBeNull();
  });

  it('descrive le settimane in modo comprensibile', () => {
    expect(settimaneTesto(1)).toBe('circa 1 settimana');
    expect(settimaneTesto(8)).toBe('circa 8 settimane');
    expect(settimaneTesto(0)).toBe('ci sei già!');
    expect(settimaneTesto(null)).toBe('ancora non lo so');
  });

  it('formatta le date', () => {
    expect(formatDate('2026-05-03')).toBe('03/05/2026');
    expect(formatDate(null)).toBe('—');
  });
});
