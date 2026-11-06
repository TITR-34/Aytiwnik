import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function ExamStart() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['exam', id], queryFn: () => api<any>(`/api/exams/${id}`) });
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [count, setCount] = useState(''), [minutes, setMinutes] = useState('');
  const start = useMutation({
    mutationFn: (extra?: any) => api<{ id: string }>(`/api/exams/${id}/attempts`, {
      body: { from: from ? +from : undefined, to: to ? +to : undefined, count: count ? +count : undefined, minutes: minutes ? +minutes : undefined, ...extra },
    }),
    onSuccess: (r) => nav(`/attempts/${r.id}`),
  });
  if (q.isLoading) return <p className="text-muted">Yüklənir...</p>;
  if (q.error) return <p className="text-red-400">{(q.error as Error).message}</p>;
  const e = q.data;
  const aiLeft = e.ai.limit - e.ai.used;
  const blocked = e.written_count > 0 && aiLeft <= 0;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to={`/groups/${e.group_id}`} className="text-sm text-muted hover:text-ink">← Qrupa qayıt</Link>
      <h1 className="text-2xl font-bold">{e.title}</h1>
      {e.description && <p className="text-muted">{e.description}</p>}
      <div className="flex flex-wrap gap-2">
        <span className="badge">{e.total_questions} sual</span>
        {e.mcq_count > 0 && <span className="badge">{e.mcq_count} test</span>}
        {e.written_count > 0 && <span className="badge">{e.written_count} yazılı</span>}
      </div>

      {e.active_attempt_id && (
        <div className="card flex items-center justify-between border-brand bg-brand-soft">
          <span className="text-sm font-medium">Yarımçıq cəhdiniz var.</span>
          <Link to={`/attempts/${e.active_attempt_id}`} className="btn-primary">Davam et</Link>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold">Məşq parametrləri</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Sual № -dən</label><input className="input" type="number" min={1} placeholder="1" value={from} onChange={(x) => setFrom(x.target.value)} /></div>
          <div><label className="label">Sual № -dək</label><input className="input" type="number" min={1} placeholder={String(e.total_questions)} value={to} onChange={(x) => setTo(x.target.value)} /></div>
          <div><label className="label">Sual sayı</label><input className="input" type="number" min={1} placeholder="Hamısı" value={count} onChange={(x) => setCount(x.target.value)} /></div>
          <div><label className="label">Vaxt (dəqiqə)</label><input className="input" type="number" min={1} max={300} placeholder={String(e.time_limit_minutes)} value={minutes} onChange={(x) => setMinutes(x.target.value)} /></div>
        </div>
        <p className="text-sm text-muted">Suallar{e.shuffle_options ? ' və variantlar' : ''} hər cəhddə təsadüfi qarışdırılır.</p>
        {e.written_count > 0 && (
          <p className={`rounded-lg p-2 text-sm ${blocked ? 'bg-red-500/10 text-red-400' : 'bg-brand-soft'}`}>
            {blocked ? `Bu imtahan üçün ${e.ai.limit} AI yoxlama haqqınızı istifadə etmisiniz.` : `Yazılı cavabları AI yoxlayır. Qalan AI yoxlama haqqınız: ${aiLeft} / ${e.ai.limit}`}
          </p>
        )}
        {start.error && <p className="text-sm text-red-400">{(start.error as Error).message}</p>}
        <button className="btn-primary w-full" disabled={start.isPending || blocked} onClick={() => start.mutate(undefined)}>İmtahana başla</button>
      </div>

      {e.last_attempt_id && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Son cəhddən təkrar</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={start.isPending || blocked} onClick={() => start.mutate({ only: 'flagged', fromAttempt: e.last_attempt_id })}>İşarələdiyim suallarla</button>
            <button className="btn-ghost" disabled={start.isPending || blocked} onClick={() => start.mutate({ only: 'wrong', fromAttempt: e.last_attempt_id })}>Səhv / boş suallarla</button>
            <Link to={`/attempts/${e.last_attempt_id}`} className="btn-ghost">Son nəticəyə bax</Link>
          </div>
        </div>
      )}
      {e.can_edit && <Link to={`/exams/${e.id}/edit`} className="btn-ghost">İmtahanı redaktə et</Link>}
    </div>
  );
}
