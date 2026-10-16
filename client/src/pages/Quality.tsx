import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleAlert, FlaskConical, Info, Play, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime, ms, pct } from '../lib/format';
import type { Doc, EvalRun } from '../lib/types';
import { Page } from '../components/Shell';
import { Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Panel, PanelHeader, Select, cx, td, th, useToast } from '../components/ui';

interface Resp {
  runs: (Omit<EvalRun, 'results'> & { cases: number; warnings: number })[];
  latest: EvalRun | null;
  cases: { id: string; question: string; expectedDocId: string | null; expectedPage: number | null; expectedDoc: string | null }[];
}

const METRICS: { key: keyof EvalRun['metrics']; label: string; help: string }[] = [
  { key: 'groundedness', label: 'Groundedness', help: 'Share of answer content supported by the passages it cites' },
  { key: 'citationCoverage', label: 'Citation coverage', help: 'Share of answer sentences carrying a valid citation' },
  { key: 'retrievalHitRate', label: 'Retrieval hit rate', help: 'Expected page found in the top 5 passages' },
  { key: 'answerRelevance', label: 'Answer relevance', help: 'Share of question concepts the answer addresses' },
  { key: 'noAnswerAccuracy', label: 'No-answer accuracy', help: 'Unanswerable questions correctly declined' },
];

const TONE = { PASS: 'ok', WARN: 'warn', FAIL: 'bad' } as const;

