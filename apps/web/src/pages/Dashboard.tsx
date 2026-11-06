import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<any[]>('/api/groups') });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<any>('/api/me/stats') });
  const [name, setName] = useState(''), [code, setCode] = useState('');
  const create = useMutation({ mutationFn: () => api('/api/groups', { body: { name } }), onSuccess: (g: any) => { qc.invalidateQueries({ queryKey: ['groups'] }); nav(`/groups/${g.id}`); } });
  const join = useMutation({ mutationFn: () => api('/api/groups/join', { body: { code } }), onSuccess: (g: any) => { qc.invalidateQueries({ queryKey: ['groups'] }); nav(`/groups/${g.id}`); } });
  const s = stats.data;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-md">
          <h1 className="text-3xl font-bold">Xoş gəlmisiniz</h1>
          <p className="mt-2 text-muted">Qrupunuzu seçin, orada imtahan yaradın və ya yoldaşlarınızın yaratdığı imtahanlarla məşq edin.</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-card">
          {[['Sessiyalar', s?.count ?? 0], ['Orta nəticə', `${s?.average ?? 0}%`], ['Ən yüksək', `${s?.best ?? 0}%`]].map(([l, v]) => (
            <div key={l as string} className="px-6 py-4"><div className="text-2xl font-bold">{v}</div><div className="text-sm text-muted">{l}</div></div>
          ))}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Qruplarım</h2>
        {groups.isLoading && <p className="text-muted">Yüklənir...</p>}
        {groups.data?.length === 0 && <div className="card text-muted">Hələ heç bir qrupda deyilsiniz. Aşağıdan qrup yaradın və ya kodla qoşulun.</div>}
        <div className="grid gap-4 md:grid-cols-3">
          {groups.data?.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="card transition-colors hover:border-brand">
              <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-blue-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>
              </div>
              <div className="text-lg font-semibold">{g.name}</div>
              <div className="mt-1 text-sm text-muted">{g.role === 'owner' ? 'Qrup sahibi' : 'Üzv'}</div>
              <div className="mt-4 font-medium text-brand">Aç</div>
            </Link>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
            <h3 className="font-semibold">Yeni qrup yarat</h3>
            <input className="input" placeholder="Qrupun adı" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            {create.error && <p className="text-sm text-red-400">{(create.error as Error).message}</p>}
            <button className="btn-primary" disabled={create.isPending}>Yarat</button>
          </form>
          <form className="card space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); join.mutate(); }}>
            <h3 className="font-semibold">Kodla qoşul</h3>
            <input className="input uppercase" placeholder="Qrup kodu" required value={code} onChange={(e) => setCode(e.target.value)} />
            {join.error && <p className="text-sm text-red-400">{(join.error as Error).message}</p>}
            <button className="btn-primary" disabled={join.isPending}>Qoşul</button>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Son sessiyalar</h2>
        {s && s.recent.length === 0 ? (
          <div className="card"><h3 className="font-semibold">Hələ sessiya yoxdur</h3><p className="mt-1 text-sm text-muted">Nəticələriniz ilk sessiyadan sonra burada görünəcək.</p></div>
        ) : (
          <div className="card p-0">
            {s?.recent.slice(0, 5).map((r: any) => (
              <Link key={r.id} to={`/attempts/${r.id}`} className="flex items-center justify-between border-b border-line px-5 py-3 last:border-0 hover:bg-white/5">
                <div className="font-medium">{r.title}</div><div className="font-semibold">{r.pct}%</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
