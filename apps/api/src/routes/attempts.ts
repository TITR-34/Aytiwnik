import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { config } from '../config';
import { HttpError, me, ok, requireMember, shuffle, shuffleOptions, wrap } from '../util';
import { finalizeExpired, gradeWritten, gradingUsed, scoreChoices, updateTotals } from '../services/grading';

export const attemptsRouter = Router();
const GRACE_MS = 60_000;
const endsAt = (a: any) => new Date(a.started_at).getTime() + a.time_limit_minutes * 60_000;

async function ownAttempt(id: string, userId: string) {
  const a = ok(await db.from('attempts').select('*').eq('id', id).eq('user_id', userId).maybeSingle());
  if (!a) throw new HttpError(404, 'Cəhd tapılmadı'); // same answer for "not yours" -> no IDOR hints
  return a;
}

/* ---- Start an attempt: random selection + shuffle + snapshot ---- */
const StartIn = z.object({
  from: z.number().int().min(1).optional(),
  to: z.number().int().min(1).optional(),
  count: z.number().int().min(1).max(500).optional(),
  minutes: z.number().int().min(1).max(300).optional(),
  only: z.enum(['flagged', 'wrong']).optional(),
  fromAttempt: z.string().uuid().optional(),
});

attemptsRouter.post('/exams/:id/attempts', wrap(async (req, res) => {
  const b = StartIn.parse(req.body ?? {});
  const exam = ok(await db.from('exams').select('*').eq('id', req.params.id).maybeSingle());
  if (!exam) throw new HttpError(404, 'İmtahan tapılmadı');
  await requireMember(exam.group_id, me(res));

  let pool: any[] = ok(await db.from('questions').select('*').eq('exam_id', exam.id).order('position'));
  if (b.from || b.to) pool = pool.filter((q) => q.position >= (b.from ?? 1) && q.position <= (b.to ?? 1e9));

  if (b.only && b.fromAttempt) {
    const prev = await ownAttempt(b.fromAttempt, me(res));
    const rows = ok(await db.from('attempt_questions').select('question_id,flagged,is_correct,snapshot').eq('attempt_id', prev.id));
    const ids = new Set(rows.filter((r: any) => (b.only === 'flagged' ? r.flagged : r.snapshot.type === 'mcq' && r.is_correct !== true)).map((r: any) => r.question_id));
    pool = pool.filter((q) => ids.has(q.id));
  }
  if (pool.length === 0) throw new HttpError(400, 'Seçilmiş aralıqda sual yoxdur');
  const count = b.count ?? pool.length;
  if (count > pool.length) throw new HttpError(400, `İstədiyiniz sual sayı (${count}) mövcud suallardan (${pool.length}) çoxdur`);

  if (pool.some((q) => q.type === 'written') && (await gradingUsed(me(res), exam.id)) >= config.AI_GRADING_LIMIT_PER_EXAM)
    throw new HttpError(429, `Bu imtahan üçün ${config.AI_GRADING_LIMIT_PER_EXAM} AI yoxlama haqqınızı istifadə etmisiniz`);

  // Random selection without duplicates, then order.
  let picked = shuffle(pool).slice(0, count);
  picked = exam.shuffle_questions ? shuffle(picked) : picked.sort((a, c) => a.position - c.position);

  // Close any older unfinished attempt of this exam.
  const old = ok(await db.from('attempts').select('id').eq('exam_id', exam.id).eq('user_id', me(res)).eq('status', 'in_progress'));
  for (const o of old) await finalizeExpired(o.id);

  const attempt = ok(await db.from('attempts').insert({ exam_id: exam.id, user_id: me(res), time_limit_minutes: b.minutes ?? exam.time_limit_minutes }).select().single());
  ok(await db.from('attempt_questions').insert(
    picked.map((q, i) => ({
      attempt_id: attempt.id, question_id: q.id, position: i + 1, max_points: q.max_points,
      snapshot: {
        type: q.type, question_text: q.question_text, topic: q.topic,
        options: q.type === 'mcq' ? (exam.shuffle_options ? shuffleOptions(q.options) : q.options) : null,
      },
      answer_key: { correct_option_id: q.correct_option_id, explanation: q.explanation, reference_answer: q.reference_answer, rubric: q.rubric },
    })),
  ));
  res.status(201).json({ id: attempt.id });
}));

