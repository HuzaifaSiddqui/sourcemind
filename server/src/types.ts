export type Role = 'owner' | 'admin' | 'knowledge_manager' | 'member' | 'viewer';
export type Visibility = 'private' | 'team' | 'organization';
export type DocType = 'PDF' | 'DOCX' | 'URL' | 'TXT' | 'MD' | 'CSV';
export type DocStatus =
  | 'uploading' | 'parsing' | 'ocr' | 'chunking' | 'embedding' | 'indexing' | 'ready' | 'failed';

export interface Entity { id: string }

export interface User extends Entity {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  teams: string[];
  title: string;
  color: string;
  createdAt: string;
  lastActiveAt?: string;
}

export interface Space extends Entity {
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Teams allowed to retrieve from this space. '*' = whole organisation. */
  accessTeams: string[];
  createdBy: string;
  createdAt: string;
}

export interface PipelineStage {
  key: 'upload' | 'parse' | 'ocr' | 'chunk' | 'embed' | 'index' | 'enrich';
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  startedAt?: string;
  endedAt?: string;
  ms?: number;
  detail?: string;
}

export interface PipelineEvent { at: string; level: 'info' | 'warn' | 'error'; message: string }

export interface KeyTerm { label: string; value: string; chunkId?: string; page?: number }

export interface DocSummary {
  executive: string;
  executiveChunkIds: string[];
  keyTerms: KeyTerm[];
  topics: string[];
  suggestedQuestions: string[];
  generatedBy: 'local' | 'llm';
}

export interface Doc extends Entity {
  title: string;
  filename: string;
  type: DocType;
  spaceId: string;
  ownerId: string;
  visibility: Visibility;
  tags: string[];
  pages: number;
  pageLabel: 'Page' | 'Part';
  sizeBytes: number;
  status: DocStatus;
  error?: string;
  sourceUrl?: string;
  storagePath?: string;
  createdAt: string;
  updatedAt: string;
  indexedAt?: string;
  processing: {
    chunks: number;
    avgTokens: number;
    totalTokens: number;
    ms: number;
    embeddingModel: string;
    chunkStrategy: string;
    vectorStore: string;
    stages: PipelineStage[];
    events: PipelineEvent[];
  };
  summary?: DocSummary;
}

/** Extracted text per page, stored separately from Doc metadata. */
export interface DocPages extends Entity { pages: { n: number; text: string; headings: { offset: number; text: string }[] }[] }

export interface Chunk extends Entity {
  seq: number;
  docId: string;
  spaceId: string;
  page: number;
  section: string;
  text: string;
  tokens: number;
  /** Character offsets of this chunk inside its page text. */
  start: number;
  end: number;
}

export interface Citation {
  n: number;
  chunkId: string;
  chunkSeq: number;
  docId: string;
  docTitle: string;
  spaceId: string;
  page: number;
  pageLabel: string;
  section: string;
  relevance: number;
  quote: string;
  /** Offsets of the supporting sentence inside the page text. */
  highlight: { start: number; end: number };
  chunkRange: { start: number; end: number };
}

export interface EvidenceStrength {
  level: 'Strong' | 'Moderate' | 'Weak' | 'None';
  passages: number;
  documents: number;
  avgRelevance: number;
}

export interface Grounding {
  groundedness: number;
  citationCoverage: number;
  unsupported: string[];
  removedCitations: number;
}

export interface RetrievalTrace {
  strategy: string;
  rewrittenQuery: string;
  allowedDocs: number;
  candidates: number;
  vectorHits: number;
  keywordHits: number;
  reranked: { chunkId: string; score: number; vector: number; keyword: number; coverage: number }[];
  ms: { retrieve: number; generate: number; total: number };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  citations?: Citation[];
  evidence?: EvidenceStrength;
  grounding?: Grounding;
  refused?: boolean;
  mode?: 'llm' | 'extractive';
  trace?: RetrievalTrace;
  followUps?: string[];
}

export interface Conversation extends Entity {
  userId: string;
  title: string;
  docIds: string[];
  spaceIds: string[];
  shared: boolean;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface EvalCase extends Entity {
  question: string;
  expectedDocId: string | null;
  expectedPage: number | null;
  note?: string;
}

export interface EvalCaseResult {
  caseId: string;
  question: string;
  expected: string;
  retrieved: string;
  hit: boolean;
  refused: boolean;
  groundedness: number;
  citationCoverage: number;
  relevance: number;
  evidence: number;
  result: 'PASS' | 'WARN' | 'FAIL';
  reason: string;
}

export interface EvalRun extends Entity {
  createdAt: string;
  label: string;
  strategy: Settings['strategy'];
  rerank: boolean;
  topK: number;
  mode: 'llm' | 'extractive';
  metrics: {
    groundedness: number;
    citationCoverage: number;
    retrievalHitRate: number;
    retrievalPrecision: number;
    answerRelevance: number;
    noAnswerAccuracy: number;
    passRate: number;
    avgLatencyMs: number;
  };
  results: EvalCaseResult[];
  triggeredBy: string;
}

export interface AuditEntry extends Entity {
  at: string;
  userId: string;
  action: string;
  target: string;
  meta?: Record<string, unknown>;
}

export interface Settings extends Entity {
  strategy: 'hybrid' | 'vector' | 'keyword';
  hybridAlpha: number;
  rerank: boolean;
  topK: number;
  candidatePool: number;
  minRelevance: number;
  chunkSize: number;
  chunkOverlap: number;
  queryRewrite: boolean;
  useLlm: boolean;
}

export interface PublicUser {
  id: string; name: string; email: string; role: Role; teams: string[]; title: string; color: string;
}
