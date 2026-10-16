import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import {
  accessibleDocIds, accessibleSpaces, can, canAccessDoc, canAccessSpace, ROLE_CAPS, ROLE_LABEL,
} from '../auth/access.js';
import { audit, HttpError, publicUser, requireAuth, requireCap, signToken } from '../auth/auth.js';
import { db, getSettings, storeName } from '../store/db.js';
import type { Conversation, Role, Settings, Space, User } from '../types.js';
import { answerQuestion } from '../rag/answer.js';
import { compareClause, compareDocuments } from '../rag/compare.js';
import { embedder } from '../rag/embeddings.js';
import { runEvaluation } from '../rag/evaluate.js';
import { bestSentence } from '../rag/grounding.js';
import { llmEnabled } from '../rag/llm.js';
import { queueState } from '../rag/pipeline.js';
import { retrieve } from '../rag/retriever.js';
import { vectorStore } from '../rag/vectorStore.js';
import { docView, documents, getDocFor } from './documents.js';

export const api = Router();

/* ───────────────────────────── auth ───────────────────────────── */

api.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const u = db.users.findOne((x) => x.email.toLowerCase() === String(email ?? '').toLowerCase());
  if (!u || !(await bcrypt.compare(String(password ?? ''), u.passwordHash))) throw new HttpError(401, 'Incorrect email or password');
  db.users.update(u.id, { lastActiveAt: new Date().toISOString() });
  audit(u.id, 'auth.login', u.email);
  res.json({ token: signToken(u), user: publicUser(u) });
});

api.get('/auth/demo-users', (_req, res) => {
  if (process.env.DEMO_LOGIN === 'false') return res.json({ users: [] });
  res.json({
    password: 'demo1234',
    users: db.users.all().map((u) => ({ ...publicUser(u), roleLabel: ROLE_LABEL[u.role] })),
  });
});

api.use(requireAuth);

api.get('/auth/me', (req, res) => {
  const u = req.user!;
  res.json({ user: publicUser(u), roleLabel: ROLE_LABEL[u.role], capabilities: ROLE_CAPS[u.role] });
});

/* ─────────────────────────── system ─────────────────────────── */

export function systemInfo() {
  return {
    store: storeName(),
    vectorStore: vectorStore.name,
    embeddingModel: embedder.model,
    llm: llmEnabled() ? config.chatModel : null,
    llmConfigured: !!config.openaiApiKey,
    answerMode: llmEnabled() ? 'llm' : 'extractive',
    chunks: db.chunks.count(),
  };
}

api.get('/system', (_req, res) => res.json(systemInfo()));

/* ─────────────────────────── dashboard ─────────────────────────── */

function spaceCard(s: Space, user: User) {
  const docs = db.docs.find((d) => d.spaceId === s.id && canAccessDoc(user, d));
  const members = db.users.find((u) => canAccessSpace(u, s));
  const last = docs.map((d) => d.updatedAt).sort().pop();
  return {
    ...s,
    documents: docs.length,
    ready: docs.filter((d) => d.status === 'ready').length,
    chunks: db.chunks.count((c) => c.spaceId === s.id),
    members: members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    lastActivity: last ?? s.createdAt,
    access: s.accessTeams.includes('*') ? 'Everyone' : s.accessTeams.map((t) => (t.length <= 2 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1))).join(' + '),
  };
}