/* ---- Read an attempt: no keys while in progress, full review after ---- */
attemptsRouter.get('/attempts/:id', wrap(async (req, res) => {
  let a = await ownAttempt(req.params.id, me(res));
  if (a.status === 'in_progress' && Date.now() > endsAt(a) + GRACE_MS) {
    await finalizeExpired(a.id);
    a = await ownAttempt(a.id, me(res));
  }
  const exam = ok(await db.from('exams').select('title,group_id').eq('id', a.exam_id).single());
  const rows = ok(await db.from('attempt_questions').select('*').eq('attempt_id', a.id).order('position'));
  const base = {
    id: a.id, exam_id: a.exam_id, exam_title: exam.title, group_id: exam.group_id, status: a.status,
    started_at: a.started_at, ends_at: new Date(endsAt(a)).toISOString(), server_now: new Date().toISOString(),
    grading_status: a.grading_status, total_score: a.total_score, maximum_score: a.maximum_score,
  };
  if (a.status === 'in_progress') {
    return res.json({
      ...base,
      questions: rows.map((r: any) => ({
        id: r.id, position: r.position, type: r.snapshot.type, question_text: r.snapshot.question_text,
        options: r.snapshot.options, max_points: r.max_points,
        selected_option_id: r.selected_option_id, text_answer: r.text_answer, flagged: r.flagged,
      })),
    });
  }
  res.json({
    ...base,
    questions: rows.map((r: any) => ({
      id: r.id, position: r.position, type: r.snapshot.type, question_text: r.snapshot.question_text,
      topic: r.snapshot.topic, options: r.snapshot.options, max_points: r.max_points,
      selected_option_id: r.selected_option_id, text_answer: r.text_answer, image_count: (r.image_paths ?? []).length,
      flagged: r.flagged, is_correct: r.is_correct, awarded_points: r.awarded_points,
      correct_option_id: r.answer_key.correct_option_id, explanation: r.answer_key.explanation,
      reference_answer: r.answer_key.reference_answer,
      ai_feedback: r.ai_feedback, ai_result: r.ai_result,
    })),
  });
}));

/* ---- Autosave (no images, no scoring) ---- */
const AnsS = z.object({
  id: z.string().uuid(),
  selected_option_id: z.string().max(8).nullish(),
  text_answer: z.string().max(20000).nullish(),
  flagged: z.boolean().optional(),
});
async function saveAnswers(a: any, answers: z.infer<typeof AnsS>[]) {
  const rows = ok(await db.from('attempt_questions').select('id,snapshot').eq('attempt_id', a.id));
  const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));
  await Promise.all(
    answers.map((x) => {
      const r = byId.get(x.id);
      if (!r) return null; // ignore ids that don't belong to this attempt
      const valid = r.snapshot.options?.some((o: any) => o.id === x.selected_option_id);
      return db.from('attempt_questions').update({
        selected_option_id: r.snapshot.type === 'mcq' && valid ? x.selected_option_id : null,
        text_answer: r.snapshot.type === 'written' ? x.text_answer ?? null : null,
        flagged: x.flagged ?? false,
      }).eq('id', x.id);
    }),
  );
}

attemptsRouter.put('/attempts/:id/save', wrap(async (req, res) => {
  const a = await ownAttempt(req.params.id, me(res));
  if (a.status !== 'in_progress' || Date.now() > endsAt(a) + GRACE_MS) throw new HttpError(409, 'Cəhd artıq bağlanıb');
  const { answers } = z.object({ answers: z.array(AnsS).max(500) }).parse(req.body);
  await saveAnswers(a, answers);
  res.json({ ok: true });
}));

/* ---- Submit: server-side scoring; written answers graded by AI ---- */
const ImgS = z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().max(6_000_000) });
const SubmitIn = z.object({ answers: z.array(AnsS.extend({ images: z.array(ImgS).max(3).optional() })).max(500) });
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

