import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { HttpError } from './auth/auth.js';
import { db, flushDb, initDb } from './store/db.js';
import { bootIndex } from './rag/pipeline.js';
import { api, systemInfo } from './routes/api.js';
import { seed } from './seed/seed.js';

async function main() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, '.server.pid'), String(process.pid));
  const store = await initDb();
  await bootIndex();
  if (!db.users.count() && process.env.AUTO_SEED !== 'false') {
    console.log('[seed] empty workspace — loading demo data…');
    await seed({ reset: false });
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, ...systemInfo() }));
  app.use('/api', api);

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status ?? 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return res.end();
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message });
  });

  app.listen(config.port, () => {
    const s = systemInfo();
    console.log(`\n  SourceMind API  →  http://localhost:${config.port}`);
    console.log(`  store: ${store} · vectors: ${s.vectorStore} · embeddings: ${s.embeddingModel} · answers: ${s.llm ?? 'extractive (no LLM key)'}\n`);
  });

  const stop = async () => {
    await flushDb();
    try { fs.unlinkSync(path.join(config.dataDir, '.server.pid')); } catch { /* already gone */ }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
