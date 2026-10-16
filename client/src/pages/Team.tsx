import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { actionLabel, dateTime, teamLabel, timeAgo } from '../lib/format';
import type { Role, User } from '../lib/types';
import { Page } from '../components/Shell';
import { Avatar, Button, ErrorNote, Field, Input, Modal, PageHeader, Panel, PanelHeader, Select, cx, td, th, useToast } from '../components/ui';

interface Member extends User { roleLabel: string; lastActiveAt?: string; spaces: string[] }
interface Resp { users: Member[]; roles: { id: Role; label: string; capabilities: string[] }[]; teams: string[]; canManage: boolean }

const CAPS: [string, string][] = [
  ['view', 'Read documents and shared answers'], ['search', 'Search knowledge'], ['ask', 'Ask questions and compare'],
  ['sources.write', 'Upload and manage sources'], ['quality.run', 'Run quality evaluations'], ['spaces.manage', 'Create spaces and set access'],
  ['ai.configure', 'Configure retrieval and AI'], ['users.manage', 'Manage members'], ['workspace.manage', 'Own the workspace'],
];

function Invite({ open, onClose, data }: { open: boolean; onClose: () => void; data: Resp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [teams, setTeams] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: () => api<{ tempPassword: string }>('/team/invite', { method: 'POST', json: { name, email, role, teams } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['team'] }); toast(`${name} added — temporary password ${r.tempPassword}`); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Add a member"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!name || !email} onClick={() => save.mutate()}>Add member</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label="Teams" hint="Teams decide which knowledge spaces this person can retrieve from.">
          <div className="flex flex-wrap gap-1.5">
            {data.teams.map((t) => (
              <button key={t} type="button" onClick={() => setTeams(teams.includes(t) ? teams.filter((x) => x !== t) : [...teams, t])} className={cx('rounded-full border px-2.5 py-0.5 text-xs', teams.includes(t) ? 'border-signal bg-signal-soft text-signal-ink' : 'border-line text-fg-2')}>{teamLabel(t)}</button>
            ))}
          </div>
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

export default function Team() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [invite, setInvite] = useState(false);
  const { data } = useQuery({ queryKey: ['team'], queryFn: () => api<Resp>('/team') });
  const { data: audit } = useQuery({ queryKey: ['audit'], enabled: can('users.manage'), queryFn: () => api<{ entries: { id: string; at: string; user: string; action: string; target: string }[] }>('/audit') });
  const update = useMutation({
    mutationFn: ({ id, ...json }: { id: string; role?: Role; teams?: string[] }) => api(`/team/${id}`, { method: 'PATCH', json }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); toast('Access updated'); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/team/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }), onError: (e) => toast((e as Error).message, 'bad') });

  return (
    <Page wide>
      <PageHeader
        title="Team & access"
        sub="Roles decide what someone can do. Teams decide which knowledge spaces they can retrieve from — enforced before any search runs."
        actions={data?.canManage && <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInvite(true)}>Add member</Button>}
      />

      <div className="mb-6 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-line bg-canvas/60"><tr>
            <th className={th}>Member</th><th className={th}>Role</th><th className={th}>Teams</th><th className={th}>Can retrieve from</th><th className={th}>Last active</th><th className="w-10" />
          </tr></thead>
          <tbody className="divide-y divide-line">
            {data?.users.map((m) => (
              <tr key={m.id}>
                <td className={td}>
                  <span className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.color} size={30} />
                    <span><span className="block font-medium text-fg">{m.name}{m.id === user?.id && <span className="ml-1.5 text-xs font-normal text-fg-muted">(you)</span>}</span><span className="block text-xs text-fg-muted">{m.email}</span></span>
                  </span>
                </td>
                <td className={td}>
                  {data.canManage && m.id !== user?.id ? (
                    <Select value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })} className="h-8 w-44">
                      {data.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </Select>
                  ) : <span className="font-medium text-fg-2">{m.roleLabel}</span>}
                </td>
                <td className={td}><span className="flex flex-wrap gap-1">{m.teams.map((t) => <span key={t} className="rounded-full bg-canvas px-2 py-0.5 text-xs text-fg-2">{teamLabel(t)}</span>)}</span></td>
                <td className={cx(td, 'max-w-[300px] text-xs')}>{m.role === 'owner' || m.role === 'admin' ? 'All spaces' : m.spaces.join(', ')}</td>
                <td className={cx(td, 'whitespace-nowrap')}>{m.lastActiveAt ? timeAgo(m.lastActiveAt) : 'Never'}</td>
                <td className="pr-3">{data.canManage && m.role !== 'owner' && m.id !== user?.id && <button onClick={() => confirm(`Remove ${m.name}?`) && remove.mutate(m.id)} className="rounded p-1 text-fg-faint hover:text-bad" aria-label={`Remove ${m.name}`}><X className="size-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel pad={false}>
          <div className="px-5 pt-5"><PanelHeader title="Role permissions" /></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-y border-line bg-canvas/60"><tr><th className={cx(th, 'min-w-[220px]')}>Capability</th>{data?.roles.map((r) => <th key={r.id} className={cx(th, 'text-center')}>{r.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {CAPS.map(([k, l]) => (
                  <tr key={k}>
                    <td className={cx(td, 'py-2.5')}>{l}</td>
                    {data?.roles.map((r) => <td key={r.id} className="text-center">{r.capabilities.includes(k) ? <Check className="mx-auto size-4 text-signal" strokeWidth={2.5} /> : <Minus className="mx-auto size-3.5 text-line-strong" />}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {can('users.manage') && (
          <Panel pad={false}>
            <div className="px-5 pt-5"><PanelHeader title="Audit log" sub="Sign-ins, uploads, questions and access changes" /></div>
            <ol className="max-h-[420px] divide-y divide-line overflow-y-auto border-t border-line">
              {audit?.entries.map((e) => (
                <li key={e.id} className="px-5 py-2.5 text-sm">
                  <p><span className="font-medium">{e.user}</span> <span className="text-fg-muted">{actionLabel(e.action)}</span> <span className="text-fg-2">{e.target}</span></p>
                  <p className="text-xs text-fg-faint">{dateTime(e.at)}</p>
                </li>
              ))}
              {audit && !audit.entries.length && <li className="px-5 py-8 text-center text-sm text-fg-muted">No activity yet.</li>}
            </ol>
          </Panel>
        )}
      </div>
      {data && invite && <Invite open onClose={() => setInvite(false)} data={data} />}
    </Page>
  );
}
