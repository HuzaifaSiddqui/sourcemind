import fs from 'node:fs';
import { config, paths } from '../config.js';
import { cosine } from './embeddings.js';

export interface VectorPoint { id: string; vector: number[]; docId: string; spaceId: string }
export interface VectorHit { id: string; score: number }

/** Retrieval-time filter. Permission filtering is pushed down into the vector query. */
export interface VectorFilter { docIds: string[] }

export interface VectorStore {
  name: string;
  init(dims: number, model: string): Promise<{ modelChanged: boolean }>;
  upsert(points: VectorPoint[]): Promise<void>;
  deleteByDoc(docId: string): Promise<void>;
  search(vector: number[], filter: VectorFilter, limit: number): Promise<VectorHit[]>;
  count(): Promise<number>;
}

/** In-process cosine index persisted to disk. Exact (brute-force) search, fine up to ~100k chunks. */
export class LocalVectorStore implements VectorStore {
  name = 'Local cosine index';
  private points = new Map<string, VectorPoint>();
  private model = '';
  private timer: NodeJS.Timeout | null = null;

  async init(_dims: number, model: string) {
    let prevModel = '';
    if (fs.existsSync(paths.vectors)) {
      const raw = JSON.parse(fs.readFileSync(paths.vectors, 'utf8'));
      prevModel = raw.model;
      if (raw.model === model) for (const p of raw.points as VectorPoint[]) this.points.set(p.id, p);
    }
    this.model = model;
    return { modelChanged: !!prevModel && prevModel !== model };
  }

  private persist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const round = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);
      const data = { model: this.model, points: [...this.points.values()].map((p) => ({ ...p, vector: round(p.vector) })) };
      fs.writeFileSync(`${paths.vectors}.tmp`, JSON.stringify(data));
      fs.renameSync(`${paths.vectors}.tmp`, paths.vectors);
    }, 400);
  }

  async upsert(points: VectorPoint[]) {
    for (const p of points) this.points.set(p.id, p);
    this.persist();
  }

  async deleteByDoc(docId: string) {
    for (const [id, p] of this.points) if (p.docId === docId) this.points.delete(id);
    this.persist();
  }

  async search(vector: number[], filter: VectorFilter, limit: number) {
    const allowed = new Set(filter.docIds);
    const hits: VectorHit[] = [];
    for (const p of this.points.values()) {
      if (!allowed.has(p.docId)) continue;
      hits.push({ id: p.id, score: cosine(vector, p.vector) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async count() { return this.points.size; }
}

/** Qdrant over its REST API. Enabled with QDRANT_URL. */
export class QdrantVectorStore implements VectorStore {
  name = 'Qdrant';
  private col = config.qdrantCollection;

  private async req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${config.qdrantUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(config.qdrantApiKey ? { 'api-key': config.qdrantApiKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 404) throw new Error(`Qdrant ${method} ${path}: ${res.status} ${JSON.stringify(json?.status ?? json)}`);
    return { status: res.status, json };
  }

  /** Qdrant ids must be UUIDs or integers; derive a stable UUID from our chunk id. */
  private uuid(id: string) {
    const hex = Buffer.from(id.padEnd(16, '0').slice(0, 16)).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  async init(dims: number, model: string) {
    const info = await this.req('GET', `/collections/${this.col}`);
    let modelChanged = false;
    if (info.status === 200) {
      const size = info.json?.result?.config?.params?.vectors?.size;
      if (size && size !== dims) {
        await this.req('DELETE', `/collections/${this.col}`);
        modelChanged = true;
      } else return { modelChanged: false };
    }
    await this.req('PUT', `/collections/${this.col}`, { vectors: { size: dims, distance: 'Cosine' }, metadata: { model } });
    for (const field of ['docId', 'spaceId']) {
      await this.req('PUT', `/collections/${this.col}/index`, { field_name: field, field_schema: 'keyword' });
    }
    return { modelChanged };
  }

  async upsert(points: VectorPoint[]) {
    for (let i = 0; i < points.length; i += 128) {
      const batch = points.slice(i, i + 128).map((p) => ({
        id: this.uuid(p.id), vector: p.vector, payload: { chunkId: p.id, docId: p.docId, spaceId: p.spaceId },
      }));
      await this.req('PUT', `/collections/${this.col}/points?wait=true`, { points: batch });
    }
  }

  async deleteByDoc(docId: string) {
    await this.req('POST', `/collections/${this.col}/points/delete?wait=true`, {
      filter: { must: [{ key: 'docId', match: { value: docId } }] },
    });
  }

  async search(vector: number[], filter: VectorFilter, limit: number) {
    if (!filter.docIds.length) return [];
    const { json } = await this.req('POST', `/collections/${this.col}/points/search`, {
      vector, limit, with_payload: true,
      filter: { must: [{ key: 'docId', match: { any: filter.docIds } }] },
    });
    return (json.result ?? []).map((r: any) => ({ id: r.payload.chunkId, score: r.score }));
  }

  async count() {
    const { json } = await this.req('POST', `/collections/${this.col}/points/count`, { exact: true });
    return json?.result?.count ?? 0;
  }
}

export const vectorStore: VectorStore = config.qdrantUrl ? new QdrantVectorStore() : new LocalVectorStore();
