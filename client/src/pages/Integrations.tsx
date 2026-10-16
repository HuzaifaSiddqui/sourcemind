import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cloud, Database, FileSpreadsheet, FileText, FileType2, Globe, LayoutGrid, NotebookPen, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Page } from '../components/Shell';
import { Badge, Button, PageHeader } from '../components/ui';
import { UploadDialog } from '../components/UploadDialog';

const ICON: Record<string, typeof Cloud> = { pdf: FileText, docx: FileType2, url: Globe, txt: NotebookPen, csv: FileSpreadsheet, gdrive: Cloud, notion: LayoutGrid, confluence: Database, dropbox: Share2, sharepoint: Share2 };

export default function Integrations() {
  const { can } = useAuth();
  const [upload, setUpload] = useState(false);
  const { data } = useQuery({ queryKey: ['integrations'], queryFn: () => api<{ integrations: { id: string; name: string; description: string; status: 'live' | 'planned' }[] }>('/integrations') });
  const live = data?.integrations.filter((i) => i.status === 'live') ?? [];
  const planned = data?.integrations.filter((i) => i.status === 'planned') ?? [];

  const Card = ({ i }: { i: (typeof live)[number] }) => {
    const I = ICON[i.id] ?? FileText;
    return (
      <div className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-canvas text-fg-2"><I className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">{i.name}{i.status === 'live' ? <Badge tone="ok">Available</Badge> : <Badge>Planned</Badge>}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{i.description}</p>
        </div>
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Sources & connectors"
        sub="What SourceMind can ingest today, and the sync connectors on the roadmap."
        actions={can('sources.write') && <Button variant="primary" onClick={() => setUpload(true)}>Add sources</Button>}
      />
      <h2 className="mb-3 text-md font-semibold">Available now</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2">{live.map((i) => <Card key={i.id} i={i} />)}</div>
      <h2 className="mb-1 text-md font-semibold">Planned connectors</h2>
      <p className="mb-3 text-sm text-fg-muted">Not built yet. Each will sync on a schedule and mirror the source system's permissions into knowledge-space access.</p>
      <div className="grid gap-3 opacity-80 sm:grid-cols-2">{planned.map((i) => <Card key={i.id} i={i} />)}</div>
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
    </Page>
  );
}
