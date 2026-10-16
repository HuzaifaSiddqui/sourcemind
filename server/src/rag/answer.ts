import { nanoid } from 'nanoid';
import { db, getSettings } from '../store/db.js';
import type { Citation, Message, User } from '../types.js';
import { evidenceStrength, toCitation, validateAnswer } from './grounding.js';
import { llmEnabled, streamChat } from './llm.js';
import { retrieve, type Retrieved, type RetrieveOptions } from './retriever.js';
import { concepts, conceptSet, coverage, identifiers, sentences, tokenize, words } from './text.js';

export const REFUSAL = "I couldn't find enough information in the selected sources to answer this reliably.";

export type AnswerEvent =
  | { type: 'retrieval'; passages: number; documents: number; ms: number }
  | { type: 'token'; text: string }
  | { type: 'done'; message: Message };

const SYSTEM = `You are SourceMind, an enterprise knowledge assistant.
Answer ONLY from the numbered sources provided. Every factual sentence must end with one or more citations like [1] or [2][3] that point to the sources supporting it.
Write concise, professional prose in short paragraphs (no headings). Do not mention "the sources" or "the context" explicitly.
If the sources do not contain the information needed, reply with exactly: INSUFFICIENT_CONTEXT`;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Extractive answer composer used when no LLM is configured.
 * Selects the sentences that best cover the question from the top passages
 * and cites each one. Nothing is generated that is not in a source.
 */
function extractiveAnswer(question: string, top: Retrieved[]) {
  const q = concepts(question);
  type Cand = { text: string; r: Retrieved; score: number; pos: number; rank: number };
  const cands: Cand[] = [];
  top.slice(0, 5).forEach((r, rank) => {
    const sectionCov = coverage(q, conceptSet(`${r.doc.title} ${r.chunk.section}`));
    for (const s of sentences(r.chunk.text)) {
      const t = s.text.replace(/\s+/g, ' ').trim();
      if (t.length < 25 || tokenize(t).length < 4) continue;
      const cov = 0.75 * coverage(q, conceptSet(t)) + 0.25 * sectionCov;
      cands.push({ text: t, r, score: 0.6 * cov + 0.4 * r.score - rank * 0.04, pos: s.start, rank });
    }
  });
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0]?.score ?? 0;
  const picked: Cand[] = [];
  const perChunk = new Map<string, number>();
  for (const c of cands) {
    if (picked.length >= 4 || c.score < 0.36 || c.score < best * 0.78) break;
    if ((perChunk.get(c.r.chunk.id) ?? 0) >= (c.rank === 0 ? 3 : 2)) continue;
    const toks = new Set(tokenize(c.text));
    const dup = picked.some((p) => {
      const pt = new Set(tokenize(p.text));
      const inter = [...toks].filter((t) => pt.has(t)).length;
      return inter / Math.min(toks.size, pt.size) > 0.7;
    });
    if (dup) continue;
    picked.push(c);
    perChunk.set(c.r.chunk.id, (perChunk.get(c.r.chunk.id) ?? 0) + 1);
  }
  if (!picked.length) return null;
  picked.sort((a, b) => a.rank - b.rank || a.pos - b.pos);

  const numOf = new Map<string, number>();
  const sources = new Map<number, Retrieved>();
  const cites: Citation[] = [];
  const paragraphs: string[] = [];
  let lastDoc = '';
  for (const p of picked) {
    let n = numOf.get(p.r.chunk.id);
    if (!n) {
      n = numOf.size + 1;
      numOf.set(p.r.chunk.id, n);
      sources.set(n, p.r);
      cites.push(toCitation(n, p.r, p.text));
    }
    const sentence = `${p.text.replace(/[.;:]$/, '')} [${n}].`;
    if (p.r.doc.id === lastDoc) paragraphs[paragraphs.length - 1] += ` ${sentence}`;
    else paragraphs.push(`**${p.r.doc.title} — ${p.r.chunk.section}.** ${sentence}`);
    lastDoc = p.r.doc.id;
  }
  return { text: paragraphs.join('\n\n'), sources, cites };
}

