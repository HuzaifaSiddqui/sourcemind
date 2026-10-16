import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Download, GitCompareArrows, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { ms } from '../lib/format';
import type { Citation, Doc } from '../lib/types';
import { Page } from '../components/Shell';
import { DocIcon } from '../components/Evidence';
import { Button, Empty, ErrorNote, Field, Input, PageHeader, Panel, PanelHeader, Select, Toggle, cx } from '../components/ui';

interface Cell { value: string | null; citation: Citation | null }
interface Row { key: string; label: string; a: Cell; b: Cell; status: 'same' | 'changed' | 'added' | 'removed' }
interface Result { a: { id: string; title: string }; b: { id: string; title: string }; rows: Row[]; differences: number; keyChanges: { label: string; text: string; citations: Citation[] }[]; ms: number }
interface ClauseResult { query: string; a: { doc: { title: string }; passages: (Citation & { text: string })[] }; b: { doc: { title: string }; passages: (Citation & { text: string })[] } }

function CiteLink({ c }: { c: Citation | null }) {
  if (!c) return null;
  return (
    <Link to={`/evidence/${c.chunkId}?q=${encodeURIComponent(c.quote.slice(0, 200))}`} title={`${c.docTitle}, ${c.pageLabel.toLowerCase()} ${c.page} — ${c.section}`}
      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-signal-soft px-1 align-middle text-[10px] font-semibold tabular-nums text-signal-ink hover:bg-signal hover:text-white">
      {c.n}
    </Link>
  );
}

