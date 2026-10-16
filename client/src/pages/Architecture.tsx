import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { SystemInfo } from '../lib/types';
import { Page } from '../components/Shell';
import { PageHeader, cx } from '../components/ui';

type Step = { title: string; body: string; impl: string; key?: boolean };

function Flow({ title, sub, steps }: { title: string; sub: string; steps: Step[] }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mb-5 mt-0.5 text-sm text-fg-muted">{sub}</p>
      <ol className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={cx('relative rounded-lg border bg-paper p-4', s.key ? 'border-signal ring-2 ring-signal/10' : 'border-line')}>
            <div className="mb-2 flex items-center gap-2.5">
              <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums', s.key ? 'bg-signal text-white' : 'bg-ink text-white')}>{i + 1}</span>
              <h3 className="font-medium">{s.title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-fg-2">{s.body}</p>
            <p className="mt-3 border-t border-line pt-2.5 text-xs text-fg-muted">{s.impl}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Architecture() {
  const { data: sys } = useQuery({ queryKey: ['system'], queryFn: () => api<SystemInfo>('/system') });
  const embed = sys?.embeddingModel ?? 'embedding model';
  const vec = sys?.vectorStore ?? 'vector store';
  return (
    <Page>
      <PageHeader title="How SourceMind answers reliably" sub="Two pipelines: one turns documents into searchable passages, the other turns a question into a cited, checked answer. This is the live configuration of this workspace." />

      <Flow
        title="Ingestion"
        sub="Runs in a background job queue whenever a source is added or re-indexed."
        steps={[
          { title: 'Parse', body: 'Extract text page by page from PDF, Word, Markdown, CSV or a web page, keeping headings.', impl: 'pdf.js, mammoth, HTML readability parser' },
          { title: 'Clean', body: 'Drop running headers, footers and page numbers; detect image-only pages that would need OCR.', impl: 'Repeated-line detection across pages' },
          { title: 'Chunk by section', body: 'Cut at headings so a passage never spans two sections, then split to the target size with overlap.', impl: 'LangChain RecursiveCharacterTextSplitter, section-aware' },
          { title: 'Embed and index', body: 'Embed each passage with its document and section as context; write to vector and keyword indexes.', impl: `${embed} → ${vec} + BM25` },
        ]}
      />

      <Flow
        title="Answering a question"
        sub="Every step is visible on each answer under “How this answer was built”."
        steps={[
          { title: 'Permission filter', body: 'Resolve the documents this person may read from their teams and the space rules — before any search runs.', impl: 'Applied as a filter inside the vector and keyword queries', key: true },
          { title: 'Hybrid retrieval', body: 'Search by meaning and by keywords in parallel, after rewriting the question into a search query.', impl: 'Vector cosine + BM25, fused with reciprocal rank fusion' },
          { title: 'Rerank', body: 'Re-score candidates on concept coverage, semantic similarity and section headings. Too little evidence means no answer.', impl: 'Cross-feature reranker with a minimum-relevance threshold' },
          { title: 'Generate and verify', body: 'Answer only from numbered passages, then validate every citation and measure how much of each sentence its source supports.', impl: sys?.llm ? `${sys.llm} with citation validation` : 'Extractive answers with citation validation (add an LLM key for generated answers)' },
        ]}
      />

      <section className="flex gap-4 rounded-lg border border-line bg-ink p-6 text-white">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-signal" />
        <div>
          <h2 className="text-md font-semibold">Why permissions come first</h2>
          <p className="mt-1 max-w-[75ch] text-sm leading-relaxed text-ink-text">
            Filtering after generation would still let restricted text influence ranking and reach the model. SourceMind narrows the searchable set to the documents a person can open, so a question about salary bands from an engineer is declined, while the same question from People Operations is answered with a citation.
          </p>
        </div>
      </section>
    </Page>
  );
}
