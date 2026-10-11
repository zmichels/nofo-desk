import type {
  ListedDocument,
  OpportunityDetail,
  OpportunityStatus,
  OpportunitySummary,
  SearchCriteria,
  SearchResult,
} from './types';

type JsonRecord = Record<string, unknown>;
interface SearchRequest {
  keyword: string;
  agencies: string;
  oppStatuses: string;
  rows: number;
  startRecordNum: number;
  sortBy: string;
  cfda?: string;
  eligibilities?: string;
}

const SOURCE_PAGE = 'https://www.grants.gov/search-results-detail/';
const ATTACHMENT_URL = 'https://apply07.grants.gov/grantsws/rest/opportunity/att/download/';
const VALID_STATUSES = new Set(['posted', 'forecasted', 'closed', 'archived']);
const VALID_SORTS = new Set(['closeDate|asc', 'openDate|desc', 'oppName|asc']);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function numericId(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value < 1_000_000_000_000
      ? String(value) : undefined;
  }
  return typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value) ? value : undefined;
}

function decodeEntity(entity: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', bull: '•', hellip: '…',
  };
  if (entity[0] !== '#') return named[entity.toLowerCase()] ?? `&${entity};`;
  const hex = entity[1]?.toLowerCase() === 'x';
  const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
  return Number.isInteger(number) && number > 0 && number <= 0x10ffff
    && !(number >= 0xd800 && number <= 0xdfff)
    ? String.fromCodePoint(number) : `&${entity};`;
}

function providerText(value: unknown): string {
  const source = text(value);
  if (!source) return '';
  // Grants.gov descriptions can contain HTML. Keep their words and paragraph
  // boundaries, then let the UI escape the resulting plain text on display.
  return source
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(?:p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (_, entity: string) => decodeEntity(entity))
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function status(value: unknown): OpportunityStatus {
  const normalized = text(value).toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized as OpportunityStatus : 'other';
}

function safeSourceLink(value: unknown): string | undefined {
  const raw = text(value);
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function providerData(raw: unknown): JsonRecord {
  if (!isRecord(raw)) throw new Error('Grants.gov returned an invalid response.');
  if (raw.errorcode !== 0) throw new Error('Grants.gov did not complete the request.');
  if (!isRecord(raw.data)) throw new Error('Grants.gov returned no usable data.');
  return raw.data;
}

function boundedText(value: string, name: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length > maximum) {
    throw new Error(`${name} must be text no longer than ${maximum} characters.`);
  }
  const normalized = value.trim();
  if (/[\x00-\x1f\x7f]/.test(normalized)) throw new Error(`${name} contains a control character.`);
  return normalized;
}

/** Build the verified search2 fields. Grants.gov currently applies `cfda` for ALN filtering. */
export function buildSearchRequest(criteria: SearchCriteria): SearchRequest {
  const keyword = boundedText(criteria.keyword, 'Keyword', 250);
  const agency = boundedText(criteria.agency, 'Agency', 80);
  const aln = boundedText(criteria.aln, 'Assistance Listing', 30);
  const eligibility = boundedText(criteria.eligibility, 'Applicant type', 16);
  if (agency && !/^[A-Za-z0-9._-]+$/.test(agency)) throw new Error('Agency must be a Grants.gov code.');
  if (aln && !/^[0-9]{2,3}(?:\.[0-9]{1,3})?$/.test(aln)) throw new Error('Assistance Listing must be a numeric code.');
  if (eligibility && !/^[A-Za-z0-9._-]+$/.test(eligibility)) throw new Error('Applicant type must be a Grants.gov code.');
  if (criteria.status !== 'all' && !VALID_STATUSES.has(criteria.status)) throw new Error('Unsupported opportunity status.');
  if (!VALID_SORTS.has(criteria.sortBy)) throw new Error('Unsupported search sort.');
  if (!Number.isInteger(criteria.offset) || criteria.offset < 0) throw new Error('Search offset must be nonnegative.');
  if (!Number.isInteger(criteria.limit) || criteria.limit < 1 || criteria.limit > 50) {
    throw new Error('Search limit must be from 1 to 50.');
  }
  const payload: SearchRequest = {
    keyword,
    agencies: agency,
    oppStatuses: criteria.status === 'all' ? '' : criteria.status,
    rows: criteria.limit,
    startRecordNum: criteria.offset,
    sortBy: criteria.sortBy,
  };
  if (aln) payload.cfda = aln;
  if (eligibility) payload.eligibilities = eligibility;
  return payload;
}

function summaryFromHit(value: unknown): OpportunitySummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = numericId(value.id);
  const number = text(value.number);
  const title = providerText(value.title);
  if (!id || !number || !title) return undefined;
  const rawAln = array(value.cfdaList ?? value.alnist);
  return {
    id,
    number,
    title,
    agency: providerText(value.agency) || providerText(value.agencyName),
    agencyCode: text(value.agencyCode),
    status: status(value.oppStatus),
    openDate: text(value.openDate),
    closeDate: text(value.closeDate),
    aln: rawAln.map(text).filter(Boolean),
    synopsis: '',
    fundingActivity: '',
    sourceUrl: `${SOURCE_PAGE}${id}`,
  };
}

function facetOptions(value: unknown): { code: string; label: string }[] {
  return array(value).flatMap((raw) => {
    const option = record(raw);
    const code = text(option.value);
    return code ? [{ code, label: providerText(option.label) || code }] : [];
  });
}

