# Portfolio copy — SourceMind AI

Text aligned with what the code actually implements, ready to paste into Upwork.

## Title

**AI Document Assistant SaaS | RAG, LangChain & Vector Search**

## Role

Full-Stack AI Developer | RAG, LLM & Knowledge Search Systems

## Description (under 600 characters)

> Built an AI document intelligence SaaS that answers questions across private knowledge bases with RAG. Ingests PDF, DOCX, web pages and CSV; section-aware chunking; hybrid vector + BM25 search with reranking; multi-document chat with page-level citations and an evidence viewer; permission-aware retrieval by team; document comparison; and a RAG evaluation dashboard. React, TypeScript, Node.js, LangChain, OpenAI-compatible LLMs, Qdrant and MongoDB.

## Skills

Artificial Intelligence · Retrieval-Augmented Generation · Large Language Model · React · Node.js

Also shown: LangChain · OpenAI API · Vector Database · TypeScript · REST API · SaaS

## Image order (1000 × 750 crops recommended)

| # | File | What it proves |
|---|---|---|
| 01 | `screenshots/01-cover.png` | RAG + AI at a glance |
| 02 | `screenshots/02-dashboard.png` | Complete SaaS product |
| 03 | `screenshots/03-ask-with-citations.png` | Core RAG capability |
| 04 | `screenshots/04-evidence-viewer.png` | Verifiable, trustworthy AI |
| 05 | `screenshots/05-compare.png` | Advanced document intelligence |
| 06 | `screenshots/06-indexing-pipeline.png` | AI / backend engineering |
| 07 | `screenshots/07-quality-center.png` | Production AI maturity |
| 08 | `screenshots/12-architecture.png` | How it was engineered |

Optional pair for the permissions story: `13-permission-declined.png` (engineer is refused) and `14-permission-allowed.png` (HR gets the cited answer).

## Talking points for interviews

- Permissions are applied **before** retrieval and pushed into the vector query, so restricted text never reaches ranking or the model.
- Hybrid search (vector + BM25 with reciprocal rank fusion) plus a reranker; the Quality center shows hybrid + rerank beating either method alone on the same question set.
- Every chunk keeps character offsets into its page, which is what allows sentence-level highlighting of evidence.
- Citation validation removes citations to passages that weren't provided and flags sentences their source doesn't support.
- "Evidence strength" is computed from retrieval, rather than asking the model to rate its own confidence.
- The system declines when evidence is weak or a specific identifier in the question (e.g. "L5") is absent from the best passage.
