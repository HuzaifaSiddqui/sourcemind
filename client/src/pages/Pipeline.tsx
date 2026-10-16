import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clock, compact, ms, timeAgo } from '../lib/format';
import type { Chunk, Doc, Settings, SystemInfo } from '../lib/types';
import { Page } from '../components/Shell';
import { DocIcon } from '../components/Evidence';
import { PipelineSteps } from '../components/PipelineSteps';
import { Button, ErrorNote, PageHeader, Panel, PanelHeader, Segmented, StatusPill, cx } from '../components/ui';
import { UploadDialog } from '../components/UploadDialog';

interface Resp { documents: Doc[]; totals: { chunks: number; tokens: number; avgMs: number; failed: number }; settings: Settings; system: SystemInfo; queue: { queued: number; active: number } }

export default function Pipeline() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'processing' | 'failed'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const { data } = useQuery({
    queryKey: ['pipeline'], queryFn: () => api<Resp>('/pipeline'),
    refetchInterval: (q) => ((q.state.data as Resp | undefined)?.documents.some((d) => !['ready', 'failed'].includes(d.status)) ? 800 : 8000),
  });
  const docs = (data?.documents ?? []).filter((d) => filter === 'all' || (filter === 'failed' ? d.status === 'failed' : !['ready', 'failed'].includes(d.status)));
  useEffect(() => {
    if (!data) return;
    if (!sel || !data.documents.some((d) => d.id === sel)) {
      const pref = data.documents.find((d) => !['ready', 'failed'].includes(d.status)) ?? data.documents.find((d) => d.title.includes('Handbook')) ?? data.documents[0];
      setSel(pref?.id ?? null);
    }
  }, [data, sel]);
  const d = data?.documents.find((x) => x.id === sel);
  const { data: chunks } = useQuery({ queryKey: ['chunks', d?.id, d?.status], enabled: d?.status === 'ready', queryFn: () => api<{ chunks: Chunk[] }>(`/documents/${d!.id}/chunks`) });
  const reprocess = useMutation({ mutationFn: (id: string) => api(`/documents/${id}/reprocess`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }) });
  const sample = chunks?.chunks.find((c) => c.tokens > 40) ?? chunks?.chunks[0];

  return (
    <Page wide>
      <PageHeader
        title="Indexing pipeline"
        sub="How each source becomes searchable: parsed, cleaned, chunked by section, embedded and written to the vector and keyword indexes."
        actions={can('sources.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUpload(true)}>Add sources</Button>}
      />

      {data && (
        <section className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-paper md:grid-cols-5">
          {[
            ['Indexed passages', compact(data.totals.chunks)], ['Tokens embedded', compact(data.totals.tokens)], ['Avg. time per document', ms(data.totals.avgMs)],
            ['Queue', data.queue.active + data.queue.queued ? `${data.queue.active} running, ${data.queue.queued} waiting` : 'Idle'], ['Failed', data.totals.failed],
          ].map(([l, v], i) => (
            <div key={l as string} className={cx('px-5 py-3.5', i > 0 && 'md:border-l md:border-line', i > 1 && 'max-md:border-t max-md:border-line')}>
              <p className="text-xl font-semibold tabular-nums tracking-[-0.01em]">{v}</p>
              <p className="text-xs text-fg-muted">{l}</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-lg border border-line bg-paper">
          <div className="border-b border-line p-3"><Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'processing', label: 'Processing' }, { value: 'failed', label: 'Failed' }]} /></div>
          <ul className="max-h-[640px] overflow-y-auto p-1.5">
            {docs.map((x) => (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} className={cx('flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left', sel === x.id ? 'bg-signal-soft' : 'hover:bg-canvas')}>
                  <DocIcon type={x.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{x.title}</span>
                    <span className="block text-xs text-fg-muted">{x.status === 'ready' ? `${x.processing.chunks} passages, ${ms(x.processing.ms)}` : timeAgo(x.updatedAt)}</span>
                  </span>
                  <StatusPill status={x.status} />
                </button>
              </li>
            ))}
            {data && !docs.length && <li className="px-3 py-8 text-center text-sm text-fg-muted">Nothing here.</li>}
          </ul>
        </aside>

        {d && (
          <div className="min-w-0 space-y-6">
            <Panel>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <DocIcon type={d.type} className="mt-1 size-5" />
                  <div>
                    <Link to={`/documents/${d.id}`} className="text-lg font-semibold tracking-[-0.01em] hover:text-signal-ink">{d.filename.startsWith('http') ? d.title : d.filename}</Link>
                    <p className="text-sm text-fg-muted">{d.pages} {d.pageLabel.toLowerCase()}{d.pages === 1 ? '' : 's'} · {d.space?.name} · added {timeAgo(d.createdAt)}</p>
                  </div>
                </div>
                {can('sources.write') && <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={reprocess.isPending} onClick={() => reprocess.mutate(d.id)}>Re-index</Button>}
              </div>
              <PipelineSteps stages={d.processing.stages} />
              {d.error && <div className="mt-5"><ErrorNote error={new Error(d.error)} /></div>}
              <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
                {[
                  ['Passages', d.processing.chunks || '—'], ['Avg. passage', d.processing.avgTokens ? `${d.processing.avgTokens} tokens` : '—'], ['Processing time', d.processing.ms ? ms(d.processing.ms) : '—'],
                  ['Chunking', d.processing.chunkStrategy], ['Vector index', d.processing.vectorStore], ['Embedding model', d.processing.embeddingModel],
                ].map(([k, v]) => (
                  <div key={k as string} className="bg-paper px-4 py-3">
                    <dt className="text-xs text-fg-muted">{k}</dt>
                    <dd className="mt-0.5 truncate text-sm font-medium" title={String(v)}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel pad={false}>
                <div className="px-5 pt-5"><PanelHeader title="Processing events" /></div>
                <ol className="max-h-[360px] overflow-y-auto border-t border-line">
                  {d.processing.stages.filter((s) => s.detail).map((s) => (
                    <li key={s.key} className="flex gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
                      <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-fg-muted" title={s.endedAt}>{s.endedAt ? (Date.now() - new Date(s.endedAt).getTime() > 86400000 ? timeAgo(s.endedAt) : clock(s.endedAt)) : ''}</span>
                      <span className="w-20 shrink-0 font-medium text-fg">{s.label}</span>
                      <span className={cx('min-w-0 text-fg-2', s.status === 'failed' && 'text-bad')}>{s.detail}</span>
                    </li>
                  ))}
                  {(d.processing.events ?? []).filter((e) => e.level !== 'info').map((e, i) => (
                    <li key={i} className={cx('flex gap-3 border-b border-line px-5 py-2.5 text-sm', e.level === 'error' ? 'text-bad' : 'text-warn')}>
                      <span className="w-16 shrink-0 font-mono text-xs tabular-nums">{clock(e.at)}</span><span>{e.message}</span>
                    </li>
                  ))}
                </ol>
              </Panel>

              <Panel>
                <PanelHeader title="Sample passage" sub="What gets embedded: the passage text plus its document and section context." />
                {sample ? (
                  <div className="rounded-md border border-line">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line bg-canvas/70 px-4 py-2.5 text-xs">
                      <dt className="text-fg-muted">Passage</dt><dd className="text-right font-mono">#{sample.seq}</dd>
                      <dt className="text-fg-muted">{d.pageLabel}</dt><dd className="text-right tabular-nums">{sample.page}</dd>
                      <dt className="text-fg-muted">Section</dt><dd className="truncate text-right">{sample.section}</dd>
                      <dt className="text-fg-muted">Size</dt><dd className="text-right tabular-nums">~{sample.tokens} tokens, chars {sample.start}–{sample.end}</dd>
                    </dl>
                    <p className="whitespace-pre-line px-4 py-3 font-serif text-[14px] leading-[1.7] text-fg-2">{sample.text}</p>
                    <Link to={`/evidence/${sample.id}`} className="block border-t border-line px-4 py-2 text-xs text-signal-ink hover:underline">Open in evidence viewer</Link>
                  </div>
                ) : <p className="text-sm text-fg-muted">Available once indexing completes.</p>}
              </Panel>
            </div>

            {data && (
              <p className="text-xs text-fg-muted">
                Current settings: target {data.settings.chunkSize} tokens per passage with {data.settings.chunkOverlap} tokens of overlap.{' '}
                {can('ai.configure') && <Link to="/settings" className="text-signal-ink hover:underline">Change in settings</Link>}
              </p>
            )}
          </div>
        )}
      </div>
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
    </Page>
  );
}