api.get('/dashboard', (req, res) => {
  const u = req.user!;
  const spaces = accessibleSpaces(u);
  const docIds = new Set(accessibleDocIds(u, { readyOnly: false }));
  const docs = db.docs.find((d) => docIds.has(d.id));
  const ready = docs.filter((d) => d.status === 'ready');
  const convs = db.conversations.find((c) => c.userId === u.id || (c.shared && can(u, 'view')));
  const answers = db.conversations.all().flatMap((c) => c.messages.filter((m) => m.role === 'assistant'));
  const recentQuestions = db.conversations
    .find((c) => c.userId === u.id)
    .flatMap((c) => c.messages.map((m, i) => ({ c, m, a: c.messages[i + 1] })).filter((x) => x.m.role === 'user'))
    .sort((a, b) => b.m.createdAt.localeCompare(a.m.createdAt))
    .slice(0, 5)
    .map(({ c, m, a }) => ({
      conversationId: c.id, question: m.content, at: m.createdAt,
      citations: a?.citations?.length ?? 0, evidence: a?.evidence?.level ?? 'None', refused: !!a?.refused,
    }));
  const seenQ = new Set<string>();
  const suggested = ready
    .sort((a, b) => (b.indexedAt ?? '').localeCompare(a.indexedAt ?? ''))
    .map((d) => {
      const q = (d.summary?.suggestedQuestions ?? []).find((x) => !seenQ.has(x) && !/^Summarise the key points/.test(x));
      if (!q) return null;
      seenQ.add(q);
      return { q, docId: d.id, doc: d.title };
    })
    .filter(Boolean)
    .slice(0, 4);

  res.json({
    kpis: {
      documents: ready.length,
      processing: docs.filter((d) => !['ready', 'failed'].includes(d.status)).length,
      failed: docs.filter((d) => d.status === 'failed').length,
      tokens: ready.reduce((s, d) => s + d.processing.totalTokens, 0),
      chunks: ready.reduce((s, d) => s + d.processing.chunks, 0),
      spaces: spaces.length,
      questions: answers.length,
      conversations: convs.length,
      grounded: answers.length ? answers.filter((m) => !m.refused).length / answers.length : 0,
    },
    spaces: spaces.map((s) => spaceCard(s, u)).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    recentQuestions,
    recentDocuments: docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((d) => ({
      ...docView(d), summary: undefined, processing: { ...d.processing, events: undefined },
    })),
    activity: docs.flatMap((d) => d.processing.events.slice(-2).map((e) => ({ ...e, docId: d.id, doc: d.title })))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    suggested,
    system: systemInfo(),
    queue: queueState(),
  });
});

/* ─────────────────────────── spaces ─────────────────────────── */

api.get('/spaces', (req, res) => {
  const u = req.user!;
  res.json({ spaces: accessibleSpaces(u).map((s) => spaceCard(s, u)), teams: allTeams() });
});

api.get('/spaces/:id', (req, res) => {
  const u = req.user!;
  const s = db.spaces.get(String(req.params.id));
  if (!s || !canAccessSpace(u, s)) throw new HttpError(404, 'Space not found');
  res.json({ space: spaceCard(s, u) });
});

api.post('/spaces', requireCap('spaces.manage'), (req, res) => {
  const u = req.user!;
  const { name, description, accessTeams, color, icon } = req.body ?? {};
  if (!name?.trim()) throw new HttpError(400, 'Name is required');
  const s: Space = {
    id: nanoid(10), name: name.trim(), description: description ?? '', icon: icon || 'folder', color: color || '#5B7CFF',
    accessTeams: Array.isArray(accessTeams) && accessTeams.length ? accessTeams : ['*'], createdBy: u.id, createdAt: new Date().toISOString(),
  };
  db.spaces.insert(s);
  audit(u.id, 'space.create', s.name, { access: s.accessTeams });
  res.status(201).json({ space: spaceCard(s, u) });
});

api.patch('/spaces/:id', requireCap('spaces.manage'), (req, res) => {
  const u = req.user!;
  const s = db.spaces.get(String(req.params.id));
  if (!s) throw new HttpError(404, 'Space not found');
  const patch: Partial<Space> = {};
  for (const k of ['name', 'description', 'color', 'icon'] as const) if (typeof req.body[k] === 'string') patch[k] = req.body[k];
  if (Array.isArray(req.body.accessTeams)) patch.accessTeams = req.body.accessTeams.length ? req.body.accessTeams : ['*'];
  const next = db.spaces.update(s.id, patch)!;
  audit(u.id, 'space.update', next.name, patch as Record<string, unknown>);
  res.json({ space: spaceCard(next, u) });
});

