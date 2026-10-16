import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { initials, STATUS_LABEL } from '../lib/format';
import type { DocStatus } from '../lib/types';

export const cx = clsx;

/* ───────── buttons ───────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-signal text-white hover:bg-signal-ink active:bg-signal-ink disabled:bg-signal/50',
  secondary: 'bg-paper text-fg border border-line hover:border-line-strong hover:bg-canvas disabled:text-fg-faint',
  ghost: 'text-fg-2 hover:bg-canvas hover:text-fg disabled:text-fg-faint',
  danger: 'bg-paper text-bad border border-line hover:border-bad/40 hover:bg-bad-soft',
  dark: 'bg-ink text-white hover:bg-ink-3',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        VARIANT[variant], className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ───────── surfaces ───────── */

export function Panel({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={cx('rounded-lg border border-line bg-paper', pad && 'p-5', className)}>{children}</section>;
}

export function PanelHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-md font-semibold text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-fg-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {sub && <p className="mt-1 max-w-[68ch] text-base text-fg-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ───────── small data ───────── */

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'signal' | 'ok' | 'warn' | 'bad' | 'dark'; className?: string }) {
  const t = {
    neutral: 'bg-canvas text-fg-2 border-line',
    signal: 'bg-signal-soft text-signal-ink border-signal/20',
    ok: 'bg-ok-soft text-ok border-ok/20',
    warn: 'bg-warn-soft text-warn border-warn/20',
    bad: 'bg-bad-soft text-bad border-bad/20',
    dark: 'bg-ink text-white border-ink',
  }[tone];
  return <span className={cx('inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium', t, className)}>{children}</span>;
}

const PROCESSING: DocStatus[] = ['uploading', 'parsing', 'ocr', 'chunking', 'embedding', 'indexing'];

export function StatusPill({ status }: { status: DocStatus }) {
  if (status === 'ready') return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ok"><span className="size-1.5 rounded-full bg-ok" />Ready</span>;
  if (status === 'failed') return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-bad"><span className="size-1.5 rounded-full bg-bad" />Failed</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-signal-ink">
      <span className="size-1.5 animate-pulseDot rounded-full bg-signal" />
      {STATUS_LABEL[status]}
      <span className="text-fg-faint">{PROCESSING.indexOf(status) + 1}/6</span>
    </span>
  );
}

export function Avatar({ name, color, size = 24, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ring && 'ring-2 ring-paper')}
      style={{ width: size, height: size, background: color, fontSize: Math.max(9, size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { id: string; name: string; color: string }[]; max?: number }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {people.slice(0, max).map((p) => <Avatar key={p.id} name={p.name} color={p.color} size={22} ring />)}
      {people.length > max && <span className="ml-2 text-xs text-fg-muted">+{people.length - max}</span>}
    </span>
  );
}

export function Meter({ value, tone = 'signal' }: { value: number; tone?: 'signal' | 'ok' | 'warn' | 'bad' }) {
  const c = { signal: 'bg-signal', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return <span className="block h-1 w-full overflow-hidden rounded-full bg-line"><span className={cx('block h-full rounded-full', c)} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-4 animate-spin text-fg-faint', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded bg-line/60', className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-canvas text-fg-muted">{icon}</div>}
      <p className="text-base font-medium text-fg">{title}</p>
      {children && <p className="mt-1 max-w-[46ch] text-sm text-fg-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-bad">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {(error as Error).message}
    </div>
  );
}

/* ───────── form controls ───────── */

export const inputCls = 'h-9 rounded border border-line bg-paper px-3 text-sm text-fg placeholder:text-fg-faint focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/15';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, !/\bw-/.test(props.className ?? '') && 'w-full', props.className)} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, !/\bw-/.test(props.className ?? '') && 'w-full', 'appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8', props.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>{children}</select>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50', checked ? 'bg-signal' : 'bg-line-strong')}
    >
      <span className={cx('inline-block size-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-sm px-2.5 font-medium transition-colors', size === 'sm' ? 'h-6 text-xs' : 'h-7 text-sm',
            value === o.value ? 'bg-paper text-fg shadow-[0_1px_2px_rgba(16,24,40,.08)]' : 'text-fg-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── modal ───────── */

export function Modal({ open, onClose, title, children, width = 520, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full animate-rise rounded-lg border border-line bg-paper shadow-[0_24px_60px_-12px_rgba(11,16,32,.35)]" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-md font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-muted hover:bg-canvas hover:text-fg"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ───────── toasts ───────── */

type Toast = { id: number; text: string; tone: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className="flex animate-rise items-center gap-2 rounded-md bg-ink px-3.5 py-2.5 text-sm text-white shadow-lg">
              {t.tone === 'ok' ? <Check className="size-4 text-signal" /> : <AlertCircle className="size-4 text-bad" />}
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ───────── table ───────── */

export const th = 'h-9 px-4 text-left text-xs font-medium text-fg-muted whitespace-nowrap';
export const td = 'px-4 py-3 text-sm text-fg-2 align-middle';
