import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Share2, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { Page } from '../components/Shell';
import { Badge, Button, Empty, PageHeader, Skeleton } from '../components/ui';

interface Row { id: string; title: string; updatedAt: string; shared: boolean; mine: boolean; owner: string; messages: number; lastAnswer: string }

export default function Conversations() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['conversations'], queryFn: () => api<{ conversations: Row[] }>('/conversations') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/conversations/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }) });
  const strip = (s: string) => s.replace(/\*\*[^*]+\*\*\s*/g, '').replace(/\s?\[\d+\]/g, '');

  return (
    <Page>
      <PageHeader
        title="Conversations"
        sub={can('ask') ? 'Your questions and any answers teammates have shared with the workspace.' : 'Answers teammates have shared with the workspace.'}
        actions={can('ask') && <Link to="/ask"><Button variant="primary" icon={<Sparkles className="size-4" />}>New question</Button></Link>}
      />
      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading && <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {data && !data.conversations.length && <Empty icon={<MessageSquareText className="size-5" />} title="No conversations yet">{can('ask') ? 'Ask a question to start one.' : 'Nothing has been shared with you yet.'}</Empty>}
        <ul className="divide-y divide-line">
          {data?.conversations.map((c) => (
            <li key={c.id} className="group flex items-start gap-4 px-5 py-4 hover:bg-canvas/60">
              <Link to={`/ask/${c.id}`} className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-fg group-hover:text-signal-ink">
                  <span className="truncate">{c.title}</span>
                  {c.shared && <Badge tone="signal"><Share2 className="size-3" />Shared</Badge>}
                </p>
                <p className="mt-1 line-clamp-2 max-w-[90ch] text-sm text-fg-muted">{strip(c.lastAnswer)}</p>
                <p className="mt-1.5 text-xs text-fg-faint">{c.mine ? 'You' : c.owner} · {c.messages / 2} {c.messages / 2 === 1 ? 'question' : 'questions'} · {timeAgo(c.updatedAt)}</p>
              </Link>
              {c.mine && (
                <button onClick={() => confirm('Delete this conversation?') && remove.mutate(c.id)} className="rounded p-1.5 text-fg-faint opacity-0 hover:bg-bad-soft hover:text-bad group-hover:opacity-100 focus:opacity-100" aria-label="Delete conversation">
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
