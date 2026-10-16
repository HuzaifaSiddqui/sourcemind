import { db, getSettings } from '../store/db.js';
import { accessibleDocIds } from '../auth/access.js';
import type { Chunk, Doc, Settings, User } from '../types.js';
import { bm25 } from './bm25.js';
import { contextualText } from './chunker.js';
import { embedder, LocalHashEmbedder } from './embeddings.js';
import { vectorStore } from './vectorStore.js';
import { clamp, conceptSet, concepts, coverage, round, tokenize } from './text.js';

export interface Retrieved {
  chunk: Chunk;
  doc: Doc;
  score: number;      // final relevance in [0,1]
  vector: number;     // raw cosine
  keyword: number;    // bm25 normalised to the best candidate
  coverage: number;   // fraction of query concepts present
  fused: number;      // reciprocal-rank-fusion score
}

export interface RetrieveOptions {
  docIds?: string[];
  spaceIds?: string[];
  strategy?: Settings['strategy'];
  topK?: number;
  rerank?: boolean;
  alpha?: number;
  pool?: number;
}

export interface RetrieveResult {
  results: Retrieved[];
  rewrittenQuery: string;
  allowedDocs: number;
  candidates: number;
  vectorHits: number;
  keywordHits: number;
  ms: number;
}

const QUESTION_NOISE = /\b(what|which|who|whom|whose|when|where|why|how|is|are|do|does|did|can|could|should|would|our|we|us|the|a|an|please|tell me|show me|explain|describe|there|any)\b/gi;

/** Light query rewrite: strip question scaffolding and add domain synonyms for the keyword leg. */
export function rewriteQuery(q: string) {
  const core = q.replace(/[?!]/g, ' ').replace(QUESTION_NOISE, ' ').replace(/\s+/g, ' ').trim();
  const extra = new Set<string>();
  const vocab: Record<string, string[]> = {
    terminat: ['cancel', 'termination'], cancel: ['termination', 'terminate'], salary: ['compensation', 'band'],
    leave: ['holiday', 'annual leave'], vacation: ['annual leave', 'holiday'], pay: ['payment', 'invoice'],
    late: ['overdue', 'interest'], breach: ['incident', 'notification'], renew: ['renewal', 'term'],
    liability: ['cap', 'limitation'], remote: ['hybrid', 'home'], price: ['fees', 'pricing'], uptime: ['availability', 'sla'],
    data: ['retention', 'deletion'], early: ['convenience', 'before'],
  };
  for (const w of tokenize(core)) {
    for (const [k, adds] of Object.entries(vocab)) if (w.startsWith(k)) adds.forEach((a) => extra.add(a));
  }
  return extra.size ? `${core} ${[...extra].join(' ')}` : core;
}

export async function retrieve(user: User, query: string, opts: RetrieveOptions = {}): Promise<RetrieveResult> {
  const t0 = Date.now();
  const s = getSettings();
  const strategy = opts.strategy ?? s.strategy;
  const topK = opts.topK ?? s.topK;
  const rerank = opts.rerank ?? s.rerank;
  const alpha = opts.alpha ?? s.hybridAlpha;
  const pool = opts.pool ?? s.candidatePool;

  // 1 — permission + scope filter BEFORE retrieval
  const allowed = accessibleDocIds(user, { docIds: opts.docIds, spaceIds: opts.spaceIds });
  const allowedSet = new Set(allowed);
  const rewritten = s.queryRewrite ? rewriteQuery(query) : query;
  if (!allowed.length) {
    return { results: [], rewrittenQuery: rewritten, allowedDocs: 0, candidates: 0, vectorHits: 0, keywordHits: 0, ms: Date.now() - t0 };
  }

  // 2 — dense + sparse legs
  const [qv] = await embedder.embed([query]);
  const vecHits = strategy === 'keyword' ? [] : await vectorStore.search(qv, { docIds: allowed }, pool);
  const kwHits = strategy === 'vector' ? [] : bm25.search(rewritten, allowedSet, pool);

  // 3 — reciprocal rank fusion
  const K = 60;
  const fused = new Map<string, { fused: number; vector: number; bm: number }>();
  const w = strategy === 'hybrid' ? alpha : strategy === 'vector' ? 1 : 0;
  vecHits.forEach((h, r) => {
    const e = fused.get(h.id) ?? { fused: 0, vector: 0, bm: 0 };
    e.fused += w / (K + r + 1); e.vector = h.score; fused.set(h.id, e);
  });
  const maxBm = kwHits[0]?.score || 1;
  kwHits.forEach((h, r) => {
    const e = fused.get(h.id) ?? { fused: 0, vector: 0, bm: 0 };
    e.fused += (1 - w) / (K + r + 1); e.bm = h.score / maxBm; fused.set(h.id, e);
  });

  // 4 — rerank (cross-feature scorer) over the fused candidate pool
  const qConcepts = concepts(query);
  const local = embedder instanceof LocalHashEmbedder;
  const vecScale = local ? 0.32 : 0.55;
  const docs = new Map(db.docs.all().map((d) => [d.id, d]));
  // keyword-only candidates get a dense score too, so the reranker compares like with like
  const missing = [...fused.entries()].filter(([id, f]) => !f.vector && db.chunks.get(id));
  if (missing.length) {
    const texts = missing.map(([id]) => { const c = db.chunks.get(id)!; return contextualText(c, docs.get(c.docId)?.title ?? ''); });
    const vecs = await embedder.embed(texts);
    missing.forEach(([, f], i) => { f.vector = cosSim(qv, vecs[i]); });
  }

  const results: Retrieved[] = [];
  for (const [id, f] of fused) {
    const chunk = db.chunks.get(id);
    if (!chunk || !allowedSet.has(chunk.docId)) continue; // defence in depth
    const doc = docs.get(chunk.docId)!;
    const passage = conceptSet(contextualText(chunk, doc.title));
    const cov = coverage(qConcepts, passage);
    const headCov = coverage(qConcepts, conceptSet(`${doc.title} ${chunk.section}`));
    const vecNorm = clamp(f.vector / vecScale);
    const score = clamp(0.44 * cov + 0.3 * vecNorm + 0.12 * f.bm + 0.14 * headCov);
    results.push({ chunk, doc, score: round(score), vector: round(f.vector), keyword: round(f.bm), coverage: round(cov), fused: f.fused });
  }

  results.sort(rerank ? (a, b) => b.score - a.score || b.fused - a.fused : (a, b) => b.fused - a.fused);
  return {
    results: results.slice(0, topK),
    rewrittenQuery: rewritten,
    allowedDocs: allowed.length,
    candidates: fused.size,
    vectorHits: vecHits.length,
    keywordHits: kwHits.length,
    ms: Date.now() - t0,
  };
}

function cosSim(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
}
