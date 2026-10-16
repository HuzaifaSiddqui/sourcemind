import type { Chunk, Doc, DocSummary, KeyTerm } from '../types.js';
import { EXTRACTORS } from './extractors.js';
import { jsonChat, llmEnabled } from './llm.js';
import { conceptSet, coverage, sentences, tokenize } from './text.js';

const GENERIC_SECTIONS = /^(definitions?|parties|recitals?|background|introduction|contents|table of contents|signatures?|schedules?|general|miscellaneous|overview|purpose|scope)$/i;
const WEAK_QUESTION_TOPICS = /^(summary|highlights|problem|goals?|users|fixes|improvements|deprecations|requirements|out of scope|launch plan|key findings|recommendations)$/i;
const titleCase = (s: string) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));

const cleanTopic = (s: string) =>
  s.replace(/^(section|article|clause)\s+[\w.]+\s*[-—:.]?\s*/i, '').replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/^#+\s*/, '').trim();

const QUESTION_TEMPLATES: [RegExp, string][] = [
  [/terminat|cancel/i, 'What are the termination conditions?'],
  [/pricing sensitiv|willingness to pay/i, 'What pricing do customers expect?'],
  [/fee|payment|invoic/i, 'What are the payment terms?'],
  [/liabil/i, 'How is liability limited?'],
  [/renew|term\b/i, 'Are there automatic renewal provisions?'],
  [/information security/i, 'What are the information security rules for employees?'],
  [/breach|incident/i, 'What happens after a data breach?'],
  [/service level|sla|availability/i, 'What SLA commitments exist?'],
  [/data protection|privacy|retention/i, 'How long is customer data retained?'],
  [/confidential/i, 'What are the confidentiality obligations?'],
  [/leave|holiday/i, 'How much annual leave do employees get?'],
  [/remote|hybrid|working pattern/i, 'What is the remote working policy?'],
  [/probation/i, 'How long is the probation period?'],
  [/expense/i, 'Which expenses can be reimbursed?'],
  [/rate limit/i, 'What are the API rate limits?'],
  [/authenticat/i, 'How does API authentication work?'],
  [/deploy|release/i, 'How are releases deployed?'],
  [/band|salary|compensation/i, 'What are the salary bands by level?'],
  [/competit/i, 'Who are the main competitors?'],
  [/finding|insight|theme/i, 'What were the key research findings?'],
];

function localSummary(doc: Doc, chunks: Chunk[]): DocSummary {
  // term importance across the whole document
  const tf = new Map<string, number>();
  for (const c of chunks) for (const t of tokenize(c.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  const top = new Set([...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t));

  const cands: { text: string; score: number; order: number; chunkId: string }[] = [];
  chunks.slice(0, 14).forEach((c, ci) => {
    sentences(c.text).forEach((s, si) => {
      const toks = tokenize(s.text);
      if (s.text.length < 60 || s.text.length > 360 || toks.length < 8) return;
      const hits = toks.filter((t) => top.has(t)).length;
      const intro = /\b(this|the)\s+(agreement|policy|document|report|handbook|specification|schedule|addendum|release)\b/i.test(s.text) ? 0.5 : 0;
      const factual = EXTRACTORS.some((ex) => ex.match(s.text)) ? 0.7 : 0;   // sentences that carry a key term
      const definitional = /"[^"]+"\s+means\b/i.test(s.text) ? -2 : 0;      // skip "X" means … definitions
      const score = hits / Math.sqrt(toks.length) + (ci === 0 ? 0.4 : 0) - ci * 0.04 + intro + factual + definitional;
      cands.push({ text: s.text, score, order: ci * 100 + si, chunkId: c.id });
    });
  });
  const picked = cands.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.order - b.order);
  let executive = '';
  const executiveChunkIds: string[] = [];
  for (const p of picked) {
    if ((executive + p.text).length > 520) break;
    executive += (executive ? ' ' : '') + p.text;
    executiveChunkIds.push(p.chunkId);
  }

  const keyTerms: KeyTerm[] = [];
  for (const ex of EXTRACTORS) {
    for (const c of chunks) {
      const v = sentences(c.text).map((s) => ex.match(s.text)).find(Boolean);
      if (v) { keyTerms.push({ label: ex.label, value: v, chunkId: c.id, page: c.page }); break; }
    }
    if (keyTerms.length >= 8) break;
  }

  const titleSet = conceptSet(doc.title);
  const titleTokens = new Set(tokenize(doc.title));
  const titleSection = chunks[0]?.page === 1 && coverage(chunks[0].section, titleSet) >= 0.5 ? chunks[0].section : '';
  const bodySections = chunks.map((c) => c.section).filter((s) => s !== titleSection && s !== doc.title);
  const topics: string[] = [];
  for (const section of bodySections) {
    const t = titleCase(cleanTopic(section));
    if (!t || GENERIC_SECTIONS.test(t) || t.length > 40 || tokenize(t).every((w) => titleTokens.has(w))) continue;
    const label = t.length > 28 ? t.split(/\s+/).slice(0, 3).join(' ') : t;
    if (!topics.some((x) => x.toLowerCase() === label.toLowerCase())) topics.push(label);
    if (topics.length >= 8) break;
  }

  const suggested: string[] = [];
  const hay = `${topics.join(' | ')} ${bodySections.join(' | ')}`;
  for (const [re, q] of QUESTION_TEMPLATES) {
    if (re.test(hay) && !suggested.includes(q)) suggested.push(q);
    if (suggested.length >= 4) break;
  }
  const focus = topics.find((t) => !WEAK_QUESTION_TOPICS.test(t) && !suggested.some((q) => coverage(t, conceptSet(q)) > 0.5));
  if (suggested.length < 3 && focus) suggested.push(`What does ${doc.title} say about ${focus.toLowerCase()}?`);
  if (suggested.length < 4) suggested.push(`Summarise the key points of ${doc.title}.`);

  return { executive, executiveChunkIds, keyTerms, topics, suggestedQuestions: suggested.slice(0, 4), generatedBy: 'local' };
}

export async function summarise(doc: Doc, chunks: Chunk[]): Promise<DocSummary> {
  const base = localSummary(doc, chunks);
  if (!llmEnabled()) return base;
  try {
    const body = chunks.map((c) => `[${c.section} · p${c.page}] ${c.text}`).join('\n').slice(0, 14000);
    const out = await jsonChat<{ executive: string; topics: string[]; suggestedQuestions: string[] }>(
      'You summarise enterprise documents for a knowledge base. Return {"executive": string (2-3 sentences, factual), "topics": string[] (max 8, 1-3 words each), "suggestedQuestions": string[] (4 short questions a reader would ask)}. Use only the provided text.',
      `Document: ${doc.title}\n\n${body}`,
    );
    return {
      ...base,
      executive: out.executive || base.executive,
      topics: out.topics?.length ? out.topics.slice(0, 8) : base.topics,
      suggestedQuestions: out.suggestedQuestions?.length ? out.suggestedQuestions.slice(0, 4) : base.suggestedQuestions,
      generatedBy: 'llm',
    };
  } catch (e) {
    console.warn('[enrich] LLM summary failed, using local summary:', (e as Error).message);
    return base;
  }
}
