import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Logo } from '../components/Shell';
import { Avatar, Button, ErrorNote, Field, Input, cx } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('daniel@helix.demo');
  const [password, setPassword] = useState('demo1234');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { data } = useQuery({ queryKey: ['demo-users'], queryFn: () => api<{ users: User[]; password: string }>('/auth/demo-users') });

  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />;

  const go = async (e: string, p: string) => {
    setBusy(e); setError(null);
    try { await login(e, p); navigate(loc.state?.from ?? '/', { replace: true }); }
    catch (err) { setError(err); }
    finally { setBusy(null); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: 'linear-gradient(#1C2440 1px, transparent 1px), linear-gradient(90deg, #1C2440 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)' }}
        />
        <div className="relative"><Logo light /></div>
        <div className="relative max-w-[520px]">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]">Ask your company knowledge. Verify every answer.</h1>
          <p className="mt-5 max-w-[46ch] text-lg text-ink-text">Every answer links back to the exact passage it came from — and only to sources you are allowed to see.</p>

          <figure className="mt-10 rounded-lg border border-ink-line bg-ink-2 p-5">
            <p className="text-sm text-ink-text">What are our termination obligations if the customer cancels early?</p>
            <p className="mt-3 text-[15px] leading-relaxed text-white">
              The customer remains responsible for all committed fees for the rest of the initial term
              <span className="mx-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-signal px-1 text-2xs font-semibold">1</span>.
            </p>
            <blockquote className="mt-4 rounded-md bg-paper px-4 py-3 font-serif text-[14px] leading-relaxed text-fg-2">
              <span className="block font-sans text-2xs font-medium text-fg-muted">Enterprise MSA 2026, page 5, section 8.4</span>
              <span className="mt-1.5 block">
                Customer termination for convenience{' '}
                <mark className="rounded-[2px] bg-signal-mark px-0.5 text-fg underline decoration-signal decoration-2 underline-offset-4">does not relieve Customer of payment obligations</mark>…
              </span>
            </blockquote>
          </figure>
        </div>
        <p className="relative text-xs text-ink-text/70">Retrieval-augmented generation with hybrid search, permission-aware retrieval and evaluated citations.</p>
      </aside>

      <main className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-semibold tracking-[-0.015em]">Sign in to Helix Systems</h2>
          <p className="mt-1 text-base text-fg-muted">Use your work email to open the knowledge workspace.</p>

          <form className="mt-7 space-y-4" onSubmit={(e) => { e.preventDefault(); go(email, password); }}>
            <Field label="Work email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <ErrorNote error={error} />
            <Button type="submit" variant="primary" className="w-full" loading={busy === email}>Sign in</Button>
          </form>

          {!!data?.users.length && (
            <div className="mt-9">
              <p className="text-sm font-medium">Try the demo as a different role</p>
              <p className="mt-0.5 text-xs text-fg-muted">Each account sees different spaces, so answers change with permissions.</p>
              <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                {data.users.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => go(u.email, data.password)}
                      disabled={!!busy}
                      className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-canvas disabled:opacity-60', busy === u.email && 'bg-canvas')}
                    >
                      <Avatar name={u.name} color={u.color} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{u.title}</span>
                      </span>
                      <span className="text-xs text-fg-muted">{u.roleLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
