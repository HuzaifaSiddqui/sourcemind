import type { Citation, EvidenceStrength, Grounding } from '../types.js';
import type { Retrieved } from './retriever.js';
import { concepts, conceptSet, coverage, round, sentences, tokenize } from './text.js';

/** Pick the sentence inside a chunk that best supports a claim (or the query). */
export function bestSentence(r: Retrieved, claim: string) {
  const sents = sentences(r.chunk.text);
  const c = concepts(claim);
  let best = sents[0] ?? { text: r.chunk.text, start: 0, end: r.chunk.text.length };
  let bestScore = -1;
  for (const s of sents) {
    if (s.text.length < 20) continue;
    const sc = coverage(c, conceptSet(s.text)) + Math.min(s.text.length, 300) / 3000;
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return best;
}

export function toCitation(n: number, r: Retrieved, claim: string): Citation {
  const s = bestSentence(r, claim);
  return {
    n,
    chunkId: r.chunk.id,
    chunkSeq: r.chunk.seq,
    docId: r.doc.id,
    docTitle: r.doc.title,
    spaceId: r.doc.spaceId,
    page: r.chunk.page,
    pageLabel: r.doc.pageLabel,
    section: r.chunk.section,
    relevance: r.score,
    quote: s.text,
    highlight: { start: r.chunk.start + s.start, end: r.chunk.start + s.end },
    chunkRange: { start: r.chunk.start, end: r.chunk.end },
  };
}

const CITE = /\s?\[(\d+(?:\s*,\s*\d+)*)\]/g;

/**
 * Citation validation:
 *  - removes citation markers that point at sources that were never provided,
 *  - scores each sentence by how much of its content is present in the passages it cites,
 *  - reports citation coverage (sentences carrying at least one valid citation).
 */
export function validateAnswer(answer: string, sources: Map<number, Retrieved>): { text: string; grounding: Grounding; used: number[] } {
  let removed = 0;
  // normalise "claim. [1]" → "claim [1]." so each marker stays inside the sentence it supports
  const normalised = answer.replace(/([.!?])\s*((?:\s?\[\d+(?:\s*,\s*\d+)*\])+)/g, (_m, p: string, cites: string) => ` ${cites.trim()}${p}`);
  const text = normalised.replace(CITE, (m, list: string) => {
    const nums = list.split(',').map((x) => Number(x.trim())).filter((n) => sources.has(n));
    removed += list.split(',').length - nums.length;
    return nums.length ? ` ${nums.map((n) => `[${n}]`).join('')}` : '';
  });

  const used = new Set<number>();
  const allText = [...sources.values()].map((r) => `${r.chunk.section} ${r.chunk.text}`).join(' ');
  const allSet = conceptSet(allText);
  let weighted = 0, weight = 0, cited = 0, counted = 0;
  const unsupported: string[] = [];

  // bold lead-ins ("**Doc — Section.**") are labels, not claims
  const plain = text.replace(/^\*\*[^*\n]+\*\*\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/^#+\s.*$/gm, '').replace(/^[-*•]\s+/gm, '');
  for (const s of sentences(plain)) {
    const nums = [...s.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const claim = s.text.replace(/\[\d+\]/g, '');
    const toks = tokenize(claim);
    if (toks.length < 4) continue;
    counted++;
    nums.forEach((n) => used.add(n));
    const target = nums.length
      ? conceptSet(nums.map((n) => `${sources.get(n)!.chunk.section} ${sources.get(n)!.chunk.text}`).join(' '))
      : allSet;
    const support = coverage(concepts(claim), target);
    if (nums.length) cited++;
    weighted += support * toks.length;
    weight += toks.length;
    if (support < 0.5) unsupported.push(claim.trim());
  }

  return {
    text: text.trim(),
    used: [...used].sort((a, b) => a - b),
    grounding: {
      groundedness: round(weight ? weighted / weight : 0),
      citationCoverage: round(counted ? cited / counted : 0),
      unsupported,
      removedCitations: removed,
    },
  };
}

export function evidenceStrength(cites: Citation[]): EvidenceStrength {
  if (!cites.length) return { level: 'None', passages: 0, documents: 0, avgRelevance: 0 };
  const passages = new Set(cites.map((c) => c.chunkId)).size;
  const documents = new Set(cites.map((c) => c.docId)).size;
  const avg = cites.reduce((s, c) => s + c.relevance, 0) / cites.length;
  const level = (passages >= 3 && avg >= 0.58) || (passages >= 2 && avg >= 0.66) || avg >= 0.78
    ? 'Strong'
    : avg >= 0.5 ? 'Moderate' : 'Weak';
  return { level, passages, documents, avgRelevance: round(avg) };
}