api.delete('/spaces/:id', requireCap('spaces.manage'), (req, res) => {
  const s = db.spaces.get(String(req.params.id));
  if (!s) throw new HttpError(404, 'Space not found');
  if (db.docs.count((d) => d.spaceId === s.id)) throw new HttpError(409, 'Move or delete the documents in this space first');
  db.spaces.remove(s.id);
  audit(req.user!.id, 'space.delete', s.name);
  res.json({ ok: true });
});

/* ─────────────────────────── documents ─────────────────────────── */

api.use('/documents', documents);

api.get('/chunks/:id', (req, res) => {
  const u = req.user!;
  const c = db.chunks.get(String(req.params.id));
  if (!c) throw new HttpError(404, 'Passage not found');
  const d = getDocFor(u, c.docId);
  const siblings = db.chunks.find((x) => x.docId === d.id).sort((a, b) => a.seq - b.seq);
  const i = siblings.findIndex((x) => x.id === c.id);
  const page = db.pages.get(d.id)?.pages.find((p) => p.n === c.page);
  res.json({
    chunk: c,
    document: { ...docView(d), summary: undefined },
    page,
    prev: siblings[i - 1] ? { id: siblings[i - 1].id, page: siblings[i - 1].page, section: siblings[i - 1].section } : null,
    next: siblings[i + 1] ? { id: siblings[i + 1].id, page: siblings[i + 1].page, section: siblings[i + 1].section } : null,
    position: { index: i + 1, total: siblings.length },
  });
});

/* ─────────────────────────── search ─────────────────────────── */