export default function Compare() {
  const loc = useLocation() as { state?: { docA?: string } };
  const navigate = useNavigate();
  const { data: docs } = useQuery({ queryKey: ['documents', 'ready'], queryFn: () => api<{ documents: Doc[] }>('/documents?status=ready') });
  const [a, setA] = useState(loc.state?.docA ?? '');
  const [b, setB] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [clause, setClause] = useState('termination');

  const run = useMutation({ mutationFn: () => api<Result>('/compare', { method: 'POST', json: { docA: a, docB: b } }) });
  const clauses = useMutation({ mutationFn: () => api<ClauseResult>('/compare/clause', { method: 'POST', json: { docA: a, docB: b, query: clause } }) });

  useEffect(() => {
    if (!docs || (a && b)) return;
    const find = (t: string) => docs.documents.find((d) => d.title === t)?.id;
    const da = a || find('Supplier Agreement 2025') || docs.documents[0]?.id || '';
    const db = find('Supplier Agreement 2026') || docs.documents.find((d) => d.id !== da)?.id || '';
    setA(da);
    setB(db === da ? docs.documents.find((d) => d.id !== da)?.id ?? '' : db);
  }, [docs, a, b]);

  useEffect(() => { if (a && b && a !== b && !run.data && !run.isPending) run.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [a, b]);

  const r = run.data;
  const rows = r ? (onlyDiff ? r.rows.filter((x) => x.status !== 'same') : r.rows) : [];

  const exportReport = () => {
    if (!r) return;
    const lines = [`# ${r.a.title} vs ${r.b.title}`, '', `${r.differences} material differences found.`, '', `| Term | ${r.a.title} | ${r.b.title} | Status |`, '|---|---|---|---|',
      ...r.rows.map((x) => `| ${x.label} | ${x.a.value ?? '—'}${x.a.citation ? ` (p${x.a.citation.page})` : ''} | ${x.b.value ?? '—'}${x.b.citation ? ` (p${x.b.citation.page})` : ''} | ${x.status} |`),
      '', '## Key changes', ...r.keyChanges.map((k) => `- ${k.text}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const el = document.createElement('a');
    el.href = url; el.download = `comparison-${r.a.title}-vs-${r.b.title}.md`.replace(/\s+/g, '-'); el.click();
    URL.revokeObjectURL(url);
  };

  const options = docs?.documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>);

  return (
    <Page wide>
      <PageHeader title="Compare documents" sub="Line up the commercial and legal terms of two documents. Every value links to the clause it was read from." />

      <Panel className="mb-6">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr_auto]">
          <Field label="Baseline"><Select value={a} onChange={(e) => { setA(e.target.value); run.reset(); }}>{options}</Select></Field>
          <button onClick={() => { setA(b); setB(a); run.reset(); }} className="mb-1 rounded p-2 text-fg-muted hover:bg-canvas hover:text-fg" aria-label="Swap documents"><ArrowLeftRight className="size-4" /></button>
          <Field label="Compared with"><Select value={b} onChange={(e) => { setB(e.target.value); run.reset(); }}>{options}</Select></Field>
          <Button variant="primary" icon={<GitCompareArrows className="size-4" />} disabled={!a || !b || a === b} loading={run.isPending} onClick={() => run.mutate()}>Compare</Button>
        </div>
      </Panel>
      <ErrorNote error={run.error} />

      {r && (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-lg border border-line bg-paper">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <p className="text-lg font-semibold tracking-[-0.01em]">{r.differences} material {r.differences === 1 ? 'difference' : 'differences'} found</p>
                  <p className="text-xs text-fg-muted">{r.rows.length} terms extracted from both documents in {ms(r.ms)}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-fg-2"><Toggle checked={onlyDiff} onChange={setOnlyDiff} label="Only differences" />Only differences</label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60 text-left text-xs text-fg-muted">
                      <th className="w-[26%] px-5 py-2.5 font-medium">Term</th>
                      <th className="px-5 py-2.5 font-medium"><span className="flex items-center gap-2"><DocIcon type="PDF" className="size-3.5" />{r.a.title}</span></th>
                      <th className="px-5 py-2.5 font-medium"><span className="flex items-center gap-2"><DocIcon type="PDF" className="size-3.5" />{r.b.title}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((x) => {
                      const diff = x.status !== 'same';
                      return (
                        <tr key={x.key} className={cx(diff && 'bg-signal-soft/40')}>
                          <td className={cx('px-5 py-3 text-sm', diff ? 'border-l-2 border-signal font-medium text-fg' : 'border-l-2 border-transparent text-fg-2')}>{x.label}</td>
                          <td className="px-5 py-3 text-[15px] text-fg-2">{x.a.value ?? <span className="text-fg-faint">Not stated</span>}<CiteLink c={x.a.citation} /></td>
                          <td className={cx('px-5 py-3 text-[15px]', diff ? 'font-semibold text-fg' : 'text-fg-2')}>{x.b.value ?? <span className="font-normal text-fg-faint">Not stated</span>}<CiteLink c={x.b.citation} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!r.rows.length && <Empty title="No comparable terms found">These documents don't share contract or policy terms SourceMind can extract. Try comparing a specific clause below.</Empty>}
            </div>

            <Panel>
              <PanelHeader title="Compare a clause" sub="Retrieve the closest passage on a topic from each document and read them side by side." />
              <form onSubmit={(e) => { e.preventDefault(); clauses.mutate(); }} className="mb-4 flex gap-2">
                <Input value={clause} onChange={(e) => setClause(e.target.value)} placeholder="e.g. termination, data retention, liability" />
                <Button type="submit" loading={clauses.isPending} disabled={!clause.trim()}>Compare clauses</Button>
              </form>
              {clauses.data && (
                <div className="grid gap-4 md:grid-cols-2">
                  {[clauses.data.a, clauses.data.b].map((side, i) => (
                    <div key={i} className="rounded-md border border-line bg-canvas p-4">
                      <p className="mb-2 text-xs font-medium text-fg-muted">{side.doc.title}</p>
                      {side.passages[0] ? (
                        <>
                          <p className="text-xs text-fg-muted">{side.passages[0].section}, {side.passages[0].pageLabel.toLowerCase()} {side.passages[0].page}, {Math.round(side.passages[0].relevance * 100)}% relevant</p>
                          <p className="mt-2 font-serif text-[14.5px] leading-[1.7] text-fg-2">{side.passages[0].text}</p>
                        </>
                      ) : <p className="text-sm text-fg-muted">No matching passage.</p>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <aside className="space-y-4">
            <Panel>
              <PanelHeader title="Key changes" />
              {!r.keyChanges.length && <p className="text-sm text-fg-muted">The extracted terms are identical.</p>}
              <ol className="space-y-4">
                {r.keyChanges.map((k, i) => (
                  <li key={k.label} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-canvas text-2xs font-semibold text-fg-2">{i + 1}</span>
                    <div>
                      <p className="text-sm leading-relaxed text-fg">{k.text}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        {k.citations.map((c) => <Link key={c.chunkId} to={`/evidence/${c.chunkId}?q=${encodeURIComponent(c.quote.slice(0, 200))}`} className="text-signal-ink hover:underline">{c.docTitle.replace('Supplier Agreement ', '')}, p{c.page}</Link>)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
            <div className="grid gap-2">
              <Button icon={<Sparkles className="size-4" />} onClick={() => navigate(`/ask?docs=${a},${b}&q=${encodeURIComponent('What changed between these two agreements and what is the commercial impact?')}`)}>Ask a follow-up</Button>
              <Button icon={<Download className="size-4" />} onClick={exportReport}>Export report</Button>
            </div>
          </aside>
        </div>
      )}
    </Page>
  );
}
