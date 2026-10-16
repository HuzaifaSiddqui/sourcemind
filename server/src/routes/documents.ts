import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { config, paths } from '../config.js';
import { canAccessDoc, canAccessSpace } from '../auth/access.js';
import { audit, HttpError, requireCap } from '../auth/auth.js';
import { db } from '../store/db.js';
import type { Doc, DocType, User, Visibility } from '../types.js';
import { enqueue, freshProcessing, queueState, removeIndex, titleFromFilename } from '../rag/pipeline.js';
import { detectType } from '../rag/parsers.js';

export const documents = Router();

fs.mkdirSync(paths.uploads, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: paths.uploads,
    filename: (_req, file, cb) => cb(null, `${nanoid(10)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, !!detectType(file.originalname));
  },
});

export function getDocFor(user: User, id: string) {
  const d = db.docs.get(id);
  if (!d || !canAccessDoc(user, d)) throw new HttpError(404, 'Document not found');
  return d;
}

export function docView(d: Doc) {
  const owner = db.users.get(d.ownerId);
  const space = db.spaces.get(d.spaceId);
  return {
    ...d,
    storagePath: undefined,
    owner: owner ? { id: owner.id, name: owner.name, color: owner.color } : null,
    space: space ? { id: space.id, name: space.name, color: space.color, icon: space.icon } : null,
  };
}

function targetSpace(user: User, spaceId: string) {
  const s = db.spaces.get(spaceId);
  if (!s || !canAccessSpace(user, s)) throw new HttpError(400, 'Choose a knowledge space you have access to');
  return s;
}

const titleFrom = titleFromFilename;

export function createDoc(user: User, p: {
  title: string; filename: string; type: DocType; spaceId: string; visibility?: Visibility;
  tags?: string[]; sizeBytes?: number; storagePath?: string; sourceUrl?: string;
}): Doc {
  const now = new Date().toISOString();
  const doc: Doc = {
    id: nanoid(12),
    title: p.title,
    filename: p.filename,
    type: p.type,
    spaceId: p.spaceId,
    ownerId: user.id,
    visibility: p.visibility ?? 'team',
    tags: p.tags ?? [],
    pages: 0,
    pageLabel: p.type === 'PDF' ? 'Page' : 'Part',
    sizeBytes: p.sizeBytes ?? 0,
    status: 'uploading',
    storagePath: p.storagePath,
    sourceUrl: p.sourceUrl,
    createdAt: now,
    updatedAt: now,
    processing: freshProcessing(),
  };
  db.docs.insert(doc);
  enqueue(doc.id);
  return doc;
}

documents.get('/', (req, res) => {
  const u = req.user!;
  const { spaceId, status, type, q, ownerId } = req.query as Record<string, string | undefined>;
  const spaces = new Map(db.spaces.all().map((s) => [s.id, s]));
  const needle = q?.toLowerCase();
  const list = db.docs
    .find((d) => canAccessDoc(u, d, spaces)
      && (!spaceId || d.spaceId === spaceId)
      && (!status || (status === 'processing' ? !['ready', 'failed'].includes(d.status) : d.status === status))
      && (!type || d.type === type)
      && (!ownerId || d.ownerId === ownerId)
      && (!needle || `${d.title} ${d.filename} ${d.tags.join(' ')}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => {
      const v = docView(d);
      return { ...v, summary: undefined, processing: { ...v.processing, events: undefined } };
    });
  res.json({ documents: list, queue: queueState() });
});

documents.post('/upload', requireCap('sources.write'), upload.array('files', 20), (req, res) => {
  const u = req.user!;
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, 'Upload PDF, DOCX, TXT, MD or CSV files');
  const space = targetSpace(u, req.body.spaceId);
  const visibility = (['private', 'team', 'organization'].includes(req.body.visibility) ? req.body.visibility : 'team') as Visibility;
  const tags = String(req.body.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const created = files.map((f) => createDoc(u, {
    title: titleFrom(f.originalname), filename: f.originalname, type: detectType(f.originalname)!,
    spaceId: space.id, visibility, tags, sizeBytes: f.size, storagePath: f.path,
  }));
  created.forEach((d) => audit(u.id, 'document.upload', d.title, { space: space.name }));
  res.status(201).json({ documents: created.map(docView) });
});

documents.post('/url', requireCap('sources.write'), (req, res) => {
  const u = req.user!;
  const { url, spaceId, visibility, title } = req.body ?? {};
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new HttpError(400, 'Enter a valid http(s) URL'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new HttpError(400, 'Only http(s) URLs are supported');
  const space = targetSpace(u, spaceId);
  const doc = createDoc(u, {
    title: title || parsed.hostname + parsed.pathname.replace(/\/$/, ''), filename: parsed.href, type: 'URL',
    spaceId: space.id, visibility, sourceUrl: parsed.href,
  });
  audit(u.id, 'document.url', parsed.href, { space: space.name });
  res.status(201).json({ document: docView(doc) });
});

documents.get('/:id', (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  const chunks = db.chunks.find((c) => c.docId === d.id);
  const sections = [...new Map(chunks.sort((a, b) => a.seq - b.seq).map((c) => [c.section, { section: c.section, page: c.page }])).values()];
  res.json({ document: docView(d), sections });
});

documents.get('/:id/pages', (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  res.json({ pages: db.pages.get(d.id)?.pages ?? [] });
});

documents.get('/:id/chunks', (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  const chunks = db.chunks.find((c) => c.docId === d.id).sort((a, b) => a.seq - b.seq);
  res.json({ chunks });
});

documents.get('/:id/file', (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  if (d.sourceUrl) return res.redirect(d.sourceUrl);
  if (!d.storagePath || !fs.existsSync(d.storagePath)) throw new HttpError(404, 'Original file not available');
  res.download(d.storagePath, d.filename);
});

documents.patch('/:id', requireCap('sources.write'), (req, res) => {
  const u = req.user!;
  const d = getDocFor(u, String(req.params.id));
  const patch: Partial<Doc> = {};
  if (typeof req.body.title === 'string' && req.body.title.trim()) patch.title = req.body.title.trim();
  if (['private', 'team', 'organization'].includes(req.body.visibility)) patch.visibility = req.body.visibility;
  if (Array.isArray(req.body.tags)) patch.tags = req.body.tags.map(String);
  if (req.body.spaceId && req.body.spaceId !== d.spaceId) {
    targetSpace(u, req.body.spaceId);
    patch.spaceId = req.body.spaceId;
    db.chunks.find((c) => c.docId === d.id).forEach((c) => db.chunks.update(c.id, { spaceId: req.body.spaceId }));
  }
  const next = db.docs.update(d.id, { ...patch, updatedAt: new Date().toISOString() })!;
  audit(u.id, 'document.update', next.title, patch as Record<string, unknown>);
  if (patch.spaceId || patch.title) enqueue(d.id); // re-index so vector payload + context text stay in sync
  res.json({ document: docView(next) });
});

documents.post('/:id/reprocess', requireCap('sources.write'), (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  db.docs.update(d.id, { status: 'uploading', error: undefined, processing: freshProcessing() });
  enqueue(d.id);
  audit(req.user!.id, 'document.reprocess', d.title);
  res.json({ ok: true });
});

documents.delete('/:id', requireCap('sources.write'), async (req, res) => {
  const d = getDocFor(req.user!, String(req.params.id));
  await removeIndex(d.id);
  db.pages.remove(d.id);
  db.docs.remove(d.id);
  if (d.storagePath && fs.existsSync(d.storagePath)) fs.unlinkSync(d.storagePath);
  audit(req.user!.id, 'document.delete', d.title);
  res.json({ ok: true });
});
