import { config } from '../config.js';
import { synonymsOf, tokenize } from './text.js';

export interface Embedder {
  model: string;
  dims: number;
  embed(texts: string[]): Promise<number[][]>;
}

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Offline embedder used when no API key is configured.
 * Signed feature hashing over stemmed unigrams, bigrams and domain synonym
 * concepts, L2-normalised. Deterministic, dependency-free, and good enough to
 * retrieve "cancel early" → "termination for convenience" without a network call.
 */
export class LocalHashEmbedder implements Embedder {
  model = 'local-hash-embed-v1';
  dims = 768;

  async embed(texts: string[]) {
    return texts.map((t) => this.one(t));
  }

  private one(text: string) {
    const v = new Float64Array(this.dims);
    const toks = tokenize(text);
    const feats = new Map<string, number>();
    const add = (f: string, w: number) => feats.set(f, (feats.get(f) ?? 0) + w);
    toks.forEach((t, i) => {
      add(`u:${t}`, 1);
      for (const g of synonymsOf(t)) add(`c:${g}`, 0.75);
      if (i > 0) add(`b:${toks[i - 1]}_${t}`, 0.5);
    });
    for (const [f, tf] of feats) {
      const h = fnv1a(f);
      const w = (1 + Math.log(tf)) * (h & 1 ? 1 : -1);
      v[h % this.dims] += w;
      // second hash reduces collision damage
      const h2 = fnv1a(`#${f}`);
      v[h2 % this.dims] += 0.5 * w * (h2 & 1 ? 1 : -1);
    }
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return Array.from(v, (x) => x / n);
  }
}

export class OpenAIEmbedder implements Embedder {
  model = config.embeddingModel;
  dims = 1536;
  private client: any;

  async embed(texts: string[]) {
    if (!this.client) {
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      this.client = new OpenAIEmbeddings({
        apiKey: config.openaiApiKey,
        model: config.embeddingModel,
        batchSize: 64,
        ...(config.openaiBaseUrl ? { configuration: { baseURL: config.openaiBaseUrl } } : {}),
      });
    }
    const out: number[][] = await this.client.embedDocuments(texts);
    if (out[0]) this.dims = out[0].length;
    return out;
  }
}

export const embedder: Embedder = config.openaiApiKey ? new OpenAIEmbedder() : new LocalHashEmbedder();

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na * nb) || 1);
}
