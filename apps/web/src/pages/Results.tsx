import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function Results() {
  const q = useQuery({ queryKey: ['stats'], queryFn: () => api<any>('/api/me/stats') });
  if (q.isLoading) return <p className="text-muted">Yüklənir...</p>;
  if (q.error) return <p className="text-red-400">{(q.error as Error).message}</p>;
  const s = q.data;
  const series = [...s.recent].reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nəticələrim</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Tamamlanan cəhd', s.count], ['Orta nəticə', `${s.average}%`], ['Ən yüksək', `${s.best}%`]].map(([l, v]) => (
          <div key={l as string} className="card"><div className="text-3xl font-bold">{v}</div><div className="text-sm text-muted">{l}</div></div>
        ))}
      </div>

      {series.length > 1 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Son nəticələr</h2>
          <div className="flex h-32 items-end gap-1">
            {series.map((r: any) => (
              <Link key={r.id} to={`/attempts/${r.id}`} title={`${r.title}: ${r.pct}%`} className="flex-1 rounded-t bg-brand/80 hover:bg-brand" style={{ height: `${Math.max(4, r.pct)}%` }} />
            ))}
          </div>
        </div>
      )}

      {s.weak_topics.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Zəif mövzular</h2>
          {s.weak_topics.map((t: any) => (
            <div key={t.topic}>
              <div className="flex justify-between text-sm"><span>{t.topic}</span><span className="text-muted">{t.pct}%</span></div>
              <div className="h-2 rounded bg-white/10"><div className={`h-2 rounded ${t.pct < 50 ? 'bg-red-500/100' : t.pct < 75 ? 'bg-amber-500/100' : 'bg-green-500/100'}`} style={{ width: `${t.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-0">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Bütün cəhdlər</h2>
        {s.recent.length === 0 && <p className="p-5 text-muted">Hələ heç bir imtahan verməmisiniz.</p>}
        {s.recent.map((r: any) => (
          <Link key={r.id} to={`/attempts/${r.id}`} className="flex items-center justify-between border-b border-line px-5 py-3 last:border-0 hover:bg-white/5">
            <div><div className="font-medium">{r.title}</div><div className="text-xs text-muted">{new Date(r.submitted_at).toLocaleString('az-AZ')}</div></div>
            <div className="text-right"><div className="font-semibold">{r.pct}%</div><div className="text-xs text-muted">{r.score}/{r.max}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
