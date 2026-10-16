import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { flushDb, initDb } from '../store/db.js';
import { bootIndex } from '../rag/pipeline.js';
import { seed } from './seed.js';

/** `npm run seed` — wipes the workspace and loads the demo data through the real ingestion pipeline. */
const pidFile = path.join(config.dataDir, '.server.pid');
if (fs.existsSync(pidFile)) {
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { /* not running */ }
  if (alive) {
    console.error(`The API server is running (pid ${pid}). Stop it before seeding, otherwise it will overwrite the new data.`);
    process.exit(1);
  }
}
const t = Date.now();
await initDb();
await bootIndex();
const out = await seed({ reset: true });
await flushDb();
await new Promise((r) => setTimeout(r, 600)); // let the vector index persist
console.log(`Seeded ${out.documents} documents, ${out.spaces} spaces, ${out.users} users in ${((Date.now() - t) / 1000).toFixed(1)}s`);
process.exit(0);
