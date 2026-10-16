import fs from 'node:fs';
import type { DocPages, DocType } from '../types.js';

export interface ParsedDoc {
  pages: DocPages['pages'];
  pageLabel: 'Page' | 'Part';
  title?: string;
  needsOcr: number[];
}

const HEADING_RE = /^(#{1,4}\s+.{2,100}|(section|article|clause|schedule|appendix)\s+[\w.]+.{0,80}|\d{1,2}(\.\d{1,2}){0,3}\.?\s+[A-Z][^.!?]{2,90}|[A-Z][A-Z0-9 &/,'-]{3,70})$/i;

function isHeadingLine(line: string) {
  const t = line.trim();
  if (t.length < 3 || t.length > 110) return false;
  if (/^#{1,4}\s/.test(t)) return true;
  if (/[.;:,]$/.test(t) && !/^\d/.test(t)) return false;
  if (/^[A-Z][A-Z0-9 &/,'.—–-]{3,70}$/.test(t) && /[A-Z]{3}/.test(t)) return true;
  if (/^\d{1,2}(\.\d{1,2}){0,3}\.?\s+[A-Z][^.!?]{2,90}$/.test(t) && t.split(' ').length <= 10) return true;
  return /^(section|article|clause|schedule|appendix)\s+[\w.]+/i.test(t) && t.split(' ').length <= 10 && HEADING_RE.test(t);
}

const cleanHeading = (h: string) => h.replace(/^#{1,4}\s+/, '').trim();

/** Assemble a page from paragraph blocks, tracking heading offsets. */
function buildPage(n: number, blocks: { text: string; heading: boolean }[]) {
  let text = '';
  const headings: { offset: number; text: string }[] = [];
  for (const b of blocks) {
    const t = b.heading ? cleanHeading(b.text) : b.text.trim();
    if (!t) continue;
    if (text) text += '\n\n';
    if (b.heading) headings.push({ offset: text.length, text: t });
    text += t;
  }
  return { n, text, headings };
}

/** Split long plain text into virtual parts at paragraph/heading boundaries. */
function paginate(blocks: { text: string; heading: boolean }[], target = 3200) {
  const pages: DocPages['pages'] = [];
  let cur: typeof blocks = [];
  let size = 0;
  for (const b of blocks) {
    const breakHere = size > target || (b.heading && size > target * 0.6);
    if (breakHere && cur.length) {
      pages.push(buildPage(pages.length + 1, cur));
      cur = [];
      size = 0;
    }
    cur.push(b);
    size += b.text.length;
  }
  if (cur.length) pages.push(buildPage(pages.length + 1, cur));
  return pages;
}

function blocksFromPlain(text: string) {
  const blocks: { text: string; heading: boolean }[] = [];
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const p of paras) {
    const lines = p.split('\n').map((l) => l.trim()).filter(Boolean);
    let buf: string[] = [];
    const flush = () => { if (buf.length) blocks.push({ text: buf.join(' '), heading: false }); buf = []; };
    for (const l of lines) {
      if (isHeadingLine(l)) { flush(); blocks.push({ text: l, heading: true }); }
      else if (/^([-*•]|\d+[.)])\s+/.test(l)) { flush(); buf.push(l); flush(); }
      else buf.push(l);
    }
    flush();
  }
  return blocks;
}

async function parsePdf(buf: Buffer): Promise<ParsedDoc> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 }).promise;
  const pages: DocPages['pages'] = [];
  const needsOcr: number[] = [];
  let title: string | undefined;
  try {
    const meta: any = await pdf.getMetadata();
    title = meta?.info?.Title || undefined;
  } catch { /* metadata optional */ }

  type Line = { text: string; y: number; size: number };
  const pageLines: Line[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc: any = await page.getTextContent();
    const lines: Line[] = [];
    let cur: Line | null = null;
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform[5];
      const size = Math.abs(it.transform[0]) || it.height || 10;
      if (!cur || Math.abs(cur.y - y) > size * 0.5) {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = { text: '', y, size };
      }
      cur.text += it.str;
      cur.size = Math.max(cur.size, size);
      if (it.hasEOL) { if (cur.text.trim()) lines.push(cur); cur = null; }
    }
    if (cur && cur.text.trim()) lines.push(cur);
    pageLines.push(lines);
  }

  // Cleaning: drop running headers/footers (lines repeated on most pages, digits ignored).
  const norm = (t: string) => t.trim().toLowerCase().replace(/\d+/g, '#');
  const seen = new Map<string, number>();
  for (const lines of pageLines) for (const k of new Set(lines.map((l) => norm(l.text)))) seen.set(k, (seen.get(k) ?? 0) + 1);
  const boiler = new Set(pdf.numPages >= 2 ? [...seen].filter(([, n]) => n >= Math.max(2, Math.ceil(pdf.numPages * 0.5))).map(([k]) => k) : []);

  for (let i = 1; i <= pdf.numPages; i++) {
    const lines = pageLines[i - 1].filter((l) => !boiler.has(norm(l.text)) && !/^page\s+#(\s+of\s+#)?$/i.test(norm(l.text)));
    if (!lines.length) {
      needsOcr.push(i);
      pages.push({ n: i, text: '', headings: [] });
      continue;
    }
    const sizes = lines.map((l) => Math.round(l.size));
    const freq = new Map<number, number>();
    sizes.forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1));
    const body = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const blocks: { text: string; heading: boolean }[] = [];
    let para: string[] = [];
    let prev: Line | null = null;
    const flush = () => { if (para.length) blocks.push({ text: para.join(' ').replace(/\s+/g, ' '), heading: false }); para = []; };
    for (const l of lines) {
      const t = l.text.trim();
      const big = l.size >= body * 1.12;
      const heading = (big && t.length < 120) || (isHeadingLine(t) && t.length < 90 && !/[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}\s[a-z]{3,}/.test(t));
      const gap = prev ? prev.y - l.y : 0;
      if (heading) {
        flush();
        const last = blocks[blocks.length - 1] as { text: string; heading: boolean; size?: number } | undefined;
        // a long heading wrapped onto two lines → one heading
        if (last?.heading && last.size && Math.abs(last.size - l.size) < 0.5 && prev && prev.y - l.y < l.size * 1.6) last.text += ` ${t}`;
        else blocks.push({ text: t, heading: true, size: l.size } as { text: string; heading: boolean });
        prev = l;
        continue;
      }
      if (prev && (gap > l.size * 1.75 || gap < 0)) flush();
      if (/^([-•]|\d+[.)])\s+/.test(t)) flush();
      para.push(t);
      prev = l;
    }
    flush();
    if (!title && blocks[0]?.heading && i === 1) title = blocks[0].text;
    pages.push(buildPage(i, blocks));
  }
  return { pages, pageLabel: 'Page', title, needsOcr };
}

