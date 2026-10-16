import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X } from 'lucide-react';
import { api } from '../lib/api';
import { ms, timeAgo } from '../lib/format';
import { Page } from '../components/Shell';
import { DocIcon } from '../components/Evidence';
import { Button, Empty, ErrorNote, Meter, Segmented, Spinner, cx } from '../components/ui';

interface Result {
  chunkId: string; chunkSeq: number; docId: string; docTitle: string; type: any; space: string; spaceColor: string; page: number; pageLabel: string;
  section: string; text: string; highlight: { start: number; end: number }; score: number; vector: number; keyword: number; coverage: number; owner: string; updatedAt: string;
}
interface Facets { spaces: { id: string; name: string; color: string; count: number }[]; types: { id: string; count: number }[]; owners: { id: string; name: string; count: number }[]; tags: { id: string; count: number }[] }
type Mode = 'hybrid' | 'vector' | 'keyword';

function Snippet({ r }: { r: Result }) {
  const { start, end } = r.highlight;
  const from = Math.max(0, start - 140);
  const to = Math.min(r.text.length, end + 140);
  return (
    <p className="font-serif text-[14.5px] leading-[1.7] text-fg-2">
      {from > 0 && '…'}{r.text.slice(from, start)}
      <mark className="rounded-[2px] bg-signal-mark px-0.5 text-fg">{r.text.slice(start, end)}</mark>
      {r.text.slice(end, to)}{to < r.text.length && '…'}
    </p>
  );
}

