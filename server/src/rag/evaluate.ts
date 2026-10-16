import { nanoid } from 'nanoid';
import { db } from '../store/db.js';
import type { EvalCaseResult, EvalRun, Settings, User } from '../types.js';
import { answerQuestion } from './answer.js';
import { llmEnabled } from './llm.js';
import { conceptSet, coverage, round } from './text.js';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Offline RAG evaluation over a labelled question set.
 *  - Retrieval hit rate   : expected page appears in the top-5 retrieved passages
 *  - Retrieval precision  : share of top-5 passages that come from the expected document
 *  - Groundedness         : share of answer content supported by the passages it cites
 *  - Citation coverage    : share of answer sentences carrying a valid citation
 *  - Answer relevance     : share of question concepts addressed by the answer
 *  - No-answer accuracy   : unanswerable questions correctly refused
 */
export async function runEvaluation(
  runner: User,
  opts: { label?: string; strategy?: Settings['strategy']; rerank?: boolean; topK?: number } = {},
): Promise<EvalRun> {
  const cases = db.evalCases.all();
  const docs = new Map(db.docs.all().map((d) => [d.id, d]));
  const results: EvalCaseResult[] = [];
  const latencies: number[] = [];

  for (const c of cases) {
    const msg = await answerQuestion(runner, c.question, { strategy: opts.strategy, rerank: opts.rerank, topK: opts.topK }, () => {});
    latencies.push(msg.trace?.ms.total ?? 0);
    const top5 = (msg.trace?.reranked ?? []).slice(0, 5).map((r) => db.chunks.get(r.chunkId)).filter(Boolean);
    const first = top5[0];
    const retrieved = first ? `${docs.get(first.docId)?.title ?? '—'} · p${first.page}` : 'None';
    const exp = c.expectedDocId ? docs.get(c.expectedDocId) : null;
    const expected = exp ? `${exp.title}${c.expectedPage ? ` · p${c.expectedPage}` : ''}` : 'None (should refuse)';

    if (!c.expectedDocId) {
      results.push({
        caseId: c.id, question: c.question, expected, retrieved: msg.refused ? 'None' : retrieved,
        hit: !!msg.refused, refused: !!msg.refused, groundedness: 0, citationCoverage: 0, relevance: 0,
        evidence: msg.evidence?.avgRelevance ?? 0,
        result: msg.refused ? 'PASS' : 'FAIL',
        reason: msg.refused ? 'Correctly declined — no supporting source' : 'Answered a question the sources cannot support',
      });
      continue;
    }

    const docHit = top5.some((ch) => ch!.docId === c.expectedDocId);
    const pageHit = top5.some((ch) => ch!.docId === c.expectedDocId && (!c.expectedPage || ch!.page === c.expectedPage));
    const precision = top5.length ? top5.filter((ch) => ch!.docId === c.expectedDocId).length / top5.length : 0;
    const g = msg.grounding?.groundedness ?? 0;
    const cc = msg.grounding?.citationCoverage ?? 0;
    const rel = msg.refused ? 0 : coverage(c.question, conceptSet(msg.content));
    let result: EvalCaseResult['result'] = 'FAIL';
    let reason = '';
    if (msg.refused) reason = 'Refused although an answer exists';
    else if (pageHit && g >= 0.7) { result = 'PASS'; reason = 'Expected passage retrieved and answer grounded'; }
    else if (docHit) { result = 'WARN'; reason = pageHit ? 'Answer partially grounded' : 'Right document, different page'; }
    else reason = 'Expected source not retrieved';

    results.push({
      caseId: c.id, question: c.question, expected, retrieved, hit: pageHit, refused: !!msg.refused,
      groundedness: round(g), citationCoverage: round(cc), relevance: round(rel),
      evidence: msg.evidence?.avgRelevance ?? 0, result, reason,
      // stash precision on the result for aggregation
      ...({ precision } as object),
    } as EvalCaseResult);
  }

  const answerable = results.filter((r, i) => cases[i].expectedDocId);
  const unanswerable = results.filter((r, i) => !cases[i].expectedDocId);
  const answered = answerable.filter((r) => !r.refused);
  const run: EvalRun = {
    id: nanoid(10),
    createdAt: new Date().toISOString(),
    label: opts.label ?? 'Manual run',
    strategy: opts.strategy ?? (db.settings.get('workspace')!.strategy),
    rerank: opts.rerank ?? db.settings.get('workspace')!.rerank,
    topK: opts.topK ?? db.settings.get('workspace')!.topK,
    mode: llmEnabled() ? 'llm' : 'extractive',
    metrics: {
      groundedness: round(avg(answered.map((r) => r.groundedness))),
      citationCoverage: round(avg(answered.map((r) => r.citationCoverage))),
      retrievalHitRate: round(avg(answerable.map((r) => (r.hit ? 1 : 0)))),
      retrievalPrecision: round(avg(answerable.map((r) => (r as any).precision ?? 0))),
      answerRelevance: round(avg(answered.map((r) => r.relevance))),
      noAnswerAccuracy: round(avg(unanswerable.map((r) => (r.refused ? 1 : 0)))),
      passRate: round(avg(results.map((r) => (r.result === 'PASS' ? 1 : 0)))),
      avgLatencyMs: Math.round(avg(latencies)),
    },
    results: results.map(({ ...r }) => { delete (r as any).precision; return r; }),
    triggeredBy: runner.id,
  };
  db.evalRuns.insert(run);
  return run;
}
