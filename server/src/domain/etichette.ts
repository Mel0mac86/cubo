/**
 * Etichette, icone e testi condivisi fra server e app.
 * Stanno nel dominio perché devono essere identici ovunque: quello che il
 * bambino legge nello storico non deve cambiare a seconda di chi lo calcola.
 */
import type { Cents } from './money.js';
import type { HistoryFilter, JarType, TransactionType, DonationCause } from './types.js';

/**
 * I nomi dei tre salvadanai come li legge il bambino.
 *
 * I codici SAVE / SPEND / GIVE restano gli identificatori interni — database,
 * API, tipi — perché cambiarli non darebbe niente a chi usa l'app e romperebbe
 * i dati già salvati. Qui si traduce solo quello che finisce sotto gli occhi.
 */
export const NOMI_JAR: Record<JarType, string> = {
  SAVE: 'RISPARMIO',
  SPEND: 'SPENDO',
  GIVE: 'DONO',
};

/** Una riga di spiegazione per ciascun salvadanaio. */
export const DESCRIZIONI_JAR: Record<JarType, string> = {
  SAVE: 'I soldi per il tuo obiettivo',
  SPEND: 'Puoi usarli quando vuoi',
  GIVE: 'I soldi per aiutare gli altri',
};

/** Come ogni filtro dello storico si traduce in una selezione di movimenti. */
export const FILTRI_STORICO: Record<HistoryFilter, { tipi?: TransactionType[]; jar?: JarType; direzione?: 'IN' | 'OUT' }> = {
  TUTTO: {},
  ENTRATE: { tipi: ['ALLOWANCE', 'JOB', 'GIFT'], direzione: 'IN' },
  SPESE: { tipi: ['PURCHASE'] },
  RISPARMIO: { jar: 'SAVE', direzione: 'IN' },
  DONAZIONI: { tipi: ['DONATION'] },
  INTERESSI: { tipi: ['INTEREST'] },
  LAVORI: { tipi: ['JOB'] },
};

export const ICONE_TIPO: Record<TransactionType, string> = {
  ALLOWANCE: '💶',
  JOB: '💪',
  GIFT: '🎁',
  PURCHASE: '🛍️',
  DONATION: '❤️',
  INTEREST: '🌱',
  TRANSFER_IN: '↩️',
  TRANSFER_OUT: '↪️',
  ADJUSTMENT: '✏️',
};

export const ETICHETTE_TIPO: Record<TransactionType, string> = {
  ALLOWANCE: 'Paghetta',
  JOB: 'Lavoro',
  GIFT: 'Regalo',
  PURCHASE: 'Acquisto',
  DONATION: 'Donazione',
  INTEREST: 'Interesse',
  TRANSFER_IN: 'Giroconto',
  TRANSFER_OUT: 'Giroconto',
  ADJUSTMENT: 'Correzione',
};

export const CAUSE_INFO: Record<DonationCause, { emoji: string; label: string; esempio: string }> = {
  ANIMALI: { emoji: '🐶', label: 'Animali', esempio: 'Rifugio per cani e gatti' },
  AMBIENTE: { emoji: '🌳', label: 'Ambiente', esempio: 'Piantare alberi' },
  PERSONE: { emoji: '❤️', label: 'Persone', esempio: 'Mensa solidale' },
  ISTRUZIONE: { emoji: '🏫', label: 'Istruzione', esempio: 'Libri per chi non può comprarli' },
  EMERGENZE: { emoji: '🌍', label: 'Emergenze', esempio: 'Aiuti dopo un terremoto' },
};

/** Messaggi motivazionali per la sezione GIVE (mai colpevolizzanti). */
export function messaggioGive(totaleDonatoCents: Cents, saldoGiveCents: Cents): string {
  if (totaleDonatoCents === 0 && saldoGiveCents === 0) return `Il salvadanaio ${NOMI_JAR.GIVE} si riempie da solo ogni volta che arrivano dei soldi. 🌱`;
  if (totaleDonatoCents === 0) return 'Hai già qualcosa da parte per aiutare. A chi ti piacerebbe darlo? 💛';
  if (totaleDonatoCents < 500) return 'Hai fatto la tua prima donazione: per qualcuno è stata una giornata migliore. ❤️';
  if (totaleDonatoCents < 2000) return 'Stai diventando davvero generoso. Continua così! 🌟';
  return 'Il tuo salvadanaio GIVE ha aiutato tante volte. Sei un campione di generosità! 🏆';
}
