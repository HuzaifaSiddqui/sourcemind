import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Settings, SystemInfo } from '../lib/types';
import { Page } from '../components/Shell';
import { Badge, Button, ErrorNote, PageHeader, Panel, PanelHeader, Segmented, Toggle, useToast } from '../components/ui';

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-3 border-t border-line py-4 first:border-0 first:pt-0 md:grid-cols-[1fr_300px]">
      <div><p className="text-sm font-medium">{label}</p><p className="mt-0.5 max-w-[56ch] text-xs text-fg-muted">{hint}</p></div>
      <div className="md:justify-self-end">{children}</div>
    </div>
  );
}

function Range({ value, min, max, step, onChange, format, disabled }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; disabled?: boolean }) {
  return (
    <span className="flex w-[300px] items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-signal" />
      <span className="w-16 text-right text-sm font-medium tabular-nums">{format(value)}</span>
    </span>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const editable = can('ai.configure');
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings; system: SystemInfo }>('/settings') });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  const save = useMutation({
    mutationFn: () => api<{ reindexRequired: boolean }>('/settings', { method: 'PATCH', json: s }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['system'] });
      toast(r.reindexRequired ? 'Saved — re-index documents to apply the new chunk size' : 'Settings saved');
    },
  });
  if (!s || !data) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const sys = data.system;

  return (
    <Page>
      <PageHeader
        title="Settings"
        sub="Retrieval and generation behaviour for the whole workspace. Measure the effect of any change in the Quality center."
        actions={editable && <><Button disabled={!dirty} onClick={() => setS(data.settings)}>Reset</Button><Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button></>}
      />
      {!editable && <p className="mb-4 rounded-md border border-line bg-paper px-4 py-3 text-sm text-fg-muted">Only owners and admins can change these settings.</p>}
      <ErrorNote error={save.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Retrieval" />
            <Row label="Strategy" hint="Hybrid combines vector similarity with BM25 keyword scores using reciprocal rank fusion.">
              <Segmented value={s.strategy} onChange={(v) => editable && set('strategy', v)} options={[{ value: 'hybrid', label: 'Hybrid' }, { value: 'vector', label: 'Vector' }, { value: 'keyword', label: 'Keyword' }]} />
            </Row>
            <Row label="Semantic weight" hint="How much the vector ranking counts in hybrid fusion. 0.5 weighs both equally.">
              <Range value={s.hybridAlpha} min={0} max={1} step={0.05} onChange={(v) => set('hybridAlpha', v)} format={(v) => v.toFixed(2)} disabled={!editable || s.strategy !== 'hybrid'} />
            </Row>
            <Row label="Rerank candidates" hint="Re-scores fused candidates on concept coverage, semantic similarity and section headings.">
              <Toggle checked={s.rerank} onChange={(v) => set('rerank', v)} disabled={!editable} label="Rerank" />
            </Row>
            <Row label="Query rewrite" hint="Strips question scaffolding and adds domain synonyms to the keyword query.">
              <Toggle checked={s.queryRewrite} onChange={(v) => set('queryRewrite', v)} disabled={!editable} label="Query rewrite" />
            </Row>
            <Row label="Candidate pool" hint="Passages retrieved from each index before fusion.">
              <Range value={s.candidatePool} min={10} max={100} step={5} onChange={(v) => set('candidatePool', v)} format={String} disabled={!editable} />
            </Row>
            <Row label="Passages sent to the answer" hint="Top passages used as context and available as citations.">
              <Range value={s.topK} min={2} max={12} step={1} onChange={(v) => set('topK', v)} format={String} disabled={!editable} />
            </Row>
          </Panel>

          <Panel>
            <PanelHeader title="Answering" />
            <Row label="Minimum relevance to answer" hint="Below this, SourceMind declines instead of guessing. Raise it to reduce wrong answers, lower it to answer more often.">
              <Range value={s.minRelevance} min={0.2} max={0.8} step={0.01} onChange={(v) => set('minRelevance', v)} format={(v) => `${Math.round(v * 100)}%`} disabled={!editable} />
            </Row>
            <Row label="Generate answers with an LLM" hint={sys.llmConfigured ? 'When off, answers are extracted verbatim from the top passages.' : 'Add OPENAI_API_KEY on the server to enable. Until then answers are extractive.'}>
              <Toggle checked={s.useLlm && sys.llmConfigured} onChange={(v) => set('useLlm', v)} disabled={!editable || !sys.llmConfigured} label="Use LLM" />
            </Row>
          </Panel>

          <Panel>
            <PanelHeader title="Chunking" sub="Applies to documents indexed after saving. Re-index existing documents from the pipeline." />
            <Row label="Target passage size" hint="Smaller passages give more precise citations; larger ones carry more context.">
              <Range value={s.chunkSize} min={80} max={800} step={10} onChange={(v) => set('chunkSize', v)} format={(v) => `${v} tok`} disabled={!editable} />
            </Row>
            <Row label="Overlap" hint="Tokens repeated between neighbouring passages so sentences are not cut off.">
              <Range value={s.chunkOverlap} min={0} max={200} step={5} onChange={(v) => set('chunkOverlap', v)} format={(v) => `${v} tok`} disabled={!editable} />
            </Row>
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="Stack" />
          <dl className="space-y-3 text-sm">
            {[
              ['Answers', sys.llm ? <Badge tone="ok">{sys.llm}</Badge> : <Badge>Extractive</Badge>],
              ['Embeddings', sys.embeddingModel], ['Vector store', sys.vectorStore], ['Keyword index', 'BM25 (in-process)'],
              ['Application data', sys.store], ['Indexed passages', sys.chunks.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k as string} className="flex items-center justify-between gap-4"><dt className="text-fg-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">Providers are set with environment variables on the server: OPENAI_API_KEY, QDRANT_URL and MONGODB_URI.</p>
        </Panel>
      </div>
    </Page>
  );
}
