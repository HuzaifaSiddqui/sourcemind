import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GitCompareArrows, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bytes, clock, ms, timeAgo } from '../lib/format';
import type { Chunk, Doc, PageText } from '../lib/types';
import { Page } from '../components/Shell';
import { DocIcon, PageView } from '../components/Evidence';
import { PipelineSteps } from '../components/PipelineSteps';
import { Badge, Button, ErrorNote, Panel, PanelHeader, Segmented, Select, Spinner, StatusPill, cx, useToast } from '../components/ui';

type Tab = 'summary' | 'reader' | 'passages' | 'processing';

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('summary');
  const [pageN, setPageN] = useState(1);

  const { data, error } = useQuery({
    queryKey: ['document', id], queryFn: () => api<{ document: Doc; sections: { section: string; page: number }[] }>(`/documents/${id}`),
    refetchInterval: (q) => { const d = (q.state.data as { document: Doc } | undefined)?.document; return d && !['ready', 'failed'].includes(d.status) ? 1000 : false; },
  });
  const ready = data?.document.status === 'ready';
  const { data: pages } = useQuery({ queryKey: ['pages', id], enabled: ready && tab === 'reader', queryFn: () => api<{ pages: PageText[] }>(`/documents/${id}/pages`) });
  const { data: chunks } = useQuery({ queryKey: ['chunks', id], enabled: ready && (tab === 'passages' || tab === 'summary'), queryFn: () => api<{ chunks: Chunk[] }>(`/documents/${id}/chunks`) });

  const update = useMutation({
    mutationFn: (json: Partial<Doc>) => api(`/documents/${id}`, { method: 'PATCH', json }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['document', id] }); qc.invalidateQueries({ queryKey: ['documents'] }); toast('Access updated'); },
  });
  const reprocess = useMutation({ mutationFn: () => api(`/documents/${id}/reprocess`, { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['document', id] }); setTab('processing'); } });
  const remove = useMutation({ mutationFn: () => api(`/documents/${id}`, { method: 'DELETE' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast('Document deleted'); navigate('/documents'); } });

  if (error) return <Page><ErrorNote error={error} /></Page>;
  if (!data) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const d = data.document;
  const s = d.summary;
  const chunkById = new Map(chunks?.chunks.map((c) => [c.id, c]));
  const page = pages?.pages.find((p) => p.n === pageN);

  return (
    <Page wide>
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-fg-muted" aria-label="Breadcrumb">
        <Link to="/documents" className="hover:text-fg">Documents</Link><span className="text-fg-faint">/</span>
        <Link to={`/documents?space=${d.spaceId}`} className="hover:text-fg">{d.space?.name}</Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-paper"><DocIcon type={d.type} className="size-5" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.015em]">{d.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              <StatusPill status={d.status} />
              <span>{d.type}, {d.pages} {d.pageLabel.toLowerCase()}{d.pages === 1 ? '' : 's'}, {bytes(d.sizeBytes)}</span>
              <span>Added by {d.owner?.name} {timeAgo(d.createdAt)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('sources.write') && (
            <Select value={d.visibility} onChange={(e) => update.mutate({ visibility: e.target.value as Doc['visibility'] })} className="w-44" aria-label="Who can retrieve this document">
              <option value="team">Space members</option>
              <option value="organization">Organisation</option>
              <option value="private">Only owner and admins</option>
            </Select>
          )}
          {can('ask') && <Link to="/compare" state={{ docA: d.id }}><Button icon={<GitCompareArrows className="size-4" />}>Compare</Button></Link>}
          {can('ask') && ready && <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => navigate(`/ask?docs=${d.id}&q=${encodeURIComponent(s?.suggestedQuestions[0] ?? `Summarise ${d.title}`)}`)}>Ask this document</Button>}
        </div>
      </header>

      <div className="mb-5 flex items-center justify-between gap-3">
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'summary', label: 'Summary' }, { value: 'reader', label: 'Reader' }, { value: 'passages', label: `Passages${d.processing.chunks ? ` (${d.processing.chunks})` : ''}` }, { value: 'processing', label: 'Processing' },
        ]} />
        {can('sources.write') && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={reprocess.isPending} onClick={() => reprocess.mutate()}>Re-index</Button>
            <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete "${d.title}"?`) && remove.mutate()}>Delete</Button>
          </div>
        )}
      </div>

      {!ready && tab !== 'processing' && (
        <Panel>
          {d.status === 'failed' ? <ErrorNote error={new Error(d.error ?? 'Indexing failed')} /> : (
            <>
              <PanelHeader title="Indexing in progress" sub="The summary and reader appear as soon as this document is ready." />
              <PipelineSteps stages={d.processing.stages} />
            </>
          )}
        </Panel>
      )}

      {ready && tab === 'summary' && s && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Executive summary" action={<Badge tone={s.generatedBy === 'llm' ? 'signal' : 'neutral'}>{s.generatedBy === 'llm' ? 'AI summary' : 'Extractive summary'}</Badge>} />
              <p className="max-w-[70ch] font-serif text-[16px] leading-[1.75] text-fg-2">{s.executive}</p>
            </Panel>
            {!!s.keyTerms.length && (
              <Panel pad={false}>
                <div className="px-5 pb-2 pt-5"><PanelHeader title="Key terms" sub="Extracted from the text. Click a value to see where it came from." /></div>
                <dl className="divide-y divide-line border-t border-line">
                  {s.keyTerms.map((k) => {
                    const c = k.chunkId ? chunkById.get(k.chunkId) : undefined;
                    return (
                      <div key={k.label} className="grid grid-cols-[180px_1fr_auto] items-center gap-4 px-5 py-3">
                        <dt className="text-sm text-fg-muted">{k.label}</dt>
                        <dd className="text-[15px] font-medium text-fg">{k.value}</dd>
                        {k.chunkId && <Link to={`/evidence/${k.chunkId}`} className="text-xs text-signal-ink hover:underline">{d.pageLabel} {k.page}{c ? `, ${c.section}` : ''}</Link>}
                      </div>
                    );
                  })}
                </dl>
              </Panel>
            )}
          </div>
          <div className="space-y-6">
            {!!s.topics.length && (
              <Panel>
                <PanelHeader title="Topics" />
                <div className="flex flex-wrap gap-1.5">
                  {s.topics.map((t) => <Link key={t} to={`/search?q=${encodeURIComponent(t)}&doc=${d.id}`} className="rounded-full border border-line px-3 py-1 text-sm text-fg-2 hover:border-signal/50 hover:text-fg">{t}</Link>)}
                </div>
              </Panel>
            )}
            {can('ask') && (
              <Panel>
                <PanelHeader title="Suggested questions" />
                <ul className="-mx-2">
                  {s.suggestedQuestions.map((q) => (
                    <li key={q}>
                      <button onClick={() => navigate(`/ask?docs=${d.id}&q=${encodeURIComponent(q)}`)} className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-sm text-fg-2 hover:bg-canvas hover:text-fg">
                        <Sparkles className="size-3.5 shrink-0 text-signal" />{q}
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <Panel>
              <PanelHeader title="Index" />
              <dl className="space-y-2 text-sm">
                {[['Passages', d.processing.chunks], ['Average size', `${d.processing.avgTokens} tokens`], ['Embedding model', d.processing.embeddingModel], ['Vector store', d.processing.vectorStore], ['Chunking', d.processing.chunkStrategy], ['Indexed', d.indexedAt ? timeAgo(d.indexedAt) : '—']].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4"><dt className="text-fg-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {ready && tab === 'reader' && (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <nav className="lg:sticky lg:top-0 lg:self-start" aria-label="Sections">
            <p className="mb-2 text-xs font-medium text-fg-muted">Sections</p>
            <ul className="space-y-px">
              {data.sections.map((x) => (
                <li key={x.section + x.page}>
                  <button onClick={() => setPageN(x.page)} className={cx('w-full truncate rounded px-2 py-1.5 text-left text-sm', x.page === pageN ? 'bg-paper font-medium text-fg' : 'text-fg-muted hover:text-fg')}>{x.section}</button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mx-auto w-full max-w-[820px]">
            <div className="mb-3 flex items-center justify-end gap-1 text-sm text-fg-muted">
              <button disabled={pageN <= 1} onClick={() => setPageN(pageN - 1)} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-4" /></button>
              <span className="tabular-nums">{d.pageLabel} {pageN} of {d.pages}</span>
              <button disabled={pageN >= d.pages} onClick={() => setPageN(pageN + 1)} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Next page"><ChevronRight className="size-4" /></button>
            </div>
            {page ? <PageView page={page} label={`${d.title}, ${d.pageLabel.toLowerCase()} ${pageN}`} /> : <div className="flex justify-center py-16"><Spinner /></div>}
          </div>
        </div>
      )}

      {ready && tab === 'passages' && (
        <div className="space-y-2">
          {chunks?.chunks.map((c) => (
            <Link key={c.id} to={`/evidence/${c.id}`} className="block rounded-md border border-line bg-paper px-5 py-4 transition-colors hover:border-line-strong">
              <div className="mb-1.5 flex items-center gap-3 text-xs text-fg-muted">
                <span className="font-mono text-fg-2">#{c.seq}</span>
                <span>{d.pageLabel} {c.page}</span>
                <span className="font-medium text-fg-2">{c.section}</span>
                <span className="ml-auto tabular-nums">~{c.tokens} tokens</span>
              </div>
              <p className="line-clamp-3 font-serif text-[14.5px] leading-relaxed text-fg-2">{c.text}</p>
            </Link>
          ))}
        </div>
      )}

      {tab === 'processing' && (
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Ingestion pipeline" sub={d.processing.ms ? `Completed in ${ms(d.processing.ms)}` : undefined} />
            <PipelineSteps stages={d.processing.stages} />
            {d.error && <div className="mt-5"><ErrorNote error={new Error(d.error)} /></div>}
          </Panel>
          <Panel pad={false}>
            <div className="px-5 pt-5"><PanelHeader title="Event log" /></div>
            <ol className="divide-y divide-line border-t border-line">
              {(d.processing.events ?? []).map((e, i) => (
                <li key={i} className="flex gap-4 px-5 py-2.5 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-fg-muted">{clock(e.at)}</span>
                  <span className={cx(e.level === 'error' ? 'text-bad' : e.level === 'warn' ? 'text-warn' : 'text-fg-2')}>{e.message}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      )}
    </Page>
  );
}
