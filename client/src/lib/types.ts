export type Role = 'owner' | 'admin' | 'knowledge_manager' | 'member' | 'viewer';
export type DocStatus = 'uploading' | 'parsing' | 'ocr' | 'chunking' | 'embedding' | 'indexing' | 'ready' | 'failed';
export type Capability = 'workspace.manage' | 'users.manage' | 'spaces.manage' | 'ai.configure' | 'sources.write' | 'quality.run' | 'ask' | 'search' | 'view';

export interface User { id: string; name: string; email: string; role: Role; teams: string[]; title: string; color: string; roleLabel?: string }

export interface Stage { key: string; label: string; status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'; startedAt?: string; endedAt?: string; ms?: number; detail?: string }
export interface PipelineEvent { at: string; level: 'info' | 'warn' | 'error'; message: string }

export interface KeyTerm { label: string; value: string; chunkId?: string; page?: number }
export interface Summary { executive: string; executiveChunkIds: string[]; keyTerms: KeyTerm[]; topics: string[]; suggestedQuestions: string[]; generatedBy: 'local' | 'llm' }

export interface Doc {
  id: string; title: string; filename: string; type: 'PDF' | 'DOCX' | 'URL' | 'TXT' | 'MD' | 'CSV';
  spaceId: string; ownerId: string; visibility: 'private' | 'team' | 'organization'; tags: string[];
  pages: number; pageLabel: 'Page' | 'Part'; sizeBytes: number; status: DocStatus; error?: string; sourceUrl?: string;
  createdAt: string; updatedAt: string; indexedAt?: string;
  processing: { chunks: number; avgTokens: number; totalTokens: number; ms: number; embeddingModel: string; chunkStrategy: string; vectorStore: string; stages: Stage[]; events?: PipelineEvent[] };
  summary?: Summary;
  owner: { id: string; name: string; color: string } | null;
  space: { id: string; name: string; color: string; icon: string } | null;
}

export interface Space {
  id: string; name: string; description: string; icon: string; color: string; accessTeams: string[];
  documents: number; ready: number; chunks: number; members: { id: string; name: string; color: string }[];
  lastActivity: string; access: string; createdAt: string;
}

export interface Chunk { id: string; seq: number; docId: string; spaceId: string; page: number; section: string; text: string; tokens: number; start: number; end: number }
export interface PageText { n: number; text: string; headings: { offset: number; text: string }[] }

export interface Citation {
  n: number; chunkId: string; chunkSeq: number; docId: string; docTitle: string; spaceId: string; page: number; pageLabel: string;
  section: string; relevance: number; quote: string; highlight: { start: number; end: number }; chunkRange: { start: number; end: number };
}
export interface Evidence { level: 'Strong' | 'Moderate' | 'Weak' | 'None'; passages: number; documents: number; avgRelevance: number }
export interface Grounding { groundedness: number; citationCoverage: number; unsupported: string[]; removedCitations: number }
export interface Trace {
  strategy: string; rewrittenQuery: string; allowedDocs: number; candidates: number; vectorHits: number; keywordHits: number;
  reranked: { chunkId: string; score: number; vector: number; keyword: number; coverage: number }[];
  ms: { retrieve: number; generate: number; total: number };
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: string;
  citations?: Citation[]; evidence?: Evidence; grounding?: Grounding; refused?: boolean; mode?: 'llm' | 'extractive'; trace?: Trace; followUps?: string[];
}
export interface Conversation { id: string; userId: string; title: string; docIds: string[]; spaceIds: string[]; shared: boolean; messages: Message[]; createdAt: string; updatedAt: string; mine?: boolean }

export interface SystemInfo { store: string; vectorStore: string; embeddingModel: string; llm: string | null; llmConfigured: boolean; answerMode: 'llm' | 'extractive'; chunks: number }

export interface Settings {
  strategy: 'hybrid' | 'vector' | 'keyword'; hybridAlpha: number; rerank: boolean; topK: number; candidatePool: number;
  minRelevance: number; chunkSize: number; chunkOverlap: number; queryRewrite: boolean; useLlm: boolean;
}

export interface EvalResult {
  caseId: string; question: string; expected: string; retrieved: string; hit: boolean; refused: boolean;
  groundedness: number; citationCoverage: number; relevance: number; evidence: number; result: 'PASS' | 'WARN' | 'FAIL'; reason: string;
}
export interface EvalMetrics {
  groundedness: number; citationCoverage: number; retrievalHitRate: number; retrievalPrecision: number;
  answerRelevance: number; noAnswerAccuracy: number; passRate: number; avgLatencyMs: number;
}
export interface EvalRun { id: string; createdAt: string; label: string; strategy: string; rerank: boolean; topK: number; mode: string; metrics: EvalMetrics; results: EvalResult[]; cases?: number; warnings?: number }
