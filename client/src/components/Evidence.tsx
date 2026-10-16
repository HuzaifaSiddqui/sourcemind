import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { FileSpreadsheet, FileText, FileType2, Globe, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { Citation, Doc, Evidence, PageText } from '../lib/types';
import { cx } from './ui';

export function DocIcon({ type, className }: { type: Doc['type']; className?: string }) {
  const map = { PDF: [FileText, '#E5484D'], DOCX: [FileType2, '#3D5BEB'], URL: [Globe, '#14B8A6'], TXT: [FileText, '#667085'], MD: [FileText, '#8B5CF6'], CSV: [FileSpreadsheet, '#12A150'] } as const;
  const [I, color] = map[type] ?? map.TXT;
  return <I className={cx('size-4 shrink-0', className)} style={{ color }} strokeWidth={1.9} />;
}

/** Inline citation marker. The one place where answers and sources meet. */
export function CitationChip({ c, active, onClick }: { c: Citation; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      title={`${c.docTitle}, ${c.pageLabel.toLowerCase()} ${c.page} — ${c.section}`}
      className={cx(
        'mx-0.5 inline-flex h-[18px] min-w-[18px] translate-y-[-1px] items-center justify-center rounded-sm px-1 align-middle font-sans text-2xs font-semibold tabular-nums transition-colors',
        active ? 'bg-signal text-white' : 'bg-signal-soft text-signal-ink hover:bg-signal hover:text-white',
      )}
    >
      {c.n}
    </button>
  );
}

export function SourceChip({ c, active, onClick }: { c: Citation; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cx(
        'inline-flex max-w-full items-center gap-2 rounded-md border py-1 pl-1 pr-2.5 text-left text-xs transition-colors',
        active ? 'border-signal bg-signal-soft text-fg' : 'border-line bg-paper text-fg-2 hover:border-signal/50',
      )}
    >
      <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-sm text-2xs font-semibold', active ? 'bg-signal text-white' : 'bg-canvas text-fg-2')}>{c.n}</span>
      <span className="truncate font-medium">{c.docTitle}</span>
      <span className="shrink-0 text-fg-muted">{c.pageLabel === 'Page' ? 'p' : 'part '}{c.page}</span>
    </button>
  );
}

/** Renders an answer: paragraphs, bold lead-ins and live citation markers. */
export function AnswerText({ text, citations, active, onCite, streaming }: { text: string; citations: Citation[]; active?: number | null; onCite?: (n: number) => void; streaming?: boolean }) {
  const byN = useMemo(() => new Map(citations.map((c) => [c.n, c])), [citations]);
  const paras = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-[1.65] text-fg">
      {paras.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, j) => {
            const cite = part.match(/^\[(\d+)\]$/);
            if (cite) {
              const c = byN.get(Number(cite[1]));
              return c ? <CitationChip key={j} c={c} active={active === c.n} onClick={() => onCite?.(c.n)} /> : null;
            }
            if (part.startsWith('**')) return <strong key={j} className="font-semibold text-fg">{part.slice(2, -2)} </strong>;
            return <Fragment key={j}>{part}</Fragment>;
          })}
          {streaming && i === paras.length - 1 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulseDot bg-signal" />}
        </p>
      ))}
    </div>
  );
}

export function EvidenceBadge({ e }: { e: Evidence }) {
  const tone = { Strong: ['text-ok', ShieldCheck], Moderate: ['text-warn', ShieldQuestion], Weak: ['text-bad', ShieldAlert], None: ['text-fg-muted', ShieldQuestion] } as const;
  const [color, Icon] = tone[e.level];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <Icon className={cx('size-3.5', color)} />
      <span className={cx('font-medium', color)}>Evidence {e.level.toLowerCase()}</span>
      {e.level !== 'None' && <span>{e.passages} {e.passages === 1 ? 'passage' : 'passages'}, {e.documents} {e.documents === 1 ? 'document' : 'documents'}, {Math.round(e.avgRelevance * 100)}% relevance</span>}
    </span>
  );
}

export interface Mark { start: number; end: number; tone: 'passage' | 'quote'; id?: string }

/**
 * A page of source text on a paper surface. Source content is always set in serif
 * so it never reads like generated text. Passage + quote highlights are drawn from
 * character offsets returned by the retriever.
 */
export function PageView({ page, label, marks = [], scrollKey, compact, footer }: { page: PageText; label: string; marks?: Mark[]; scrollKey?: string | number; compact?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[data-quote]') ?? ref.current?.querySelector('[data-passage]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [scrollKey]);

  const headingAt = new Set(page.headings.map((h) => h.offset));
  const paras: { start: number; text: string }[] = [];
  let pos = 0;
  for (const chunk of page.text.split(/\n\n/)) {
    paras.push({ start: pos, text: chunk });
    pos += chunk.length + 2;
  }

  const renderPara = (p: { start: number; text: string }) => {
    const end = p.start + p.text.length;
    const cuts = new Set([p.start, end]);
    for (const m of marks) {
      if (m.end <= p.start || m.start >= end) continue;
      cuts.add(Math.max(p.start, m.start));
      cuts.add(Math.min(end, m.end));
    }
    const pts = [...cuts].sort((a, b) => a - b);
    return pts.slice(0, -1).map((a, i) => {
      const b = pts[i + 1];
      const seg = page.text.slice(a, b);
      const inQuote = marks.some((m) => m.tone === 'quote' && m.start <= a && m.end >= b);
      const inPassage = marks.some((m) => m.tone === 'passage' && m.start <= a && m.end >= b);
      if (inQuote) return <mark key={a} data-quote className="animate-flash rounded-[2px] bg-signal-mark px-0.5 text-fg underline decoration-signal decoration-2 underline-offset-[5px] [box-decoration-break:clone]">{seg}</mark>;
      if (inPassage) return <span key={a} data-passage className="bg-[#F0F3FF] [box-decoration-break:clone]">{seg}</span>;
      return <Fragment key={a}>{seg}</Fragment>;
    });
  };

  return (
    <div ref={ref} className={cx('rounded-md border border-line bg-paper shadow-[0_1px_0_rgba(16,24,40,.04),0_8px_24px_-16px_rgba(11,16,32,.18)]', compact ? 'px-6 py-6' : 'px-10 py-10 lg:px-14')}>
      <div className={cx('font-serif text-fg', compact ? 'text-[14.5px] leading-[1.7]' : 'text-[16px] leading-[1.75]')}>
        {paras.map((p) =>
          headingAt.has(p.start)
            ? <h3 key={p.start} className={cx('font-serif font-semibold tracking-[-0.005em] text-fg', compact ? 'mb-2 mt-5 text-[15.5px] first:mt-0' : 'mb-3 mt-7 text-[18px] first:mt-0')}>{renderPara(p)}</h3>
            : <p key={p.start} className="mb-3.5 max-w-[72ch] text-fg-2">{renderPara(p)}</p>,
        )}
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-line pt-3 font-sans text-xs text-fg-faint">
        <span>{label}</span>
        {footer}
      </div>
    </div>
  );
}
