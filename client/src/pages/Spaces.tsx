import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { teamLabel, timeAgo } from '../lib/format';
import type { Space } from '../lib/types';
import { Page, SpaceIcon, SPACE_ICON } from '../components/Shell';
import { AvatarStack, Button, ErrorNote, Field, Input, Modal, PageHeader, Skeleton, cx, useToast } from '../components/ui';

const COLORS = ['#5B7CFF', '#10B981', '#EC4899', '#8B5CF6', '#F59E0B', '#14B8A6', '#EF4444'];

function SpaceForm({ open, onClose, teams, space }: { open: boolean; onClose: () => void; teams: string[]; space?: Space }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(space?.name ?? '');
  const [description, setDescription] = useState(space?.description ?? '');
  const [icon, setIcon] = useState(space?.icon ?? 'folder');
  const [color, setColor] = useState(space?.color ?? COLORS[0]);
  const [access, setAccess] = useState<string[]>(space?.accessTeams ?? ['*']);
  const everyone = access.includes('*');
  const save = useMutation({
    mutationFn: () => api(space ? `/spaces/${space.id}` : '/spaces', { method: space ? 'PATCH' : 'POST', json: { name, description, icon, color, accessTeams: access } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast(space ? 'Space updated' : 'Space created'); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={space ? 'Edit knowledge space' : 'New knowledge space'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || (!everyone && !access.length)} loading={save.isPending} onClick={() => save.mutate()}>{space ? 'Save changes' : 'Create space'}</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance Policies" /></Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What belongs in this space" /></Field>
        <div className="flex gap-6">
          <Field label="Icon">
            <div className="flex gap-1">
              {Object.keys(SPACE_ICON).map((k) => (
                <button key={k} type="button" onClick={() => setIcon(k)} className={cx('rounded-md p-0.5 ring-2', icon === k ? 'ring-signal' : 'ring-transparent')} aria-label={k}><SpaceIcon icon={k} color={color} size={28} /></button>
              ))}
            </div>
          </Field>
          <Field label="Colour">
            <div className="flex gap-1.5 pt-1">
              {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={cx('size-6 rounded-full ring-2 ring-offset-2', color === c ? 'ring-fg' : 'ring-transparent')} style={{ background: c }} aria-label={c} />)}
            </div>
          </Field>
        </div>
        <Field label="Who can retrieve from this space" hint="Permissions are enforced before search, so restricted passages never reach the ranking step or the model.">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={everyone} onChange={() => setAccess(['*'])} className="accent-signal" />Everyone in the workspace</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!everyone} onChange={() => setAccess([])} className="accent-signal" />Only selected teams</label>
            {!everyone && (
              <div className="ml-6 flex flex-wrap gap-1.5">
                {teams.map((t) => (
                  <button key={t} type="button" onClick={() => setAccess(access.includes(t) ? access.filter((x) => x !== t) : [...access, t])}
                    className={cx('rounded-full border px-2.5 py-0.5 text-xs', access.includes(t) ? 'border-signal bg-signal-soft text-signal-ink' : 'border-line text-fg-2')}>{teamLabel(t)}</button>
                ))}
              </div>
            )}
          </div>
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

export default function Spaces() {
  const { can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['spaces'], queryFn: () => api<{ spaces: Space[]; teams: string[] }>('/spaces') });
  const [form, setForm] = useState<{ open: boolean; space?: Space }>({ open: false });

  return (
    <Page>
      <PageHeader
        title="Knowledge spaces"
        sub="Isolated collections with their own access rules. A question only searches the spaces the person asking is allowed to see."
        actions={can('spaces.manage') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setForm({ open: true })}>New space</Button>}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
        <ul className="divide-y divide-line">
          {data?.spaces.map((s) => (
            <li key={s.id} className="grid items-center gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_1fr_140px_120px_auto]">
              <Link to={`/documents?space=${s.id}`} className="group flex min-w-0 items-center gap-3">
                <SpaceIcon icon={s.icon} color={s.color} size={36} />
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:text-signal-ink">{s.name}</span>
                  <span className="block truncate text-sm text-fg-muted">{s.description}</span>
                </span>
              </Link>
              <span className="flex items-center gap-1.5 text-sm text-fg-2">
                {s.accessTeams.includes('*') ? <Globe2 className="size-4 text-fg-muted" /> : <ShieldCheck className="size-4 text-signal" />}
                {s.accessTeams.includes('*') ? 'Everyone' : `${s.access} only`}
              </span>
              <span className="text-sm tabular-nums text-fg-2">{s.documents} sources <span className="text-fg-faint">/ {s.chunks} passages</span></span>
              <AvatarStack people={s.members} max={3} />
              <span className="flex items-center justify-end gap-3 text-xs text-fg-muted">
                {timeAgo(s.lastActivity)}
                {can('spaces.manage') && <button onClick={() => setForm({ open: true, space: s })} className="rounded p-1.5 hover:bg-canvas hover:text-fg" aria-label={`Edit ${s.name}`}><Pencil className="size-3.5" /></button>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {form.open && <SpaceForm open onClose={() => setForm({ open: false })} teams={data?.teams ?? []} space={form.space} />}
    </Page>
  );
}
