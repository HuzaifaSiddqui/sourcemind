import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, CircleAlert, MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { compact, timeAgo } from '../lib/format';
import type { Doc, PipelineEvent, Space, SystemInfo } from '../lib/types';
import { Page, SpaceIcon } from '../components/Shell';
import { DocIcon } from '../components/Evidence';
import { AvatarStack, Button, Empty, Panel, PanelHeader, Skeleton, StatusPill, cx } from '../components/ui';
import { UploadDialog } from '../components/UploadDialog';

interface Dashboard {
  kpis: { documents: number; processing: number; failed: number; tokens: number; chunks: number; spaces: number; questions: number; conversations: number; grounded: number };
  spaces: Space[];
  recentQuestions: { conversationId: string; question: string; at: string; citations: number; evidence: string; refused: boolean }[];
  recentDocuments: Doc[];
  activity: (PipelineEvent & { docId: string; doc: string })[];
  suggested: { q: string; docId: string; doc: string }[];
  system: SystemInfo;
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export default function Home() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [upload, setUpload] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'),
    refetchInterval: (query) => ((query.state.data as Dashboard | undefined)?.kpis.processing ? 1500 : false),
  });

  const ask = (text: string, docId?: string) => navigate(`/ask?q=${encodeURIComponent(text)}${docId ? `&docs=${docId}` : ''}`);

  return (
    <Page>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em]">{greeting()}, {user?.name.split(' ')[0]}</h1>
          <p className="mt-1 text-base text-fg-muted">Your company knowledge, ready to search.</p>
        </div>
        {can('sources.write') && <Button icon={<Plus className="size-4" />} onClick={() => setUpload(true)}>Add sources</Button>}
      </header>

      {can('ask') ? (
        <section className="mb-6 rounded-lg border border-line bg-paper p-2 shadow-[0_1px_0_rgba(16,24,40,.03)]">
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }} className="flex items-center gap-2 px-3">
            <Sparkles className="size-5 shrink-0 text-signal" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={data ? `Ask a question across ${data.kpis.documents} documents you can access` : 'Ask a question'}
              className="h-12 flex-1 bg-transparent text-md placeholder:text-fg-faint focus:outline-none" aria-label="Ask a question"
            />
            <Button type="submit" variant="primary" disabled={!q.trim()} aria-label="Ask" className="size-9 !px-0"><ArrowUp className="size-4" /></Button>
          </form>
          {!!data?.suggested.length && (
            <div className="flex flex-wrap gap-1.5 border-t border-line px-3 pb-1.5 pt-2.5">
              {data.suggested.map((s) => (
                <button key={s.q + s.docId} onClick={() => ask(s.q, s.docId)} className="rounded-full border border-line px-3 py-1 text-xs text-fg-2 transition-colors hover:border-signal/50 hover:text-fg">
                  {s.q} <span className="text-fg-faint">in {s.doc}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <Panel className="mb-6 text-sm text-fg-muted">Your viewer role can read documents and answers shared with you. Ask an admin for member access to ask questions.</Panel>
      )}

      <section className="mb-8 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-paper md:grid-cols-4" aria-label="Workspace metrics">
        {[
          { v: data?.kpis.documents, l: 'Documents indexed', s: data && (data.kpis.processing ? `${data.kpis.processing} processing now` : `${compact(data.kpis.chunks)} searchable passages`) },
          { v: data && compact(data.kpis.tokens), l: 'Tokens processed', s: data && `${data.system.embeddingModel}` },
          { v: data?.kpis.spaces, l: 'Knowledge spaces', s: 'You have access to' },
          { v: data?.kpis.questions, l: 'Questions answered', s: data && `${Math.round(data.kpis.grounded * 100)}% with cited evidence` },
        ].map((k, i) => (
          <div key={k.l} className={cx('px-5 py-4', i > 0 && 'border-l border-line', i === 2 && 'max-md:border-l-0 max-md:border-t', i === 3 && 'max-md:border-t')}>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <p className="text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{k.v}</p>}
            <p className="text-sm font-medium text-fg-2">{k.l}</p>
            <p className="mt-0.5 truncate text-xs text-fg-muted">{k.s}</p>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-md font-semibold">Knowledge spaces</h2>
          <Link to="/spaces" className="text-sm text-signal-ink hover:underline">Manage spaces</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px]" />)}
          {data?.spaces.map((s) => (
            <Link key={s.id} to={`/documents?space=${s.id}`} className="group rounded-lg border border-line bg-paper p-4 transition-colors hover:border-line-strong">
              <div className="flex items-start gap-3">
                <SpaceIcon icon={s.icon} color={s.color} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg group-hover:text-signal-ink">{s.name}</p>
                  <p className="text-xs text-fg-muted">{s.documents} {s.documents === 1 ? 'document' : 'documents'}, {s.chunks} passages</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <AvatarStack people={s.members} />
                <span className="text-xs text-fg-muted">{s.access === 'Everyone' ? 'Everyone' : s.access} · {timeAgo(s.lastActivity)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Panel>
          <PanelHeader title="Your recent questions" action={<Link to="/conversations" className="text-sm text-signal-ink hover:underline">All conversations</Link>} />
          {data && !data.recentQuestions.length && <Empty icon={<MessageSquareText className="size-5" />} title="No questions yet">Ask anything above. Answers include citations you can open.</Empty>}
          <ul className="-mx-2">
            {data?.recentQuestions.map((r) => (
              <li key={r.conversationId + r.at}>
                <Link to={`/ask/${r.conversationId}`} className="flex items-start gap-3 rounded px-2 py-2.5 hover:bg-canvas">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-fg-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium text-fg">{r.question}</span>
                    <span className="text-xs text-fg-muted">
                      {r.refused ? 'Not enough evidence to answer' : `${r.citations} ${r.citations === 1 ? 'citation' : 'citations'}, evidence ${r.evidence.toLowerCase()}`} · {timeAgo(r.at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Recently added" action={<Link to="/pipeline" className="text-sm text-signal-ink hover:underline">Pipeline</Link>} />
          <ul className="-mx-2">
            {data?.recentDocuments.map((d) => (
              <li key={d.id}>
                <Link to={`/documents/${d.id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-canvas">
                  <DocIcon type={d.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block text-xs text-fg-muted">{d.space?.name} · {timeAgo(d.createdAt)}</span>
                  </span>
                  <StatusPill status={d.status} />
                </Link>
              </li>
            ))}
          </ul>
          {!!data?.activity.some((a) => a.level !== 'info') && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {data.activity.filter((a) => a.level !== 'info').slice(0, 2).map((a) => (
                <p key={a.at + a.docId} className="flex items-start gap-2 text-xs text-fg-muted"><CircleAlert className="mt-px size-3.5 shrink-0 text-warn" /><span><span className="font-medium text-fg-2">{a.doc}:</span> {a.message}</span></p>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
    </Page>
  );
}
