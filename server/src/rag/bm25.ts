import { tokenize } from './text.js';

interface Posting { id: string; tf: number }

/** Okapi BM25 inverted index (k1 = 1.2, b = 0.75). Rebuilt at boot, updated incrementally on ingest. */
export class BM25Index {
  private postings = new Map<string, Posting[]>();
  private lengths = new Map<string, number>();
  private docOf = new Map<string, string>();
  private totalLen = 0;
  private k1 = 1.2;
  private b = 0.75;

  get size() { return this.lengths.size; }

  add(id: string, docId: string, text: string) {
    if (this.lengths.has(id)) this.remove(id);
    const toks = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, n] of tf) {
      const list = this.postings.get(term) ?? [];
      list.push({ id, tf: n });
      this.postings.set(term, list);
    }
    this.lengths.set(id, toks.length);
    this.docOf.set(id, docId);
    this.totalLen += toks.length;
  }

  remove(id: string) {
    const len = this.lengths.get(id);
    if (len === undefined) return;
    this.totalLen -= len;
    this.lengths.delete(id);
    this.docOf.delete(id);
    for (const [term, list] of this.postings) {
      const next = list.filter((p) => p.id !== id);
      if (next.length) this.postings.set(term, next); else this.postings.delete(term);
    }
  }

  removeDoc(docId: string) {
    const ids = [...this.docOf.entries()].filter(([, d]) => d === docId).map(([id]) => id);
    const set = new Set(ids);
    for (const id of ids) { this.totalLen -= this.lengths.get(id) ?? 0; this.lengths.delete(id); this.docOf.delete(id); }
    for (const [term, list] of this.postings) {
      const next = list.filter((p) => !set.has(p.id));
      if (next.length) this.postings.set(term, next); else this.postings.delete(term);
    }
  }

  search(query: string, allowedDocs: Set<string>, limit: number) {
    const N = this.lengths.size || 1;
    const avg = this.totalLen / N || 1;
    const scores = new Map<string, number>();
    for (const term of new Set(tokenize(query))) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5));
      for (const p of list) {
        if (!allowedDocs.has(this.docOf.get(p.id)!)) continue;
        const len = this.lengths.get(p.id)!;
        const s = idf * ((p.tf * (this.k1 + 1)) / (p.tf + this.k1 * (1 - this.b + (this.b * len) / avg)));
        scores.set(p.id, (scores.get(p.id) ?? 0) + s);
      }
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export const bm25 = new BM25Index();
