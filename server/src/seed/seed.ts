import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Document as DocxDocument, HeadingLevel, Packer, Paragraph } from 'docx';
import { nanoid } from 'nanoid';
import PDFDocument from 'pdfkit';
import { paths } from '../config.js';
import { db, defaultSettings, flushDb } from '../store/db.js';
import type { Doc, DocType, Space, User, Visibility } from '../types.js';
import { answerQuestion } from '../rag/answer.js';
import { runEvaluation } from '../rag/evaluate.js';
import { enqueue, freshProcessing, idle, removeIndex } from '../rag/pipeline.js';
import { enterpriseMsa, northstar, pricingSchedule, securityAddendum, supplier2025, supplier2026, type Page } from './content/legal.js';
import { compensationBands, employeeHandbook, expensePolicy } from './content/people.js';
import { apiArchitecture, customerInterviews, marketResearch, releaseNotes, smartSearchPrd } from './content/product.js';

const SEED_DIR = path.join(paths.uploads, 'seed');

function renderPdf(file: string, title: string, pages: Page[]) {
  return new Promise<number>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 72, bottom: 72, left: 68, right: 68 }, bufferPages: true, info: { Title: title, Author: 'Helix Systems Ltd' } });
    const out = fs.createWriteStream(file);
    doc.pipe(out);
    pages.forEach((blocks, i) => {
      if (i > 0) doc.addPage();
      blocks.forEach(([kind, text], j) => {
        if (kind === 'h') {
          const isTitle = i === 0 && j === 0;
          if (!isTitle) doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(isTitle ? 19 : 12.5).fillColor('#0B1020').text(text);
          doc.moveDown(isTitle ? 0.8 : 0.35);
        } else {
          doc.font('Helvetica').fontSize(10.5).fillColor('#1F2937').text(text, { lineGap: 2.2, align: 'left' });
          doc.moveDown(0.7);
        }
      });
    });
    if (pages.length > 1) {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8');
        doc.text('HELIX SYSTEMS LTD  ·  CONFIDENTIAL', 68, 36, { lineBreak: false });
        doc.text(`Page ${i + 1} of ${range.count}`, 68, doc.page.height - 48, { lineBreak: false });
      }
    }
    doc.end();
    out.on('finish', () => resolve(fs.statSync(file).size));
    out.on('error', reject);
  });
}

async function renderDocx(file: string, blocks: [boolean, string][]) {
  const doc = new DocxDocument({
    sections: [{
      children: blocks.map(([h, text], i) => new Paragraph({ text, heading: h ? (i === 0 ? HeadingLevel.TITLE : HeadingLevel.HEADING_2) : undefined })),
    }],
  });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  return fs.statSync(file).size;
}

const COLORS = { blue: '#5B7CFF', teal: '#14B8A6', amber: '#F59E0B', pink: '#EC4899', violet: '#8B5CF6', green: '#10B981', red: '#EF4444' };

