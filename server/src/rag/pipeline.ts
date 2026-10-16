import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db, getSettings, nextChunkSeq } from '../store/db.js';
import type { Chunk, Doc, DocStatus, PipelineStage } from '../types.js';
import { bm25 } from './bm25.js';
import { chunkPages, contextualText } from './chunker.js';
import { embedder } from './embeddings.js';
import { summarise } from './enrich.js';
import { parseSource } from './parsers.js';
import { vectorStore } from './vectorStore.js';

export const titleFromFilename = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const niceTitle = (t?: string) => (t && !/[a-z]/.test(t) ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : t);

export const STAGES: { key: PipelineStage['key']; label: string; status: DocStatus }[] = [
  { key: 'upload', label: 'Upload', status: 'uploading' },
  { key: 'parse', label: 'Parse', status: 'parsing' },
  { key: 'ocr', label: 'OCR', status: 'ocr' },
  { key: 'chunk', label: 'Chunk', status: 'chunking' },
  { key: 'embed', label: 'Embed', status: 'embedding' },
  { key: 'index', label: 'Index', status: 'indexing' },
  { key: 'enrich', label: 'Summarise', status: 'indexing' },
];

export function freshProcessing(): Doc['processing'] {
  return {
    chunks: 0, avgTokens: 0, totalTokens: 0, ms: 0,
    embeddingModel: embedder.model,
    chunkStrategy: 'Section-aware recursive',
    vectorStore: vectorStore.name,
    stages: STAGES.map((s) => ({ key: s.key, label: s.label, status: 'pending' as const })),
    events: [],
  };
}

const queue: string[] = [];
let active = 0;
const CONCURRENCY = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function enqueue(docId: string) {
  if (!queue.includes(docId)) queue.push(docId);
  pump();
}

export function queueState() {
  return { queued: queue.length, active };
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const id = queue.shift()!;
    active++;
    process(id)
      .catch((e) => console.error('[pipeline]', e))
      .finally(() => { active--; pump(); });
  }
}

export function idle() {
  return new Promise<void>((resolve) => {
    const t = setInterval(() => { if (!queue.length && !active) { clearInterval(t); resolve(); } }, 50);
  });
}

function log(docId: string, level: 'info' | 'warn' | 'error', message: string) {
  db.docs.update(docId, (d) => ({ processing: { ...d.processing, events: [...d.processing.events, { at: new Date().toISOString(), level, message }] } }));
}

function stage(docId: string, key: PipelineStage['key'], patch: Partial<PipelineStage>) {
  db.docs.update(docId, (d) => ({
    updatedAt: new Date().toISOString(),
    processing: { ...d.processing, stages: d.processing.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) },
  }));
}

async function run<T>(docId: string, key: PipelineStage['key'], fn: () => Promise<{ value: T; detail?: string; skipped?: boolean }>) {
  const meta = STAGES.find((s) => s.key === key)!;
  const startedAt = new Date().toISOString();
  db.docs.update(docId, { status: meta.status });
  stage(docId, key, { status: 'running', startedAt });
  if (config.stageDelayMs) await sleep(config.stageDelayMs);
  const t = Date.now();
  const r = await fn();
  const ms = Date.now() - t + (config.stageDelayMs || 0);
  stage(docId, key, { status: r.skipped ? 'skipped' : 'done', endedAt: new Date().toISOString(), ms, detail: r.detail });
  return r.value;
}