function AddCase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['documents', 'ready'], queryFn: () => api<{ documents: Doc[] }>('/documents?status=ready'), enabled: open });
  const [question, setQuestion] = useState('');
  const [doc, setDoc] = useState('');
  const [page, setPage] = useState('');
  const save = useMutation({
    mutationFn: () => api('/quality/cases', { method: 'POST', json: { question, expectedDocId: doc || null, expectedPage: page || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality'] }); setQuestion(''); setDoc(''); setPage(''); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Add a test question"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!question.trim()} loading={save.isPending} onClick={() => save.mutate()}>Add question</Button></>}>
      <div className="space-y-4">
        <Field label="Question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is the notice period for termination?" /></Field>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Expected source" hint="Choose none to test that SourceMind declines.">
            <Select value={doc} onChange={(e) => setDoc(e.target.value)}>
              <option value="">None — should decline</option>
              {data?.documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
          </Field>
          <Field label="Page"><Input type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} disabled={!doc} /></Field>
        </div>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

export default function Quality() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [strategy, setStrategy] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const { data } = useQuery({ queryKey: ['quality'], queryFn: () => api<Resp>('/quality') });
  const run = useMutation({
    mutationFn: () => api<{ run: EvalRun }>('/quality/run', { method: 'POST', json: strategy ? { strategy, rerank: strategy === 'hybrid', label: { hybrid: 'Hybrid + rerank', vector: 'Vector only', keyword: 'Keyword only (BM25)' }[strategy] } : {} }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['quality'] }); toast(`Evaluation finished: ${pct(r.run.metrics.passRate, 0)} passed`); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/quality/cases/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['quality'] }) });

  const latest = data?.latest;
  const prev = data && data.runs.length > 1 ? data.runs[data.runs.length - 2] : null;
  const trend = useMemo(() => (data?.runs ?? []).map((r, i) => ({
    name: `${i + 1}. ${r.label}`, short: `Run ${i + 1}`,
    ...Object.fromEntries(METRICS.map((m) => [m.label, Math.round(r.metrics[m.key] * 1000) / 10])),
    'Pass rate': Math.round(r.metrics.passRate * 1000) / 10,
  })), [data]);
  const strategies = useMemo(() => {
    const by = new Map<string, Resp['runs'][number]>();
    (data?.runs ?? []).forEach((r) => by.set(r.label, r));
    return [...by.values()].map((r) => ({ name: r.label, 'Hit rate': Math.round(r.metrics.retrievalHitRate * 100), 'Precision@5': Math.round(r.metrics.retrievalPrecision * 100), 'Pass rate': Math.round(r.metrics.passRate * 100) }));
  }, [data]);

  const issues = latest?.results.filter((r) => r.result !== 'PASS') ?? [];
  const rows = (latest?.results ?? []).filter((r) => filter === 'all' || r.result !== 'PASS');
  const delta = latest && prev ? latest.metrics.passRate - prev.metrics.passRate : 0;
  const best = [...(data?.runs ?? [])].sort((a, b) => b.metrics.passRate - a.metrics.passRate || b.metrics.retrievalPrecision - a.metrics.retrievalPrecision)[0];

  return (
    <Page wide>
      <PageHeader
        title="Quality center"
        sub="SourceMind is evaluated against a labelled question set: does it find the right passage, cite it, stay grounded, and decline when the answer isn't there?"
        actions={can('quality.run') && (
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add question</Button>
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="w-44" aria-label="Retrieval strategy">
              <option value="">Current settings</option>
              <option value="hybrid">Hybrid + rerank</option>
              <option value="vector">Vector only</option>
              <option value="keyword">Keyword only</option>
            </Select>
            <Button variant="primary" icon={<Play className="size-4" />} loading={run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Evaluating' : 'Run evaluation'}</Button>
          </>
        )}
      />
      <ErrorNote error={run.error} />

      {latest && (
        <>
          <section className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-paper md:grid-cols-5">
            {METRICS.map((m, i) => {
              const v = latest.metrics[m.key];
              const d = prev ? v - prev.metrics[m.key] : 0;
              return (
                <div key={m.key} className={cx('px-5 py-4', i > 0 && 'md:border-l md:border-line', i > 1 && 'max-md:border-t max-md:border-line')} title={m.help}>
                  <p className="text-[28px] font-semibold leading-9 tracking-[-0.02em] tabular-nums">{pct(v)}</p>
                  <p className="text-sm font-medium text-fg-2">{m.label}</p>
                  <p className={cx('mt-0.5 text-xs tabular-nums', d > 0.0005 ? 'text-ok' : d < -0.0005 ? 'text-bad' : 'text-fg-muted')}>
                    {prev ? (Math.abs(d) < 0.0005 ? 'No change' : `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pts vs previous`) : m.help}
                  </p>
                </div>
              );
            })}
          </section>

          <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_340px]">
            <Panel>
              <PanelHeader title="Quality across evaluation runs" sub={`${data!.runs.length} runs on ${latest.results.length} questions`} />
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#E3E7EF" vertical={false} />
                    <XAxis dataKey="short" tick={{ fontSize: 11, fill: '#667085' }} tickLine={false} axisLine={{ stroke: '#E3E7EF' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E3E7EF', fontSize: 12 }} labelFormatter={(_, p) => (p?.[0]?.payload as { name?: string })?.name ?? ''} formatter={(v) => `${v}%`} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="Pass rate" stroke="#0B1020" strokeWidth={2.2} dot={{ r: 3 }} />
                    <Line dataKey="Retrieval hit rate" stroke="#5B7CFF" strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="Answer relevance" stroke="#14B8A6" strokeWidth={1.6} dot={false} />
                    <Line dataKey="No-answer accuracy" stroke="#C77A07" strokeWidth={1.6} dot={false} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Quality insights" />
              <ul className="space-y-4 text-sm">
                {issues.length > 0 && (
                  <li className="flex gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                    <span><span className="font-medium">{issues.length} {issues.length === 1 ? 'question needs' : 'questions need'} retrieval tuning.</span> <span className="text-fg-muted">{issues.slice(0, 2).map((i) => `"${i.question}"`).join(', ')}</span></span>
                  </li>
                )}
                {prev && (
                  <li className="flex gap-3">{delta >= 0 ? <TrendingUp className="mt-0.5 size-4 shrink-0 text-ok" /> : <TrendingDown className="mt-0.5 size-4 shrink-0 text-bad" />}
                    <span><span className="font-medium">{Math.abs(delta) < 0.0005 ? 'Pass rate unchanged' : `Pass rate ${delta > 0 ? 'improved' : 'dropped'} ${Math.abs(delta * 100).toFixed(1)} points`}</span> <span className="text-fg-muted">{prev.label} → {latest.label}.</span></span>
                  </li>
                )}
                {best && (
                  <li className="flex gap-3"><FlaskConical className="mt-0.5 size-4 shrink-0 text-signal" />
                    <span><span className="font-medium">Best configuration: {best.label}.</span> <span className="text-fg-muted">{pct(best.metrics.passRate, 0)} pass rate, {pct(best.metrics.retrievalPrecision, 0)} precision@5.</span></span>
                  </li>
                )}
                {latest.mode === 'extractive' && (
                  <li className="flex gap-3"><Info className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                    <span className="text-fg-muted">Answers are extractive (no LLM key), so groundedness is high by construction. Add an API key to evaluate generated answers.</span>
                  </li>
                )}
                <li className="flex gap-3"><Info className="mt-0.5 size-4 shrink-0 text-fg-muted" /><span className="text-fg-muted">Average latency {ms(latest.metrics.avgLatencyMs)} per question, last run {dateTime(latest.createdAt)}.</span></li>
              </ul>
            </Panel>
          </div>

          {strategies.length > 1 && (
            <Panel className="mb-6">
              <PanelHeader title="Retrieval strategy comparison" sub="Same questions, different retrieval. Hybrid search with reranking should lead on precision." />
              <div className="h-[220px]">
                <ResponsiveContainer>
                  <BarChart data={strategies} margin={{ top: 5, right: 8, left: -18, bottom: 0 }} barGap={3}>
                    <CartesianGrid stroke="#E3E7EF" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#667085' }} tickLine={false} axisLine={{ stroke: '#E3E7EF' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip cursor={{ fill: '#F4F6FA' }} contentStyle={{ borderRadius: 8, border: '1px solid #E3E7EF', fontSize: 12 }} formatter={(v) => `${v}%`} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Pass rate" fill="#0B1020" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Hit rate" fill="#5B7CFF" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Precision@5" fill="#B8C6FF" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h2 className="text-md font-semibold">Test questions</h2>
                <p className="text-xs text-fg-muted">Latest run: {latest.label}, {latest.results.filter((r) => r.result === 'PASS').length} of {latest.results.length} passed</p>
              </div>
              <div className="flex gap-1">
                {(['all', 'issues'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cx('rounded px-2.5 py-1 text-xs font-medium', filter === f ? 'bg-canvas text-fg' : 'text-fg-muted hover:text-fg')}>{f === 'all' ? 'All' : `Needs attention (${issues.length})`}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-line bg-canvas/60"><tr>
                  <th className={th}>Question</th><th className={th}>Expected source</th><th className={th}>Retrieved</th><th className={cx(th, 'text-right')}>Evidence</th><th className={cx(th, 'text-right')}>Grounded</th><th className={th}>Result</th><th className="w-8" />
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.caseId}>
                      <td className={cx(td, 'max-w-[340px] font-medium text-fg')}>{r.question}</td>
                      <td className={td}>{r.expected}</td>
                      <td className={cx(td, r.result !== 'PASS' && 'text-fg-muted')}>{r.retrieved}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{r.evidence ? pct(r.evidence, 0) : '—'}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{r.refused ? '—' : pct(r.groundedness, 0)}</td>
                      <td className={td}><span title={r.reason}><Badge tone={TONE[r.result]}>{r.result}</Badge></span><p className="mt-1 max-w-[220px] text-2xs text-fg-muted">{r.reason}</p></td>
                      <td className="pr-3">{can('quality.run') && <button onClick={() => confirm('Remove this test question?') && remove.mutate(r.caseId)} className="rounded p-1 text-fg-faint hover:text-bad" aria-label="Remove question"><Trash2 className="size-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <AddCase open={adding} onClose={() => setAdding(false)} />
    </Page>
  );
}
