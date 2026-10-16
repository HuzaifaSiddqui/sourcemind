import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, BookOpen, Box, ChevronDown, Code2, FileText, Folder, FolderKanban, GitCompareArrows, Home, Layers, Lock, LogOut,
  Menu, MessageSquareText, Plug, Scale, Search, Settings, ShieldCheck, Sparkles, Users, Workflow, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SystemInfo } from '../lib/types';
import { Avatar, cx } from './ui';

export const SPACE_ICON: Record<string, typeof Folder> = { scale: Scale, book: BookOpen, lock: Lock, box: Box, code: Code2, search: Search, folder: Folder };

export function SpaceIcon({ icon, color, size = 28 }: { icon: string; color: string; size?: number }) {
  const I = SPACE_ICON[icon] ?? Folder;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-md" style={{ width: size, height: size, background: `${color}1A`, color }}>
      <I style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </span>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? '#1C2440' : '#0B1020'} />
        <path d="M9 10.5h9.5M9 16h14M9 21.5h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="22.5" cy="21.5" r="2.6" fill="#5B7CFF" />
      </svg>
      <span className={cx('text-[15px] font-semibold tracking-[-0.01em]', light ? 'text-white' : 'text-fg')}>SourceMind</span>
    </span>
  );
}

const NAV: { group: string; items: { to: string; label: string; icon: typeof Home; cap?: string }[] }[] = [
  { group: 'Workspace', items: [
    { to: '/', label: 'Home', icon: Home },
    { to: '/ask', label: 'Ask SourceMind', icon: Sparkles, cap: 'ask' },
    { to: '/search', label: 'Search', icon: Search, cap: 'search' },
    { to: '/conversations', label: 'Conversations', icon: MessageSquareText },
  ] },
  { group: 'Knowledge', items: [
    { to: '/spaces', label: 'Knowledge spaces', icon: FolderKanban },
    { to: '/documents', label: 'Documents', icon: FileText },
    { to: '/compare', label: 'Compare', icon: GitCompareArrows, cap: 'ask' },
  ] },
  { group: 'Operations', items: [
    { to: '/pipeline', label: 'Indexing pipeline', icon: Workflow },
    { to: '/quality', label: 'Quality center', icon: ShieldCheck },
  ] },
  { group: 'Admin', items: [
    { to: '/team', label: 'Team & access', icon: Users },
    { to: '/integrations', label: 'Sources & connectors', icon: Plug },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: () => api<SystemInfo>('/system'), staleTime: 60_000 });
  return (
    <nav className="flex h-full flex-col bg-ink text-ink-text" aria-label="Primary">
      <div className="px-5 pb-4 pt-5"><Logo light /></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="mb-1 px-2 text-2xs font-medium text-ink-text/60">{g.group}</p>
            <ul className="space-y-px">
              {g.items.filter((i) => !i.cap || can(i.cap as any)).map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to} end={i.to === '/'} onClick={onNavigate}
                    className={({ isActive }) => cx(
                      'flex h-8 items-center gap-2.5 rounded px-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal',
                      isActive ? 'bg-ink-3 text-white' : 'hover:bg-ink-2 hover:text-white',
                    )}
                  >
                    {({ isActive }) => (<><i.icon className={cx('size-4', isActive && 'text-signal')} strokeWidth={1.9} />{i.label}</>)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-line p-3">
        <NavLink to="/architecture" onClick={onNavigate} className={({ isActive }) => cx('mb-2 flex h-8 items-center gap-2.5 rounded px-2 text-sm hover:bg-ink-2 hover:text-white', isActive && 'bg-ink-3 text-white')}>
          <Layers className="size-4" strokeWidth={1.9} />How answers are built
        </NavLink>
        {sys && (
          <div className="rounded-md bg-ink-2 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-white">
              <span className={cx('size-1.5 rounded-full', sys.llm ? 'bg-ok' : 'bg-signal')} />
              {sys.llm ? `LLM answers · ${sys.llm}` : 'Extractive answers (offline)'}
            </div>
            <div className="mt-1 truncate text-ink-text/70">{sys.vectorStore} · {sys.embeddingModel}</div>
          </div>
        )}
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, roleLabel, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-canvas" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.name} color={user.color} size={28} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-fg">{user.name}</span>
          <span className="block text-2xs text-fg-muted">{roleLabel}</span>
        </span>
        <ChevronDown className="size-3.5 text-fg-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-64 animate-rise rounded-md border border-line bg-paper p-1.5 shadow-[0_12px_32px_-8px_rgba(11,16,32,.25)]">
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium">{user.email}</p>
            <p className="text-xs text-fg-muted">Teams: {user.teams.join(', ') || 'none'}</p>
          </div>
          <button role="menuitem" onClick={() => { logout(); navigate('/login'); }} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-sm text-fg-2 hover:bg-canvas">
            <LogOut className="size-4" />Switch account
          </button>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your company knowledge"
        className="h-9 w-full rounded border border-line bg-canvas pl-9 pr-14 text-sm placeholder:text-fg-faint focus:border-signal focus:bg-paper focus:outline-none focus:ring-2 focus:ring-signal/15"
        aria-label="Search knowledge"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-paper px-1.5 text-2xs text-fg-muted">⌘K</kbd>
    </form>
  );
}

export function Shell() {
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobile(false), [loc.pathname]);
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="hidden w-[244px] shrink-0 lg:block"><Sidebar /></aside>
      {mobile && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-[260px]"><Sidebar onNavigate={() => setMobile(false)} /></div>
          <button className="flex-1 bg-ink/40" aria-label="Close menu" onClick={() => setMobile(false)}><X className="ml-3 size-5 text-white" /></button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-4 lg:px-6">
          <button className="rounded p-1.5 hover:bg-canvas lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2"><UserMenu /></div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto" id="main"><Outlet /></main>
      </div>
    </div>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx('mx-auto w-full px-4 py-7 lg:px-8', wide ? 'max-w-[1440px]' : 'max-w-[1240px]')}>{children}</div>;
}

export function ActivityIcon() { return <Activity className="size-4" />; }