api.post('/search', requireCap('search'), async (req, res) => {
  const u = req.user!;
  const { query, mode, spaceIds, docIds, types, ownerIds, tags, since, limit } = req.body ?? {};
  if (!query?.trim()) throw new HttpError(400, 'Enter a search query');
  const filtered = accessibleDocIds(u, { spaceIds, docIds }).filter((id) => {
    const d = db.docs.get(id)!;
    return (!types?.length || types.includes(d.type))
      && (!ownerIds?.length || ownerIds.includes(d.ownerId))
      && (!tags?.length || d.tags.some((t) => tags.includes(t)))
      && (!since || d.createdAt >= since);
  });
  const strategy = (['hybrid', 'vector', 'keyword'].includes(mode) ? mode : 'hybrid') as Settings['strategy'];
  const r = filtered.length
    ? await retrieve(u, query, { docIds: filtered, strategy, topK: Math.min(Number(limit) || 20, 50), pool: 60 })
    : { results: [], ms: 0, candidates: 0, vectorHits: 0, keywordHits: 0, rewrittenQuery: query, allowedDocs: 0 };
  // collapse to the best passage per document + section
  const seen = new Set<string>();
  const results = r.results.filter((x) => {
    const k = `${x.doc.id}::${x.chunk.section}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((x) => {
    const s = bestSentence(x, query);
    return {
      chunkId: x.chunk.id, chunkSeq: x.chunk.seq, docId: x.doc.id, docTitle: x.doc.title, type: x.doc.type,
      space: db.spaces.get(x.doc.spaceId)?.name, spaceColor: db.spaces.get(x.doc.spaceId)?.color,
      page: x.chunk.page, pageLabel: x.doc.pageLabel, section: x.chunk.section, text: x.chunk.text,
      highlight: { start: s.start, end: s.end }, score: x.score, vector: x.vector, keyword: x.keyword, coverage: x.coverage,
      owner: db.users.get(x.doc.ownerId)?.name, updatedAt: x.doc.updatedAt,
    };
  });
  audit(u.id, 'search', query, { mode: strategy, results: results.length });
  res.json({
    results,
    stats: { ms: r.ms, candidates: r.candidates, vectorHits: r.vectorHits, keywordHits: r.keywordHits, searchedDocs: filtered.length, rewrittenQuery: r.rewrittenQuery, mode: strategy },
  });
});

api.get('/search/facets', (req, res) => {
  const u = req.user!;
  const ids = new Set(accessibleDocIds(u));
  const docs = db.docs.find((d) => ids.has(d.id));
  const count = <T extends string>(xs: T[]) => Object.entries(xs.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {} as Record<string, number>));
  res.json({
    spaces: accessibleSpaces(u).map((s) => ({ id: s.id, name: s.name, color: s.color, count: docs.filter((d) => d.spaceId === s.id).length })),
    types: count(docs.map((d) => d.type)).map(([k, n]) => ({ id: k, count: n })),
    owners: [...new Set(docs.map((d) => d.ownerId))].map((id) => ({ id, name: db.users.get(id)?.name ?? 'Unknown', count: docs.filter((d) => d.ownerId === id).length })),
    tags: count(docs.flatMap((d) => d.tags)).map(([k, n]) => ({ id: k, count: n })).sort((a, b) => b.count - a.count),
  });
});

/* ─────────────────────────── chat ─────────────────────────── */

function sse(res: Response) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

api.post('/chat/ask', requireCap('ask'), async (req, res) => {
  const u = req.user!;
  const { question, conversationId, docIds, spaceIds } = req.body ?? {};
  if (!question?.trim()) throw new HttpError(400, 'Ask a question');
  let conv: Conversation | undefined = conversationId ? db.conversations.get(conversationId) : undefined;
  if (conv && conv.userId !== u.id) throw new HttpError(403, 'Not your conversation');
  const now = new Date().toISOString();
  if (!conv) {
    conv = {
      id: nanoid(12), userId: u.id, title: question.trim().slice(0, 80), docIds: docIds ?? [], spaceIds: spaceIds ?? [],
      shared: false, messages: [], createdAt: now, updatedAt: now,
    };
    db.conversations.insert(conv);
  }
  const userMsg = { id: nanoid(12), role: 'user' as const, content: question.trim(), createdAt: now };
  db.conversations.update(conv.id, (c) => ({ messages: [...c.messages, userMsg], docIds: docIds ?? c.docIds, spaceIds: spaceIds ?? c.spaceIds, updatedAt: now }));


  const send = sse(res);
  send({ type: 'conversation', conversationId: conv.id, userMessage: userMsg });
  try {
    const msg = await answerQuestion(u, question.trim(), { docIds, spaceIds }, (e) => {
      if (e.type !== 'done') send(e);
    });
    db.conversations.update(conv.id, (c) => ({ messages: [...c.messages, msg], updatedAt: new Date().toISOString() }));
    audit(u.id, 'chat.ask', question.trim().slice(0, 120), { refused: !!msg.refused, citations: msg.citations?.length ?? 0 });
    send({ type: 'done', message: msg, conversationId: conv.id });
  } catch (e) {
    send({ type: 'error', message: (e as Error).message });
  }
  res.end();
});

api.get('/conversations', (req, res) => {
  const u = req.user!;
  const list = db.conversations
    .find((c) => c.userId === u.id || c.shared)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((c) => ({
      id: c.id, title: c.title, updatedAt: c.updatedAt, shared: c.shared, mine: c.userId === u.id,
      owner: db.users.get(c.userId)?.name, messages: c.messages.length,
      lastAnswer: [...c.messages].reverse().find((m) => m.role === 'assistant')?.content.slice(0, 160) ?? '',
      docIds: c.docIds,
    }));
  res.json({ conversations: list });
});

api.get('/conversations/:id', (req, res) => {
  const u = req.user!;
  const c = db.conversations.get(String(req.params.id));
  if (!c || (c.userId !== u.id && !c.shared)) throw new HttpError(404, 'Conversation not found');
  // re-check access: hide citations to documents this viewer cannot open
  const messages = c.messages.map((m) => ({
    ...m,
    citations: m.citations?.filter((ci) => { const d = db.docs.get(ci.docId); return d && canAccessDoc(u, d); }),
  }));
  res.json({ conversation: { ...c, messages, mine: c.userId === u.id } });
});

api.patch('/conversations/:id', (req, res) => {
  const c = db.conversations.get(String(req.params.id));
  if (!c || c.userId !== req.user!.id) throw new HttpError(404, 'Conversation not found');
  const patch: Partial<Conversation> = {};
  if (typeof req.body.title === 'string') patch.title = req.body.title.slice(0, 120);
  if (typeof req.body.shared === 'boolean') patch.shared = req.body.shared;
  res.json({ conversation: db.conversations.update(c.id, patch) });
});

api.delete('/conversations/:id', (req, res) => {
  const c = db.conversations.get(String(req.params.id));
  if (!c || c.userId !== req.user!.id) throw new HttpError(404, 'Conversation not found');
  db.conversations.remove(c.id);
  res.json({ ok: true });
});

/* ─────────────────────────── compare ─────────────────────────── */

api.post('/compare', requireCap('ask'), async (req, res) => {
  const u = req.user!;
  const a = getDocFor(u, req.body.docA);
  const b = getDocFor(u, req.body.docB);
  if (a.status !== 'ready' || b.status !== 'ready') throw new HttpError(409, 'Both documents must finish indexing first');
  const t = Date.now();
  const out = await compareDocuments(u, a, b);
  audit(u.id, 'compare', `${a.title} ↔ ${b.title}`, { differences: out.differences });
  res.json({ ...out, ms: Date.now() - t });
});

api.post('/compare/clause', requireCap('ask'), async (req, res) => {
  const u = req.user!;
  const a = getDocFor(u, req.body.docA);
  const b = getDocFor(u, req.body.docB);
  if (!req.body.query?.trim()) throw new HttpError(400, 'Describe the clause to compare');
  res.json(await compareClause(u, a, b, req.body.query.trim()));
});

/* ─────────────────────────── pipeline ─────────────────────────── */

api.get('/pipeline', (req, res) => {
  const u = req.user!;
  const docs = db.docs.find((d) => canAccessDoc(u, d)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const ready = docs.filter((d) => d.status === 'ready');
  res.json({
    documents: docs.map((d) => ({ ...docView(d), summary: undefined })),
    totals: {
      chunks: ready.reduce((s, d) => s + d.processing.chunks, 0),
      tokens: ready.reduce((s, d) => s + d.processing.totalTokens, 0),
      avgMs: ready.length ? Math.round(ready.reduce((s, d) => s + d.processing.ms, 0) / ready.length) : 0,
      failed: docs.filter((d) => d.status === 'failed').length,
    },
    settings: getSettings(),
    system: systemInfo(),
    queue: queueState(),
  });
});

/* ─────────────────────────── quality ─────────────────────────── */

const evalRunner = () => db.users.findOne((x) => x.role === 'owner')!;

api.get('/quality', (_req, res) => {
  const runs = db.evalRuns.all().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const docs = new Map(db.docs.all().map((d) => [d.id, d]));
  res.json({
    runs: runs.map(({ results, ...r }) => ({ ...r, cases: results.length, warnings: results.filter((x) => x.result !== 'PASS').length })),
    latest: runs[runs.length - 1] ?? null,
    cases: db.evalCases.all().map((c) => ({ ...c, expectedDoc: c.expectedDocId ? docs.get(c.expectedDocId)?.title ?? 'Missing document' : null })),
  });
});

let evalRunning = false;
api.post('/quality/run', requireCap('quality.run'), async (req, res) => {
  if (evalRunning) throw new HttpError(409, 'An evaluation is already running');
  evalRunning = true;
  try {
    const { strategy, rerank, label } = req.body ?? {};
    const run = await runEvaluation(evalRunner(), {
      strategy: ['hybrid', 'vector', 'keyword'].includes(strategy) ? strategy : undefined,
      rerank: typeof rerank === 'boolean' ? rerank : undefined,
      label: label || `Run by ${req.user!.name.split(' ')[0]}`,
    });
    audit(req.user!.id, 'quality.run', run.label, run.metrics);
    res.json({ run });
  } finally { evalRunning = false; }
});

api.post('/quality/cases', requireCap('quality.run'), (req, res) => {
  const { question, expectedDocId, expectedPage, note } = req.body ?? {};
  if (!question?.trim()) throw new HttpError(400, 'Question is required');
  const c = { id: nanoid(10), question: question.trim(), expectedDocId: expectedDocId || null, expectedPage: expectedPage ? Number(expectedPage) : null, note };
  db.evalCases.insert(c);
  res.status(201).json({ case: c });
});

api.delete('/quality/cases/:id', requireCap('quality.run'), (req, res) => {
  db.evalCases.remove(String(req.params.id));
  res.json({ ok: true });
});

/* ─────────────────────────── team ─────────────────────────── */

function allTeams() {
  return [...new Set([...db.users.all().flatMap((u) => u.teams), ...db.spaces.all().flatMap((s) => s.accessTeams.filter((t) => t !== '*'))])].sort();
}

api.get('/team', (req, res) => {
  const spaces = db.spaces.all();
  res.json({
    users: db.users.all().map((u) => ({
      ...publicUser(u), roleLabel: ROLE_LABEL[u.role], lastActiveAt: u.lastActiveAt, createdAt: u.createdAt,
      spaces: spaces.filter((s) => canAccessSpace(u, s)).map((s) => s.name),
    })),
    roles: (Object.keys(ROLE_CAPS) as Role[]).map((r) => ({ id: r, label: ROLE_LABEL[r], capabilities: ROLE_CAPS[r] })),
    teams: allTeams(),
    canManage: can(req.user!, 'users.manage'),
  });
});

api.post('/team/invite', requireCap('users.manage'), async (req, res) => {
  const { name, email, role, teams, title } = req.body ?? {};
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email ?? '')) throw new HttpError(400, 'Name and a valid email are required');
  if (db.users.findOne((u) => u.email.toLowerCase() === email.toLowerCase())) throw new HttpError(409, 'That email is already a member');
  if (role === 'owner' && req.user!.role !== 'owner') throw new HttpError(403, 'Only the owner can add another owner');
  const colors = ['#5B7CFF', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981', '#EF4444'];
  const u: User = {
    id: nanoid(10), name: name.trim(), email: email.trim(), role: (Object.keys(ROLE_CAPS).includes(role) ? role : 'member') as Role,
    teams: Array.isArray(teams) ? teams : [], title: title || '', color: colors[db.users.count() % colors.length],
    passwordHash: await bcrypt.hash('demo1234', 10), createdAt: new Date().toISOString(),
  };
  db.users.insert(u);
  audit(req.user!.id, 'team.invite', u.email, { role: u.role, teams: u.teams });
  res.status(201).json({ user: publicUser(u), tempPassword: 'demo1234' });
});

api.patch('/team/:id', requireCap('users.manage'), (req, res) => {
  const target = db.users.get(String(req.params.id));
  if (!target) throw new HttpError(404, 'User not found');
  const patch: Partial<User> = {};
  if (req.body.role && Object.keys(ROLE_CAPS).includes(req.body.role)) {
    if ((req.body.role === 'owner' || target.role === 'owner') && req.user!.role !== 'owner') throw new HttpError(403, 'Only the owner can change ownership');
    if (target.role === 'owner' && req.body.role !== 'owner' && db.users.count((u) => u.role === 'owner') === 1) throw new HttpError(409, 'A workspace needs at least one owner');
    patch.role = req.body.role;
  }
  if (Array.isArray(req.body.teams)) patch.teams = req.body.teams.map(String);
  const next = db.users.update(target.id, patch)!;
  audit(req.user!.id, 'team.update', next.email, patch as Record<string, unknown>);
  res.json({ user: publicUser(next) });
});

api.delete('/team/:id', requireCap('users.manage'), (req, res) => {
  const target = db.users.get(String(req.params.id));
  if (!target) throw new HttpError(404, 'User not found');
  if (target.role === 'owner') throw new HttpError(409, 'The workspace owner cannot be removed');
  if (target.id === req.user!.id) throw new HttpError(409, 'You cannot remove yourself');
  db.users.remove(target.id);
  audit(req.user!.id, 'team.remove', target.email);
  res.json({ ok: true });
});

/* ─────────────────────────── settings & audit ─────────────────────────── */

api.get('/settings', (_req, res) => res.json({ settings: getSettings(), system: systemInfo() }));

api.patch('/settings', requireCap('ai.configure'), (req, res) => {
  const b = req.body ?? {};
  const cur = getSettings();
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);
  const next: Settings = {
    ...cur,
    strategy: ['hybrid', 'vector', 'keyword'].includes(b.strategy) ? b.strategy : cur.strategy,
    hybridAlpha: num(b.hybridAlpha, 0, 1, cur.hybridAlpha),
    rerank: typeof b.rerank === 'boolean' ? b.rerank : cur.rerank,
    topK: num(b.topK, 1, 12, cur.topK),
    candidatePool: num(b.candidatePool, 10, 100, cur.candidatePool),
    minRelevance: num(b.minRelevance, 0, 0.9, cur.minRelevance),
    chunkSize: num(b.chunkSize, 80, 800, cur.chunkSize),
    chunkOverlap: num(b.chunkOverlap, 0, 200, cur.chunkOverlap),
    queryRewrite: typeof b.queryRewrite === 'boolean' ? b.queryRewrite : cur.queryRewrite,
    useLlm: typeof b.useLlm === 'boolean' ? b.useLlm : cur.useLlm,
  };
  db.settings.update('workspace', next);
  audit(req.user!.id, 'settings.update', 'AI configuration', next as unknown as Record<string, unknown>);
  res.json({ settings: next, reindexRequired: next.chunkSize !== cur.chunkSize || next.chunkOverlap !== cur.chunkOverlap });
});

api.get('/audit', requireCap('users.manage'), (_req, res) => {
  const entries = db.audit.all().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200)
    .map((e) => ({ ...e, user: db.users.get(e.userId)?.name ?? 'Removed user' }));
  res.json({ entries });
});

api.get('/integrations', (_req, res) => {
  const live = { status: 'live' as const };
  const planned = { status: 'planned' as const };
  res.json({
    integrations: [
      { id: 'pdf', name: 'PDF', description: 'Text-layer PDFs with page-accurate citations', ...live },
      { id: 'docx', name: 'Word (DOCX)', description: 'Headings and lists preserved as sections', ...live },
      { id: 'url', name: 'Website / URL', description: 'Fetch a public page and index its content', ...live },
      { id: 'txt', name: 'Text & Markdown', description: 'Plain text and .md with heading detection', ...live },
      { id: 'csv', name: 'CSV', description: 'Each row indexed as a retrievable record', ...live },
      { id: 'gdrive', name: 'Google Drive', description: 'Sync folders with permission mirroring', ...planned },
      { id: 'notion', name: 'Notion', description: 'Pages and databases', ...planned },
      { id: 'confluence', name: 'Confluence', description: 'Spaces and page trees', ...planned },
      { id: 'dropbox', name: 'Dropbox', description: 'Shared folders', ...planned },
      { id: 'sharepoint', name: 'SharePoint', description: 'Document libraries', ...planned },
    ],
  });
});
