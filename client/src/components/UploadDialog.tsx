import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Link2, UploadCloud, X } from 'lucide-react';
import { api } from '../lib/api';
import { bytes } from '../lib/format';
import type { Space } from '../lib/types';
import { Button, cx, ErrorNote, Field, Input, Modal, Segmented, Select, useToast } from './ui';

const ACCEPT = '.pdf,.docx,.txt,.md,.csv';

export function UploadDialog({ open, onClose, defaultSpaceId }: { open: boolean; onClose: () => void; defaultSpaceId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['spaces'], queryFn: () => api<{ spaces: Space[] }>('/spaces'), enabled: open });
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? '');
  const [visibility, setVisibility] = useState('team');
  const [tags, setTags] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setFiles([]); setUrl(''); setTags(''); }
    if (open && !spaceId && data?.spaces[0]) setSpaceId(defaultSpaceId ?? data.spaces[0].id);
  }, [open, data, defaultSpaceId, spaceId]);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'url') return api('/documents/url', { method: 'POST', json: { url, spaceId, visibility } });
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('spaceId', spaceId);
      fd.append('visibility', visibility);
      fd.append('tags', tags);
      return api('/documents/upload', { method: 'POST', body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      toast(mode === 'url' ? 'URL added — indexing started' : `${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded — indexing started`);
      onClose();
    },
  });

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok = [...list].filter((f) => /\.(pdf|docx|txt|md|csv)$/i.test(f.name));
    setFiles((cur) => [...cur, ...ok].slice(0, 20));
  };

  const valid = spaceId && (mode === 'file' ? files.length > 0 : /^https?:\/\/\S+\.\S+/.test(url));

  return (
    <Modal
      open={open} onClose={onClose} title="Add sources" width={560}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} loading={submit.isPending} onClick={() => submit.mutate()}>
          {mode === 'url' ? 'Add URL' : files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'file', label: 'Files' }, { value: 'url', label: 'Web page' }]} />
        {mode === 'file' ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
              onClick={() => input.current?.click()}
              className={cx('flex cursor-pointer flex-col items-center rounded-md border border-dashed px-6 py-8 text-center transition-colors', drag ? 'border-signal bg-signal-soft' : 'border-line-strong bg-canvas hover:border-signal/60')}
            >
              <UploadCloud className="mb-2 size-6 text-signal" />
              <p className="text-sm font-medium">Drop files here or browse</p>
              <p className="mt-0.5 text-xs text-fg-muted">PDF, DOCX, TXT, Markdown or CSV, up to 25 MB each</p>
              <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded border border-line px-2.5 py-1.5 text-sm">
                    <FileUp className="size-4 text-fg-muted" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-fg-muted">{bytes(f.size)}</span>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-fg-faint hover:text-fg"><X className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Field label="Page URL" hint="SourceMind fetches the page server-side and indexes its readable text.">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/policy" className="pl-9" />
            </div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Knowledge space">
            <Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              {data?.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Who can retrieve it">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="team">Space members</option>
              <option value="organization">Space members (org-visible)</option>
              <option value="private">Only me and admins</option>
            </Select>
          </Field>
        </div>
        {mode === 'file' && <Field label="Tags" hint="Optional, comma separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="contract, 2026" /></Field>}
        <ErrorNote error={submit.error} />
      </div>
    </Modal>
  );
}
