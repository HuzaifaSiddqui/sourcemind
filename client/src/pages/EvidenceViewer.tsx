import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff } from 'lucide-react';
import { api, tokenStore } from '../lib/api';
import type { Chunk, Doc, PageText } from '../lib/types';
import { DocIcon, PageView, type Mark } from '../components/Evidence';
import { Badge, Button, ErrorNote, Meter, Spinner, cx, useToast } from '../components/ui';

interface ChunkResp {
  chunk: Chunk; document: Doc; page: PageText;
  prev: { id: string; page: number; section: string } | null;
  next: { id: string; page: number; section: string } | null;
  position: { index: number; total: number };
}

export default function EvidenceViewer() {
  const { chunkId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const quote = params.get('q') ?? '';
  const rel = params.get('rel');
  const n = params.get('n');
  const [context, setContext] = useState(false);
  const [pageN, setPageN] = useState<number | null>(null);

  const { data, error, isLoading } = useQuery({ queryKey: ['chunk', chunkId], queryFn: () => api<ChunkResp>(`/chunks/${chunkId}`) });
  const { data: pages } = useQuery({ queryKey: ['pages', data?.document.id], enabled: !!data, queryFn: () => api<{ pages: PageText[] }>(`/documents/${data!.document.id}/pages`) });
  const { data: chunks } = useQuery({ queryKey: ['chunks', data?.document.id], enabled: !!data && context, queryFn: () => api<{ chunks: Chunk[] }>(`/documents/${data!.document.id}/chunks`) });

  const shownPage = pageN ?? data?.chunk.page ?? 1;
  const page = pages?.pages.find((p) => p.n === shownPage) ?? (shownPage === data?.chunk.page ? data?.page : undefined);

  const marks = useMemo<Mark[]>(() => {
    if (!data || !page) return [];
    const out: Mark[] = [];
    if (context && chunks) {
      chunks.chunks.filter((c) => c.page === page.n && Math.abs(c.seq - data.chunk.seq) === 1).forEach((c) => out.push({ start: c.start, end: c.end, tone: 'passage' }));
    }
    if (page.n === data.chunk.page) {
      out.push({ start: data.chunk.start, end: data.chunk.end, tone: 'passage' });
      const at = quote ? page.text.indexOf(quote) : -1;
      if (at >= 0) out.push({ start: at, end: at + quote.length, tone: 'quote' });
      else out.push({ start: data.chunk.start, end: data.chunk.end, tone: 'quote' });
    }
    return out;
  }, [data, page, quote, context, chunks]);

  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (error || !data) return <div className="p-8"><ErrorNote error={error ?? new Error('Passage not found')} /></div>;
  const d = data.document;

  const copy = () => {
    navigator.clipboard?.writeText(`"${quote || data.chunk.text.slice(0, 200)}" — ${d.title}, ${d.pageLabel.toLowerCase()} ${data.chunk.page}, ${data.chunk.section}`);
    toast('Citation copied');
  };
  const download = async () => {
    const res = await fetch(`/api/documents/${d.id}/file`, { headers: { authorization: `Bearer ${tokenStore.get()}` } });
    if (!res.ok) return toast('Original file is not available', 'bad');
    if (res.redirected) { window.open(res.url, '_blank'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = d.filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-paper px-4">
          <button onClick={() => navigate(-1)} className="rounded p-1.5 text-fg-muted hover:bg-canvas hover:text-fg" aria-label="Back"><ArrowLeft className="size-4" /></button>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
            <Link to={`/documents?space=${d.spaceId}`} className="truncate text-fg-muted hover:text-fg">{d.space?.name}</Link>
            <span className="text-fg-faint">/</span>
            <Link to={`/documents/${d.id}`} className="truncate font-medium hover:text-signal-ink">{d.title}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1 text-xs text-fg-muted">
            <button disabled={shownPage <= 1} onClick={() => setPageN(shownPage - 1)} className="rounded p-1 hover:bg-canvas disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <span className="tabular-nums">{d.pageLabel} {shownPage} of {d.pages}</span>
            <button disabled={shownPage >= d.pages} onClick={() => setPageN(shownPage + 1)} className="rounded p-1 hover:bg-canvas disabled:opacity-30" aria-label="Next page"><ChevronRight className="size-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-[820px]">
            {page ? <PageView page={page} label={`${d.title}, ${d.pageLabel.toLowerCase()} ${page.n}`} marks={marks} scrollKey={`${chunkId}-${page.n}-${context}`} /> : <div className="flex justify-center py-20"><Spinner /></div>}
          </div>
        </div>
      </section>

      <aside className="w-full shrink-0 border-l border-line bg-paper lg:w-[360px]">
        <div className="border-b border-line px-5 py-4">
          <p className="text-xs text-fg-muted">{n ? `Citation ${n}` : 'Passage'}</p>
          <div className="mt-1.5 flex items-start gap-2.5">
            <DocIcon type={d.type} className="mt-0.5" />
            <p className="font-medium leading-snug">{d.title}</p>
          </div>
        </div>
        <dl className="space-y-3 border-b border-line px-5 py-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-fg-muted">{d.pageLabel}</dt><dd className="font-medium tabular-nums">{data.chunk.page}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-fg-muted">Section</dt><dd className="text-right font-medium">{data.chunk.section}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-fg-muted">Passage</dt><dd className="font-mono tabular-nums">#{data.chunk.seq}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-fg-muted">Size</dt><dd className="tabular-nums">~{data.chunk.tokens} tokens</dd></div>
          {rel && (
            <div>
              <div className="mb-1.5 flex justify-between gap-4"><dt className="text-fg-muted">Retrieval relevance</dt><dd className="font-medium tabular-nums">{Math.round(Number(rel) * 100)}%</dd></div>
              <Meter value={Number(rel)} tone={Number(rel) >= 0.7 ? 'ok' : Number(rel) >= 0.5 ? 'warn' : 'bad'} />
            </div>
          )}
          <div className="flex justify-between gap-4"><dt className="text-fg-muted">Indexed with</dt><dd className="text-right text-fg-2">{d.processing.embeddingModel}</dd></div>
        </dl>
        <div className="space-y-2 border-b border-line px-5 py-4">
          <Button className="w-full" icon={<Download className="size-4" />} onClick={download}>Open original document</Button>
          <Button className="w-full" icon={<Copy className="size-4" />} onClick={copy}>Copy citation</Button>
          <Button className="w-full" variant={context ? 'dark' : 'secondary'} icon={context ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={() => setContext(!context)}>
            {context ? 'Hide surrounding context' : 'View surrounding context'}
          </Button>
        </div>
        <div className="px-5 py-4">
          <p className="mb-2 text-xs text-fg-muted">Passage {data.position.index} of {data.position.total} in this document</p>
          <div className="grid grid-cols-2 gap-2">
            {[data.prev, data.next].map((x, i) => (
              <button
                key={i} disabled={!x} onClick={() => x && navigate(`/evidence/${x.id}`)}
                className={cx('rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-line-strong disabled:opacity-40', i === 1 && 'text-right')}
              >
                <span className="block text-2xs text-fg-muted">{i === 0 ? 'Previous' : 'Next'}</span>
                <span className="block truncate text-xs font-medium">{x ? x.section : '—'}</span>
              </button>
            ))}
          </div>
          {d.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
        </div>
      </aside>
    </div>
  );
}
