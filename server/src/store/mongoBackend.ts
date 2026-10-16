import type { Backend } from './collection.js';
import type { Entity } from '../types.js';

/**
 * MongoDB write-through backend. Enabled when MONGODB_URI is set.
 * Reads happen once at boot; every mutation is persisted asynchronously.
 */
export class MongoBackend implements Backend {
  name = 'MongoDB';
  private pending: Promise<unknown>[] = [];
  private db: any;

  static async connect(uri: string, dbName: string) {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(uri);
    await client.connect();
    const b = new MongoBackend();
    b.db = client.db(dbName);
    return b;
  }

  private track(p: Promise<unknown>) {
    const tracked = p.catch((e) => console.error('[mongo] write failed', e?.message));
    this.pending.push(tracked);
    if (this.pending.length > 500) this.pending = this.pending.slice(-100);
  }

  async load<T extends Entity>(collection: string): Promise<T[]> {
    const docs = await this.db.collection(collection).find({}).toArray();
    return docs.map(({ _id, ...rest }: any) => ({ ...rest, id: rest.id ?? String(_id) }) as T);
  }

  upsert<T extends Entity>(collection: string, doc: T) {
    this.track(this.db.collection(collection).replaceOne({ id: doc.id }, doc, { upsert: true }));
  }

  remove(collection: string, id: string) {
    this.track(this.db.collection(collection).deleteOne({ id }));
  }

  replaceAll<T extends Entity>(collection: string, docs: T[]) {
    const col = this.db.collection(collection);
    this.track(
      (async () => {
        await col.deleteMany({});
        if (docs.length) await col.insertMany(docs.map((d) => ({ ...d })));
      })(),
    );
  }

  async flush() {
    await Promise.all(this.pending);
    this.pending = [];
  }
}