async function parseDocx(buf: Buffer): Promise<ParsedDoc> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }, { styleMap: ["p[style-name='Title'] => h1:fresh"] });
  const blocks: { text: string; heading: boolean }[] = [];
  const re = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = decode(m[2].replace(/<[^>]+>/g, '')).trim();
    if (!text) continue;
    blocks.push({ text: m[1] === 'li' ? `• ${text}` : text, heading: m[1].startsWith('h') || isHeadingLine(text) });
  }
  return { pages: paginate(blocks), pageLabel: 'Part', title: blocks[0]?.heading ? blocks[0].text : undefined, needsOcr: [] };
}

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&pound;/g, '£').replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function htmlToBlocks(html: string) {
  const body = (html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const blocks: { text: string; heading: boolean }[] = [];
  const re = /<(h[1-6]|p|li|td|th|blockquote|pre|dd|dt)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const text = decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    const tag = m[1].toLowerCase();
    blocks.push({ text: tag === 'li' ? `• ${text}` : text, heading: /^h[1-6]$/.test(tag) });
  }
  if (!blocks.length) {
    const text = decode(body.replace(/<[^>]+>/g, '\n')).replace(/\n\s*\n+/g, '\n\n');
    return blocksFromPlain(text);
  }
  return blocks;
}

async function parseUrl(url: string): Promise<ParsedDoc & { size: number }> {
  const res = await fetchOrExplain(url, {
    headers: { 'user-agent': 'SourceMindBot/1.0 (+document ingestion)', accept: 'text/html,text/plain,application/pdf' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (type.includes('pdf')) return { ...(await parsePdf(buf)), size: buf.length };
  const html = buf.toString('utf8');
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '') || undefined;
  const blocks = type.includes('html') || /<html|<body|<p[\s>]/i.test(html) ? htmlToBlocks(html) : blocksFromPlain(html);
  return { pages: paginate(blocks), pageLabel: 'Part', title, needsOcr: [], size: buf.length };
}

async function fetchOrExplain(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    throw new Error(code === 'ENOTFOUND' ? 'Could not resolve that domain' : code === 'ECONNREFUSED' ? 'The server refused the connection'
      : (e as Error).name === 'TimeoutError' ? 'The page took too long to respond' : 'Could not reach the URL from the server (network blocked or offline)');
  }
}

function parseCsv(text: string): ParsedDoc {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return { pages: [], pageLabel: 'Part', needsOcr: [] };
  const blocks = data.map((r, i) => ({
    text: `Row ${i + 1}: ` + header.map((h, j) => `${h.trim()}: ${(r[j] ?? '').trim()}`).filter((s) => !s.endsWith(': ')).join('; ') + '.',
    heading: false,
  }));
  return { pages: paginate(blocks, 2400), pageLabel: 'Part', needsOcr: [] };
}

export function detectType(filename: string): DocType | null {
  const ext = filename.toLowerCase().split('.').pop();
  return ({ pdf: 'PDF', docx: 'DOCX', txt: 'TXT', md: 'MD', markdown: 'MD', csv: 'CSV' } as Record<string, DocType>)[ext ?? ''] ?? null;
}

export async function parseSource(type: DocType, src: { path?: string; url?: string }): Promise<ParsedDoc & { size?: number }> {
  if (type === 'URL') return parseUrl(src.url!);
  const buf = fs.readFileSync(src.path!);
  switch (type) {
    case 'PDF': return parsePdf(buf);
    case 'DOCX': return parseDocx(buf);
    case 'CSV': return parseCsv(buf.toString('utf8'));
    case 'TXT':
    case 'MD': {
      const blocks = blocksFromPlain(buf.toString('utf8'));
      return { pages: paginate(blocks), pageLabel: 'Part', title: blocks[0]?.heading ? blocks[0].text : undefined, needsOcr: [] };
    }
  }
}