export async function seed({ reset }: { reset: boolean }) {
  if (reset) {
    for (const d of db.docs.all()) await removeIndex(d.id);
    for (const c of ['users', 'spaces', 'docs', 'pages', 'chunks', 'conversations', 'evalCases', 'evalRuns', 'audit'] as const) db[c].clear();
    db.settings.update('workspace', { ...defaultSettings });
    if (fs.existsSync(paths.uploads)) fs.rmSync(paths.uploads, { recursive: true, force: true });
  }
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  const hash = await bcrypt.hash('demo1234', 10);
  const mkUser = (name: string, email: string, role: User['role'], teams: string[], title: string, color: string): User => ({
    id: nanoid(10), name, email, role, teams, title, color, passwordHash: hash, createdAt: ago(60 * 24 * 120),
  });
  const users = {
    daniel: mkUser('Daniel Reed', 'daniel@helix.demo', 'owner', ['management'], 'Head of Operations', COLORS.blue),
    olivia: mkUser('Olivia Brooks', 'olivia@helix.demo', 'admin', ['hr', 'management'], 'People Operations Lead', COLORS.pink),
    sarah: mkUser('Sarah Chen', 'sarah@helix.demo', 'knowledge_manager', ['legal'], 'Senior Legal Counsel', COLORS.teal),
    marcus: mkUser('Marcus Hale', 'marcus@helix.demo', 'member', ['engineering', 'product'], 'Staff Engineer', COLORS.amber),
    priya: mkUser('Priya Nair', 'priya@helix.demo', 'viewer', ['sales'], 'Account Executive', COLORS.violet),
  };
  Object.values(users).forEach((u) => db.users.insert(u));

  const mkSpace = (name: string, description: string, icon: string, color: string, accessTeams: string[], days: number): Space => ({
    id: nanoid(10), name, description, icon, color, accessTeams, createdBy: users.daniel.id, createdAt: ago(60 * 24 * days),
  });
  const spaces = {
    legal: mkSpace('Legal & Contracts', 'Customer agreements, supplier contracts and security terms.', 'scale', COLORS.blue, ['legal', 'management'], 90),
    policies: mkSpace('Company Policies', 'Handbook and policies every employee can rely on.', 'book', COLORS.green, ['*'], 88),
    hr: mkSpace('HR Confidential', 'Compensation and people data — People Ops only.', 'lock', COLORS.pink, ['hr'], 80),
    product: mkSpace('Product Knowledge', 'Requirements, release notes and product decisions.', 'box', COLORS.violet, ['product', 'engineering'], 75),
    engineering: mkSpace('Engineering Docs', 'Architecture, APIs and operational runbooks.', 'code', COLORS.amber, ['engineering'], 70),
    research: mkSpace('Customer Research', 'Market research and customer interview synthesis.', 'search', COLORS.teal, ['product', 'sales', 'management'], 60),
  };
  Object.values(spaces).forEach((s) => db.spaces.insert(s));

  type SeedDoc = { key: string; title: string; filename: string; type: DocType; space: Space; owner: User; visibility?: Visibility; tags: string[]; minutesAgo: number; write: (file: string) => Promise<number> | number };
  const text = (content: string) => (file: string) => { fs.writeFileSync(file, content); return Buffer.byteLength(content); };
  const seedDocs: SeedDoc[] = [
    { key: 'msa', title: 'Enterprise MSA 2026', filename: 'Enterprise-MSA-2026.pdf', type: 'PDF', space: spaces.legal, owner: users.sarah, tags: ['contract', 'customer', 'meridian'], minutesAgo: 12, write: (f) => renderPdf(f, 'Enterprise Master Subscription Agreement 2026', enterpriseMsa) },
    { key: 'pricing', title: 'Pricing Schedule — Meridian', filename: 'Pricing-Schedule.pdf', type: 'PDF', space: spaces.legal, owner: users.sarah, tags: ['contract', 'pricing', 'meridian'], minutesAgo: 14, write: (f) => renderPdf(f, 'Pricing Schedule', pricingSchedule) },
    { key: 'security', title: 'Security Addendum', filename: 'Security-Addendum.pdf', type: 'PDF', space: spaces.legal, owner: users.sarah, tags: ['contract', 'security', 'meridian'], minutesAgo: 15, write: (f) => renderPdf(f, 'Security Addendum', securityAddendum) },
    { key: 'sup25', title: 'Supplier Agreement 2025', filename: 'Supplier-Agreement-2025.pdf', type: 'PDF', space: spaces.legal, owner: users.sarah, tags: ['contract', 'supplier', 'kestrel'], minutesAgo: 60 * 24 * 9, write: (f) => renderPdf(f, 'Supplier Agreement 2025', supplier2025) },
    { key: 'sup26', title: 'Supplier Agreement 2026', filename: 'Supplier-Agreement-2026.pdf', type: 'PDF', space: spaces.legal, owner: users.sarah, tags: ['contract', 'supplier', 'kestrel'], minutesAgo: 60 * 24 * 2, write: (f) => renderPdf(f, 'Supplier Agreement 2026', supplier2026) },
    { key: 'northstar', title: 'Northstar Agreement', filename: 'Northstar-Platform-Agreement.pdf', type: 'PDF', space: spaces.legal, owner: users.daniel, tags: ['contract', 'customer'], minutesAgo: 60 * 24 * 20, write: (f) => renderPdf(f, 'Northstar Platform Agreement', northstar) },
    { key: 'handbook', title: 'Employee Handbook 2026', filename: 'Employee-Handbook-2026.pdf', type: 'PDF', space: spaces.policies, owner: users.olivia, visibility: 'organization', tags: ['policy', 'hr'], minutesAgo: 60 * 24 * 2 + 300, write: (f) => renderPdf(f, 'Employee Handbook 2026', employeeHandbook) },
    { key: 'expenses', title: 'Expense Policy', filename: 'Expense-Policy.txt', type: 'TXT', space: spaces.policies, owner: users.olivia, visibility: 'organization', tags: ['policy', 'finance'], minutesAgo: 60 * 24 * 30, write: text(expensePolicy) },
    { key: 'comp', title: 'Compensation Bands 2026', filename: 'Compensation-Bands-2026.pdf', type: 'PDF', space: spaces.hr, owner: users.olivia, tags: ['hr', 'confidential'], minutesAgo: 60 * 24 * 6, write: (f) => renderPdf(f, 'Compensation Bands 2026', compensationBands) },
    { key: 'api', title: 'API Architecture', filename: 'API-Architecture.docx', type: 'DOCX', space: spaces.engineering, owner: users.marcus, tags: ['architecture', 'api'], minutesAgo: 60 * 26, write: (f) => renderDocx(f, apiArchitecture) },
    { key: 'prd', title: 'PRD — Smart Search v3', filename: 'PRD-Smart-Search-v3.md', type: 'MD', space: spaces.product, owner: users.marcus, tags: ['prd', 'search'], minutesAgo: 60 * 24 * 4, write: text(smartSearchPrd) },
    { key: 'release', title: 'Release Notes 4.2', filename: 'Release-Notes-4.2.txt', type: 'TXT', space: spaces.product, owner: users.marcus, tags: ['release'], minutesAgo: 60 * 24 * 8, write: text(releaseNotes) },
    { key: 'research', title: 'Q3 Market Research', filename: 'Q3-Market-Research.pdf', type: 'PDF', space: spaces.research, owner: users.daniel, tags: ['research', 'market'], minutesAgo: 60 * 24 * 4 + 90, write: (f) => renderPdf(f, 'Q3 2026 Market Research', marketResearch) },
    { key: 'interviews', title: 'Customer Interviews Q3', filename: 'Customer-Interviews-Q3.csv', type: 'CSV', space: spaces.research, owner: users.daniel, tags: ['research', 'interviews'], minutesAgo: 60 * 24 * 4 + 60, write: text(customerInterviews) },
  ];

  const ids: Record<string, string> = {};
  for (const s of seedDocs.sort((a, b) => b.minutesAgo - a.minutesAgo)) {
    const file = path.join(SEED_DIR, s.filename);
    const size = await s.write(file);
    const doc: Doc = {
      id: nanoid(12), title: s.title, filename: s.filename, type: s.type, spaceId: s.space.id, ownerId: s.owner.id,
      visibility: s.visibility ?? 'team', tags: s.tags, pages: 0, pageLabel: s.type === 'PDF' ? 'Page' : 'Part',
      sizeBytes: size, status: 'uploading', storagePath: file, createdAt: ago(s.minutesAgo), updatedAt: ago(s.minutesAgo),
      processing: freshProcessing(),
    };
    db.docs.insert(doc);
    ids[s.key] = doc.id;
    enqueue(doc.id);
  }
  await idle();
  // demo realism: documents look as if they were indexed when they were uploaded
  for (const d of db.docs.all()) {
    const at = new Date(new Date(d.createdAt).getTime() + d.processing.ms).toISOString();
    db.docs.update(d.id, { indexedAt: at, updatedAt: at });
    db.audit.insert({ id: nanoid(12), at: d.createdAt, userId: d.ownerId, action: 'document.upload', target: d.title, meta: { space: db.spaces.get(d.spaceId)?.name } });
  }

  // labelled evaluation set — expected pages are resolved from the indexed chunks
  const pageOf = (key: string, phrase: string) =>
    db.chunks.find((c) => c.docId === ids[key] && c.text.toLowerCase().includes(phrase.toLowerCase()))[0]?.page ?? null;
  const cases: [string, string | null, string][] = [
    ['How much notice must the customer give to terminate for convenience?', 'msa', 'ninety (90) days'],
    ['What is the liability cap in the enterprise agreement?', 'msa', 'total aggregate liability'],
    ['When are invoices due under the MSA?', 'msa', 'Net 30'],
    ['How quickly must a security breach be notified to the customer?', 'security', 'confirmed security incident'],
    ['What is the total contract value for Meridian?', 'pricing', 'total contract value'],
    ['What happens to fees if Meridian cancels before the initial term ends?', 'pricing', 'remaining Committed Fees'],
    ['How many days of annual leave do employees get?', 'handbook', '25 days of paid annual leave'],
    ['How many days a week can employees work from home?', 'handbook', 'three (3) days per week'],
    ['How long is the probation period?', 'handbook', 'probation period of six'],
    ['What is the annual learning budget?', 'handbook', '£1,500'],
    ['What is the API rate limit per key?', 'api', '600 requests per minute'],
    ['What are the payment terms in the 2026 supplier agreement?', 'sup26', 'Net 30'],
    ['Who are the main competitors in the Q3 research?', 'research', 'main competitors'],
    ['What is the daily meal allowance when travelling?', 'expenses', '£35 per day'],
    // harder, paraphrased questions with little keyword overlap
    ['Can we get out of the Kestrel contract quickly in 2026?', 'sup26', 'terminate this Agreement for convenience'],
    ["What's the uptime guarantee we give Meridian?", 'msa', '99.9%'],
    ['How much does an extra seat cost for Meridian?', 'pricing', '£290 per user'],
    ['When will API v1 be switched off?', 'release', 'API v1 will be retired'],
    ['What frustrates customers about finding dashboards?', 'interviews', 'nobody can find'],
    ["What is the CEO's 2028 acquisition strategy?", null, ''],
    ['Does the company provide private medical insurance?', null, ''],
    ['How many parking spaces are allocated per office?', null, ''],
  ];
  for (const [question, key, phrase] of cases) {
    db.evalCases.insert({ id: nanoid(10), question, expectedDocId: key ? ids[key] : null, expectedPage: key ? pageOf(key, phrase) : null });
  }

  // a few real conversations so the workspace is not empty on first login
  const convo = async (u: User, questions: string[], docKeys: string[], shared = false) => {
    const docIds = docKeys.map((k) => ids[k]);
    const t = new Date().toISOString();
    const conv = { id: nanoid(12), userId: u.id, title: questions[0], docIds, spaceIds: [], shared, messages: [] as any[], createdAt: t, updatedAt: t };
    for (const q of questions) {
      conv.messages.push({ id: nanoid(12), role: 'user', content: q, createdAt: new Date().toISOString() });
      conv.messages.push(await answerQuestion(u, q, { docIds }, () => {}));
    }
    db.conversations.insert(conv);
  };
  await convo(users.daniel, ['What are our termination obligations if the customer cancels before the initial term ends?'], ['msa', 'pricing', 'security'], true);
  await convo(users.sarah, ['How quickly must we notify Meridian about a data breach?', 'How long is customer data kept after termination?'], ['msa', 'security']);
  await convo(users.marcus, ['What are the API rate limits and how are they enforced?'], ['api']);
  await convo(users.olivia, ['How much annual leave do employees get?'], ['handbook']);

  // retrieval strategy comparison — four real evaluation runs
  await runEvaluation(users.daniel, { label: 'Keyword only (BM25)', strategy: 'keyword', rerank: false });
  await runEvaluation(users.daniel, { label: 'Vector only', strategy: 'vector', rerank: false });
  await runEvaluation(users.daniel, { label: 'Hybrid (RRF)', strategy: 'hybrid', rerank: false });
  await runEvaluation(users.daniel, { label: 'Hybrid + rerank', strategy: 'hybrid', rerank: true });

  await flushDb();
  return { users: Object.keys(users).length, spaces: Object.keys(spaces).length, documents: seedDocs.length };
}
