import fs from 'node:fs';
import path from 'node:path';
import type { Entity } from '../types.js';

/**
 * Persistence backend. The app keeps a hot in-memory copy of every collection
 * (fast permission filtering + BM25 over chunks) and writes through to the backend.
 */
export interface Backend {
  name: string;
  load<T extends Entity>(collection: string): Promise<T[]>;
  upsert<T extends Entity>(collection: string, doc: T): void;
  remove(collection: string, id: string): void;
  replaceAll<T extends Entity>(collection: string, docs: T[]): void;
  flush(): Promise<void>;
}

export class JsonBackend implements Backend {
  name = 'Embedded JSON store';
  private dirty = new Map<string, () => Entity[]>();
  private timer: NodeJS.Timeout | null = null;
  private sources = new Map<string, () => Entity[]>();

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  register(collection: string, snapshot: () => Entity[]) {
    this.sources.set(collection, snapshot);
  }

  async load<T extends Entity>(collection: string): Promise<T[]> {
    const file = path.join(this.dir, `${collection}.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
  }

  private mark(collection: string) {
    const src = this.sources.get(collection);
    if (src) this.dirty.set(collection, src);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 250);
  }

  upsert(collection: string) { this.mark(collection); }
  remove(collection: string) { this.mark(collection); }
  replaceAll(collection: string) { this.mark(collection); }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const [name, snap] of this.dirty) {
      const file = path.join(this.dir, `${name}.json`);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snap()));
      fs.renameSync(tmp, file);
    }
    this.dirty.clear();
  }
}

export class Collection<T extends Entity> {
  private map = new Map<string, T>();

  constructor(public readonly name: string, private backend: Backend) {
    if (backend instanceof JsonBackend) backend.register(name, () => this.all());
  }

  async init() {
    for (const d of await this.backend.load<T>(this.name)) this.map.set(d.id, d);
  }

  all(): T[] { return [...this.map.values()]; }
  get(id: string): T | undefined { return this.map.get(id); }
  find(pred: (d: T) => boolean): T[] { return this.all().filter(pred); }
  findOne(pred: (d: T) => boolean): T | undefined { return this.all().find(pred); }
  count(pred?: (d: T) => boolean): number { return pred ? this.find(pred).length : this.map.size; }

  insert(doc: T): T {
    this.map.set(doc.id, doc);
    this.backend.upsert(this.name, doc);
    return doc;
  }

  update(id: string, patch: Partial<T> | ((d: T) => Partial<T>)): T | undefined {
    const cur = this.map.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } as T;
    this.map.set(id, next);
    this.backend.upsert(this.name, next);
    return next;
  }

  remove(id: string) {
    if (this.map.delete(id)) this.backend.remove(this.name, id);
  }

  removeWhere(pred: (d: T) => boolean): number {
    const ids = this.find(pred).map((d) => d.id);
    ids.forEach((id) => this.map.delete(id));
    if (ids.length) this.backend.replaceAll(this.name, this.all());
    return ids.length;
  }

  clear() {
    this.map.clear();
    this.backend.replaceAll(this.name, []);
  }
}