function searchFacets(data: JsonRecord): SearchResult['facets'] {
  const agencies = new Map<string, { code: string; label: string }>();
  for (const raw of array(data.agencies)) {
    const parent = record(raw);
    // Agency filters are nested in current search2 responses; retain each code.
    for (const option of [...facetOptions([parent]), ...facetOptions(parent.subAgencyOptions)]) {
      agencies.set(option.code, option);
    }
  }
  const applicantTypes = new Map<string, { code: string; label: string }>();
  for (const option of facetOptions(data.eligibilities)) applicantTypes.set(option.code, option);
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  return {
    agencies: [...agencies.values()].sort(byLabel),
    applicantTypes: [...applicantTypes.values()].sort(byLabel),
  };
}

export function mapSearchResponse(raw: unknown, criteria: SearchCriteria): SearchResult {
  const data = providerData(raw);
  const total = data.hitCount;
  if (!Number.isInteger(total) || typeof total !== 'number' || total < 0) {
    throw new Error('Grants.gov returned an invalid result count.');
  }
  if (!Array.isArray(data.oppHits)) throw new Error('Grants.gov returned an invalid result list.');
  const items = data.oppHits.map(summaryFromHit).filter((item): item is OpportunitySummary => Boolean(item));
  const omitted = data.oppHits.length - items.length;
  return {
    total,
    offset: criteria.offset,
    limit: criteria.limit,
    items,
    facets: searchFacets(data),
    warnings: omitted ? [`${omitted} incomplete Grants.gov result(s) omitted.`] : [],
  };
}

function detailAln(data: JsonRecord): string[] {
  const entries = array(data.cfdas ?? data.alns);
  return entries.map((raw) => {
    const entry = record(raw);
    return text(entry.cfdaNumber) || text(entry.alnNumber);
  }).filter(Boolean);
}

function facetDescriptions(value: unknown): string[] {
  return array(value).map((raw) => providerText(record(raw).description)).filter(Boolean);
}

function listedDocuments(data: JsonRecord): ListedDocument[] {
  const documents: ListedDocument[] = [];
  for (const rawFolder of array(data.synopsisAttachmentFolders)) {
    const folder = record(rawFolder);
    for (const rawAttachment of array(folder.synopsisAttachments)) {
      const attachment = record(rawAttachment);
      const title = providerText(attachment.fileName);
      if (!title) continue;
      const id = numericId(attachment.id);
      documents.push({
        title,
        kind: providerText(folder.folderType) || 'Attachment',
        description: providerText(attachment.fileDescription) || undefined,
        // The reader accepts only this listed, numeric attachment ID.
        // Related links below remain link-outs rather than arbitrary fetches.
        sourceDocumentId: id,
        url: id ? `${ATTACHMENT_URL}${id}` : undefined,
      });
    }
  }
  for (const rawLink of array(data.synopsisDocumentURLs)) {
    const link = record(rawLink);
    const url = safeSourceLink(link.url ?? link.documentURL);
    if (!url) continue;
    documents.push({
      title: providerText(link.title) || providerText(link.description) || url,
      kind: 'Related link',
      url,
    });
  }
  return documents;
}

export function mapDetailResponse(raw: unknown, requestedId: string): OpportunityDetail {
  const normalizedId = numericId(requestedId);
  if (!normalizedId) throw new Error('A valid opportunity ID is required.');
  const data = providerData(raw);
  if (numericId(data.id) !== normalizedId) throw new Error('Grants.gov returned a mismatched opportunity.');
  const docType = text(data.docType).toLowerCase();
  // A current forecast may retain an older synopsis. Its own dates and text win.
  const preferred = docType === 'forecast' ? data.forecast : data.synopsis;
  const contentValue = preferred || data.synopsis || data.forecast || {};
  if (!isRecord(contentValue)) throw new Error('Grants.gov returned invalid opportunity detail.');
  const content = contentValue;
  const number = text(data.opportunityNumber);
  const title = providerText(data.opportunityTitle);
  if (!number || !title) throw new Error('Grants.gov returned incomplete opportunity detail.');
  const agencyDetails = record(data.agencyDetails);
  const deadlineNotes = docType === 'forecast'
    ? providerText(content.estApplicationResponseDateDesc)
    : providerText(content.responseDateDesc);
  return {
    id: normalizedId,
    number,
    title,
    agency: providerText(content.agencyName) || providerText(agencyDetails.agencyName),
    agencyCode: text(content.agencyCode) || text(data.owningAgencyCode),
    status: status(data.ost),
    openDate: text(content.postingDate) || text(content.forecastDate),
    closeDate: text(content.responseDate),
    aln: detailAln(data),
    synopsis: providerText(content.synopsisDesc) || providerText(content.forecastDesc),
    fundingActivity: facetDescriptions(content.fundingActivityCategories).join(', '),
    sourceUrl: `${SOURCE_PAGE}${normalizedId}`,
    eligibility: providerText(content.applicantEligibilityDesc),
    eligibleApplicantTypes: facetDescriptions(content.applicantTypes),
    awardCeiling: text(content.awardCeilingFormatted) || text(content.awardCeiling),
    estimatedFunding: text(content.estimatedFundingFormatted) || text(content.estimatedFunding),
    documents: listedDocuments(data),
    deadlineNotes: deadlineNotes || providerText(data.originalDueDateDesc) || undefined,
    updatedAt: text(content.lastUpdatedDate),
  };
}
