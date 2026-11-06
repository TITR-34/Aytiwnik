import { db } from '../db';
import { ai, GradeItem } from '../ai';
import { clampPoints, ok } from '../util';

async function loadImages(paths: string[]) {
  const out: { mime: string; data: Buffer }[] = [];
  for (const p of paths) {
    const { data, error } = await db.storage.from('answers').download(p);
    if (error || !data) continue;
    const ext = p.split('.').pop();
    out.push({ mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: Buffer.from(await data.arrayBuffer()) });
  }
  return out;
}

/** Deterministic scoring for multiple-choice rows. No AI involved. */
export async function scoreChoices(attemptId: string) {
  const rows = ok(await db.from('attempt_questions').select('*').eq('attempt_id', attemptId));
  await Promise.all(
    rows
      .filter((r: any) => r.snapshot.type === 'mcq')
      .map((r: any) => {
        const correct = r.selected_option_id != null && r.selected_option_id === r.answer_key.correct_option_id;
        return db.from('attempt_questions').update({ is_correct: correct, awarded_points: correct ? Number(r.max_points) : 0 }).eq('id', r.id);
      }),
  );
}

export async function updateTotals(attemptId: string) {
  const rows = ok(await db.from('attempt_questions').select('max_points,awarded_points').eq('attempt_id', attemptId));
  const total = rows.reduce((s: number, r: any) => s + Number(r.awarded_points ?? 0), 0);
  const max = rows.reduce((s: number, r: any) => s + Number(r.max_points), 0);
  await db.from('attempts').update({ total_score: total, maximum_score: max }).eq('id', attemptId);
}

/** Time ran out and the student never submitted: score MCQ from autosaved answers, skip AI. */
export async function finalizeExpired(attemptId: string) {
  await scoreChoices(attemptId);
  await db
    .from('attempt_questions')
    .update({ awarded_points: 0, ai_feedback: 'Vaxt bitdiyi üçün yoxlanmadı.' })
    .eq('attempt_id', attemptId)
    .eq('snapshot->>type', 'written');
  await db.from('attempts').update({ status: 'expired', submitted_at: new Date().toISOString(), grading_status: 'graded' }).eq('id', attemptId);
  await updateTotals(attemptId);
}

/** Grades all written answers of an attempt in ONE AI call (= 1 use of the user's limit). */
export async function gradeWritten(attemptId: string, userId: string, examId: string): Promise<'graded' | 'failed'> {
  const rows = ok(await db.from('attempt_questions').select('*').eq('attempt_id', attemptId).order('position'));
  const written = rows.filter((r: any) => r.snapshot.type === 'written');
  const toGrade: any[] = [];

  for (const r of written) {
    const hasText = (r.text_answer ?? '').trim().length > 0;
    const hasImg = (r.image_paths ?? []).length > 0;
    if (!hasText && !hasImg) {
      await db.from('attempt_questions').update({ awarded_points: 0, ai_feedback: 'Cavab verilməyib.', ai_result: null }).eq('id', r.id);
    } else toGrade.push(r);
  }

  if (toGrade.length) {
    const items: GradeItem[] = await Promise.all(
      toGrade.map(async (r) => ({
        id: r.id,
        question: r.snapshot.question_text,
        reference_answer: r.answer_key.reference_answer,
        rubric: r.answer_key.rubric,
        max_points: Number(r.max_points),
        text_answer: r.text_answer,
        images: await loadImages(r.image_paths ?? []),
      })),
    );
    let results;
    try {
      results = await ai.gradeAnswers({ items });
      if (!results.length) throw new Error('empty AI result');
    } catch {
      await db.from('attempts').update({ grading_status: 'failed' }).eq('id', attemptId);
      await updateTotals(attemptId);
      return 'failed';
    }
    for (const r of toGrade) {
      const g = results.find((x) => x.id === r.id);
      const max = Number(r.max_points);
      if (!g) {
        await db.from('attempt_questions').update({ awarded_points: 0, ai_feedback: 'AI bu cavab üçün nəticə qaytarmadı.', ai_result: { needs_human_review: true } }).eq('id', r.id);
        continue;
      }
      const points = clampPoints(g.awarded_points, max);
      await db
        .from('attempt_questions')
        .update({
          awarded_points: points,
          ai_feedback: g.feedback,
          ai_result: { ...g, awarded_points: points, maximum_points: max, needs_human_review: g.needs_human_review || g.confidence < 0.6 },
        })
        .eq('id', r.id);
    }
    await db.from('ai_usage').insert({ user_id: userId, exam_id: examId, kind: 'grading' });
  }

  await db.from('attempts').update({ grading_status: 'graded' }).eq('id', attemptId);
  await updateTotals(attemptId);
  return 'graded';
}

export async function gradingUsed(userId: string, examId: string): Promise<number> {
  const { count } = await db
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('exam_id', examId)
    .eq('kind', 'grading');
  return count ?? 0;
}
