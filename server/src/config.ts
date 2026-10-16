import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true } as dotenv.DotenvConfigOptions);

function num(v: string | undefined, d: number) {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d;
}

export const config = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'sourcemind-dev-secret-change-me',
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  clientDist: path.resolve(ROOT, '../client/dist'),

  /** Optional: MongoDB for application data. Falls back to an embedded JSON store. */
  mongoUri: process.env.MONGODB_URI || '',
  mongoDb: process.env.MONGODB_DB || 'sourcemind',

  /** Optional: Qdrant for vectors. Falls back to an in-process cosine index. */
  qdrantUrl: process.env.QDRANT_URL || '',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  qdrantCollection: process.env.QDRANT_COLLECTION || 'sourcemind_chunks',

  /** Optional: any OpenAI-compatible API. Without a key the engine runs fully offline. */
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
  chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',

  /** Slows each pipeline stage for screen recordings. 0 = real speed. */
  stageDelayMs: num(process.env.PIPELINE_STAGE_DELAY_MS, 0),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 25),
};

export const paths = {
  uploads: path.join(config.dataDir, 'uploads'),
  store: path.join(config.dataDir, 'store'),
  vectors: path.join(config.dataDir, 'vectors.json'),
};
