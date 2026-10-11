import type { OpportunityDetail, OpportunityStatus } from './types';

/** Only public Grants.gov IDs are saved. Details are fetched afresh when shown. */
export const SHORTLIST_STORAGE_KEY = 'nofo-desk.shortlist.v1';
export const MAX_SHORTLIST_ITEMS = 8;

export interface ShortlistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ShortlistRead {
  ids: string[];
  status: 'ready' | 'empty' | 'invalid' | 'unavailable';
}

export interface ComparisonRow {
  id: string;
  number: string;
  title: string;
  sourceUrl: string;
  status: OpportunityStatus;
  agency: string | null;
  deadline: { value: string | null; kind: 'forecast' | 'stated' | 'not_supplied' };
  assistanceListings: string[];
  applicantCategories: string[];
  awardCeiling: string | null;
  estimatedFunding: string | null;
  providerUpdated: string | null;
  listedDocumentCount: number;
  linkedDocumentCount: number;
}

const ID_PATTERN = /^[1-9]\d{0,11}$/;

function isGrantsId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validateIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length > MAX_SHORTLIST_ITEMS ||
    ids.some((id) => !isGrantsId(id)) || new Set(ids).size !== ids.length) {
    throw new Error(`A shortlist must contain at most ${MAX_SHORTLIST_ITEMS} distinct Grants.gov opportunity IDs.`);
  }
}

export function loadShortlist(storage: Pick<ShortlistStorage, 'getItem'>): ShortlistRead {
  let raw: string | null;
  try {
    raw = storage.getItem(SHORTLIST_STORAGE_KEY);
  } catch {
    return { ids: [], status: 'unavailable' };
  }
  if (raw === null) return { ids: [], status: 'empty' };
  try {
    // A small, exact schema avoids treating arbitrary browser storage as app data.
    if (raw.length > 512) throw new Error('Stored shortlist is too large.');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Invalid shortlist.');
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).length !== 2 || !Object.hasOwn(record, 'ids')) {
      throw new Error('Unsupported shortlist version or shape.');
    }
    validateIds(record.ids);
    return { ids: [...record.ids], status: record.ids.length ? 'ready' : 'empty' };
  } catch {
    // Never silently rewrite a version we do not understand.
    return { ids: [], status: 'invalid' };
  }
}

export function saveShortlist(storage: Pick<ShortlistStorage, 'setItem'>, ids: readonly string[]): void {
  validateIds(ids);
  storage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify({ version: 1, ids }));
}

export function addOpportunityId(current: readonly string[], id: string): string[] {
  validateIds(current);
  if (!isGrantsId(id)) throw new Error('A valid numeric Grants.gov opportunity ID is required.');
  if (current.includes(id)) return [...current];
  if (current.length === MAX_SHORTLIST_ITEMS) throw new Error(`The shortlist holds at most ${MAX_SHORTLIST_ITEMS} opportunities.`);
  return [...current, id];
}

export function removeOpportunityId(current: readonly string[], id: string): string[] {
  validateIds(current);
  if (!isGrantsId(id)) throw new Error('A valid numeric Grants.gov opportunity ID is required.');
  return current.filter((saved) => saved !== id);
}

function supplied(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function buildComparisonRow(detail: OpportunityDetail): ComparisonRow {
  if (!isGrantsId(detail.id)) throw new Error('A comparison requires a Grants.gov opportunity ID.');
  const closeDate = supplied(detail.closeDate);
  return {
    id: detail.id,
    number: detail.number,
    title: detail.title,
    // Construct this link from the validated provider ID, not supplied text.
    sourceUrl: `https://www.grants.gov/search-results-detail/${detail.id}`,
    status: detail.status,
    agency: supplied(detail.agency),
    deadline: {
      value: closeDate,
      kind: !closeDate ? 'not_supplied' : detail.status === 'forecasted' ? 'forecast' : 'stated',
    },
    assistanceListings: detail.aln.filter(Boolean),
    applicantCategories: detail.eligibleApplicantTypes.filter(Boolean),
    awardCeiling: supplied(detail.awardCeiling),
    estimatedFunding: supplied(detail.estimatedFunding),
    providerUpdated: supplied(detail.updatedAt),
    listedDocumentCount: detail.documents.length,
    linkedDocumentCount: detail.documents.filter((document) => Boolean(publicHttpsUrl(document.url))).length,
  };
}

function publicHttpsUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.includes(':')) return null;
    if (/^\d+(?:\.\d+){3}$/.test(host) || host === 'localhost' || host === 'example.com') return null;
    if (['.local', '.localhost', '.internal', '.invalid', '.test', '.example', '.example.com'].some((suffix) => host.endsWith(suffix))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function markdownText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
    .replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]')
    .replace(/([*_`!#()])/g, '\\$1')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function display(value: string | null): string {
  return markdownText(value || 'Not supplied');
}

/** Export provider metadata and links, never an inferred eligibility decision. */
export function buildMarkdownBrief(details: readonly OpportunityDetail[], generatedAt: Date = new Date()): string {
  const ids = details.map((detail) => detail.id);
  validateIds(ids);
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('A valid generation time is required.');
  const rows = details.map(buildComparisonRow);
  const lines = [
    '# NOFO Desk opportunity brief',
    '',
    `Generated ${generatedAt.toISOString()}. These are Grants.gov provider summaries, not verified submission requirements or eligibility decisions. Confirm each original notice and amendments before acting.`,
    '',
    '| Opportunity | Status | Deadline | Agency | Award ceiling | Listed files |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => {
      const deadline = row.deadline.kind === 'forecast'
        ? `${display(row.deadline.value)} (forecast; confirm)` : display(row.deadline.value);
      return `| [${markdownText(row.title)}](<${row.sourceUrl}>) (${markdownText(row.number)}) | ${markdownText(row.status)} | ${deadline} | ${display(row.agency)} | ${display(row.awardCeiling)} | ${row.listedDocumentCount} listed; ${row.linkedDocumentCount} linked |`;
    }),
    '',
  ];
  for (const [index, detail] of details.entries()) {
    const row = rows[index];
    if (!row) continue;
    lines.push(`## ${markdownText(row.number)} — ${markdownText(row.title)}`, '');
    lines.push(`- Original posting: <${row.sourceUrl}>`);
    lines.push(`- Assistance Listings: ${row.assistanceListings.length ? row.assistanceListings.map(markdownText).join(', ') : 'Not supplied'}`);
    lines.push(`- Applicant categories: ${row.applicantCategories.length ? row.applicantCategories.map(markdownText).join(', ') : 'Not supplied'}`);
    lines.push(`- Estimated funding: ${display(row.estimatedFunding)}`);
    lines.push(`- Provider updated: ${display(row.providerUpdated)}`);
    const linked = detail.documents.flatMap((document) => {
      const url = publicHttpsUrl(document.url);
      return url ? [`  - [${markdownText(document.title || 'Listed file')}](<${url}>)`] : [];
    });
    lines.push('- Listed source links (contents not assessed in this brief):',
      ...(linked.length ? linked : ['  - None supplied with a public HTTPS link.']), '');
  }
  lines.push('This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services.', '');
  return lines.join('\n');
}
