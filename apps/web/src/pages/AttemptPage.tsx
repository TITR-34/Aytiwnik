import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, compressImage } from '../lib/api';

type Ans = { selected_option_id: string | null; text_answer: string; flagged: boolean; images: { mime: string; data: string; preview: string }[] };
const letter = (i: number) => String.fromCharCode(65 + i);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function AttemptPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['attempt', id], queryFn: () => api<any>(`/api/attempts/${id}`) });
  if (q.isLoading) return <p className="text-muted">Yüklənir...</p>;
  if (q.error) return <p className="text-red-400">{(q.error as Error).message}</p>;
  return q.data.status === 'in_progress' ? <Player a={q.data} /> : <Result a={q.data} />;
}

/* ------------------------------- Player ------------------------------- */
function Player({ a }: { a: any }) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Ans>>(() =>
    Object.fromEntries(a.questions.map((x: any) => [x.id, { selected_option_id: x.selected_option_id, text_answer: x.text_answer ?? '', flagged: x.flagged, images: [] }])),
  );
  const offset = useRef(new Date(a.server_now).getTime() - Date.now());
  const endMs = new Date(a.ends_at).getTime();
  const [left, setLeft] = useState(Math.max(0, Math.round((endMs - (Date.now() + offset.current)) / 1000)));
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const submitted = useRef(false);
  const hasWritten = a.questions.some((x: any) => x.type === 'written');

  const payload = (withImages: boolean) =>
    a.questions.map((x: any) => {
      const s = answers[x.id];
      return { id: x.id, selected_option_id: s.selected_option_id, text_answer: s.text_answer || null, flagged: s.flagged, ...(withImages && s.images.length ? { images: s.images.map(({ mime, data }) => ({ mime, data })) } : {}) };
    });

  const submit = useMutation({
    mutationFn: () => api(`/api/attempts/${a.id}/submit`, { body: { answers: payload(true) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attempt', a.id] }),
    onError: (e: Error) => { submitted.current = false; setError(e.message); qc.invalidateQueries({ queryKey: ['attempt', a.id] }); },
  });
  const doSubmit = () => { if (submitted.current) return; submitted.current = true; setError(''); submit.mutate(); };

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((endMs - (Date.now() + offset.current)) / 1000))), 1000);
    return () => clearInterval(t);
  }, [endMs]);
  useEffect(() => { if (left <= 0) doSubmit(); }, [left]);          // auto-submit on timeout
  useEffect(() => { dirty.current = true; }, [answers]);
  useEffect(() => {                                                    // autosave every 15 s
    const t = setInterval(() => {
      if (dirty.current && !submitted.current) { dirty.current = false; api(`/api/attempts/${a.id}/save`, { method: 'PUT', body: { answers: payload(false) } }).catch(() => {}); }
    }, 15000);
    return () => clearInterval(t);
  });

  const cur = a.questions[idx];
  const s = answers[cur.id];
  const set = (patch: Partial<Ans>) => setAnswers((p) => ({ ...p, [cur.id]: { ...p[cur.id], ...patch } }));
  const answered = (x: any) => (x.type === 'mcq' ? !!answers[x.id].selected_option_id : !!answers[x.id].text_answer.trim() || answers[x.id].images.length > 0);
  const unanswered = a.questions.filter((x: any) => !answered(x)).length;

  async function addImages(files: FileList | null) {
    if (!files) return;
    const room = 3 - s.images.length;
    const added = await Promise.all([...files].slice(0, room).map(compressImage));
    set({ images: [...s.images, ...added] });
  }

  if (submit.isPending) return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <p className="font-semibold">{hasWritten ? 'Cavablar yoxlanılır...' : 'Nəticə hesablanır...'}</p>
      <p className="mt-1 text-sm text-muted">{hasWritten ? 'AI yazılı cavablarınızı oxuyur, bu 20-60 saniyə çəkə bilər. Səhifəni bağlamayın.' : 'Bir neçə saniyə.'}</p>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">{a.exam_title} — Sual {idx + 1} / {a.questions.length}</span>
          <span className={`rounded-lg px-3 py-1 font-mono text-sm font-semibold ${left < 60 ? 'bg-red-500/10 text-red-400' : 'bg-card border border-line'}`}>{mmss(left)}</span>
        </div>

        <div className="card space-y-4">
          <p className="whitespace-pre-wrap text-lg">{cur.question_text}</p>
          {cur.type === 'mcq' ? (
            <div className="space-y-2">
              {cur.options.map((o: any, i: number) => (
                <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${s.selected_option_id === o.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-white/5'}`}>
                  <input type="radio" className="mt-1" name={cur.id} checked={s.selected_option_id === o.id} onChange={() => set({ selected_option_id: o.id })} />
                  <span><b className="mr-2">{letter(i)}.</b>{o.text}</span>
                </label>
              ))}
              {s.selected_option_id && <button className="text-sm text-muted hover:text-ink" onClick={() => set({ selected_option_id: null })}>Cavabı təmizlə</button>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">Maksimum bal: {cur.max_points}</p>
              <textarea className="input min-h-[200px]" placeholder="Cavabınızı yazın..." value={s.text_answer} onChange={(e) => set({ text_answer: e.target.value })} />
              <div>
                <label className="label">və ya əl yazısının şəklini yükləyin (ən çox 3 şəkil)</label>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={s.images.length >= 3} onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} className="text-sm" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.images.map((im, k) => (
                    <div key={k} className="relative">
                      <img src={im.preview} className="h-24 rounded-lg border border-line" />
                      <button className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-red-600 text-xs text-white" onClick={() => set({ images: s.images.filter((_, j) => j !== k) })}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Əvvəlki</button>
            <button className="btn-ghost" disabled={idx === a.questions.length - 1} onClick={() => setIdx(idx + 1)}>Növbəti</button>
          </div>
          <button className={s.flagged ? 'btn-primary' : 'btn-ghost'} onClick={() => set({ flagged: !s.flagged })}>{s.flagged ? 'İşarə qaldırılsın' : 'Sonra baxım'}</button>
        </div>
      </div>

      <aside className="card h-fit space-y-3">
        <div className="grid grid-cols-5 gap-1.5 md:grid-cols-4">
          {a.questions.map((x: any, i: number) => (
            <button key={x.id} onClick={() => setIdx(i)}
              className={`h-9 rounded-md text-sm font-medium ${i === idx ? 'ring-2 ring-brand' : ''} ${answers[x.id].flagged ? 'bg-amber-500/20 text-amber-400' : answered(x) ? 'bg-brand text-white' : 'bg-white/5 text-muted border border-line'}`}>{i + 1}</button>
          ))}
        </div>
        <p className="text-xs text-muted">Mavi — cavablanıb · Sarı — işarələnib</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={() => { if (unanswered === 0 || confirm(`${unanswered} sual cavabsızdır. Təhvil verilsin?`)) doSubmit(); }}>İmtahanı bitir</button>
      </aside>
    </div>
  );
}

/* ------------------------------- Result ------------------------------- */
function Result({ a }: { a: any }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const regrade = useMutation({ mutationFn: () => api(`/api/attempts/${a.id}/regrade`, { method: 'POST', body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['attempt', a.id] }) });
  const mcq = a.questions.filter((x: any) => x.type === 'mcq');
  const correct = mcq.filter((x: any) => x.is_correct).length;
  const blank = mcq.filter((x: any) => !x.selected_option_id).length;
  const pct = a.maximum_score ? Math.round((Number(a.total_score) / Number(a.maximum_score)) * 100) : 0;
  const retry = useMutation({
    mutationFn: (only: 'flagged' | 'wrong') => api<{ id: string }>(`/api/exams/${a.exam_id}/attempts`, { body: { only, fromAttempt: a.id } }),
    onSuccess: (r) => nav(`/attempts/${r.id}`),
  });
  const cls = useMemo(() => (pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'), [pct]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to={`/exams/${a.exam_id}`} className="text-sm text-muted hover:text-ink">← İmtahan səhifəsi</Link>
      <h1 className="text-2xl font-bold">{a.exam_title}</h1>
      {a.status === 'expired' && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-400">Vaxt bitdiyi üçün cəhd avtomatik bağlandı. Yazılı suallar yoxlanılmadı.</p>}
      {a.grading_status === 'failed' && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          AI yazılı cavabları yoxlaya bilmədi. Cavablarınız saxlanıb; yenidən cəhd edin (limitinizdən yalnız uğurlu yoxlama çıxılır).
          <div className="mt-2"><button className="btn-primary" disabled={regrade.isPending} onClick={() => regrade.mutate()}>{regrade.isPending ? 'Yoxlanılır...' : 'Yenidən yoxla'}</button></div>
          {regrade.error && <p className="mt-1">{(regrade.error as Error).message}</p>}
        </div>
      )}
      <div className="card flex flex-wrap items-center gap-8">
        <div><div className={`text-5xl font-bold ${cls}`}>{pct}%</div><div className="text-sm text-muted">{Number(a.total_score)} / {Number(a.maximum_score)} bal</div></div>
        {mcq.length > 0 && <div className="grid grid-cols-3 gap-6 text-center">
          <div><div className="text-xl font-semibold text-green-400">{correct}</div><div className="text-xs text-muted">Düzgün</div></div>
          <div><div className="text-xl font-semibold text-red-400">{mcq.length - correct - blank}</div><div className="text-xs text-muted">Səhv</div></div>
          <div><div className="text-xl font-semibold text-muted">{blank}</div><div className="text-xs text-muted">Boş</div></div>
        </div>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={retry.isPending} onClick={() => retry.mutate('wrong')}>Səhvlərlə təkrar</button>
          {a.questions.some((x: any) => x.flagged) && <button className="btn-ghost" disabled={retry.isPending} onClick={() => retry.mutate('flagged')}>İşarələnmişlərlə təkrar</button>}
        </div>
      </div>
      {retry.error && <p className="text-sm text-red-400">{(retry.error as Error).message}</p>}

      {a.questions.map((x: any) => (
        <div key={x.id} className={`card space-y-3 border-l-4 ${x.type === 'mcq' ? (x.is_correct ? 'border-l-green-500' : !x.selected_option_id ? 'border-l-slate-300' : 'border-l-red-500') : 'border-l-brand'}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-wrap font-medium">{x.position}. {x.question_text}</p>
            <span className="badge shrink-0">{Number(x.awarded_points ?? 0)} / {Number(x.max_points)}</span>
          </div>
          {x.flagged && <span className="badge">İşarələnib</span>}
          {x.type === 'mcq' ? (
            <div className="space-y-1.5">
              {x.options.map((o: any, i: number) => {
                const isCorrect = o.id === x.correct_option_id, isMine = o.id === x.selected_option_id;
                return <div key={o.id} className={`rounded-lg border px-3 py-2 text-sm ${isCorrect ? 'border-green-500/40 bg-green-500/10' : isMine ? 'border-red-500/40 bg-red-500/10' : 'border-line'}`}>
                  <b className="mr-2">{letter(i)}.</b>{o.text}{isCorrect && ' ✓'}{isMine && !isCorrect && ' (sizin cavab)'}
                </div>;
              })}
              {x.explanation && <p className="text-sm text-muted">{x.explanation}</p>}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div><div className="font-medium">Sizin cavab</div><p className="whitespace-pre-wrap text-muted">{x.text_answer || (x.image_count ? `(${x.image_count} şəkil göndərilib)` : 'Cavab verilməyib')}</p></div>
              {x.ai_result?.transcription && <div><div className="font-medium">AI-ın oxuduğu əl yazısı</div><p className="whitespace-pre-wrap text-muted">{x.ai_result.transcription}</p></div>}
              {x.ai_feedback && <div className="rounded-lg bg-brand-soft p-3"><div className="font-medium">AI rəyi</div><p>{x.ai_feedback}</p></div>}
              {x.ai_result?.criteria?.length > 0 && (
                <ul className="space-y-1">{x.ai_result.criteria.map((c: any, k: number) => <li key={k}><b>{c.name}:</b> {c.score}/{c.max_score} — <span className="text-muted">{c.feedback}</span></li>)}</ul>
              )}
              {x.ai_result?.needs_human_review && <p className="text-amber-400">AI bu qiymətdən tam əmin deyil — müəllimlə yoxlamaq məsləhətdir.</p>}
              {x.reference_answer && <details><summary className="cursor-pointer font-medium">Nümunə cavab</summary><p className="mt-1 whitespace-pre-wrap text-muted">{x.reference_answer}</p></details>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
