/** Text utilities shared by BM25, the local embedder, the reranker and grounding checks. */

const STOP = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by
  can could did do does doing down during each few for from further had has have having he her here hers herself him
  himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other
  our ours ourselves out over own same she should so some such than that the their theirs them themselves then there
  these they this those through to too under until up very was we were what when where which while who whom why will
  with would you your yours yourself yourselves shall may must also within upon per via any each etc s t us
  tell show give find please explain describe list say says said know`.split(/\s+/),
);

/** Light stemmer: good enough to merge plural/tense variants for retrieval. */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  const rules: [RegExp, string][] = [
    [/ational$/, 'ate'], [/ization$/, 'ize'], [/isation$/, 'ize'], [/fulness$/, 'ful'], [/ousness$/, 'ous'],
    [/iveness$/, 'ive'], [/ations?$/, 'ate'], [/ments?$/, ''], [/ness$/, ''], [/ities$/, 'ity'], [/ies$/, 'y'],
    [/ied$/, 'y'], [/ing$/, ''], [/edly$/, ''], [/ed$/, ''], [/ers?$/, ''], [/ly$/, ''], [/sses$/, 'ss'],
    [/([^s])s$/, '$1'],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const out = w.replace(re, rep);
      if (out.length >= 3) return out.replace(/(.)\1$/, (m, c) => (/[lsz]/.test(c) ? m : c));
    }
  }
  return w;
}

export function words(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').match(/[a-z0-9£$€%][a-z0-9£$€%.\-']*/g) ?? [])
    .map((w) => w.replace(/[.'\-]+$/g, ''))
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return words(text).filter((w) => !STOP.has(w) && w.length > 1).map(stem);
}

/**
 * Domain synonym groups. Lets the offline embedder match "cancel early" with
 * "termination for convenience" the way a neural embedding would.
 */
const GROUPS: string[][] = [
  ['terminate', 'termination', 'cancel', 'cancellation', 'cancels', 'exit', 'rescind', 'withdraw', 'end'],
  ['early', 'before', 'prior', 'premature', 'convenience'],
  ['payment', 'pay', 'paid', 'payable', 'invoice', 'invoicing', 'billing', 'remit'],
  ['fee', 'fees', 'charge', 'charges', 'price', 'pricing', 'cost', 'costs', 'rate', 'subscription'],
  ['salary', 'salaries', 'compensation', 'pay band', 'band', 'remuneration', 'wage', 'bonus'],
  ['leave', 'vacation', 'holiday', 'pto', 'absence', 'time-off'],
  ['liability', 'liable', 'damages', 'indemnity', 'indemnify'],
  ['cap', 'limit', 'limited', 'maximum', 'ceiling'],
  ['renew', 'renewal', 'renews', 'extend', 'extension', 'rollover'],
  ['breach', 'violation', 'incident', 'compromise', 'unauthorised', 'unauthorized'],
  ['notice', 'notify', 'notification', 'inform', 'written notice'],
  ['employee', 'employees', 'staff', 'worker', 'personnel', 'colleague', 'team member'],
  ['remote', 'home', 'hybrid', 'office', 'wfh'],
  ['security', 'secure', 'encryption', 'encrypt', 'protection', 'safeguard'],
  ['data', 'information', 'records', 'personal data'],
  ['retention', 'retain', 'store', 'storage', 'delete', 'deletion', 'archive'],
  ['discount', 'rebate', 'reduction'],
  ['late', 'overdue', 'delayed', 'arrears', 'interest'],
  ['customer', 'client', 'buyer', 'licensee'],
  ['supplier', 'vendor', 'provider', 'contractor'],
  ['contract', 'agreement', 'msa', 'terms'],
  ['deploy', 'deployment', 'release', 'rollout', 'ship'],
  ['api', 'endpoint', 'rest', 'interface'],
  ['limit', 'throttle', 'quota', 'rate limit', 'allowance'],
  ['rate', 'requests per minute', 'per minute', 'per second', 'throughput', 'burst'],
  ['enforce', 'enforced', 'exceed', 'reject', 'block', '429'],
  ['uptime', 'availability', 'sla', 'service level'],
  ['probation', 'probationary', 'trial period'],
  ['expense', 'expenses', 'reimburse', 'reimbursement', 'claim'],
  ['churn', 'cancel', 'attrition', 'retention'],
  ['competitor', 'competitive', 'rival', 'alternative'],
  ['law', 'governing', 'jurisdiction', 'courts'],
  ['confidential', 'confidentiality', 'secret', 'proprietary', 'nda'],
  ['obligation', 'obligations', 'responsible', 'responsibility', 'liable', 'must', 'required', 'owe', 'remain'],
  ['period', 'term', 'duration', 'months', 'years'],
  ['increase', 'raise', 'uplift', 'escalation', 'adjustment'],
  ['parental', 'maternity', 'paternity', 'adoption'],
  ['sick', 'illness', 'sickness', 'unwell'],
  ['learn', 'learning', 'training', 'development', 'course'],
  ['search', 'retrieval', 'find', 'lookup', 'query'],
  ['acquisition', 'acquire', 'merger', 'buyout'],
];

const groupOf = new Map<string, string[]>();
GROUPS.forEach((g, i) => {
  for (const term of g) {
    for (const w of tokenize(term)) {
      const list = groupOf.get(w) ?? [];
      list.push(`syn${i}`);
      groupOf.set(w, list);
    }
  }
});

export function synonymsOf(token: string): string[] {
  return groupOf.get(token) ?? [];
}

/** Concept set used for coverage scoring: each query token matches itself or any synonym. */
export function concepts(text: string): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const t of tokenize(text)) {
    if (seen.has(t)) continue;
    seen.add(t);
    const groups = synonymsOf(t);
    // "salary band" is one concept, not two: merge tokens that share a synonym group
    const same = groups.length ? out.find((alts) => groups.some((g) => alts.includes(g))) : undefined;
    if (same) { same.push(t, ...groups.filter((g) => !same.includes(g))); continue; }
    out.push([t, ...groups]);
  }
  return out;
}

/** Identifier-like tokens ("L5", "v1", "2028", "Q3") that an answer must actually mention. */
export function identifiers(text: string): string[] {
  return words(text).filter((w) => /^(?=.*\d)(?=.*[a-z])[a-z0-9]{2,6}$/.test(w) || /^(19|20)\d\d$/.test(w));
}

export function conceptSet(text: string): Set<string> {
  const s = new Set<string>();
  for (const t of tokenize(text)) {
    s.add(t);
    for (const g of synonymsOf(t)) s.add(g);
  }
  return s;
}

/** Fraction of query concepts present in the passage (synonym-aware). */
export function coverage(query: string | string[][], passage: Set<string>): number {
  const qc = typeof query === 'string' ? concepts(query) : query;
  if (!qc.length) return 0;
  let hit = 0;
  for (const alts of qc) if (alts.some((a) => passage.has(a))) hit++;
  return hit / qc.length;
}

export interface Sentence { text: string; start: number; end: number }

const ABBREV = /\b(e\.g|i\.e|no|vs|approx|para|cl|inc|ltd|plc|co|mr|mrs|ms|dr|st|art|sec|fig|etc)\.$/i;

/** Sentence splitter that keeps decimals ("1.5%"), clause numbers ("8.4") and abbreviations intact. */
export function sentences(text: string, offset = 0): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: offset + start + lead, end: offset + start + lead + t.length });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { push(i); start = i + 1; continue; }
    if (c !== '.' && c !== '!' && c !== '?') continue;
    let j = i + 1;
    while (j < text.length && /["')\]]/.test(text[j])) j++;
    if (j < text.length && !/\s/.test(text[j])) continue;                 // "1.5", "8.4", "e.g."
    if (c === '.' && ABBREV.test(text.slice(Math.max(0, i - 6), i + 1))) continue;
    if (c === '.' && /(^|\s)\d{1,2}(\.\d{1,2})*\.$/.test(text.slice(Math.max(0, i - 8), i + 1))) continue; // "8.1 " clause numbering
    push(j);
    start = j;
    i = j - 1;
  }
  push(text.length);
  return out;
}

export const approxTokens = (t: string) => Math.max(1, Math.round(t.length / 4));

export function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }
export function round(n: number, d = 3) { const p = 10 ** d; return Math.round(n * p) / p; }
