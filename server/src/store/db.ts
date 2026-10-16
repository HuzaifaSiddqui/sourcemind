import { config, paths } from '../config.js';
import { Collection, JsonBackend, type Backend } from './collection.js';
import { MongoBackend } from './mongoBackend.js';
import type {
  AuditEntry, Chunk, Conversation, Doc, DocPages, EvalCase, EvalRun, Settings, Space, User,
} from '../types.js';

let backend: Backend;

export const db = {} as {
  users: Collection<User>;
  spaces: Collection<Space>;
  docs: Collection<Doc>;
  pages: Collection<DocPages>;
  chunks: Collection<Chunk>;
  conversations: Collection<Conversation>;
  evalCases: Collection<EvalCase>;
  evalRuns: Collection<EvalRun>;
  audit: Collection<AuditEntry>;
  settings: Collection<Settings>;
};

export const defaultSettings: Settings = {
  id: 'workspace',
  strategy: 'hybrid',
  hybridAlpha: 0.5,
  rerank: true,
  topK: 6,
  candidatePool: 40,
  minRelevance: 0.5,
  chunkSize: 220,
  chunkOverlap: 30,
  queryRewrite: true,
  useLlm: true,
};

export async function initDb() {
  backend = config.mongoUri
    ? await MongoBackend.connect(config.mongoUri, config.mongoDb)
    : new JsonBackend(paths.store);

  const names = [
    'users', 'spaces', 'docs', 'pages', 'chunks', 'conversations', 'evalCases', 'evalRuns', 'audit', 'settings',
  ] as const;
  for (const n of names) {
    const c = new Collection<any>(n, backend);
    await c.init();
    (db as any)[n] = c;
  }
  if (!db.settings.get('workspace')) db.settings.insert({ ...defaultSettings });
  return backend.name;
}

export function getSettings(): Settings {
  return { ...defaultSettings, ...db.settings.get('workspace') };
}

export function storeName() { return backend?.name ?? 'uninitialised'; }
export async function flushDb() { await backend.flush(); }

let seqCounter = 0;
export function nextChunkSeq() {
  if (!seqCounter) seqCounter = db.chunks.all().reduce((m, c) => Math.max(m, c.seq), 1000);
  return ++seqCounter;
}
