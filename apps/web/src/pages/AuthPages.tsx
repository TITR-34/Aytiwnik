import { FormEvent, ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../lib/t';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-brand">{t.brand}</h1>
        <p className="mb-6 text-center text-sm text-muted">Qrupunla imtahana birlikdə hazırlaş</p>
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
const Msg = ({ error, info }: { error?: string; info?: string }) =>
  error ? <p className="mb-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-400">{error}</p> : info ? <p className="mb-3 rounded-lg bg-green-500/10 p-2 text-sm text-green-400">{info}</p> : null;

export function Login() {
  const { session } = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message.includes('Invalid') ? 'E-poçt və ya şifrə yanlışdır' : error.message.includes('confirm') ? 'E-poçtunuzu təsdiqləyin' : error.message);
    setBusy(false);
  }
  return (
    <Shell title="Daxil ol">
      <form onSubmit={submit} className="space-y-3">
        <Msg error={error} />
        <div><label className="label">E-poçt</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Şifrə</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={busy}>Daxil ol</button>
        <div className="flex justify-between text-sm"><Link to="/forgot" className="text-brand">Şifrəni unutdum</Link><Link to="/signup" className="text-brand">Qeydiyyat</Link></div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const nav = useNavigate();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [info, setInfo] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: window.location.origin } });
    if (error) setError(error.message);
    else if (data.session) nav('/');
    else setInfo('Qeydiyyat tamamlandı. E-poçtunuza göndərilən linki təsdiqləyin, sonra daxil olun.');
    setBusy(false);
  }
  return (
    <Shell title="Qeydiyyat">
      <form onSubmit={submit} className="space-y-3">
        <Msg error={error} info={info} />
        <div><label className="label">Ad Soyad</label><input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">E-poçt</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Şifrə (ən azı 8 simvol)</label><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={busy}>Qeydiyyatdan keç</button>
        <p className="text-center text-sm"><Link to="/login" className="text-brand">Artıq hesabım var</Link></p>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState(''), [info, setInfo] = useState(''), [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
    if (error) setError(error.message); else setInfo('Şifrə bərpa linki e-poçtunuza göndərildi.');
  }
  return (
    <Shell title="Şifrəni bərpa et">
      <form onSubmit={submit} className="space-y-3">
        <Msg error={error} info={info} />
        <div><label className="label">E-poçt</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn-primary w-full">Link göndər</button>
        <p className="text-center text-sm"><Link to="/login" className="text-brand">Geri</Link></p>
      </form>
    </Shell>
  );
}

export function Reset() {
  const nav = useNavigate();
  const [password, setPassword] = useState(''), [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message); else nav('/');
  }
  return (
    <Shell title="Yeni şifrə">
      <form onSubmit={submit} className="space-y-3">
        <Msg error={error} />
        <div><label className="label">Yeni şifrə</label><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn-primary w-full">Yadda saxla</button>
      </form>
    </Shell>
  );
}