async function process(docId: string) {
  const doc = db.docs.get(docId);
  if (!doc) return;
  const t0 = Date.now();
  const settings = getSettings();
  db.docs.update(docId, { processing: { ...freshProcessing(), events: [] }, error: undefined });
  stage(docId, 'upload', { status: 'done', startedAt: doc.createdAt, endedAt: doc.createdAt, ms: 0, detail: doc.sourceUrl ? 'URL registered' : `${(doc.sizeBytes / 1024).toFixed(0)} KB stored` });
  log(docId, 'info', `Ingestion started for ${doc.filename}`);

  try {
    const parsed = await run(docId, 'parse', async () => {
      const p = await parseSource(doc.type, { path: doc.storagePath, url: doc.sourceUrl });
      const chars = p.pages.reduce((s, pg) => s + pg.text.length, 0);
      if (!chars && !p.needsOcr.length) throw new Error('No extractable text found in source');
      db.pages.insert({ id: docId, pages: p.pages });
      db.docs.update(docId, (d) => ({
        pages: p.pages.length,
        pageLabel: p.pageLabel,
        sizeBytes: p.size ?? d.sizeBytes,
        title: !d.title || (d.title === titleFromFilename(d.filename) && p.title && p.title.length >= 4 && p.title.length <= 90 && d.type !== 'PDF') ? (niceTitle(p.title) || d.title || d.filename) : d.title,
      }));
      return { value: p, detail: `${p.pages.length} ${p.pageLabel.toLowerCase()}s · ${chars.toLocaleString()} characters` };
    });
    log(docId, 'info', `Parsed ${parsed.pages.length} ${parsed.pageLabel.toLowerCase()}s`);

    await run(docId, 'ocr', async () => {
      if (!parsed.needsOcr.length) return { value: null, skipped: true, detail: 'Text layer present — OCR not required' };
      if (parsed.needsOcr.length === parsed.pages.length) {
        throw new Error('Scanned document: no text layer found. Connect an OCR engine (see README) to ingest image-only PDFs.');
      }
      log(docId, 'warn', `${parsed.needsOcr.length} page(s) have no text layer and were skipped: ${parsed.needsOcr.join(', ')}`);
      return { value: null, skipped: true, detail: `${parsed.needsOcr.length} image-only page(s) skipped` };
    });

    const fresh = db.docs.get(docId)!;
    const drafts = await run(docId, 'chunk', async () => {
      const d = await chunkPages(parsed.pages, { chunkTokens: settings.chunkSize, overlapTokens: settings.chunkOverlap, docTitle: fresh.title });
      if (!d.length) throw new Error('Document produced no chunks');
      const sections = new Set(d.map((c) => c.section)).size;
      return { value: d, detail: `${d.length} chunks across ${sections} sections` };
    });

    // replace previous chunks if this is a re-index
    await removeIndex(docId);
    const chunks: Chunk[] = drafts.map((c) => ({ ...c, id: nanoid(16), seq: nextChunkSeq(), docId, spaceId: fresh.spaceId }));
    chunks.forEach((c) => db.chunks.insert(c));
    log(docId, 'info', `Created ${chunks.length} chunks (target ${settings.chunkSize} tokens, overlap ${settings.chunkOverlap})`);

    const vectors = await run(docId, 'embed', async () => {
      const out: number[][] = [];
      for (let i = 0; i < chunks.length; i += 64) {
        out.push(...(await embedder.embed(chunks.slice(i, i + 64).map((c) => contextualText(c, fresh.title)))));
      }
      return { value: out, detail: `${out.length} vectors · ${embedder.model} · ${out[0]?.length ?? 0} dims` };
    });
    log(docId, 'info', `Embedded ${vectors.length} chunks with ${embedder.model}`);

    await run(docId, 'index', async () => {
      await vectorStore.upsert(chunks.map((c, i) => ({ id: c.id, vector: vectors[i], docId, spaceId: c.spaceId })));
      chunks.forEach((c) => bm25.add(c.id, docId, contextualText(c, fresh.title)));
      return { value: null, detail: `${vectorStore.name} + BM25 keyword index` };
    });
    log(docId, 'info', `Indexed into ${vectorStore.name} and BM25`);

    const summary = await run(docId, 'enrich', async () => {
      const s = await summarise(db.docs.get(docId)!, chunks);
      return { value: s, detail: `${s.keyTerms.length} key terms · ${s.topics.length} topics (${s.generatedBy})` };
    });

    const total = chunks.reduce((s, c) => s + c.tokens, 0);
    db.docs.update(docId, (d) => ({
      status: 'ready',
      summary,
      indexedAt: new Date().toISOString(),
      processing: {
        ...d.processing,
        chunks: chunks.length,
        totalTokens: total,
        avgTokens: Math.round(total / chunks.length),
        ms: Date.now() - t0,
      },
    }));
    log(docId, 'info', `Ready in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    db.docs.update(docId, (d) => ({
      status: 'failed',
      error: msg,
      processing: {
        ...d.processing,
        ms: Date.now() - t0,
        stages: d.processing.stages.map((s) => (s.status === 'running' ? { ...s, status: 'failed', endedAt: new Date().toISOString(), detail: msg } : s)),
      },
    }));
    log(docId, 'error', msg);
  }
}

export async function removeIndex(docId: string) {
  bm25.removeDoc(docId);
  await vectorStore.deleteByDoc(docId);
  db.chunks.removeWhere((c) => c.docId === docId);
}

/** Boot: rebuild keyword index, reconcile vectors, resume interrupted jobs. */
export async function bootIndex() {
  const docs = new Map(db.docs.all().map((d) => [d.id, d]));
  const { modelChanged } = await vectorStore.init(embedder.dims, embedder.model);
  for (const c of db.chunks.all()) {
    const d = docs.get(c.docId);
    if (d) bm25.add(c.id, c.docId, contextualText(c, d.title));
  }
  const have = await vectorStore.count();
  const chunks = db.chunks.all();
  if (modelChanged || have < chunks.length) {
    console.log(`[index] embedding ${chunks.length} chunks with ${embedder.model}${modelChanged ? ' (model changed)' : ''}…`);
    for (let i = 0; i < chunks.length; i += 64) {
      const batch = chunks.slice(i, i + 64);
      const vecs = await embedder.embed(batch.map((c) => contextualText(c, docs.get(c.docId)?.title ?? '')));
      await vectorStore.upsert(batch.map((c, j) => ({ id: c.id, vector: vecs[j], docId: c.docId, spaceId: c.spaceId })));
    }
    for (const d of docs.values()) {
      if (d.status === 'ready') db.docs.update(d.id, (x) => ({ processing: { ...x.processing, embeddingModel: embedder.model, vectorStore: vectorStore.name } }));
    }
  }
  for (const d of docs.values()) {
    if (!['ready', 'failed'].includes(d.status)) enqueue(d.id);
  }
}
