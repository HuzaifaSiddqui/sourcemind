/** Clause/value extractors shared by document summaries and document comparison. */

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fourteen: 14, fifteen: 15, eighteen: 18, twenty: 20, 'twenty-four': 24, thirty: 30, 'thirty-six': 36, forty: 40,
  'forty-five': 45, sixty: 60, 'seventy-two': 72, ninety: 90,
};
const NUM = `(\\d+|${Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|')})`;
export const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s.toLowerCase()] ?? NaN);

export interface Extractor {
  key: string;
  label: string;
  /** Natural-language probe used to retrieve the right clause. */
  probe: string;
  match: (sentence: string) => string | null;
  kind: 'contract' | 'policy' | 'technical' | 'any';
}

const rx = (re: RegExp, fmt: (m: RegExpMatchArray) => string) => (s: string) => {
  const m = s.match(re);
  return m ? fmt(m) : null;
};

const unit = (n: string, u: string) => `${toNum(n)} ${u.replace(/s?$/, toNum(n) === 1 ? '' : 's')}`;

export const EXTRACTORS: Extractor[] = [
  {
    key: 'contractValue', label: 'Contract Value', kind: 'contract', probe: 'total contract value annual fees',
    match: rx(/(?:total|aggregate|annual)?\s*(?:contract value|subscription fees?|committed fees?|fees? of)[^.]{0,60}?([£$€]\s?[\d,]+(?:\.\d+)?(?:\s?(?:k|m|million))?)/i, (m) => m[1].replace(/\s/g, '')),
  },
  {
    key: 'effectiveDate', label: 'Effective Date', kind: 'contract', probe: 'effective date of the agreement',
    match: rx(/effective\s+(?:date|as of|from|on)[^.]{0,30}?(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})/, (m) => m[1]),
  },
  {
    key: 'initialTerm', label: 'Initial Term', kind: 'contract', probe: 'initial subscription term length months',
    match: rx(new RegExp(`initial\\s+(?:subscription\\s+)?term[^.]{0,40}?${NUM}[\\s-]*(?:\\(\\d+\\)\\s*)?(months?|years?)`, 'i'), (m) => unit(m[1], m[2])),
  },
  {
    key: 'renewal', label: 'Renewal', kind: 'contract', probe: 'automatic renewal successive renewal term',
    match: (s) => {
      if (!/renew/i.test(s)) return null;
      const m = s.match(new RegExp(`${NUM}[\\s-]*(?:\\(\\d+\\)\\s*)?(month|year)`, 'i'));
      if (/automatic(ally)?\s+renew|renews?\s+automatically/i.test(s)) return m ? `Auto-renews for ${toNum(m[1])}-${m[2].toLowerCase()} terms` : 'Automatic renewal';
      if (/not\s+(automatically\s+)?renew|no automatic renewal/i.test(s)) return 'No automatic renewal';
      return m ? `Renewal term ${toNum(m[1])} ${m[2].toLowerCase()}s` : null;
    },
  },
  {
    key: 'paymentTerm', label: 'Payment Term', kind: 'contract', probe: 'payment terms invoices due within days net',
    match: (s) => {
      const net = s.match(/\bnet\s*(\d+)/i);
      if (net) return `Net ${net[1]}`;
      const m = s.match(new RegExp(`(?:payable|paid|due)\\s+within\\s+${NUM}\\s*(?:\\(\\d+\\)\\s*)?days`, 'i'));
      return m ? `Net ${toNum(m[1])}` : null;
    },
  },
  {
    key: 'lateFee', label: 'Late Fee', kind: 'contract', probe: 'late payment interest overdue amounts per month',
    match: (s) => {
      if (!/late|overdue|interest|arrears/i.test(s)) return null;
      const m = s.match(/(\d+(?:\.\d+)?)\s?%\s*(?:per|a|each)\s*(month|annum|year)/i);
      return m ? `${m[1]}% ${m[2].toLowerCase() === 'month' ? 'monthly' : 'annually'}` : null;
    },
  },
  {
    key: 'earlyDiscount', label: 'Early Payment Discount', kind: 'contract', probe: 'early payment discount paid within days',
    match: (s) => {
      if (!/discount/i.test(s)) return null;
      if (/no\s+(early[- ]payment\s+)?discount|not\s+entitled\s+to\s+any\s+discount/i.test(s)) return 'None';
      const m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s?%[^.]{0,60}?within\\s+${NUM}\\s*(?:\\(\\d+\\)\\s*)?days`, 'i'));
      return m ? `${m[1]}% within ${toNum(m[2])} days` : null;
    },
  },
  {
    key: 'terminationNotice', label: 'Termination Notice', kind: 'contract', probe: 'terminate for convenience written notice days',
    match: (s) => {
      if (!/terminat|cancel/i.test(s)) return null;
      const m = s.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(days|months)['’]?\\s+(?:prior\\s+)?(?:written\\s+)?notice`, 'i'));
      return m ? `${unit(m[1], m[2])}' notice` : null;
    },
  },
  {
    key: 'liabilityCap', label: 'Liability Cap', kind: 'contract', probe: 'aggregate liability limited cap fees paid',
    match: (s) => {
      if (!/liabilit/i.test(s)) return null;
      const m = s.match(new RegExp(`(?:limited to|shall not exceed|capped at|exceed)\\s+(?:an amount equal to\\s+)?(?:the\\s+)?(?:total\\s+)?(?:fees[^.]{0,30}?(?:in|during)\\s+the\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?months`, 'i'));
      if (m) return `${toNum(m[1])} months of fees`;
      const money = s.match(/(?:limited to|shall not exceed|capped at)\s+([£$€][\d,]+)/i);
      return money ? money[1] : null;
    },
  },
  {
    key: 'priceIncrease', label: 'Price Increase Cap', kind: 'contract', probe: 'price increase annual uplift cap',
    match: (s) => {
      if (!/increase|uplift|adjust/i.test(s)) return null;
      const cpi = s.match(/CPI\s*(?:\+|plus)\s*(\d+(?:\.\d+)?)\s?%/i);
      if (cpi) return `CPI + ${cpi[1]}%`;
      const m = s.match(/(?:exceed|more than|capped at|maximum of|up to)\s+(\d+(?:\.\d+)?)\s?%/i);
      return m ? `${m[1]}% per year` : null;
    },
  },
  {
    key: 'uptime', label: 'Uptime SLA', kind: 'contract', probe: 'service level availability uptime percent',
    match: rx(/(\d{2}(?:\.\d+)?)\s?%\s*(?:monthly\s+)?(?:uptime|availability)/i, (m) => `${m[1]}%`),
  },
  {
    key: 'dataRetention', label: 'Data Retention', kind: 'contract', probe: 'retain records data retention period years',
    match: (s) => {
      if (!/retain|retention|kept for|stored for/i.test(s)) return null;
      const m = s.match(new RegExp(`(?:for|of|period of)\\s+(?:a\\s+(?:minimum|maximum)\\s+of\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?(years?|months?|days)`, 'i'));
      return m ? unit(m[1], m[2]) : null;
    },
  },
  {
    key: 'breachNotice', label: 'Breach Notification', kind: 'contract', probe: 'notify security incident data breach within hours',
    match: (s) => {
      if (!/breach|incident/i.test(s) || !/notif/i.test(s)) return null;
      const m = s.match(new RegExp(`within\\s+${NUM}\\s*(?:\\(\\d+\\)\\s*)?(hours|days)`, 'i'));
      return m ? `Within ${unit(m[1], m[2])}` : null;
    },
  },
  {
    key: 'governingLaw', label: 'Governing Law', kind: 'contract', probe: 'governed by the laws of jurisdiction',
    match: rx(/governed by(?:,? and construed in accordance with,?)?\s+the\s+laws?\s+of\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s(?:and|&)\s[A-Z][a-z]+|\s[A-Z][a-z]+)*)/, (m) => m[1]),
  },
  {
    key: 'annualLeave', label: 'Annual Leave', kind: 'policy', probe: 'annual leave days holiday entitlement',
    match: rx(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(?:working\\s+)?days['’]?\\s+(?:of\\s+)?(?:paid\\s+)?(?:annual\\s+)?(?:leave|holiday)`, 'i'), (m) => `${toNum(m[1])} days`),
  },
  {
    key: 'probation', label: 'Probation', kind: 'policy', probe: 'probation period months',
    match: rx(new RegExp(`probation(?:ary)?\\s+period[^.]{0,20}?${NUM}\\s*(?:\\(\\d+\\)\\s*)?months`, 'i'), (m) => `${toNum(m[1])} months`),
  },
  {
    key: 'noticePeriod', label: 'Notice Period', kind: 'policy', probe: 'resignation notice period weeks',
    match: (s) => {
      if (!/resign|notice period/i.test(s)) return null;
      const m = s.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?(weeks|months)`, 'i'));
      return m ? unit(m[1], m[2]) : null;
    },
  },
  {
    key: 'remoteDays', label: 'Remote Working', kind: 'policy', probe: 'remote working days per week office',
    match: rx(new RegExp(`(?:up to\\s+)?${NUM}\\s*(?:\\(\\d+\\)\\s*)?days\\s+(?:per|a|each)\\s+week\\s+(?:from home|remotely|remote)`, 'i'), (m) => `Up to ${toNum(m[1])} days/week remote`),
  },
  {
    key: 'rateLimit', label: 'Rate Limit', kind: 'technical', probe: 'rate limit requests per minute',
    match: rx(/([\d,]+)\s+requests\s+per\s+(second|minute|hour)/i, (m) => `${m[1]} req/${m[2].toLowerCase().slice(0, 3)}`),
  },
  {
    key: 'apiVersioning', label: 'API Versioning', kind: 'technical', probe: 'API versioning deprecation policy months',
    match: (s) => {
      if (!/deprecat|version/i.test(s)) return null;
      const m = s.match(new RegExp(`${NUM}\\s*(?:\\(\\d+\\)\\s*)?months`, 'i'));
      return m ? `${toNum(m[1])}-month deprecation window` : null;
    },
  },
];

export const normalizeValue = (v: string) => v.toLowerCase().replace(/[^a-z0-9.%+£$€]/g, '');
