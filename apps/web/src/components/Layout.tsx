import { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../lib/t';

const items = [
  { to: '/', label: 'Panel', end: true, icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/results', label: 'Nəticələrim', end: false, icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const email = session?.user.email ?? '';
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-brand-soft text-blue-300' : 'text-muted hover:bg-white/5 hover:text-ink'}`;
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">A</span>
          {t.brand}
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm sm:inline">{email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>{t.nav.logout}</button>
        </div>
      </header>
      <div className="flex flex-col md:flex-row">
        <nav className="flex gap-1 border-b border-line p-3 md:min-h-[calc(100vh-73px)] md:w-64 md:flex-col md:border-b-0 md:border-r md:p-4">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={link}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={i.icon} /></svg>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
