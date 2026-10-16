import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Chunk, DocPages } from '../types.js';
import { approxTokens } from './text.js';

export interface ChunkDraft extends Omit<Chunk, 'id' | 'seq' | 'docId' | 'spaceId'> {}

/**
 * Section-aware recursive chunking.
 * 1. Each page is cut at its headings so a chunk never straddles two sections.
 * 2. Each section slice is split with LangChain's RecursiveCharacterTextSplitter
 *    (paragraph → sentence → word separators) to the target token budget.
 * 3. Every chunk keeps exact character offsets into the page text, so the
 *    evidence viewer can highlight the precise passage that supports an answer.
 */
export async function chunkPages(
  pages: DocPages['pages'],
  opts: { chunkTokens: number; overlapTokens: number; docTitle: string },
): Promise<ChunkDraft[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: opts.chunkTokens * 4,
    chunkOverlap: opts.overlapTokens * 4,
    separators: ['\n\n', '\n', '. ', '; ', ', ', ' ', ''],
  });

  const out: ChunkDraft[] = [];
  let section = opts.docTitle;

  for (const page of pages) {
    if (!page.text.trim()) continue;
    const cuts = [0, ...page.headings.map((h) => h.offset).filter((o) => o > 0), page.text.length];
    for (let i = 0; i < cuts.length - 1; i++) {
      const sliceStart = cuts[i];
      const slice = page.text.slice(sliceStart, cuts[i + 1]);
      const heading = page.headings.find((h) => h.offset === sliceStart);
      if (heading) section = heading.text;

      // A heading alone is not a useful chunk; fold it into its section body.
      if (!slice.replace(heading?.text ?? '', '').trim()) continue;

      const parts = await splitter.splitText(slice);
      let cursor = 0;
      for (const part of parts) {
        const text = part.trim();
        if (text.length < 40 && parts.length > 1) continue;
        let at = slice.indexOf(text, Math.max(0, cursor - opts.overlapTokens * 8));
        if (at < 0) at = slice.indexOf(text.slice(0, 60));
        if (at < 0) at = cursor;
        cursor = at + text.length;
        out.push({
          page: page.n,
          section,
          text,
          tokens: approxTokens(text),
          start: sliceStart + at,
          end: sliceStart + at + text.length,
        });
      }
    }
  }
  return out;
}

/** Text that is actually embedded / keyword-indexed: adds document + section context. */
export function contextualText(c: Pick<Chunk, 'section' | 'text'>, docTitle: string) {
  return `${docTitle} — ${c.section}\n${c.text}`;
}
