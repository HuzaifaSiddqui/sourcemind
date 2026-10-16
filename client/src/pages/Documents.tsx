import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Lock, MoreHorizontal, Plus, RefreshCw, Search as SearchIcon, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import type { Doc, Space } from '../lib/types';
import { Page } from '../components/Shell';
import { DocIcon } from '../components/Evidence';
import { Avatar, Button, Empty, Input, PageHeader, Select, Skeleton, StatusPill, cx, td, th, useToast } from '../components/ui';
import { UploadDialog } from '../components/UploadDialog';

function RowMenu({ d }: { d: Doc }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['documents'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const reprocess = useMutation({ mutationFn: () => api(`/documents/${d.id}/reprocess`, { method: 'POST' }), onSuccess: () => { refresh(); toast('Re-indexing started'); } });
  const remove = useMutation({ mutationFn: () => api(`/documents/${d.id}`, { method: 'DELETE' }), onSuccess: () => { refresh(); toast(`Deleted ${d.title}`); } });
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <button onClick={() => setOpen(!open)} className="rounded p-1 text-fg-muted hover:bg-canvas hover:text-fg" aria-label={`Actions for ${d.title}`}><MoreHorizontal className="size-4" /></button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 animate-rise rounded-md border border-line bg-paper p-1 shadow-lg">
          <button onClick={() => { reprocess.mutate(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-canvas"><RefreshCw className="size-3.5" />Re-index</button>
          <button onClick={() => { if (confirm(`Delete "${d.title}" and its index? This cannot be undone.`)) remove.mutate(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm text-bad hover:bg-bad-soft"><Trash2 className="size-3.5" />Delete</button>
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const space = params.get('space') ?? '';
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [upload, setUpload] = useState(false);

  const { data: sp } = useQuery({ queryKey: ['spaces'], queryFn: () => api<{ spaces: Space[] }>('/spaces') });
  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: () => api<{ documents: Doc[] }>('/documents'),
    refetchInterval: (query) => ((query.state.data as { documents: Doc[] } | undefined)?.documents.some((d) => !['ready', 'failed'].includes(d.status)) ? 1200 : false),
  });

  const rows = useMemo(() => (data?.documents ?? []).filter((d) =>
    (!space || d.spaceId === space)
    && (!type || d.type === type)
    && (!status || (status === 'processing' ? !['ready', 'failed'].includes(d.status) : d.status === status))
    && (!q || `${d.title} ${d.filename} ${d.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [data, space, type, status, q]);

  const currentSpace = sp?.spaces.find((s) => s.id === space);

  return (
    <Page wide>
      <PageHeader
        title={currentSpace ? currentSpace.name : 'Documents'}
        sub={currentSpace ? currentSpace.description : 'Every source SourceMind can retrieve from, with its indexing status.'}
        actions={can('sources.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUpload(true)}>Add sources</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or tag" className="pl-9" />
        </div>
        <Select value={space} onChange={(e) => setParams(e.target.value ? { space: e.target.value } : {})} className="w-48">
          <option value="">All spaces</option>
          {sp?.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-32">
          <option value="">Any type</option>
          {['PDF', 'DOCX', 'URL', 'TXT', 'MD', 'CSV'].map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">Any status</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
        </Select>
        <span className="ml-auto text-sm text-fg-muted">{rows.length} of {data?.documents.length ?? 0}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className={th}>Document</th><th className={th}>Space</th><th className={cx(th, 'text-right')}>Pages</th><th className={cx(th, 'text-right')}>Passages</th>
              <th className={th}>Indexed</th><th className={th}>Owner</th><th className={th}>Access</th><th className={th}>Status</th><th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={9} className="px-4 py-3"><Skeleton className="h-5" /></td></tr>)}
            {rows.map((d) => (
              <tr key={d.id} className="group hover:bg-canvas/60">
                <td className={td}>
                  <Link to={`/documents/${d.id}`} className="flex items-center gap-3">
                    <DocIcon type={d.type} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg group-hover:text-signal-ink">{d.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{d.type} · {d.filename}</span>
                    </span>
                  </Link>
                </td>
                <td className={td}><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: d.space?.color }} />{d.space?.name}</span></td>
                <td className={cx(td, 'text-right tabular-nums')}>{d.pages || '—'}</td>
                <td className={cx(td, 'text-right tabular-nums')}>{d.processing.chunks || '—'}</td>
                <td className={cx(td, 'whitespace-nowrap')}>{d.indexedAt ? timeAgo(d.indexedAt) : '—'}</td>
                <td className={td}>{d.owner && <span className="inline-flex items-center gap-2"><Avatar name={d.owner.name} color={d.owner.color} size={20} />{d.owner.name.split(' ')[0]}</span>}</td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                    {d.visibility === 'private' ? <><Lock className="size-3" />Private</> : <><Users className="size-3" />{d.visibility === 'organization' ? 'Organisation' : 'Team'}</>}
                  </span>
                </td>
                <td className={td}>{d.status === 'failed' ? <span title={d.error}><StatusPill status="failed" /></span> : <StatusPill status={d.status} />}</td>
                <td className="pr-3">{can('sources.write') && <RowMenu d={d} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows.length && (
          <Empty icon={<FileText className="size-5" />} title={data.documents.length ? 'No documents match these filters' : 'No documents yet'}
            action={can('sources.write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUpload(true)}>Add sources</Button>}>
            {data.documents.length ? 'Clear a filter to see more.' : 'Upload PDFs, Word files, text or a web page to start building your knowledge base.'}
          </Empty>
        )}
      </div>
      <UploadDialog open={upload} onClose={() => setUpload(false)} defaultSpaceId={space || undefined} />
    </Page>
  );
}
