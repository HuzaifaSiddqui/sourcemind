import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, FilePlus2, Layers, PanelLeft, RotateCcw, Search as SearchIcon, Share2, SquarePen,
} from 'lucide-react';
import { api, askStream } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ms } from '../lib/format';
import type { Citation, Conversation, Doc, Message, PageText, Space } from '../lib/types';
import { SpaceIcon } from '../components/Shell';
import { AnswerText, DocIcon, EvidenceBadge, PageView, SourceChip } from '../components/Evidence';
import { Badge, Button, Empty, Spinner, cx, useToast } from '../components/ui';
import { UploadDialog } from '../components/UploadDialog';

type UiMessage = Message & { streaming?: boolean; phase?: string };

/* ───────────── left: sources ───────────── */

function SourcesPanel({ selected, setSelected }: { selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const { data: docs } = useQuery({ queryKey: ['documents', 'ready'], queryFn: () => api<{ documents: Doc[] }>('/documents?status=ready') });
  const { data: sp } = useQuery({ queryKey: ['spaces'], queryFn: () => api<{ spaces: Space[] }>('/spaces') });
  const [filter, setFilter] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => (sp?.spaces ?? []).map((s) => ({
    space: s,
    docs: (docs?.documents ?? []).filter((d) => d.spaceId === s.id && d.title.toLowerCase().includes(filter.toLowerCase())),
  })).filter((g) => g.docs.length), [sp, docs, filter]);

  const toggle = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleSpace = (ids: string[]) => {
    const n = new Set(selected);
    const all = ids.every((i) => n.has(i));
    ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
    setSelected(n);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sources</h2>
          {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-xs text-signal-ink hover:underline">Clear</button>}
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">{selected.size ? `${selected.size} selected` : 'Searching everything you can access'}</p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sources" className="mt-2.5 h-8 w-full rounded border border-line bg-canvas px-2.5 text-sm placeholder:text-fg-faint focus:border-signal focus:bg-paper focus:outline-none" />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map(({ space, docs: list }) => {
          const ids = list.map((d) => d.id);
          const count = ids.filter((i) => selected.has(i)).length;
          const open = !closed.has(space.id);
          return (
            <div key={space.id} className="mb-1">
              <div className="flex items-center gap-1 rounded px-1.5 py-1.5 hover:bg-canvas">
                <button onClick={() => { const n = new Set(closed); open ? n.add(space.id) : n.delete(space.id); setClosed(n); }} className="flex flex-1 items-center gap-2 text-left" aria-expanded={open}>
                  <ChevronDown className={cx('size-3.5 text-fg-faint transition-transform', !open && '-rotate-90')} />
                  <SpaceIcon icon={space.icon} color={space.color} size={20} />
                  <span className="truncate text-sm font-medium">{space.name}</span>
                </button>
                <button onClick={() => toggleSpace(ids)} className="text-2xs text-fg-muted hover:text-signal-ink">{count === ids.length ? 'None' : 'All'}</button>
              </div>
              {open && (
                <ul className="ml-5 mt-0.5 space-y-px">
                  {list.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-canvas">
                        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="size-3.5 rounded border-line-strong accent-signal" />
                        <DocIcon type={d.type} className="size-3.5" />
                        <span className={cx('truncate', selected.has(d.id) ? 'text-fg' : 'text-fg-2')}>{d.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {docs && !groups.length && <p className="px-3 py-6 text-center text-sm text-fg-muted">No indexed sources match.</p>}
      </div>
    </div>
  );
}

/* ───────────── right: evidence ───────────── */

function EvidencePanel({ citations, active, setActive }: { citations: Citation[]; active: number | null; setActive: (n: number) => void }) {
  const toast = useToast();
  const c = citations.find((x) => x.n === active) ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ['chunk', c?.chunkId], enabled: !!c,
    queryFn: () => api<{ page: PageText; document: Doc }>(`/chunks/${c!.chunkId}`),
  });
  if (!c) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-sm font-semibold">Evidence</h2></div>
        <Empty icon={<Layers className="size-5" />} title="Select a citation">The passage behind each numbered citation opens here, highlighted in its original page.</Empty>
      </div>
    );
  }
  const idx = citations.findIndex((x) => x.n === c.n);
  const copy = () => {
    navigator.clipboard?.writeText(`"${c.quote}" — ${c.docTitle}, ${c.pageLabel.toLowerCase()} ${c.page}, ${c.section}`);
    toast('Citation copied');
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">Evidence</h2>
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          <button disabled={idx <= 0} onClick={() => setActive(citations[idx - 1].n)} className="rounded p-1 hover:bg-canvas disabled:opacity-30" aria-label="Previous citation"><ChevronLeft className="size-4" /></button>
          <span className="tabular-nums">{idx + 1} of {citations.length}</span>
          <button disabled={idx >= citations.length - 1} onClick={() => setActive(citations[idx + 1].n)} className="rounded p-1 hover:bg-canvas disabled:opacity-30" aria-label="Next citation"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-signal text-2xs font-semibold text-white">{c.n}</span>
          <div className="min-w-0">
            <Link to={`/documents/${c.docId}`} className="block truncate font-medium hover:text-signal-ink">{c.docTitle}</Link>
            <p className="text-xs text-fg-muted">{c.pageLabel} {c.page} · {c.section}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-fg-muted">Retrieval relevance</dt><dd className="text-right font-medium tabular-nums">{Math.round(c.relevance * 100)}%</dd>
          <dt className="text-fg-muted">Passage</dt><dd className="text-right font-mono tabular-nums text-fg-2">#{c.chunkSeq}</dd>
        </dl>
        <div className="mt-3 flex gap-2">
          <Link to={`/evidence/${c.chunkId}?q=${encodeURIComponent(c.quote.slice(0, 200))}&rel=${c.relevance}&n=${c.n}`}><Button size="sm" icon={<ExternalLink className="size-3.5" />}>Open document</Button></Link>
          <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={copy}>Copy citation</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-canvas p-4">
        {isLoading || !data ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <PageView
            compact page={data.page} scrollKey={c.chunkId + c.n}
            label={`${c.docTitle}, ${c.pageLabel.toLowerCase()} ${c.page} of ${data.document.pages}`}
            marks={[{ start: c.chunkRange.start, end: c.chunkRange.end, tone: 'passage' }, { start: c.highlight.start, end: c.highlight.end, tone: 'quote' }]}
          />
        )}
      </div>
    </div>
  );
}

/* ───────────── center: thread ───────────── */

function Trace({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  if (!m.trace) return null;
  const t = m.trace;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg" aria-expanded={open}>
        <ChevronDown className={cx('size-3.5 transition-transform', !open && '-rotate-90')} />How this answer was built
      </button>
      {open && (
        <div className="mt-2 animate-rise rounded-md border border-line bg-canvas p-3.5 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-fg-muted">Permission filter</dt><dd>{t.allowedDocs} documents you can access were searched</dd>
            <dt className="text-fg-muted">Query rewrite</dt><dd className="font-mono text-fg-2">{t.rewrittenQuery}</dd>
            <dt className="text-fg-muted">Retrieval</dt><dd>{t.strategy}: {t.vectorHits} vector + {t.keywordHits} keyword hits, {t.candidates} fused candidates</dd>
            <dt className="text-fg-muted">Generation</dt><dd>{m.mode === 'llm' ? 'LLM, grounded on numbered passages' : 'Extractive: sentences selected verbatim from top passages'}</dd>
            {m.grounding && <><dt className="text-fg-muted">Grounding check</dt><dd>{Math.round(m.grounding.groundedness * 100)}% supported, {Math.round(m.grounding.citationCoverage * 100)}% of sentences cited{m.grounding.removedCitations ? `, ${m.grounding.removedCitations} invalid citations removed` : ''}</dd></>}
            <dt className="text-fg-muted">Latency</dt><dd className="tabular-nums">retrieve {ms(t.ms.retrieve)}, generate {ms(t.ms.generate)}, total {ms(t.ms.total)}</dd>
          </dl>
          {!!t.reranked.length && (
            <table className="mt-3 w-full tabular-nums">
              <thead><tr className="text-left text-fg-muted"><th className="pb-1 font-normal">Rank</th><th className="pb-1 font-normal">Relevance</th><th className="pb-1 font-normal">Vector</th><th className="pb-1 font-normal">Keyword</th><th className="pb-1 font-normal">Coverage</th></tr></thead>
              <tbody>{t.reranked.map((r, i) => (
                <tr key={r.chunkId} className="border-t border-line"><td className="py-1">{i + 1}</td><td className="py-1 font-medium">{r.score.toFixed(2)}</td><td>{r.vector.toFixed(2)}</td><td>{r.keyword.toFixed(2)}</td><td>{r.coverage.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ m, active, onCite, onFollow, onRefusalAction, scoped }: {
  m: UiMessage; active: number | null; onCite: (n: number) => void; onFollow: (q: string) => void; onRefusalAction: (a: 'all' | 'upload' | 'rephrase') => void; scoped: boolean;
}) {
  const { can } = useAuth();
  if (m.refused && !m.streaming) {
    return (
      <div className="rounded-lg border border-line bg-paper p-5">
        <p className="text-[15px] font-medium text-fg">{m.content}</p>
        <p className="mt-1 text-sm text-fg-muted">SourceMind only answers when the sources you can access contain supporting evidence.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {scoped && <Button size="sm" icon={<SearchIcon className="size-3.5" />} onClick={() => onRefusalAction('all')}>Search all knowledge spaces</Button>}
          {can('sources.write') && <Button size="sm" icon={<FilePlus2 className="size-3.5" />} onClick={() => onRefusalAction('upload')}>Add a source</Button>}
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onRefusalAction('rephrase')}>Ask differently</Button>
        </div>
      </div>
    );
  }
  const cites = m.citations ?? [];
  return (
    <div>
      {m.streaming && !m.content && (
        <p className="flex items-center gap-2 text-sm text-fg-muted"><Spinner className="size-3.5" />{m.phase ?? 'Searching your sources'}</p>
      )}
      {!!m.content && <AnswerText text={m.content} citations={cites} active={active} onCite={onCite} streaming={m.streaming} />}
      {!m.streaming && (
        <>
          {!!cites.length && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {cites.map((c) => <SourceChip key={c.n} c={c} active={active === c.n} onClick={() => onCite(c.n)} />)}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {m.evidence && <EvidenceBadge e={m.evidence} />}
            {m.mode === 'extractive' && <Badge>Extractive mode</Badge>}
          </div>
          <Trace m={m} />
          {!!m.followUps?.length && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {m.followUps.map((f) => (
                <button key={f} onClick={() => onFollow(f)} className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-fg-2 hover:border-signal/50 hover:text-fg">{f}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Ask() {
  const { conversationId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ msg: string; n: number } | null>(null);
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const [shared, setShared] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [upload, setUpload] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoAsked = useRef(false);
  const local = useRef(new Set<string>()); // conversations created in this view — never reload them from the server mid-stream

  const { data: conv } = useQuery({
    queryKey: ['conversation', conversationId], enabled: !!conversationId && conversationId !== convId && !local.current.has(conversationId),
    queryFn: () => api<{ conversation: Conversation }>(`/conversations/${conversationId}`),
  });

  useEffect(() => {
    if (!conversationId) { if (convId && !busy) { setMessages([]); setConvId(undefined); setActive(null); } return; }
    if (local.current.has(conversationId)) return;
    if (conv && conversationId !== convId) {
      setMessages(conv.conversation.messages);
      setSelected(new Set(conv.conversation.docIds));
      setConvId(conversationId);
      setShared(conv.conversation.shared);
      const last = [...conv.conversation.messages].reverse().find((m) => m.citations?.length);
      setActive(last ? { msg: last.id, n: last.citations![0].n } : null);
    }
  }, [conversationId, conv, convId, busy]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, messages[messages.length - 1]?.content.length]);

  const send = useCallback(async (question: string, docIds?: string[]) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput('');
    const scope = docIds ?? [...selected];
    const tmpId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${tmpId}`, role: 'user', content: question, createdAt: new Date().toISOString() }, { id: tmpId, role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true }]);
    const patch = (fn: (m: UiMessage) => UiMessage) => setMessages((all) => all.map((m) => (m.id === tmpId ? fn(m) : m)));
    try {
      await askStream({ question, conversationId: convId, docIds: scope }, (e) => {
        if (e.type === 'conversation' && !convId) { local.current.add(e.conversationId); setConvId(e.conversationId); navigate(`/ask/${e.conversationId}`, { replace: true }); }
        if (e.type === 'retrieval') patch((m) => ({ ...m, phase: `Found ${e.passages} passages in ${e.documents} ${e.documents === 1 ? 'document' : 'documents'}, writing answer` }));
        if (e.type === 'token') patch((m) => ({ ...m, content: m.content + e.text }));
        if (e.type === 'done') {
          setMessages((all) => all.map((m) => (m.id === tmpId ? e.message : m)));
          if (e.message.citations?.length) setActive({ msg: e.message.id, n: e.message.citations[0].n });
        }
        if (e.type === 'error') throw new Error(e.message);
      });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      patch((m) => ({ ...m, streaming: false, refused: true, content: (err as Error).message }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, selected, convId, navigate, qc]);

  // deep links: /ask?q=…&docs=a,b
  useEffect(() => {
    const q = params.get('q');
    if (!q || autoAsked.current) return;
    autoAsked.current = true;
    const docs = params.get('docs')?.split(',').filter(Boolean) ?? [];
    if (docs.length) setSelected(new Set(docs));
    setParams({}, { replace: true });
    send(q, docs);
  }, [params, setParams, send]);

  const activeMsg = messages.find((m) => m.id === active?.msg);
  const lastWithCites = [...messages].reverse().find((m) => m.citations?.length);
  const evidenceMsg = activeMsg ?? lastWithCites;

  const newChat = () => { setMessages([]); setConvId(undefined); setActive(null); setShared(false); navigate('/ask'); };
  const toggleShare = async () => {
    if (!convId) return;
    await api(`/conversations/${convId}`, { method: 'PATCH', json: { shared: !shared } });
    setShared(!shared);
    toast(shared ? 'Conversation is private again' : 'Shared with your workspace');
  };

  return (
    <div className="flex h-full min-h-0">
      {showSources && <aside className="hidden w-[280px] shrink-0 border-r border-line bg-paper md:block"><SourcesPanel selected={selected} setSelected={setSelected} /></aside>}

      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-4">
          <button onClick={() => setShowSources(!showSources)} className="hidden rounded p-1.5 text-fg-muted hover:bg-canvas hover:text-fg md:block" aria-label="Toggle sources"><PanelLeft className="size-4" /></button>
          <h1 className="text-sm font-semibold">Ask SourceMind</h1>
          <span className="truncate text-xs text-fg-muted">{selected.size ? `${selected.size} selected ${selected.size === 1 ? 'source' : 'sources'}` : 'All accessible sources'}</span>
          <div className="ml-auto flex items-center gap-1">
            {convId && <Button size="sm" variant="ghost" icon={shared ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />} onClick={toggleShare}>{shared ? 'Shared' : 'Share'}</Button>}
            <Button size="sm" variant="ghost" icon={<SquarePen className="size-3.5" />} onClick={newChat}>New</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-5 py-8">
            {!messages.length && (
              <div className="pt-[8vh]">
                <h2 className="text-[26px] font-semibold tracking-[-0.02em]">What do you need to know?</h2>
                <p className="mt-1.5 max-w-[56ch] text-base text-fg-muted">Answers come only from your documents. Each claim is cited, and you can open the exact passage it came from.</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {['What are our termination obligations if the customer cancels before the initial term ends?', 'How quickly must we notify a customer about a data breach?', 'How many days a week can employees work from home?', 'What are the API rate limits?'].map((q) => (
                    <button key={q} onClick={() => send(q)} className="rounded-md border border-line bg-paper p-3.5 text-left text-sm text-fg-2 transition-colors hover:border-signal/50 hover:text-fg">{q}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-7">
              {messages.map((m) => m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg rounded-br-sm bg-ink px-4 py-2.5 text-[15px] text-white">{m.content}</p>
                </div>
              ) : (
                <AssistantMessage
                  key={m.id} m={m} active={active?.msg === m.id ? active.n : null} scoped={selected.size > 0}
                  onCite={(n) => {
                    setActive({ msg: m.id, n });
                    const c = m.citations?.find((x) => x.n === n);
                    if (c && !window.matchMedia('(min-width: 1280px)').matches) navigate(`/evidence/${c.chunkId}?q=${encodeURIComponent(c.quote.slice(0, 200))}&rel=${c.relevance}&n=${c.n}`);
                  }}
                  onFollow={(q) => send(q)}
                  onRefusalAction={(a) => {
                    const lastQ = [...messages].reverse().find((x) => x.role === 'user')?.content ?? '';
                    if (a === 'all') { setSelected(new Set()); send(lastQ, []); }
                    if (a === 'upload') setUpload(true);
                    if (a === 'rephrase') { setInput(lastQ); inputRef.current?.focus(); }
                  }}
                />
              ))}
            </div>
            <div ref={bottom} />
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-paper px-4 py-3">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mx-auto flex max-w-[760px] items-end gap-2 rounded-lg border border-line bg-paper p-1.5 pl-3.5 focus-within:border-signal focus-within:ring-2 focus-within:ring-signal/15">
            <textarea
              ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={messages.length ? 'Ask a follow-up' : 'Ask about contracts, policies, products…'}
              className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] placeholder:text-fg-faint focus:outline-none" aria-label="Question"
            />
            <Button type="submit" variant="primary" disabled={!input.trim()} loading={busy} aria-label="Send" className="size-9 !px-0">{!busy && <ArrowUp className="size-4" />}</Button>
          </form>
        </div>
      </section>

      <aside className="hidden w-[440px] shrink-0 border-l border-line bg-paper xl:block">
        <EvidencePanel
          citations={evidenceMsg?.citations ?? []}
          active={evidenceMsg && active?.msg === evidenceMsg.id ? active.n : null}
          setActive={(n) => evidenceMsg && setActive({ msg: evidenceMsg.id, n })}
        />
      </aside>
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
    </div>
  );
}
