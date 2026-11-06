import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function GroupPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['group', id], queryFn: () => api<any>(`/api/groups/${id}`) });
  const [copied, setCopied] = useState(false);
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/api/groups/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  });
  if (q.isLoading) return <p className="text-muted">Yüklənir...</p>;
  if (q.error) return <p className="text-red-400">{(q.error as Error).message}</p>;
  const { group, exams, members, role, my_id } = q.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <button className="mt-1 text-sm text-muted hover:text-ink" onClick={() => { navigator.clipboard.writeText(group.join_code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            Qrup kodu: <span className="font-mono font-semibold text-ink">{group.join_code}</span> {copied ? '(kopyalandı)' : '(kopyala)'}
          </button>
        </div>
        <Link to={`/groups/${group.id}/exams/new`} className="btn-primary">Yeni imtahan yarat</Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">İmtahanlar</h2>
        {exams.length === 0 && <div className="card text-center text-muted">Hələ imtahan yoxdur. İlk imtahanı sən yarat, qrup yoldaşların da istifadə etsin.</div>}
        {exams.map((e: any) => (
          <div key={e.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{e.title}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {e.mcq_count > 0 && <span className="badge">{e.mcq_count} test</span>}
                {e.written_count > 0 && <span className="badge">{e.written_count} yazılı</span>}
                <span className="badge">{e.time_limit_minutes} dəq</span>
                <span className="text-muted">{e.creator_name} yaratdı</span>
              </div>
            </div>
            <div className="flex gap-2">
              {(e.created_by === my_id || role === 'owner') && <Link to={`/exams/${e.id}/edit`} className="btn-ghost">Redaktə</Link>}
              <Link to={`/exams/${e.id}`} className="btn-primary">Başla</Link>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Üzvlər ({members.length})</h2>
        <div className="card divide-y divide-line p-0">
          {members.map((m: any) => (
            <div key={m.user_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{m.display_name} {m.role === 'owner' && <span className="badge ml-2">Sahib</span>}</span>
              {role === 'owner' && m.role !== 'owner' && (
                <button className="text-red-400 hover:underline" onClick={() => confirm('Üzv qrupdan çıxarılsın?') && remove.mutate(m.user_id)}>Çıxar</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
