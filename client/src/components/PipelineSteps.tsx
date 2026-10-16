import { Check, Minus, X } from 'lucide-react';
import { ms } from '../lib/format';
import type { Stage } from '../lib/types';
import { cx } from './ui';

/** Horizontal ingestion pipeline: Upload → Parse → OCR → Chunk → Embed → Index → Summarise. */
export function PipelineSteps({ stages, compact }: { stages: Stage[]; compact?: boolean }) {
  return (
    <ol className="flex w-full items-start">
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const done = s.status === 'done';
        return (
          <li key={s.key} className={cx('relative flex min-w-0 flex-1 flex-col', last && 'flex-none')}>
            <div className="flex items-center">
              <span
                className={cx(
                  'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  compact ? 'size-5' : 'size-7',
                  done && 'border-signal bg-signal text-white',
                  s.status === 'running' && 'border-signal bg-paper text-signal',
                  s.status === 'skipped' && 'border-line-strong bg-canvas text-fg-muted',
                  s.status === 'failed' && 'border-bad bg-bad text-white',
                  s.status === 'pending' && 'border-line bg-paper text-fg-faint',
                )}
                title={s.detail}
              >
                {done && <Check className={compact ? 'size-3' : 'size-3.5'} strokeWidth={3} />}
                {s.status === 'skipped' && <Minus className="size-3" strokeWidth={3} />}
                {s.status === 'failed' && <X className="size-3" strokeWidth={3} />}
                {s.status === 'running' && <span className="size-2 animate-pulseDot rounded-full bg-signal" />}
              </span>
              {!last && <span className={cx('h-0.5 flex-1', done || s.status === 'skipped' ? 'bg-signal/70' : 'bg-line')} />}
            </div>
            {!compact && (
              <div className="mt-2 pr-3">
                <p className={cx('text-sm font-medium', s.status === 'pending' ? 'text-fg-faint' : 'text-fg')}>{s.label}</p>
                <p className="text-xs tabular-nums text-fg-muted">
                  {s.status === 'skipped' ? 'Skipped' : s.status === 'running' ? 'Running' : s.status === 'failed' ? 'Failed' : s.ms !== undefined && s.status === 'done' ? ms(s.ms) : '—'}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