attemptsRouter.post('/attempts/:id/submit', wrap(async (req, res) => {
  const a = await ownAttempt(req.params.id, me(res));
  if (a.status !== 'in_progress') throw new HttpError(409, 'Bu cəhd artıq təhvil verilib');
  if (Date.now() > endsAt(a) + GRACE_MS) {
    await finalizeExpired(a.id);
    throw new HttpError(409, 'Vaxt bitib. Test cavabları avtomatik yadda saxlanılmış versiya ilə qiymətləndirildi.');
  }
  const { answers } = SubmitIn.parse(req.body);
  await saveAnswers(a, answers);

  // Store handwritten-answer photos in the private bucket, linked to this attempt + question.
  const own = ok(await db.from('attempt_questions').select('id,snapshot').eq('attempt_id', a.id));
  const ownIds = new Set(own.map((r: any) => r.id));
  for (const x of answers) {
    if (!x.images?.length || !ownIds.has(x.id)) continue;
    const paths: string[] = [];
    for (let i = 0; i < x.images.length; i++) {
      const img = x.images[i];
      const path = `${a.id}/${x.id}/${i}.${EXT[img.mime]}`;
      const { error } = await db.storage.from('answers').upload(path, Buffer.from(img.data, 'base64'), { contentType: img.mime, upsert: true });
      if (!error) paths.push(path);
    }
    await db.from('attempt_questions').update({ image_paths: paths }).eq('id', x.id);
  }

  await scoreChoices(a.id);
  await db.from('attempts').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', a.id);
  const result = await gradeWritten(a.id, me(res), a.exam_id);
  res.json({ id: a.id, grading: result });
}));

/* ---- Retry AI grading after a failure (limit is only consumed on success) ---- */
attemptsRouter.post('/attempts/:id/regrade', wrap(async (req, res) => {
  const a = await ownAttempt(req.params.id, me(res));
  if (a.grading_status !== 'failed') throw new HttpError(400, 'Bu cəhdi yenidən yoxlamaq lazım deyil');
  if ((await gradingUsed(me(res), a.exam_id)) >= config.AI_GRADING_LIMIT_PER_EXAM) throw new HttpError(429, 'AI yoxlama limitiniz bitib');
  const result = await gradeWritten(a.id, me(res), a.exam_id);
  res.json({ grading: result });
}));

/* ---- Personal results + simple analytics ---- */
attemptsRouter.get('/me/stats', wrap(async (_req, res) => {
  const uid = me(res);
  const attempts = ok(await db.from('attempts').select('id,exam_id,submitted_at,total_score,maximum_score,grading_status,exams(title)').eq('user_id', uid).in('status', ['submitted', 'expired']).order('submitted_at', { ascending: false }).limit(200));
  const withPct = attempts.filter((a: any) => Number(a.maximum_score) > 0).map((a: any) => ({
    id: a.id, exam_id: a.exam_id, title: a.exams?.title ?? '', submitted_at: a.submitted_at,
    score: Number(a.total_score), max: Number(a.maximum_score), pct: Math.round((Number(a.total_score) / Number(a.maximum_score)) * 100), grading_status: a.grading_status,
  }));
  const topicRows = ok(await db.from('attempt_questions').select('snapshot,awarded_points,max_points,attempts!inner(user_id,status)').eq('attempts.user_id', uid).neq('attempts.status', 'in_progress').limit(3000));
  const topics = new Map<string, { got: number; max: number }>();
  for (const r of topicRows) {
    const t = r.snapshot?.topic; if (!t) continue;
    const e = topics.get(t) ?? { got: 0, max: 0 };
    e.got += Number(r.awarded_points ?? 0); e.max += Number(r.max_points); topics.set(t, e);
  }
  const byTopic = [...topics.entries()].map(([topic, v]) => ({ topic, pct: Math.round((v.got / v.max) * 100), max: v.max })).sort((a, b) => a.pct - b.pct);
  res.json({
    count: withPct.length,
    average: withPct.length ? Math.round(withPct.reduce((s: number, a: any) => s + a.pct, 0) / withPct.length) : 0,
    best: withPct.length ? Math.max(...withPct.map((a: any) => a.pct)) : 0,
    recent: withPct.slice(0, 30), weak_topics: byTopic.slice(0, 8),
  });
}));
