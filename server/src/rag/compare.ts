import { db } from '../store/db.js';
import type { Citation, Doc, User } from '../types.js';
import { EXTRACTORS, normalizeValue, type Extractor } from './extractors.js';
import { toCitation } from './grounding.js';
import { retrieve, type Retrieved } from './retriever.js';
import { sentences } from './text.js';

export interface CompareCell { value: string | null; citation: Citation | null }
export interface CompareRow { key: string; label: string; a: CompareCell; b: CompareCell; status: 'same' | 'changed' | 'added' | 'removed' }

async function extract(user: User, doc: Doc, ex: Extractor): Promise<CompareCell> {
  const { results } = await retrieve(user, ex.probe, { docIds: [doc.id], topK: 5, strategy: 'hybrid', rerank: true });
  const scan = (rs: Retrieved[]) => {
    for (const r of rs) {
      for (const s of sentences(r.chunk.text)) {
        const v = ex.match(s.text);
        if (v) return { value: v, citation: toCitation(0, r, s.text) };
      }
    }
    return null;
  };
  const hit = scan(results);
  if (hit) return hit;
  // Exhaustive fallback over the document's own chunks (still permission-checked by retrieve above).
  if (!results.length) return { value: null, citation: null };
  const all = db.chunks.find((c) => c.docId === doc.id).sort((a, b) => a.seq - b.seq)
    .map((chunk) => ({ chunk, doc, score: 0.5, vector: 0, keyword: 0, coverage: 0, fused: 0 }));
  return scan(all) ?? { value: null, citation: null };
}

export async function compareDocuments(user: User, a: Doc, b: Doc) {
  const kinds = new Set(['any', 'contract', 'policy', 'technical']);
  const rows: CompareRow[] = [];
  for (const ex of EXTRACTORS.filter((e) => kinds.has(e.kind))) {
    const [ca, cb] = await Promise.all([extract(user, a, ex), extract(user, b, ex)]);
    if (!ca.value && !cb.value) continue;
    const status: CompareRow['status'] = !ca.value ? 'added' : !cb.value ? 'removed'
      : normalizeValue(ca.value) === normalizeValue(cb.value) ? 'same' : 'changed';
    rows.push({ key: ex.key, label: ex.label, a: ca, b: cb, status });
  }
  // number citations sequentially for display
  let n = 0;
  for (const r of rows) {
    if (r.a.citation) r.a.citation.n = ++n;
    if (r.b.citation) r.b.citation.n = ++n;
  }
  const differences = rows.filter((r) => r.status !== 'same');
  // commercial impact first; dates and boilerplate last
  const PRIORITY = ['paymentTerm', 'liabilityCap', 'terminationNotice', 'lateFee', 'earlyDiscount', 'priceIncrease', 'uptime', 'dataRetention', 'breachNotice', 'contractValue', 'renewal', 'initialTerm'];
  const rank = (k: string) => { const i = PRIORITY.indexOf(k); return i < 0 ? 99 : i; };
  const keyChanges = [...differences].sort((x, y) => rank(x.key) - rank(y.key)).slice(0, 4).map((r) => ({
    label: r.label,
    text: r.status === 'changed' ? `${r.label} changed from ${r.a.value} to ${r.b.value}.`
      : r.status === 'added' ? `${r.label} introduced: ${r.b.value}.`
      : `${r.label} (${r.a.value}) no longer present.`,
    citations: [r.a.citation, r.b.citation].filter(Boolean) as Citation[],
  }));
  return { a: brief(a), b: brief(b), rows, differences: differences.length, keyChanges };
}

export async function compareClause(user: User, a: Doc, b: Doc, query: string) {
  const pick = async (d: Doc) => {
    const { results } = await retrieve(user, query, { docIds: [d.id], topK: 2 });
    return results.map((r, i) => ({ ...toCitation(i + 1, r, query), text: r.chunk.text }));
  };
  const [pa, pb] = await Promise.all([pick(a), pick(b)]);
  return { query, a: { doc: brief(a), passages: pa }, b: { doc: brief(b), passages: pb } };
}

const brief = (d: Doc) => ({ id: d.id, title: d.title, type: d.type, pages: d.pages, pageLabel: d.pageLabel, spaceId: d.spaceId });
