import { Router } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { z } from 'zod';
import { db } from '../db';
import { ai } from '../ai';
import { config } from '../config';
import { HttpError, me, ok, requireMember, wrap } from '../util';
import { gradingUsed } from '../services/grading';

export const examsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const OptionS = z.object({ id: z.string().min(1).max(8), text: z.string().trim().min(1).max(1000) });
const BaseQ = z.object({
  type: z.enum(['mcq', 'written']),
  question_text: z.string().trim().min(1).max(5000),
  options: z.array(OptionS).max(8).nullish(),
  correct_option_id: z.string().nullish(),
  explanation: z.string().max(3000).nullish(),
  reference_answer: z.string().max(5000).nullish(),
  rubric: z.string().max(3000).nullish(),
  topic: z.string().max(200).nullish(),
  max_points: z.number().min(0.5).max(100).nullish(),
});
const QuestionIn = BaseQ.superRefine((q, ctx) => {
  if (q.type !== 'mcq') return;
  if (!q.options || q.options.length < 2)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Test sualında ən azı 2 variant olmalıdır' });
  else if (!q.correct_option_id || !q.options.some((o) => o.id === q.correct_option_id))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Düzgün cavab seçilməyib: "${q.question_text.slice(0, 40)}"` });
});
const ExamIn = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).nullish(),
  time_limit_minutes: z.number().int().min(1).max(300),
  shuffle_questions: z.boolean().default(true),
  shuffle_options: z.boolean().default(true),
  questions: z.array(QuestionIn).min(1).max(1000),
});

const toRow = (q: z.infer<typeof QuestionIn>, examId: string, position: number) => ({
  exam_id: examId, position, type: q.type, question_text: q.question_text,
  options: q.type === 'mcq' ? q.options : null,
  correct_option_id: q.type === 'mcq' ? q.correct_option_id : null,
  explanation: q.explanation ?? null, reference_answer: q.reference_answer ?? null,
  rubric: q.rubric ?? null, topic: q.topic ?? null,
  max_points: q.type === 'mcq' ? 1 : q.max_points ?? 10, // MCQ is always 1 point
});

async function insertQuestions(examId: string, qs: z.infer<typeof QuestionIn>[]) {
  const rows = qs.map((q, i) => toRow(q, examId, i + 1));
  for (let i = 0; i < rows.length; i += 200) ok(await db.from('questions').insert(rows.slice(i, i + 200)));
}

async function loadExam(id: string, userId: string) {
  const exam = ok(await db.from('exams').select('*').eq('id', id).maybeSingle());
  if (!exam) throw new HttpError(404, 'İmtahan tapılmadı');
  const role = await requireMember(exam.group_id, userId);
  return { exam, role };
}
const canEdit = (exam: any, role: string, userId: string) => exam.created_by === userId || role === 'owner';

examsRouter.post('/groups/:gid/exams', wrap(async (req, res) => {
  await requireMember(req.params.gid, me(res)); // any member may create exams
  const b = ExamIn.parse(req.body);
  const { questions, ...meta } = b;
  const exam = ok(await db.from('exams').insert({ ...meta, description: meta.description ?? null, group_id: req.params.gid, created_by: me(res) }).select().single());
  await insertQuestions(exam.id, questions);
  res.status(201).json({ id: exam.id });
}));

examsRouter.get('/exams/:id', wrap(async (req, res) => {
  const { exam, role } = await loadExam(req.params.id, me(res));
  const qs = ok(await db.from('questions').select('type,position').eq('exam_id', exam.id));
  const attempts = ok(await db.from('attempts').select('id,status,started_at,time_limit_minutes').eq('exam_id', exam.id).eq('user_id', me(res)).order('started_at', { ascending: false }).limit(20));
  const active = attempts.find((a: any) => a.status === 'in_progress' && new Date(a.started_at).getTime() + a.time_limit_minutes * 60000 + 60000 > Date.now());
  const last = attempts.find((a: any) => a.status !== 'in_progress');
  res.json({
    id: exam.id, group_id: exam.group_id, title: exam.title, description: exam.description,
    time_limit_minutes: exam.time_limit_minutes, shuffle_questions: exam.shuffle_questions, shuffle_options: exam.shuffle_options,
    total_questions: qs.length,
    mcq_count: qs.filter((q: any) => q.type === 'mcq').length,
    written_count: qs.filter((q: any) => q.type === 'written').length,
    ai: { used: await gradingUsed(me(res), exam.id), limit: config.AI_GRADING_LIMIT_PER_EXAM },
    active_attempt_id: active?.id ?? null, last_attempt_id: last?.id ?? null,
    can_edit: canEdit(exam, role, me(res)),
  });
}));

// Full exam INCLUDING answer keys — only for the creator / group owner.
examsRouter.get('/exams/:id/edit', wrap(async (req, res) => {
  const { exam, role } = await loadExam(req.params.id, me(res));
  if (!canEdit(exam, role, me(res))) throw new HttpError(403, 'Yalnız imtahanı yaradan redaktə edə bilər');
  const questions = ok(await db.from('questions').select('*').eq('exam_id', exam.id).order('position'));
  res.json({ exam, questions });
}));

examsRouter.put('/exams/:id', wrap(async (req, res) => {
  const { exam, role } = await loadExam(req.params.id, me(res));
  if (!canEdit(exam, role, me(res))) throw new HttpError(403, 'Yalnız imtahanı yaradan redaktə edə bilər');
  const { questions, ...meta } = ExamIn.parse(req.body);
  ok(await db.from('exams').update({ ...meta, description: meta.description ?? null, updated_at: new Date().toISOString() }).eq('id', exam.id));
  ok(await db.from('questions').delete().eq('exam_id', exam.id)); // past attempts keep their own snapshots
  await insertQuestions(exam.id, questions);
  res.json({ id: exam.id });
}));

examsRouter.delete('/exams/:id', wrap(async (req, res) => {
  const { exam, role } = await loadExam(req.params.id, me(res));
  if (!canEdit(exam, role, me(res))) throw new HttpError(403, 'Yalnız imtahanı yaradan silə bilər');
  ok(await db.from('exams').delete().eq('id', exam.id));
  res.json({ ok: true });
}));

// Upload a PDF/DOCX/TXT -> AI extracts questions -> creator reviews/edits them in the UI.
examsRouter.post('/extract', upload.single('file'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, 'Fayl seçilməyib');
  const name = f.originalname.toLowerCase();
  const isPdf = name.endsWith('.pdf'), isDocx = name.endsWith('.docx'), isTxt = name.endsWith('.txt');
  if (!isPdf && !isDocx && !isTxt) throw new HttpError(400, 'Yalnız PDF, DOCX və TXT dəstəklənir');
  const hint = z.enum(['mixed', 'mcq', 'written']).catch('mixed').parse(req.body?.hint);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', me(res)).eq('kind', 'extraction').gte('created_at', since);
  if ((count ?? 0) >= config.AI_EXTRACTION_LIMIT_PER_DAY) throw new HttpError(429, `Gündəlik fayl yükləmə limiti (${config.AI_EXTRACTION_LIMIT_PER_DAY}) bitib. Sualları əl ilə də əlavə edə bilərsiniz.`);

  // Read PDF text locally first (fast, no AI needed). Only scanned PDFs are sent to Gemini as a file.
  let text: string | undefined;
  if (isPdf) {
    try {
      const parsed = (await pdfParse(f.buffer)).text ?? '';
      if (parsed.trim().length >= 200) text = parsed;
    } catch { /* fall through to sending the PDF itself */ }
  } else if (isDocx) text = (await mammoth.extractRawText({ buffer: f.buffer })).value;
  else text = f.buffer.toString('utf8');

  let raw: any;
  try {
    raw = await ai.extractQuestions({
      hint,
      mimeType: text ? 'text/plain' : 'application/pdf',
      data: text ? undefined : f.buffer,
      text,
    });
  } catch {
    throw new HttpError(502, 'AI hazırda yüklüdür və ya faylı oxuya bilmədi. 1-2 dəqiqə sonra yenidən cəhd edin və ya sualları əl ilə əlavə edin.');
  }
  await db.from('ai_usage').insert({ user_id: me(res), kind: 'extraction' });

  const letters = 'abcdefgh';
  const seen = new Set<string>();
  const out: any[] = [];
  let skipped = 0;
  for (const r of Array.isArray(raw?.questions) ? raw.questions : []) {
    const p = BaseQ.safeParse(r);
    if (!p.success) { console.error('Skipped question:', p.error.issues[0]?.message); skipped++; continue; }
    const q = p.data;
    const key = q.question_text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    if (q.type === 'mcq') {
      if (!q.options || q.options.length < 2) { skipped++; continue; }
      const idx = q.options.findIndex((o) => o.id === q.correct_option_id);
      out.push({ ...q, options: q.options.slice(0, 8).map((o, i) => ({ id: letters[i], text: o.text })), correct_option_id: idx >= 0 && idx < 8 ? letters[idx] : null, max_points: 1 });
    } else out.push({ ...q, options: null, correct_option_id: null, max_points: q.max_points ?? 10 });
  }
  res.json({ questions: out, skipped });
}));
