/** Mini-lezioni e quiz: progressi, punteggi e XP. */
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { LESSONS, getLesson, type Lesson } from '../content/lessons.js';
import { awardXp, notify, unlockAchievement, type XpResult } from './gamification.js';

export interface LessonSummary {
  id: string;
  position: number;
  title: string;
  emoji: string;
  summary: string;
  minutes: number;
  totalQuestions: number;
  completed: boolean;
  bestScore: number;
  attempts: number;
}

export async function listLessons(db: Db, childId: string): Promise<LessonSummary[]> {
  const { rows } = await db.query(
    `SELECT lesson_id, completed_at, best_score, attempts FROM lesson_progress WHERE child_id = $1`,
    [childId],
  );
  const progressi = new Map(rows.map((r) => [r.lesson_id, r]));
  return LESSONS.map((l) => {
    const p = progressi.get(l.id);
    return {
      id: l.id,
      position: l.position,
      title: l.title,
      emoji: l.emoji,
      summary: l.summary,
      minutes: l.minutes,
      totalQuestions: l.quiz.length,
      completed: !!p?.completed_at,
      bestScore: p?.best_score ?? 0,
      attempts: p?.attempts ?? 0,
    };
  }).sort((a, b) => a.position - b.position);
}

/** Lezione completa (senza le risposte corrette: quelle restano sul server). */
export function getLessonForChild(lessonId: string): Omit<Lesson, 'quiz'> & { quiz: { id: string; question: string; options: string[] }[] } {
  const lezione = getLesson(lessonId);
  if (!lezione) throw notFound('Lezione non trovata.');
  return {
    ...lezione,
    quiz: lezione.quiz.map((q) => ({ id: q.id, question: q.question, options: q.options })),
  };
}

export interface QuizResult {
  lessonId: string;
  score: number;
  total: number;
  perfetto: boolean;
  dettagli: { id: string; corretta: boolean; correctIndex: number; explanation: string }[];
  xp: XpResult[];
  celebrations: string[];
}

/** Correzione del quiz: le risposte corrette non escono mai dal server prima della consegna. */
export async function submitQuiz(
  client: PoolClient,
  childId: string,
  lessonId: string,
  risposte: { id: string; answerIndex: number }[],
): Promise<QuizResult> {
  const lezione = getLesson(lessonId);
  if (!lezione) throw notFound('Lezione non trovata.');
  if (!Array.isArray(risposte)) throw badRequest('Risposte non valide.');

  const mappa = new Map(risposte.map((r) => [r.id, r.answerIndex]));
  const dettagli = lezione.quiz.map((q) => ({
    id: q.id,
    corretta: mappa.get(q.id) === q.correctIndex,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
  const score = dettagli.filter((d) => d.corretta).length;
  const total = lezione.quiz.length;
  const perfetto = score === total && total > 0;

  const { rows: precedente } = await client.query(
    `SELECT best_score, completed_at FROM lesson_progress WHERE child_id = $1 AND lesson_id = $2`,
    [childId, lessonId],
  );
  const eraCompletata = !!precedente[0]?.completed_at;
  const bestPrecedente = precedente[0]?.best_score ?? 0;

  await client.query(
    `INSERT INTO lesson_progress (child_id, lesson_id, completed_at, best_score, attempts)
     VALUES ($1,$2,now(),$3,1)
     ON CONFLICT (child_id, lesson_id) DO UPDATE
       SET completed_at = COALESCE(lesson_progress.completed_at, now()),
           best_score = GREATEST(lesson_progress.best_score, EXCLUDED.best_score),
           attempts = lesson_progress.attempts + 1`,
    [childId, lessonId, score],
  );
  await client.query(
    `INSERT INTO quiz_attempts (child_id, lesson_id, score, total, answers) VALUES ($1,$2,$3,$4,$5)`,
    [childId, lessonId, score, total, JSON.stringify(risposte)],
  );

  const xp: XpResult[] = [];
  // Gli XP delle risposte si assegnano solo per i miglioramenti: niente "farming" ripetendo il quiz.
  const nuoveCorrette = Math.max(0, score - bestPrecedente);
  if (nuoveCorrette > 0) {
    xp.push(await awardXp(client, childId, 'QUIZ_RISPOSTA_CORRETTA', { amount: nuoveCorrette * 10, metadata: { lessonId } }));
  }
  if (!eraCompletata) {
    xp.push(await awardXp(client, childId, 'LEZIONE_COMPLETATA', { metadata: { lessonId } }));
    await notify(client, childId, 'LEZIONE', '💡', `Hai completato la lezione "${lezione.title}"!`);
  }
  if (perfetto && bestPrecedente < total) {
    xp.push(await awardXp(client, childId, 'QUIZ_PERFETTO', { metadata: { lessonId } }));
    await unlockAchievement(client, childId, `QUIZ_${lessonId}`, `Quiz perfetto: ${lezione.title}`, '🎓');
  }

  const { rows: completate } = await client.query(
    `SELECT COUNT(*)::int AS n FROM lesson_progress WHERE child_id = $1 AND completed_at IS NOT NULL`,
    [childId],
  );
  if (completate[0].n >= LESSONS.length) {
    await unlockAchievement(client, childId, 'DIPLOMA', 'Tutte le lezioni completate', '🎓');
  }

  return { lessonId, score, total, perfetto, dettagli, xp, celebrations: perfetto ? ['CONFETTI'] : [] };
}
