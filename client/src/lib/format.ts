export function timeAgo(iso?: string) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 2) return 'Yesterday';
  if (s < 86400 * 7) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function compact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString();
}

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(/\.0$/, '')}%`;

export function bytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading', parsing: 'Parsing', ocr: 'OCR', chunking: 'Chunking', embedding: 'Embedding', indexing: 'Indexing', ready: 'Ready', failed: 'Failed',
};

export const teamLabel = (t: string) => (t.length <= 2 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1));

const ACTIONS: Record<string, string> = {
  'auth.login': 'signed in', 'chat.ask': 'asked', 'document.upload': 'uploaded', 'document.url': 'added the page', 'document.update': 'updated',
  'document.delete': 'deleted', 'document.reprocess': 're-indexed', search: 'searched for', compare: 'compared', 'quality.run': 'ran an evaluation',
  'space.create': 'created the space', 'space.update': 'updated the space', 'space.delete': 'deleted the space', 'team.invite': 'added',
  'team.update': 'changed access for', 'team.remove': 'removed', 'settings.update': 'changed',
};
export const actionLabel = (a: string) => ACTIONS[a] ?? a.replace('.', ' ');