function FacetGroup({ title, items, selected, toggle }: { title: string; items: { id: string; label: string; count: number; color?: string }[]; selected: string[]; toggle: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <fieldset className="mb-6">
      <legend className="mb-2 text-xs font-medium text-fg-muted">{title}</legend>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1 text-sm hover:bg-paper">
              <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} className="size-3.5 accent-signal" />
              {i.color && <span className="size-2 rounded-full" style={{ background: i.color }} />}
              <span className="flex-1 truncate text-fg-2">{i.label}</span>
              <span className="text-xs tabular-nums text-fg-faint">{i.count}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState<Mode>('hybrid');
  const [spaces, setSpaces] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [since, setSince] = useState('');
  const docScope = params.get('doc');

  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => api<Facets>('/search/facets') });
  const search = useMutation({
    mutationFn: (query: string) => api<{ results: Result[]; stats: { ms: number; candidates: number; vectorHits: number; keywordHits: number; searchedDocs: number; rewrittenQuery: string; mode: Mode } }>('/search', {
      method: 'POST', json: { query, mode, spaceIds: spaces, types, ownerIds: owners, tags, since: since ? new Date(Date.now() - Number(since) * 86400000).toISOString() : undefined, docIds: docScope ? [docScope] : undefined },
    }),
  });

  const run = (query = q) => {
    const t = query.trim();
    if (!t) return;
    if (params.get('q') === t) { search.mutate(t); return; }
    const next = new URLSearchParams(params);
    next.set('q', t);
    setParams(next, { replace: true });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const pq = params.get('q'); if (pq) { setQ(pq); search.mutate(pq); } }, [params.get('q'), mode, spaces, types, owners, tags, since, docScope]);

  const flip = (list: string[], set: (v: string[]) => void) => (id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const data = search.data;

  return (
    <Page wide>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="mb-5">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-paper p-1.5 pl-4 focus-within:border-signal focus-within:ring-2 focus-within:ring-signal/15">
          <SearchIcon className="size-5 text-fg-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by meaning, e.g. agreements where customers can terminate early" className="h-10 flex-1 bg-transparent text-md placeholder:text-fg-faint focus:outline-none" aria-label="Search" />
          <Button type="submit" variant="primary" loading={search.isPending}>Search</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Segmented<Mode> value={mode} onChange={setMode} size="sm" options={[{ value: 'hybrid', label: 'Hybrid' }, { value: 'vector', label: 'Semantic' }, { value: 'keyword', label: 'Keyword' }]} />
          <span className="text-xs text-fg-muted">
            {mode === 'hybrid' ? 'Vector similarity and BM25 combined with rank fusion, then reranked' : mode === 'vector' ? 'Embedding similarity only — finds matches without shared words' : 'BM25 full-text matching only'}
          </span>
          {docScope && <button type="button" onClick={() => { const n = new URLSearchParams(params); n.delete('doc'); setParams(n); }} className="inline-flex items-center gap-1 rounded-full bg-signal-soft px-2.5 py-0.5 text-xs text-signal-ink">One document <X className="size-3" /></button>}
        </div>
      </form>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside>
          <FacetGroup title="Knowledge space" items={(facets?.spaces ?? []).map((s) => ({ id: s.id, label: s.name, count: s.count, color: s.color }))} selected={spaces} toggle={flip(spaces, setSpaces)} />
          <FacetGroup title="Document type" items={(facets?.types ?? []).map((t) => ({ id: t.id, label: t.id, count: t.count }))} selected={types} toggle={flip(types, setTypes)} />
          <FacetGroup title="Owner" items={(facets?.owners ?? []).map((o) => ({ id: o.id, label: o.name, count: o.count }))} selected={owners} toggle={flip(owners, setOwners)} />
          <FacetGroup title="Tags" items={(facets?.tags ?? []).slice(0, 8).map((t) => ({ id: t.id, label: t.id, count: t.count }))} selected={tags} toggle={flip(tags, setTags)} />
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-fg-muted">Added</legend>
            <div className="flex flex-wrap gap-1">
              {[['', 'Any time'], ['7', '7 days'], ['30', '30 days']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSince(v)} className={cx('rounded-full border px-2.5 py-0.5 text-xs', since === v ? 'border-signal bg-signal-soft text-signal-ink' : 'border-line text-fg-2 hover:border-line-strong')}>{l}</button>
              ))}
            </div>
          </fieldset>
        </aside>

        <section aria-live="polite">
          <ErrorNote error={search.error} />
          {search.isPending && !data && <div className="flex justify-center py-16"><Spinner /></div>}
          {!data && !search.isPending && <Empty icon={<SearchIcon className="size-5" />} title="Search across every source you can access">Results match on meaning, not just keywords. Permissions are applied before anything is ranked.</Empty>}
          {data && (
            <>
              <p className="mb-4 text-sm text-fg-muted">
                <span className="font-medium text-fg">{data.results.length} passages</span> from {data.stats.searchedDocs} searchable documents in {ms(data.stats.ms)}
                {data.stats.mode !== 'vector' && <> · keyword query <span className="font-mono text-xs text-fg-2">{data.stats.rewrittenQuery}</span></>}
              </p>
              {!data.results.length && <Empty title="No matching passages">Try different words, switch to semantic search, or clear filters.</Empty>}
              <ol className={cx('space-y-3', search.isPending && 'opacity-60')}>
                {data.results.map((r) => (
                  <li key={r.chunkId}>
                    <Link to={`/evidence/${r.chunkId}?q=${encodeURIComponent(r.text.slice(r.highlight.start, r.highlight.end))}&rel=${r.score}`} className="group block rounded-lg border border-line bg-paper p-5 transition-colors hover:border-line-strong">
                      <div className="mb-2.5 flex items-start gap-3">
                        <DocIcon type={r.type} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-fg group-hover:text-signal-ink">{r.docTitle}</p>
                          <p className="text-xs text-fg-muted">{r.section}, {r.pageLabel.toLowerCase()} {r.page} · <span style={{ color: r.spaceColor }}>{r.space}</span> · {r.owner}, {timeAgo(r.updatedAt)}</p>
                        </div>
                        <div className="w-24 shrink-0 text-right">
                          <p className="text-md font-semibold tabular-nums">{Math.round(r.score * 100)}%</p>
                          <p className="text-2xs text-fg-muted">match</p>
                        </div>
                      </div>
                      <Snippet r={r} />
                      <div className="mt-3 grid max-w-sm grid-cols-3 gap-3 text-2xs text-fg-muted">
                        {[['Semantic', r.vector / 0.35], ['Keyword', r.keyword], ['Coverage', r.coverage]].map(([l, v]) => (
                          <div key={l as string}><p className="mb-1">{l}</p><Meter value={Math.min(1, v as number)} /></div>
                        ))}
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </Page>
  );
}
