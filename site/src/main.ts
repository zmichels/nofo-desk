import './styles.css';
import { deskService, serviceMode } from './service';
import type {
  ListedDocument,
  OpportunityDetail,
  OpportunityStatus,
  PassageSearchResult,
  ReadDocumentResult,
  SearchCriteria,
  SearchResult,
  SortBy,
} from './types';

type Page = 'discover' | 'opportunity' | 'document';

interface AppState {
  page: Page;
  query: SearchCriteria;
  results?: SearchResult;
  opportunity?: OpportunityDetail;
  reading?: ReadDocumentResult;
  documentId?: string;
  passageQuery: string;
  passageSearch?: PassageSearchResult;
  passageSearchLoading: boolean;
  passageSearchError: string;
  loading: boolean;
  error: string;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('The NOFO Desk app root is missing.');
const liveProvider = serviceMode === 'provider-direct';
const liveData = liveProvider;
document.title = liveProvider ? 'NOFO Desk · Grants.gov opportunities' : 'NOFO Desk · Fictional sample';

function defaultQuery(): SearchCriteria {
  return {
    keyword: liveData ? 'cancer' : '',
    status: 'posted',
    agency: '',
    aln: '',
    eligibility: '',
    sortBy: 'closeDate|asc',
    offset: 0,
    limit: 10,
  };
}

const state: AppState = {
  page: 'discover',
  query: defaultQuery(),
  passageQuery: '',
  passageSearchLoading: false,
  passageSearchError: '',
  loading: false,
  error: '',
};

let routeRequest = 0;
let searchRequest = 0;
let passageRequest = 0;
let blockVisibleCount = 80;

function escapeHtml(value: string | number | undefined | null): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

// Sample records carry no external links; local records may link to a public source.
function publicSourceUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    if (['.local', '.localhost', '.internal', '.invalid', '.test', '.example', '.example.com'].some((ending) => host.endsWith(ending))) return null;
    if (host === 'localhost' || host === 'example.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sourceLink(raw: string | undefined, label: string): string {
  const url = publicSourceUrl(raw);
  return url
    ? `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`
    : `<span class="unavailable-link">${liveData ? 'Original source link not supplied' : 'Original source link unavailable in this sample'}</span>`;
}

function dateLabel(raw?: string): string {
  if (!raw) return 'Not supplied';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? raw
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function statusLabel(status: OpportunityStatus): string {
  return status === 'posted' ? 'Posted' : status === 'forecasted' ? 'Forecasted'
    : status === 'closed' ? 'Closed' : status === 'archived' ? 'Archived' : 'Status unavailable';
}

function statusBadge(status: OpportunityStatus): string {
  return `<span class="status-badge status-${escapeHtml(status)}"><span class="status-dot" aria-hidden="true"></span>${statusLabel(status)}</span>`;
}

function selected(value: string, current: string): string {
  return value === current ? ' selected' : '';
}

function facetOptions(options: { code: string; label: string }[], current: string): string {
  const entries = options.map((option) => `<option value="${escapeHtml(option.code)}"${selected(option.code, current)}>${escapeHtml(option.label)}</option>`);
  if (current && !options.some((option) => option.code === current)) {
    entries.push(`<option value="${escapeHtml(current)}" selected>Selected code: ${escapeHtml(current)}</option>`);
  }
  return entries.join('');
}

function renderHeader(): string {
  return `<header class="app-header">
    <div class="header-inner">
      <a class="brand" href="#/discover" aria-label="NOFO Desk, return to discovery">
        <span class="brand-mark" aria-hidden="true">ND</span>
        <span class="brand-copy"><strong>NOFO Desk</strong><small>Opportunity intelligence</small></span>
      </a>
      <div class="header-actions">
        <span class="header-context">Opportunity discovery</span>
        <a class="mode-switch" href="${liveProvider ? '?mode=sample#/discover' : '?mode=provider#/discover'}">${liveProvider ? 'View fictional sample' : 'Use live Grants.gov'}</a>
        <span class="sample-pill"><span class="sample-dot" aria-hidden="true"></span> ${liveProvider ? 'Live · Grants.gov' : 'Fictional sample'}</span>
      </div>
    </div>
  </header>`;
}

function renderRail(): string {
  const current = state.page;
  return `<aside class="workspace-rail" aria-label="Workspace context">
    <div class="rail-label">WORKSPACE</div>
    <a class="rail-step ${current === 'discover' ? 'active' : ''}" href="#/discover" ${current === 'discover' ? 'aria-current="step"' : ''}>
      <span class="rail-number">01</span><span><strong>Discover</strong><small>Find opportunities</small></span>
    </a>
    <div class="rail-step ${current === 'opportunity' ? 'active' : ''}">
      <span class="rail-number">02</span><span><strong>Explore</strong><small>Review the posting</small></span>
    </div>
    <div class="rail-step ${current === 'document' ? 'active' : ''}">
      <span class="rail-number">03</span><span><strong>${liveProvider ? 'Open source' : 'Read sample'}</strong><small>${liveProvider ? 'Follow official links' : 'Locate sample passages'}</small></span>
    </div>
    <div class="rail-divider"></div>
    <div class="rail-note"><span class="rail-note-icon" aria-hidden="true">i</span>
      <p><strong>${liveProvider ? 'Direct provider search' : 'About this sample'}</strong><br />${liveProvider
          ? 'This browser calls the public Grants.gov API. Open the original posting and listed files to confirm details.'
          : 'All opportunities and passages here are fictional. Use live search for current provider records.'}</p>
    </div>
  </aside>`;
}

function renderHero(): string {
  const copy = state.page === 'discover'
    ? ['DISCOVERY WORKSPACE', 'Find opportunities. Follow the source.',
      liveProvider ? 'Search by topic or identifier; open posting details and source links.'
        : 'Search by topic or identifier; open sample details, documents, and located passages.']
    : state.page === 'opportunity'
      ? ['OPPORTUNITY RECORD', 'The essentials, with a path to the full notice.',
        liveProvider ? 'Details are a starting point. Open the original posting and listed files for full instructions.'
          : 'Details are a starting point. Open a sample document to inspect located passages.']
      : ['SOURCE READER', 'Read the passage. Keep its location.', 'Candidate passages are reading aids, not a complete or verified set of requirements.'];
  return `<section class="hero ${state.page === 'discover' ? 'hero-discover' : ''}" aria-labelledby="page-title">
    <div class="hero-copy"><p class="eyebrow">${copy[0]}</p><h1 id="page-title">${copy[1]}</h1><p>${copy[2]}</p></div>
    <div class="hero-art" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><span class="art-card art-card-one"></span><span class="art-card art-card-two"></span></div>
  </section>`;
}

function renderSearchForm(): string {
  const query = state.query;
  const agencies = state.results?.facets.agencies ?? [];
  const applicantTypes = state.results?.facets.applicantTypes ?? [];
  return `<section class="surface search-surface" aria-labelledby="search-title">
    <div class="surface-heading"><div><p class="overline">START HERE</p><h2 id="search-title">Search opportunities</h2></div><span class="surface-tag">${liveProvider ? 'Live Grants.gov search' : 'Fictional sample records'}</span></div>
    <form id="search-form" role="search">
      <div class="search-line"><div class="field keyword-field"><label for="keyword">Topic, title, number, or ALN</label><input id="keyword" name="keyword" type="search" value="${escapeHtml(query.keyword)}" placeholder="${liveData ? 'Try cancer or RFA-CA-27-020' : 'Try community health or 93.000'}" autocomplete="off" /></div><button class="button-primary search-button" type="submit">Search <span aria-hidden="true">→</span></button></div>
      <div class="filter-grid">
        <div class="field"><label for="status">Status</label><select id="status" name="status" data-filter><option value="all"${selected('all', query.status)}>Any status</option><option value="posted"${selected('posted', query.status)}>Posted</option><option value="forecasted"${selected('forecasted', query.status)}>Forecasted</option><option value="closed"${selected('closed', query.status)}>Closed</option>${liveData ? `<option value="archived"${selected('archived', query.status)}>Archived</option>` : ''}</select></div>
        <div class="field"><label for="agency">Agency</label><select id="agency" name="agency" data-filter><option value="">All agencies</option>${facetOptions(agencies, query.agency)}</select></div>
        <div class="field"><label for="sortBy">Sort by</label><select id="sortBy" name="sortBy" data-filter><option value="closeDate|asc"${selected('closeDate|asc', query.sortBy)}>Closest deadline</option><option value="openDate|desc"${selected('openDate|desc', query.sortBy)}>Newest opening</option><option value="oppName|asc"${selected('oppName|asc', query.sortBy)}>Title A–Z</option></select></div>
      </div>
      <details class="more-filters" ${query.aln || query.eligibility ? 'open' : ''}><summary>More ways to narrow your search</summary><div class="extra-grid"><div class="field"><label for="aln">Assistance Listing number</label><input id="aln" name="aln" type="text" value="${escapeHtml(query.aln)}" placeholder="e.g. 93.395" /></div><div class="field"><label for="eligibility">Applicant type</label><select id="eligibility" name="eligibility" data-filter><option value="">Any applicant type</option>${facetOptions(applicantTypes, query.eligibility)}</select></div><button class="button-secondary apply-extra" type="submit">Apply filters</button></div></details>
      <div class="filter-footer"><span>${liveData ? 'Agency and applicant choices come from the current provider search.' : 'Choose Any status to include forecasted and closed samples.'}</span><button class="button-text" type="button" data-action="clear-filters">Clear filters</button></div>
    </form>
  </section>`;
}

function renderResultCard(item: SearchResult['items'][number]): string {
  return `<article class="result-card"><a class="result-card-link" href="#/opportunity/${encodeURIComponent(item.id)}" aria-label="Explore ${escapeHtml(item.title || 'Untitled opportunity')}, ${escapeHtml(item.number)}">
    <div class="result-top"><span class="result-number">${escapeHtml(item.number)}</span>${statusBadge(item.status)}</div>
    <div class="result-body"><div><h3>${escapeHtml(item.title || 'Untitled opportunity')}</h3><p class="result-agency">${escapeHtml(item.agency || item.agencyCode || 'Agency not supplied')}</p>${item.synopsis ? `<p class="result-summary">${escapeHtml(item.synopsis)}</p>` : ''}</div><div class="deadline-block"><span>Closing date</span><strong>${escapeHtml(dateLabel(item.closeDate))}</strong></div></div>
    <div class="result-footer"><div class="result-tags">${item.fundingActivity ? `<span>${escapeHtml(item.fundingActivity)}</span>` : ''}${item.aln.map((aln) => `<span>ALN ${escapeHtml(aln)}</span>`).join('')}</div><span class="result-action">Explore opportunity <span aria-hidden="true">→</span></span></div>
  </a></article>`;
}

function renderResults(): string {
  if (state.loading && !state.results) return `<div class="state-card" role="status">${liveData ? 'Searching Grants.gov…' : 'Loading sample opportunities…'}</div>`;
  if (state.error) return `<div class="state-card state-error" role="alert" tabindex="-1"><strong>Search could not finish.</strong><p>${escapeHtml(state.error)}</p><button class="button-secondary" type="button" data-action="retry-search">Try again</button></div>`;
  const result = state.results;
  if (!result) return `<div class="state-card">Search to see ${liveData ? 'current provider listings' : 'sample opportunities'}.</div>`;
  const start = result.items.length ? result.offset + 1 : 0;
  const end = result.offset + result.items.length;
  return `<section class="results-section" aria-labelledby="results-title" aria-busy="${state.loading}">
    <div class="results-heading"><div><p class="overline">EXPLORE THE LIST</p><h2 id="results-title" tabindex="-1">Opportunities <span>${result.total}</span></h2></div><p>${state.loading ? 'Updating results…' : `${start}–${end} of ${result.total} ${liveData ? 'provider records' : 'fictional records'}`}</p></div>
    ${result.total
      ? `<div class="result-list">${result.items.map(renderResultCard).join('')}</div>`
      : `<div class="state-card empty-state"><span class="empty-symbol" aria-hidden="true">⌕</span><h3>No opportunities match</h3><p>Try a broader topic or clear one of the filters.</p><button class="button-secondary" type="button" data-action="clear-filters">Clear filters</button></div>`}
    ${result.warnings.map((warning) => `<p class="provider-warning" role="note">${escapeHtml(warning)}</p>`).join('')}
    ${result.total > result.limit ? `<nav class="result-pagination" aria-label="Results pages"><button class="button-secondary" type="button" data-action="previous-page" ${result.offset <= 0 || state.loading ? 'disabled' : ''}>Previous</button><span>${start}–${end} of ${result.total}</span><button class="button-secondary" type="button" data-action="next-page" ${end >= result.total || state.loading ? 'disabled' : ''}>Next</button></nav>` : ''}
  </section>`;
}

function renderDiscover(): string {
  return `${renderSearchForm()}${renderResults()}`;
}

function fact(label: string, value: string): string {
  return `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not supplied')}</dd></div>`;
}

function renderDocumentCard(document: ListedDocument, opportunityId: string): string {
  const canRead = Boolean(document.sourceDocumentId);
  const action = canRead
    ? `<button class="button-secondary" type="button" data-action="read-document" data-id="${escapeHtml(opportunityId)}" data-document-id="${escapeHtml(document.sourceDocumentId)}">Read sample text <span aria-hidden="true">→</span></button>`
    : liveProvider ? '' : '<span class="muted">In-app text unavailable</span>';
  return `<article class="document-card"><div class="document-icon" aria-hidden="true">DOC</div><div class="document-copy"><span>${escapeHtml(document.kind)}</span><h3>${escapeHtml(document.title)}</h3>${document.description ? `<p>${escapeHtml(document.description)}</p>` : ''}<div class="document-link">${sourceLink(document.url, 'Open original source')}</div></div><div class="document-action">${action}</div></article>`;
}

function renderSynopsis(synopsis: string): string {
  if (!synopsis) return '<p class="muted">Synopsis not supplied in this provider record.</p>';
  if (synopsis.length <= 650) return `<div class="detail-summary">${escapeHtml(synopsis)}</div>`;
  const sentenceEnd = synopsis.indexOf('. ', 430);
  const cutoff = sentenceEnd > 0 && sentenceEnd < 720 ? sentenceEnd + 1 : 620;
  return `<div class="detail-summary"><p>${escapeHtml(synopsis.slice(0, cutoff).trim())}</p><details><summary>Continue provider synopsis</summary><p>${escapeHtml(synopsis.slice(cutoff).trim())}</p></details></div>`;
}

function renderOpportunity(): string {
  if (state.loading && !state.opportunity) return `<div class="state-card" role="status">Opening ${liveData ? 'provider record' : 'sample opportunity'}…</div>`;
  if (state.error || !state.opportunity) return `<div class="state-card state-error" role="alert"><h2>Record unavailable</h2><p>${escapeHtml(state.error || 'The opportunity record could not be opened.')}</p><a class="button-secondary" href="#/discover">Back to search</a></div>`;
  const item = state.opportunity;
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/discover">Search results</a><span aria-hidden="true">/</span><span>Opportunity</span></nav>
    <section class="surface detail-intro" aria-labelledby="opportunity-title"><div class="detail-intro-top"><span class="record-number">${escapeHtml(item.number)}</span>${statusBadge(item.status)}</div><h2 id="opportunity-title">${escapeHtml(item.title)}</h2><p class="detail-agency">${escapeHtml(item.agency || item.agencyCode || 'Agency not supplied')}</p>${renderSynopsis(item.synopsis)}<div class="detail-source">${sourceLink(item.sourceUrl, 'Open original posting')}</div></section>
    <section class="detail-grid" aria-label="Opportunity information"><div class="surface facts-surface"><div class="surface-heading compact"><div><p class="overline">AT A GLANCE</p><h2>Posting details</h2></div></div><dl class="facts-grid">${fact('Closing date', dateLabel(item.closeDate))}${fact('Opening date', dateLabel(item.openDate))}${fact('Agency', item.agency)}${fact('Assistance Listing', item.aln.join(', '))}${fact('Funding activity', item.fundingActivity)}${fact('Award ceiling', item.awardCeiling)}${fact('Estimated funding', item.estimatedFunding)}${fact(liveData ? 'Provider updated' : 'Last sample update', dateLabel(item.updatedAt))}</dl>${item.deadlineNotes ? `<p class="detail-note">${escapeHtml(item.deadlineNotes)}</p>` : ''}</div>
    <div class="surface eligibility-surface"><div class="surface-heading compact"><div><p class="overline">WHO MAY APPLY</p><h2>Eligibility summary</h2></div></div><p>${escapeHtml(item.eligibility || 'Not supplied in this provider record.')}</p><div class="chip-row">${item.eligibleApplicantTypes.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join('')}</div><div class="boundary-note"><strong>Check the notice.</strong> A provider summary cannot establish every eligibility condition.</div></div></section>
    <section class="surface sources-surface" aria-labelledby="sources-title"><div class="surface-heading"><div><p class="overline">FOLLOW THE SOURCE</p><h2 id="sources-title">Listed documents <span class="count-chip">${item.documents.length}</span></h2><p>${liveProvider ? 'Follow provider links to confirm the notice and its instructions. This browser edition does not extract document text.' : 'Open a sample document to see located passages.'}</p></div></div>${item.documents.length
      ? `<div class="document-list">${item.documents.map((document) => renderDocumentCard(document, item.id)).join('')}</div>`
      : `<div class="state-card compact-state"><strong>No documents listed ${liveData ? 'in this provider record' : 'in this sample forecast'}.</strong><p>Check the original posting when it becomes available; a summary does not establish complete instructions.</p></div>`}</section>`;
}

function renderCandidateGroups(reading: ReadDocumentResult): string {
  const groups = new Map<string, ReadDocumentResult['requirementScan']['candidates']>();
  for (const candidate of reading.requirementScan.candidates) {
    groups.set(candidate.category, [...(groups.get(candidate.category) ?? []), candidate]);
  }
  if (!groups.size) return '<div class="state-card compact-state">No candidate passages were flagged. Inspect the extracted text and original source.</div>';
  const names: Record<string, string> = {
    eligibility: 'Eligibility', deadline: 'Deadlines', requiredMaterial: 'Required materials',
    pageFormat: 'Page and format', budget: 'Budget', other: 'Other passages',
  };
  const order = ['deadline', 'eligibility', 'requiredMaterial', 'pageFormat', 'budget', 'other'];
  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  }).map(([category, passages]) => {
    const heading = names[category] ?? category;
    return `<section class="candidate-group" aria-label="${escapeHtml(heading)} passages"><div class="candidate-group-head"><h3>${escapeHtml(heading)}</h3><span>${passages.length} ${passages.length === 1 ? 'passage' : 'passages'}</span></div><div class="candidate-list">${passages.map((passage) => `<blockquote class="passage"><p>“${escapeHtml(passage.quote)}”</p><footer><span class="locator">${escapeHtml(passage.locator || 'Location unavailable')}</span><span>${liveProvider ? 'Source location' : 'Sample source location'}</span></footer></blockquote>`).join('')}</div></section>`;
  }).join('');
}

function renderPassageSearch(reading: ReadDocumentResult): string {
  const result = state.passageSearch;
  const changed = result?.sourceVersion && reading.sourceVersion
    && result.sourceVersion !== reading.sourceVersion;
  return `<section class="surface passage-search-surface" aria-labelledby="passage-search-title">
    <div class="surface-heading compact"><div><p class="overline">FIND IN THIS FILE</p><h2 id="passage-search-title">Search source text</h2><p>Find literal words in the extracted file. A zero-match search does not establish that the notice has no such instruction.</p></div></div>
    <form id="passage-search-form" role="search"><div class="search-line"><div class="field keyword-field"><label for="passage-query">Words or phrase</label><input id="passage-query" name="query" type="search" minlength="2" maxlength="160" value="${escapeHtml(state.passageQuery)}" placeholder="Try budget justification" required /></div><button class="button-primary search-button" type="submit">Find passages <span aria-hidden="true">→</span></button></div></form>
    ${state.passageSearchLoading ? '<p class="passage-search-note" role="status">Reading the listed file and finding passages…</p>' : ''}
    ${state.passageSearchError ? `<div class="state-card state-error compact-state" role="alert" tabindex="-1"><strong>Source search could not finish.</strong><p>${escapeHtml(state.passageSearchError)}</p></div>` : ''}
    ${result && !state.passageSearchLoading ? `<div class="passage-results"><div class="passage-results-head"><h3 id="passage-results-title" tabindex="-1">${result.matchCount} ${result.matchCount === 1 ? 'located match' : 'located matches'}</h3><span>${result.returnedCount} shown${result.resultsTruncated ? ' · more in file' : ''}</span></div>
      ${changed ? '<p class="provider-warning">This file changed since it was opened. Reopen it before relying on these passages.</p>' : ''}
      ${result.status !== 'read' ? `<p class="provider-warning">Reading status: ${escapeHtml(result.status)}. Some text may not be searchable.</p>` : ''}
      ${result.warnings.map((warning) => `<p class="provider-warning">${escapeHtml(warning)}</p>`).join('')}
      ${result.passages.length ? `<div class="passage-results-list">${result.passages.map((passage) => `<div class="passage"><p>${escapeHtml(passage.text)}</p><footer><span class="locator">${escapeHtml(passage.locator || 'Location unavailable')}</span><span>${passage.matchKind === 'phrase' ? 'Exact phrase' : 'All search words'}${passage.truncated ? ' · excerpt shortened' : ''}</span></footer></div>`).join('')}</div>` : '<p class="muted">No extracted blocks matched. Check the original file and try related wording.</p>'}
    </div>` : ''}
  </section>`;
}

function renderReader(): string {
  if (state.loading) return `<div class="state-card" role="status">Reading ${liveProvider ? 'listed document' : 'sample document'}…</div>`;
  const item = state.opportunity;
  const reading = state.reading;
  if (state.error || !item || !reading) return `<div class="state-card state-error" role="alert"><h2>Document unavailable</h2><p>${escapeHtml(state.error || 'The listed document could not be read.')}</p><button class="button-secondary" type="button" data-action="retry-document">Try again</button></div>`;
  const document = item.documents.find((listed) => listed.sourceDocumentId === state.documentId);
  const readStatus = reading.status === 'partial' ? 'Partial text' : reading.status === 'unreadable'
    ? 'Unreadable' : reading.status === 'read' ? 'Text available' : 'Status unknown';
  const visibleBlocks = reading.blocks.slice(0, blockVisibleCount);
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/discover">Search results</a><span aria-hidden="true">/</span><a href="#/opportunity/${escapeHtml(item.id)}">Opportunity</a><span aria-hidden="true">/</span><span>Document</span></nav>
    <section class="surface reader-intro"><div><p class="overline">${liveProvider ? 'LISTED DOCUMENT READER' : 'SAMPLE DOCUMENT READER'}</p><h2>${escapeHtml(reading.fileName)}</h2><p>From <strong>${escapeHtml(item.number)}</strong> · ${escapeHtml(item.title)}</p></div><span class="reader-status ${reading.status === 'partial' || reading.status === 'unreadable' ? 'partial' : ''}">${readStatus}</span></section>
    <div class="reader-metrics"><div><strong>${reading.requirementScan.candidates.length}</strong><span>candidate passages</span></div><div><strong>${reading.pageCount ?? '—'}</strong><span>${liveProvider ? 'reported pages' : 'sample pages'}</span></div><div><strong>${escapeHtml(readStatus)}</strong><span>reading status</span></div></div>
    ${renderPassageSearch(reading)}
    <section class="reader-layout"><div class="surface candidate-surface"><div class="surface-heading"><div><p class="overline">PASSAGES TO REVIEW</p><h2>Grouped by topic</h2><p>These excerpts suggest where to read further. They do not certify a requirement or cover the full notice.</p></div></div>${renderCandidateGroups(reading)}</div>
    <aside class="reader-aside"><div class="surface source-context"><p class="overline">SOURCE CONTEXT</p><h2>Keep the source in view</h2><p>${liveProvider ? 'Locations come from the retrieved listed file. Open the original to confirm surrounding text and current instructions.' : 'Locations refer to this fictional sample text. In a connected app, open the listed original before acting on an excerpt.'}</p>${sourceLink(document?.url ?? reading.sourceUrl, 'Open original document')}</div><div class="surface caution-card"><span class="caution-icon" aria-hidden="true">!</span><h2>Reading boundary</h2><p>Candidate passages are not an exhaustive submission checklist. Confirm the notice, amendments, and incorporated instructions.</p>${reading.requirementScan.truncated ? '<p class="warning-text">The candidate scan stopped at its limit. More instructions may be present.</p>' : ''}${reading.warnings.map((warning) => `<p class="warning-text">${escapeHtml(warning)}</p>`).join('')}</div></aside></section>
    <details class="surface extracted-text" ${blockVisibleCount > 80 ? 'open' : ''}><summary>View extracted ${liveProvider ? 'source' : 'sample'} text <span>${reading.blocks.length} blocks</span></summary><div class="block-list">${visibleBlocks.map((block) => `<div class="source-block"><span>${escapeHtml(block.locator || 'Location unavailable')}</span><p>${escapeHtml(block.text)}</p></div>`).join('')}${visibleBlocks.length < reading.blocks.length ? `<button class="button-secondary" type="button" data-action="show-more-blocks">Show next ${Math.min(80, reading.blocks.length - visibleBlocks.length)} blocks</button>` : ''}</div></details>`;
}

function render(): void {
  const page = state.page === 'discover' ? renderDiscover() : state.page === 'opportunity' ? renderOpportunity() : renderReader();
  app!.innerHTML = `${renderHeader()}<div class="sample-banner ${liveData ? 'live-banner' : ''}" role="note"><div><strong>${liveProvider ? 'LIVE PUBLIC SEARCH' : 'FICTIONAL SAMPLE'}</strong><span>${liveProvider
    ? 'This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services.'
    : 'Fictional opportunities, documents, and passages. No live Grants.gov data is displayed here.'}</span></div></div><main id="main-content" class="app-main" tabindex="-1">${renderHero()}<div class="workspace-layout">${renderRail()}<div class="workspace-content">${page}</div></div></main><footer class="app-footer"><span>NOFO Desk · ${liveProvider ? 'Live Grants.gov' : 'Fictional sample'}</span><span>Opportunity discovery and source links</span></footer>`;
}

function readCriteria(form: HTMLFormElement): SearchCriteria {
  const data = new FormData(form);
  const status = String(data.get('status') ?? 'all');
  const sortBy = String(data.get('sortBy') ?? 'closeDate|asc');
  return {
    keyword: String(data.get('keyword') ?? '').trim(),
    status: status === 'posted' || status === 'forecasted' || status === 'closed' || status === 'archived' ? status : 'all',
    agency: String(data.get('agency') ?? ''),
    aln: String(data.get('aln') ?? '').trim(),
    eligibility: String(data.get('eligibility') ?? ''),
    sortBy: (['closeDate|asc', 'openDate|desc', 'oppName|asc'].includes(sortBy) ? sortBy : 'closeDate|asc') as SortBy,
    offset: 0,
    limit: state.query.limit,
  };
}

function focusFilter(id?: string): void {
  if (!id) return;
  const control = document.getElementById(id);
  if (control instanceof HTMLSelectElement && control.matches('[data-filter]')) {
    control.focus({ preventScroll: true });
  }
}

async function runSearch(focusResults = false, filterId?: string): Promise<void> {
  const request = ++searchRequest;
  state.loading = true;
  state.error = '';
  render();
  // Auto-search rebuilds the form; keep a keyboard user's place in its filter.
  focusFilter(filterId);
  try {
    const results = await deskService.searchOpportunities(state.query);
    if (request !== searchRequest) return;
    state.results = results;
  } catch (error) {
    if (request !== searchRequest) return;
    state.error = error instanceof Error ? error.message : 'An unexpected search error occurred.';
  } finally {
    if (request === searchRequest) {
      state.loading = false;
      const filterStillFocused = filterId && document.activeElement?.id === filterId;
      render();
      if (focusResults) {
        const target = document.querySelector<HTMLElement>(state.error ? '.state-error' : '#results-title');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (filterStillFocused) {
        focusFilter(filterId);
      }
    }
  }
}

async function runPassageSearch(): Promise<void> {
  const request = ++passageRequest;
  const opportunityId = state.opportunity?.id;
  const documentId = state.documentId;
  if (!opportunityId || !documentId) return;
  state.passageSearchLoading = true;
  state.passageSearchError = '';
  state.passageSearch = undefined;
  render();
  try {
    const result = await deskService.findSourcePassages(opportunityId, documentId, state.passageQuery, 8);
    if (request !== passageRequest) return;
    state.passageSearch = result;
  } catch (error) {
    if (request !== passageRequest) return;
    state.passageSearchError = error instanceof Error ? error.message : 'An unexpected source search error occurred.';
  } finally {
    if (request === passageRequest) {
      state.passageSearchLoading = false;
      render();
      const target = document.querySelector<HTMLElement>(state.passageSearchError ? '.passage-search-surface .state-error' : '#passage-results-title');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function parseRoute(): { page: Page; opportunityId?: string; documentId?: string } {
  const hash = window.location.hash;
  const document = hash.match(/^#\/document\/(\d+)\/(\d+)$/);
  if (document) return { page: 'document', opportunityId: document[1], documentId: document[2] };
  const opportunity = hash.match(/^#\/opportunity\/(\d+)$/);
  if (opportunity) return { page: 'opportunity', opportunityId: opportunity[1] };
  return { page: 'discover' };
}

async function syncRoute(): Promise<void> {
  const request = ++routeRequest;
  ++passageRequest;
  const route = parseRoute();
  state.page = route.page;
  state.error = '';
  if (route.page === 'discover') {
    state.loading = false;
    if (!state.results) await runSearch();
    else render();
  } else {
    state.loading = true;
    state.opportunity = undefined;
    state.reading = undefined;
    state.documentId = route.documentId;
    state.passageQuery = '';
    state.passageSearch = undefined;
    state.passageSearchLoading = false;
    state.passageSearchError = '';
    blockVisibleCount = 80;
    render();
    try {
      if (!route.opportunityId) throw new Error('The opportunity identifier is missing.');
      const opportunity = await deskService.getOpportunity(route.opportunityId);
      if (request !== routeRequest) return;
      state.opportunity = opportunity;
      if (route.page === 'document') {
        if (!route.documentId) throw new Error('The document identifier is missing.');
        state.reading = await deskService.readListedDocument(route.opportunityId, route.documentId);
      }
    } catch (error) {
      if (request !== routeRequest) return;
      state.error = error instanceof Error ? error.message : 'This record could not be opened.';
    } finally {
      if (request === routeRequest) {
        state.loading = false;
        render();
      }
    }
  }
  if (request === routeRequest && route.page !== 'discover') {
    document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

app.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'passage-search-form') {
    event.preventDefault();
    state.passageQuery = String(new FormData(form).get('query') ?? '').trim();
    void runPassageSearch();
    return;
  }
  if (form.id !== 'search-form') return;
  event.preventDefault();
  state.query = readCriteria(form);
  void runSearch(true);
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.matches('[data-filter]')) return;
  const form = target.closest<HTMLFormElement>('form');
  if (!form) return;
  state.query = readCriteria(form);
  void runSearch(false, target.id);
});

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest<HTMLElement>('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'clear-filters') {
    state.query = { ...defaultQuery(), keyword: '', status: 'all' };
    void runSearch();
  } else if (action === 'retry-search') {
    void runSearch();
  } else if (action === 'previous-page') {
    state.query = { ...state.query, offset: Math.max(0, state.query.offset - state.query.limit) };
    void runSearch();
  } else if (action === 'next-page') {
    state.query = { ...state.query, offset: state.query.offset + state.query.limit };
    void runSearch();
  } else if (action === 'show-more-blocks') {
    blockVisibleCount += 80;
    render();
  } else if (action === 'read-document' && control.dataset.id && control.dataset.documentId) {
    window.location.hash = `#/document/${encodeURIComponent(control.dataset.id)}/${encodeURIComponent(control.dataset.documentId)}`;
  } else if (action === 'retry-document') {
    void syncRoute();
  }
});

// The skip link focuses the current view without changing its hash route.
document.querySelector<HTMLAnchorElement>('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector<HTMLElement>('#main-content')?.focus();
});

window.addEventListener('hashchange', () => { void syncRoute(); });
if (!window.location.hash) window.history.replaceState(null, '', '#/discover');
void syncRoute();
