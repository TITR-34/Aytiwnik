import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

type Opt = { id: string; text: string };
type Q = {
  type: 'mcq' | 'written'; question_text: string; options?: Opt[] | null; correct_option_id?: string | null;
  explanation?: string | null; reference_answer?: string | null; rubric?: string | null; topic?: string | null; max_points?: number;
};
const LETTERS = 'abcdefgh';
const newMcq = (): Q => ({ type: 'mcq', question_text: '', options: LETTERS.slice(0, 4).split('').map((id) => ({ id, text: '' })), correct_option_id: null, max_points: 1 });
const newWritten = (): Q => ({ type: 'written', question_text: '', reference_answer: '', rubric: '', max_points: 10 });

export default function ExamEditor() {
  const { gid, id } = useParams();
  const nav = useNavigate();
  const editing = !!id;
  const loaded = useQuery({ queryKey: ['exam-edit', id], enabled: editing, queryFn: () => api<any>(`/api/exams/${id}/edit`) });

  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [shuffleQ, setShuffleQ] = useState(true), [shuffleO, setShuffleO] = useState(true);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [info, setInfo] = useState('');
  const [hint, setHint] = useState<'mixed' | 'mcq' | 'written'>('mixed');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded.data) return;
    const { exam, questions } = loaded.data;
    setTitle(exam.title); setDescription(exam.description ?? ''); setMinutes(exam.time_limit_minutes);
    setShuffleQ(exam.shuffle_questions); setShuffleO(exam.shuffle_options); setQuestions(questions);
  }, [loaded.data]);

  const update = (i: number, patch: Partial<Q>) => setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const setOpt = (i: number, oi: number, text: string) => update(i, { options: questions[i].options!.map((o, k) => (k === oi ? { ...o, text } : o)) });

  async function upload(file: File) {
    setBusy(true); setError(''); setInfo('');
    try {
      const form = new FormData(); form.append('file', file); form.append('hint', hint);
      const r = await api<{ questions: Q[]; skipped: number }>('/api/extract', { form });
      setQuestions((qs) => [...qs, ...r.questions]);
      const noKey = r.questions.filter((q) => q.type === 'mcq' && !q.correct_option_id).length;
      setInfo(`${r.questions.length} sual tapıldı.${noKey ? ` ${noKey} test sualında düzgün cavab faylda göstərilməyib — onları özünüz seçin.` : ''}${r.skipped ? ` ${r.skipped} sual oxuna bilmədi.` : ''}`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    setError('');
    if (!questions.length) return setError('Ən azı bir sual əlavə edin');
    setBusy(true);
    try {
      const body = {
        title, description, time_limit_minutes: minutes, shuffle_questions: shuffleQ, shuffle_options: shuffleO,
        questions: questions.map((q) => ({
          type: q.type, question_text: q.question_text, topic: q.topic || null, explanation: q.explanation || null,
          ...(q.type === 'mcq'
            ? { options: q.options!.filter((o) => o.text.trim()), correct_option_id: q.correct_option_id }
            : { reference_answer: q.reference_answer || null, rubric: q.rubric || null, max_points: Number(q.max_points) || 10 }),
        })),
      };
      const r = editing ? await api<any>(`/api/exams/${id}`, { method: 'PUT', body }) : await api<any>(`/api/groups/${gid}/exams`, { body });
      nav(`/exams/${r.id}`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  if (editing && loaded.isLoading) return <p className="text-muted">Yüklənir...</p>;
  if (loaded.error) return <p className="text-red-400">{(loaded.error as Error).message}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{editing ? 'İmtahanı redaktə et' : 'Yeni imtahan'}</h1>

      <div className="card space-y-4">
        <div><label className="label">Ad</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="məs. Mikroiqtisadiyyat — aralıq" /></div>
        <div><label className="label">Təsvir (ixtiyari)</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex flex-wrap items-end gap-6">
          <div><label className="label">İmtahan vaxtı (dəqiqə)</label><input className="input w-32" type="number" min={1} max={300} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} /> Sualları qarışdır</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shuffleO} onChange={(e) => setShuffleO(e.target.checked)} /> Variantları qarışdır</label>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Fayldan sualları çıxar (AI)</h2>
        <p className="text-sm text-muted">PDF, DOCX və ya TXT yükləyin. AI sualları tapıb aşağıda göstərəcək, siz yoxlayıb düzəldəcəksiniz. Düzgün cavab faylda yoxdursa, AI təxmin etmir — onu özünüz seçirsiniz.</p>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto" value={hint} onChange={(e) => setHint(e.target.value as any)}>
            <option value="mixed">Hər növ sual</option><option value="mcq">Yalnız test</option><option value="written">Yalnız yazılı</option>
          </select>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="text-sm" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {busy && <span className="text-sm text-muted">AI oxuyur, bir az gözləyin...</span>}
        </div>
        {info && <p className="rounded-lg bg-brand-soft p-2 text-sm">{info}</p>}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Suallar ({questions.length})</h2>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setQuestions([...questions, newMcq()])}>+ Test sualı</button>
            <button className="btn-ghost" onClick={() => setQuestions([...questions, newWritten()])}>+ Yazılı sual</button>
          </div>
        </div>

        {questions.map((q, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{i + 1}. <span className="badge ml-1">{q.type === 'mcq' ? 'Test · 1 bal' : 'Yazılı'}</span></span>
              <button className="text-sm text-red-400 hover:underline" onClick={() => setQuestions(questions.filter((_, k) => k !== i))}>Sil</button>
            </div>
            <textarea className="input min-h-[70px]" value={q.question_text} onChange={(e) => update(i, { question_text: e.target.value })} placeholder="Sual mətni" />
            {q.type === 'mcq' ? (
              <div className="space-y-2">
                {q.options?.map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input type="radio" name={`c${i}`} checked={q.correct_option_id === o.id} onChange={() => update(i, { correct_option_id: o.id })} title="Düzgün cavab" />
                    <span className="w-5 text-sm font-medium uppercase">{o.id}</span>
                    <input className="input" value={o.text} onChange={(e) => setOpt(i, oi, e.target.value)} />
                  </div>
                ))}
                {!q.correct_option_id && <p className="text-sm text-amber-400">Düzgün cavabı seçin (sol dairə).</p>}
                {(q.options?.length ?? 0) < 8 && (
                  <button className="text-sm text-brand" onClick={() => update(i, { options: [...q.options!, { id: LETTERS[q.options!.length], text: '' }] })}>+ variant</button>
                )}
                <input className="input" placeholder="Izah (ixtiyari)" value={q.explanation ?? ''} onChange={(e) => update(i, { explanation: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Bu sual üçün maksimum bal:</label>
                  <input className="input w-24" type="number" min={0.5} step={0.5} value={q.max_points ?? 10} onChange={(e) => update(i, { max_points: Number(e.target.value) })} />
                </div>
                <textarea className="input min-h-[70px]" placeholder="Nümunə / düzgün cavab (AI buna əsasən yoxlayır)" value={q.reference_answer ?? ''} onChange={(e) => update(i, { reference_answer: e.target.value })} />
                <textarea className="input min-h-[50px]" placeholder="Qiymətləndirmə meyarları (ixtiyari). Məs: Anlayışın izahı - 4 bal, nümunə - 3 bal, nəticə - 3 bal" value={q.rubric ?? ''} onChange={(e) => update(i, { rubric: e.target.value })} />
              </div>
            )}
            <input className="input" placeholder="Mövzu (ixtiyari — zəif mövzuları tapmaq üçün)" value={q.topic ?? ''} onChange={(e) => update(i, { topic: e.target.value })} />
          </div>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || title.trim().length < 2} onClick={save}>{editing ? 'Yadda saxla' : 'İmtahanı yarat'}</button>
        <button className="btn-ghost" onClick={() => nav(-1)}>Ləğv et</button>
        {editing && <button className="btn-danger ml-auto" onClick={async () => { if (confirm('İmtahan və bütün nəticələri silinsin?')) { await api(`/api/exams/${id}`, { method: 'DELETE' }); nav('/'); } }}>İmtahanı sil</button>}
      </div>
    </div>
  );
}