export async function answerQuestion(
  user: User,
  question: string,
  opts: RetrieveOptions & { followUpPool?: string[] },
  emit: (e: AnswerEvent) => void,
): Promise<Message> {
  const settings = getSettings();
  const t0 = Date.now();
  const ret = await retrieve(user, question, opts);
  const top = ret.results;
  emit({ type: 'retrieval', passages: top.length, documents: new Set(top.map((r) => r.doc.id)).size, ms: ret.ms });

  const trace = {
    strategy: `${opts.strategy ?? settings.strategy}${(opts.rerank ?? settings.rerank) ? ' + rerank' : ''}`,
    rewrittenQuery: ret.rewrittenQuery,
    allowedDocs: ret.allowedDocs,
    candidates: ret.candidates,
    vectorHits: ret.vectorHits,
    keywordHits: ret.keywordHits,
    reranked: top.map((r) => ({ chunkId: r.chunk.id, score: r.score, vector: r.vector, keyword: r.keyword, coverage: r.coverage })),
    ms: { retrieve: ret.ms, generate: 0, total: 0 },
  };

  const refuse = async (): Promise<Message> => {
    for (const w of REFUSAL.split(/(?<= )/)) { emit({ type: 'token', text: w }); await sleep(6); }
    trace.ms.total = Date.now() - t0;
    const msg: Message = {
      id: nanoid(12), role: 'assistant', content: REFUSAL, createdAt: new Date().toISOString(),
      refused: true, citations: [], evidence: evidenceStrength([]), mode: llmEnabled() ? 'llm' : 'extractive', trace,
      followUps: [],
    };
    emit({ type: 'done', message: msg });
    return msg;
  };

  // Safe "I don't know": no passage is relevant enough to ground an answer.
  if (!top.length || top[0].score < settings.minRelevance || top[0].coverage < 0.5) return refuse();
  const grounded = top.filter((r) => r.score >= settings.minRelevance * 0.85);
  // Hard constraint: specific identifiers in the question (L5, v1, 2028…) must appear in the primary evidence passage.
  const ids = identifiers(question);
  if (ids.length) {
    const lead = grounded[0] ?? top[0];
    const evidence = new Set(words(`${lead.doc.title} ${lead.chunk.section} ${lead.chunk.text}`));
    if (!ids.every((id) => evidence.has(id))) return refuse();
  }

  const tg = Date.now();
  let text: string;
  let sources: Map<number, Retrieved>;
  let citations: Citation[];
  const mode: Message['mode'] = llmEnabled() ? 'llm' : 'extractive';

  if (mode === 'llm') {
    sources = new Map(grounded.map((r, i) => [i + 1, r]));
    const ctx = grounded
      .map((r, i) => `[${i + 1}] ${r.doc.title} — ${r.chunk.section} (${r.doc.pageLabel} ${r.chunk.page})\n${r.chunk.text}`)
      .join('\n\n');
    let raw = '';
    let buffered = '';
    let released = false;
    raw = await streamChat(SYSTEM, `Sources:\n${ctx}\n\nQuestion: ${question}`, (t) => {
      // hold back the first tokens so an INSUFFICIENT_CONTEXT reply is never streamed
      if (released) return emit({ type: 'token', text: t });
      buffered += t;
      if (buffered.length > 24 && !'INSUFFICIENT_CONTEXT'.startsWith(buffered.trim().slice(0, 20))) {
        released = true;
        emit({ type: 'token', text: buffered });
      }
    });
    if (raw.trim().startsWith('INSUFFICIENT_CONTEXT')) return refuse();
    if (!released) emit({ type: 'token', text: buffered });
    const v = validateAnswer(raw, sources);
    text = v.text;
    citations = v.used.map((n) => toCitation(n, sources.get(n)!, citedClaim(text, n)));
    if (!citations.length) return refuse();
    trace.ms.generate = Date.now() - tg;
    trace.ms.total = Date.now() - t0;
    const msg: Message = {
      id: nanoid(12), role: 'assistant', content: text, createdAt: new Date().toISOString(),
      citations, evidence: evidenceStrength(citations), grounding: v.grounding, mode, trace,
      followUps: followUps(question, citations, opts.followUpPool),
    };
    emit({ type: 'done', message: msg });
    return msg;
  }

  const ex = extractiveAnswer(question, grounded);
  if (!ex) return refuse();
  ({ text, sources, cites: citations } = ex);
  for (const piece of text.match(/\S+\s*/g) ?? []) { emit({ type: 'token', text: piece }); await sleep(4); }
  const v = validateAnswer(text, sources);
  trace.ms.generate = Date.now() - tg;
  trace.ms.total = Date.now() - t0;
  const msg: Message = {
    id: nanoid(12), role: 'assistant', content: v.text, createdAt: new Date().toISOString(),
    citations, evidence: evidenceStrength(citations), grounding: v.grounding, mode, trace,
    followUps: followUps(question, citations, opts.followUpPool),
  };
  emit({ type: 'done', message: msg });
  return msg;
}

function citedClaim(text: string, n: number) {
  return sentences(text).filter((s) => s.text.includes(`[${n}]`)).map((s) => s.text).join(' ') || text;
}

/** Follow-up questions come from the summaries of the documents that were actually cited. */
function followUps(question: string, cites: Citation[], pool: string[] = []) {
  const qset = conceptSet(question);
  const fromCited = [...new Set(cites.map((c) => c.docId))]
    .flatMap((id) => db.docs.get(id)?.summary?.suggestedQuestions ?? [])
    .filter((q) => !/^Summarise the key points/.test(q));
  return [...new Set([...fromCited, ...pool])]
    .filter((p) => coverage(p, qset) < 0.5)
    .slice(0, 3);
}
