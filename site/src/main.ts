import './styles.css';
import { deskService, serviceMode } from './service';
import {
  MAX_SHORTLIST_ITEMS,
  SHORTLIST_STORAGE_KEY,
  addOpportunityId,
  buildComparisonRow,
  buildMarkdownBrief,
  loadShortlist,
  removeOpportunityId,
  saveShortlist,
} from './shortlist';
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

type Page = 'discover' | 'opportunity' | 'document' | 'desk';

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
  shortlistIds: string[];
  shortlistStatus: 'ready' | 'empty' | 'invalid' | 'unavailable';
  shortlistNotice: string;
  comparisonIds: string[];
  deskDetails: Record<string, OpportunityDetail>;
  deskFailures: Record<string, string>;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('The NOFO Desk app root is missing.');
const liveProvider = serviceMode === 'provider-direct';
const liveData = liveProvider;
document.title = liveProvider ? 'NOFO Desk · Grants.gov opportunities' : 'NOFO Desk · Fictional sample';

function readShortlist() {
  try { return loadShortlist(window.localStorage); }
  catch { return { ids: [], status: 'unavailable' as const }; }
}

const saved = liveProvider ? readShortlist() : { ids: [], status: 'empty' as const };

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
  shortlistIds: saved.ids,
  shortlistStatus: saved.status,
  shortlistNotice: '',
  comparisonIds: saved.ids.slice(0, 3),
  deskDetails: {},
  deskFailures: {},
};

let routeRequest = 0;
let searchRequest = 0;
let passageRequest = 0;
let deskLoadRequest = 0;
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

function deadlineLabel(status: OpportunityStatus): string {
  return status === 'forecasted' ? 'Expected deadline' : 'Closing date';
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
        ${liveProvider ? `<a class="header-desk" href="#/desk">My desk <span>${state.shortlistIds.length}</span></a>` : '<span class="header-context">Opportunity discovery</span>'}
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
      <span class="rail-number">03</span><span><strong>${liveProvider ? 'Read source' : 'Read sample'}</strong><small>${liveProvider ? 'Locate file passages' : 'Locate sample passages'}</small></span>
    </div>
    ${liveProvider ? `<a class="rail-step ${current === 'desk' ? 'active' : ''}" href="#/desk" ${current === 'desk' ? 'aria-current="page"' : ''}><span class="rail-number">04</span><span><strong>My desk</strong><small>Compare and brief · ${state.shortlistIds.length}</small></span></a>` : ''}
    <div class="rail-divider"></div>
    <div class="rail-note"><span class="rail-note-icon" aria-hidden="true">i</span>
      <p><strong>${liveProvider ? 'Direct provider search' : 'About this sample'}</strong><br />${liveProvider
          ? 'This browser calls the public Grants.gov API. Confirm extracted passages against the original listed files.'
          : 'All opportunities and passages here are fictional. Use live search for current provider records.'}</p>
    </div>
  </aside>`;
}

function renderHero(): string {
  const copy = state.page === 'discover'
    ? ['DISCOVERY WORKSPACE', 'Find opportunities. Follow the source.',
      liveProvider ? 'Search by topic or identifier; inspect listed files and save promising opportunities to compare.'
        : 'Search by topic or identifier; open sample details, documents, and located passages.']
    : state.page === 'desk'
      ? ['RESEARCH DESK', 'Bring promising opportunities together.',
        'Compare provider facts, see what is missing, and download a source-linked brief for discussion.']
    : state.page === 'opportunity'
      ? ['OPPORTUNITY RECORD', 'The essentials, with a path to the full notice.',
        liveProvider ? 'Read supported listed files here, then open the original posting to confirm full instructions.'
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
      <div class="filter-footer"><span>${liveData ? 'Agency and applicant choices come from the current provider search.' : 'Choose Any status to include forecasted and closed samples.'}</span><div class="filter-actions">${liveData ? '<a href="https://simpler.grants.gov/search" target="_blank" rel="noopener noreferrer">Advanced federal search ↗</a>' : ''}<button class="button-text" type="button" data-action="clear-filters">Clear filters</button></div></div>
    </form>
  </section>`;
}

function renderResultCard(item: SearchResult['items'][number]): string {
  const savedHere = state.shortlistIds.includes(item.id);
  return `<article class="result-card"><a class="result-card-link" href="#/opportunity/${encodeURIComponent(item.id)}" aria-label="Explore ${escapeHtml(item.title || 'Untitled opportunity')}, ${escapeHtml(item.number)}">
    <div class="result-top"><span class="result-number">${escapeHtml(item.number)}</span>${statusBadge(item.status)}</div>
    <div class="result-body"><div><h3>${escapeHtml(item.title || 'Untitled opportunity')}</h3><p class="result-agency">${escapeHtml(item.agency || item.agencyCode || 'Agency not supplied')}</p>${item.synopsis ? `<p class="result-summary">${escapeHtml(item.synopsis)}</p>` : ''}</div><div class="deadline-block"><span>${deadlineLabel(item.status)}</span><strong>${escapeHtml(dateLabel(item.closeDate))}</strong></div></div>
    <div class="result-footer"><div class="result-tags">${item.fundingActivity ? `<span>${escapeHtml(item.fundingActivity)}</span>` : ''}${item.aln.map((aln) => `<span>ALN ${escapeHtml(aln)}</span>`).join('')}</div><span class="result-action">Explore opportunity <span aria-hidden="true">→</span></span></div>
  </a>${liveProvider ? `<div class="result-tools"><button class="button-inline" type="button" data-action="toggle-save" data-id="${escapeHtml(item.id)}" aria-pressed="${savedHere}" ${state.shortlistStatus === 'invalid' || state.shortlistStatus === 'unavailable' ? 'disabled' : ''}>${savedHere ? '✓ Saved to my desk' : '+ Save to my desk'}</button></div>` : ''}</article>`;
}

function renderResults(): string {
  if (state.loading && !state.results) return `<div class="state-card" role="status">${liveData ? 'Searching Grants.gov…' : 'Loading sample opportunities…'}</div>`;
  if (state.error) return `<div class="state-card state-error" role="alert" tabindex="-1"><strong>Search could not finish.</strong><p>${escapeHtml(state.error)}</p><button class="button-secondary" type="button" data-action="retry-search">Try again</button></div>`;
  const result = state.results;
  if (!result) return `<div class="state-card">Search to see ${liveData ? 'current provider listings' : 'sample opportunities'}.</div>`;
  const start = result.items.length ? result.offset + 1 : 0;
  const end = result.offset + result.items.length;
  return `<section class="results-section" aria-labelledby="results-title" aria-busy="${state.loading}">
    <div class="results-heading"><div><p class="overline">EXPLORE THE LIST</p><h2 id="results-title" tabindex="-1">Opportunities <span>${result.total}</span></h2></div><p role="status" aria-live="polite">${state.loading ? 'Updating results…' : `${start}–${end} of ${result.total} ${liveData ? 'provider records' : 'fictional records'}`}</p></div>
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

function renderDesk(): string {
  if (state.shortlistStatus === 'invalid') {
    return `<section class="surface"><h2>Saved list needs a reset</h2><p class="desk-copy">This browser has a saved-list format NOFO Desk cannot safely read. You can clear that list and start again.</p><button class="button-secondary" type="button" data-action="reset-desk">Clear saved list</button></section>`;
  }
  if (state.shortlistStatus === 'unavailable') {
    return `<section class="state-card state-error" role="alert"><h2>Browser storage is unavailable</h2><p>My desk needs this browser's local storage. Live search and source links still work.</p></section>`;
  }
  const ids = state.shortlistIds;
  const details = ids.flatMap((id) => state.deskDetails[id] ? [state.deskDetails[id]] : []);
  const selected = state.comparisonIds.flatMap((id) => state.deskDetails[id] ? [state.deskDetails[id]] : []);
  const rows = selected.map(buildComparisonRow);
  const comparedField = (label: string, values: string[]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
  const applicantCategories = `<tr><th scope="row">Applicant categories</th>${rows.map((row) => `<td>${row.applicantCategories.length
    ? `<details><summary>${row.applicantCategories.length} categories listed</summary><ul>${row.applicantCategories.map((category) => `<li>${escapeHtml(category)}</li>`).join('')}</ul></details>`
    : 'Not supplied'}</td>`).join('')}</tr>`;
  const deadline = rows.map((row) => row.deadline.kind === 'not_supplied' ? 'Not supplied'
    : `${dateLabel(row.deadline.value || '')}${row.deadline.kind === 'forecast' ? ' · forecast; confirm' : ''}`);
  return `<section class="surface desk-overview"><div><p class="overline">YOUR SHORTLIST</p><h2>${ids.length} ${ids.length === 1 ? 'opportunity' : 'opportunities'} to consider</h2><p>Only public Grants.gov IDs are saved in this browser. Details refresh when you open this desk; the list is not shared across devices.</p></div><div class="desk-overview-actions"><button class="button-secondary" type="button" data-action="refresh-desk" ${!ids.length || state.loading ? 'disabled' : ''}>Refresh provider details</button><button class="button-primary" type="button" data-action="download-brief" ${!selected.length || state.loading ? 'disabled' : ''}>Download source-linked brief</button></div></section>
    ${!ids.length ? '<div class="state-card empty-state"><h2>Your desk is ready.</h2><p>Save a few opportunities from live search, then return to compare their provider facts.</p><a class="button-secondary" href="#/discover">Find opportunities</a></div>' : `
    <section class="desk-list" aria-labelledby="desk-list-title"><div class="results-heading"><div><p class="overline">KEEP IN VIEW</p><h2 id="desk-list-title" tabindex="-1">Saved opportunities</h2></div><p role="status" aria-live="polite">${state.loading ? 'Refreshing provider records…' : `Compare up to 3 of ${ids.length}`}</p></div>
      ${ids.map((id) => {
        const item = state.deskDetails[id];
        const failure = state.deskFailures[id];
        const chosen = state.comparisonIds.includes(id);
        return `<article class="desk-item"><div><span class="result-number">${escapeHtml(item?.number || `Grants.gov ID ${id}`)}</span><h3>${item ? `<a href="#/opportunity/${escapeHtml(id)}">${escapeHtml(item.title)}</a>` : failure ? 'Provider record unavailable' : 'Loading provider record…'}</h3><p>${item ? `${escapeHtml(item.agency || 'Agency not supplied')} · ${escapeHtml(deadlineLabel(item.status))}: ${escapeHtml(dateLabel(item.closeDate))}` : escapeHtml(failure || 'Fetching current details')}</p></div><div class="desk-item-actions"><button class="button-secondary" type="button" data-action="toggle-compare" data-id="${escapeHtml(id)}" aria-pressed="${chosen}" ${!item ? 'disabled' : ''}>${chosen ? '✓ Comparing' : 'Compare'}</button><button class="button-text" type="button" data-action="toggle-save" data-id="${escapeHtml(id)}">Remove</button></div></article>`;
      }).join('')}
    </section>
    <section class="surface compare-surface" aria-labelledby="compare-title"><div class="surface-heading"><div><p class="overline">SIDE BY SIDE</p><h2 id="compare-title">Provider facts</h2><p>Missing values stay visible. A forecast date is tentative, and applicant categories do not establish eligibility.</p></div><span class="surface-tag">${rows.length} selected</span></div>${rows.length ? `<div class="compare-scroll"><table><thead><tr><th scope="col">Field</th>${rows.map((row) => `<th scope="col"><a href="#/opportunity/${escapeHtml(row.id)}">${escapeHtml(row.number)}</a><small>${escapeHtml(row.title)}</small></th>`).join('')}</tr></thead><tbody>
      ${comparedField('Status', rows.map((row) => statusLabel(row.status)))}
      ${comparedField('Agency', rows.map((row) => row.agency || 'Not supplied'))}
      ${comparedField('Deadline', deadline)}
      ${comparedField('Award ceiling', rows.map((row) => row.awardCeiling || 'Not supplied'))}
      ${comparedField('Estimated funding', rows.map((row) => row.estimatedFunding || 'Not supplied'))}
      ${applicantCategories}
      ${comparedField('Assistance Listings', rows.map((row) => row.assistanceListings.join(', ') || 'Not supplied'))}
      ${comparedField('Listed source links', rows.map((row) => `${row.linkedDocumentCount} of ${row.listedDocumentCount} listed`))}
      ${comparedField('Provider updated', rows.map((row) => dateLabel(row.providerUpdated || '')))}
    </tbody></table></div>` : '<div class="state-card compact-state">Select up to three available records above to compare.</div>'}</section>
    <section class="surface desk-checks"><p class="overline">BEFORE YOU ACT</p><h2>Open the notice, then verify the unknowns.</h2><p>The brief carries public provider facts and source links. Check the full notice, amendments, institutional eligibility, exact deadline and time zone, and budget instructions with the appropriate research support team.</p></section>`}`;
}

function fact(label: string, value: string): string {
  return `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not supplied')}</dd></div>`;
}

function renderDocumentCard(document: ListedDocument, opportunityId: string): string {
  const canRead = Boolean(document.sourceDocumentId);
  const action = canRead
    ? `<button class="button-secondary" type="button" data-action="read-document" data-id="${escapeHtml(opportunityId)}" data-document-id="${escapeHtml(document.sourceDocumentId)}">Read ${liveProvider ? 'listed file' : 'sample text'} <span aria-hidden="true">→</span></button>`
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
    <section class="surface detail-intro" aria-labelledby="opportunity-title"><div class="detail-intro-top"><span class="record-number">${escapeHtml(item.number)}</span>${statusBadge(item.status)}</div><h2 id="opportunity-title">${escapeHtml(item.title)}</h2><p class="detail-agency">${escapeHtml(item.agency || item.agencyCode || 'Agency not supplied')}</p>${renderSynopsis(item.synopsis)}<div class="detail-source">${sourceLink(item.sourceUrl, 'Open original posting')}${liveProvider ? `<button class="button-secondary" type="button" data-action="toggle-save" data-id="${escapeHtml(item.id)}" aria-pressed="${state.shortlistIds.includes(item.id)}" ${state.shortlistStatus === 'invalid' || state.shortlistStatus === 'unavailable' ? 'disabled' : ''}>${state.shortlistIds.includes(item.id) ? '✓ Saved to my desk' : '+ Save to my desk'}</button>` : ''}</div></section>
    <section class="detail-grid" aria-label="Opportunity information"><div class="surface facts-surface"><div class="surface-heading compact"><div><p class="overline">AT A GLANCE</p><h2>Posting details</h2></div></div><dl class="facts-grid">${fact(deadlineLabel(item.status), dateLabel(item.closeDate))}${fact('Opening date', dateLabel(item.openDate))}${fact('Agency', item.agency)}${fact('Assistance Listing', item.aln.join(', '))}${fact('Funding activity', item.fundingActivity)}${fact('Award ceiling', item.awardCeiling)}${fact('Estimated funding', item.estimatedFunding)}${fact(liveData ? 'Provider updated' : 'Last sample update', dateLabel(item.updatedAt))}</dl>${item.deadlineNotes ? `<p class="detail-note">${escapeHtml(item.deadlineNotes)}</p>` : ''}</div>
    <div class="surface eligibility-surface"><div class="surface-heading compact"><div><p class="overline">WHO MAY APPLY</p><h2>Eligibility summary</h2></div></div><p>${escapeHtml(item.eligibility || 'Not supplied in this provider record.')}</p><div class="chip-row">${item.eligibleApplicantTypes.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join('')}</div><div class="boundary-note"><strong>Check the notice.</strong> A provider summary cannot establish every eligibility condition.</div></div></section>
    <section class="surface sources-surface" aria-labelledby="sources-title"><div class="surface-heading"><div><p class="overline">FOLLOW THE SOURCE</p><h2 id="sources-title">Listed documents <span class="count-chip">${item.documents.length}</span></h2><p>${liveProvider ? 'Read supported Grants.gov files here to find located passages. Open each original to confirm its full instructions.' : 'Open a sample document to see located passages.'}</p></div></div>${item.documents.length
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
    ${state.passageSearchLoading ? '<p class="passage-search-note" role="status">Searching extracted text…</p>' : ''}
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
    <div class="reader-metrics"><div><strong>${reading.requirementScan.candidates.length}</strong><span>candidate passages</span></div><div><strong>${reading.pageCount ?? '—'}</strong><span>${liveProvider ? 'PDF pages' : 'sample pages'}</span></div><div><strong>${escapeHtml(readStatus)}</strong><span>reading status</span></div></div>
    ${renderPassageSearch(reading)}
    <section class="reader-layout"><div class="surface candidate-surface"><div class="surface-heading"><div><p class="overline">PASSAGES TO REVIEW</p><h2>Grouped by topic</h2><p>These excerpts suggest where to read further. They do not certify a requirement or cover the full notice.</p></div></div>${renderCandidateGroups(reading)}</div>
    <aside class="reader-aside"><div class="surface source-context"><p class="overline">SOURCE CONTEXT</p><h2>Keep the source in view</h2><p>${liveProvider ? 'Locations come from the retrieved listed file. Open the original to confirm surrounding text and current instructions.' : 'Locations refer to this fictional sample text. In a connected app, open the listed original before acting on an excerpt.'}</p>${sourceLink(document?.url ?? reading.sourceUrl, 'Open original document')}</div><div class="surface caution-card"><span class="caution-icon" aria-hidden="true">!</span><h2>Reading boundary</h2><p>Candidate passages are not an exhaustive submission checklist. Confirm the notice, amendments, and incorporated instructions.</p>${reading.requirementScan.truncated ? '<p class="warning-text">The candidate scan stopped at its limit. More instructions may be present.</p>' : ''}${reading.warnings.map((warning) => `<p class="warning-text">${escapeHtml(warning)}</p>`).join('')}</div></aside></section>
    <details class="surface extracted-text" ${blockVisibleCount > 80 ? 'open' : ''}><summary>View extracted ${liveProvider ? 'source' : 'sample'} text <span>${reading.blocks.length} blocks</span></summary><div class="block-list">${visibleBlocks.map((block) => `<div class="source-block"><span>${escapeHtml(block.locator || 'Location unavailable')}</span><p>${escapeHtml(block.text)}</p></div>`).join('')}${visibleBlocks.length < reading.blocks.length ? `<button class="button-secondary" type="button" data-action="show-more-blocks">Show next ${Math.min(80, reading.blocks.length - visibleBlocks.length)} blocks</button>` : ''}</div></details>`;
}

function render(): void {
  const page = state.page === 'discover' ? renderDiscover()
    : state.page === 'opportunity' ? renderOpportunity()
      : state.page === 'desk' ? renderDesk() : renderReader();
  app!.innerHTML = `${renderHeader()}<div class="sample-banner ${liveData ? 'live-banner' : ''}" role="note"><div><strong>${liveProvider ? 'LIVE PUBLIC SEARCH' : 'FICTIONAL SAMPLE'}</strong><span>${liveProvider
    ? 'This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services.'
    : 'Fictional opportunities, documents, and passages. No live Grants.gov data is displayed here.'}</span></div></div><main id="main-content" class="app-main" tabindex="-1">${renderHero()}${state.shortlistNotice ? `<div class="desk-notice" role="status">${escapeHtml(state.shortlistNotice)}</div>` : ''}<div class="workspace-layout">${renderRail()}<div class="workspace-content">${page}</div></div></main><footer class="app-footer"><span>NOFO Desk · ${liveProvider ? 'Live Grants.gov' : 'Fictional sample'}</span><span>Opportunity discovery and source links</span></footer>`;
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
  if (liveProvider && hash === '#/desk') return { page: 'desk' };
  const document = hash.match(/^#\/document\/(\d+)\/(\d+)$/);
  if (document) return { page: 'document', opportunityId: document[1], documentId: document[2] };
  const opportunity = hash.match(/^#\/opportunity\/(\d+)$/);
  if (opportunity) return { page: 'opportunity', opportunityId: opportunity[1] };
  return { page: 'discover' };
}

async function loadDesk(): Promise<void> {
  const request = ++deskLoadRequest;
  const ids = [...state.shortlistIds];
  state.loading = Boolean(ids.length);
  state.deskDetails = {};
  state.deskFailures = {};
  render();
  // Small batches keep a saved list from sending a burst of detail calls.
  for (let start = 0; start < ids.length; start += 3) {
    const batch = ids.slice(start, start + 3);
    const results = await Promise.allSettled(batch.map((id) => deskService.getOpportunity(id)));
    if (request !== deskLoadRequest || state.page !== 'desk') return;
    results.forEach((result, index) => {
      const id = batch[index];
      if (!id) return;
      if (result.status === 'fulfilled') state.deskDetails[id] = result.value;
      else state.deskFailures[id] = result.reason instanceof Error ? result.reason.message : 'Provider detail could not be loaded.';
    });
    render();
  }
  if (request === deskLoadRequest && state.page === 'desk') {
    state.loading = false;
    render();
  }
}

async function syncRoute(): Promise<void> {
  const request = ++routeRequest;
  ++passageRequest;
  ++deskLoadRequest;
  const route = parseRoute();
  state.page = route.page;
  state.error = '';
  state.shortlistNotice = '';
  if (route.page === 'discover') {
    state.loading = false;
    if (!state.results) await runSearch();
    else render();
  } else if (route.page === 'desk') {
    await loadDesk();
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

function toggleSavedOpportunity(id: string): void {
  if (!liveProvider) return;
  if (state.shortlistStatus === 'invalid' || state.shortlistStatus === 'unavailable') {
    state.shortlistNotice = 'Open My desk to resolve browser storage before saving opportunities.';
    render();
    return;
  }
  try {
    const alreadySaved = state.shortlistIds.includes(id);
    const next = alreadySaved ? removeOpportunityId(state.shortlistIds, id)
      : addOpportunityId(state.shortlistIds, id);
    saveShortlist(window.localStorage, next);
    state.shortlistIds = next;
    state.shortlistStatus = next.length ? 'ready' : 'empty';
    state.comparisonIds = state.comparisonIds.filter((savedId) => next.includes(savedId));
    if (!alreadySaved && state.comparisonIds.length < 3) state.comparisonIds.push(id);
    if (alreadySaved) {
      delete state.deskDetails[id];
      delete state.deskFailures[id];
    }
    state.shortlistNotice = alreadySaved ? 'Removed from your browser shortlist.'
      : `Saved to My desk (${next.length}/${MAX_SHORTLIST_ITEMS}).`;
  } catch (error) {
    state.shortlistNotice = error instanceof Error ? error.message : 'This browser could not save the opportunity.';
  }
  render();
}

function downloadBrief(): void {
  const details = state.comparisonIds.flatMap((id) => state.deskDetails[id] ? [state.deskDetails[id]] : []);
  if (!details.length) return;
  try {
    const brief = buildMarkdownBrief(details);
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    const today = new Date();
    const localDay = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')].join('-');
    link.download = `nofo-desk-brief-${localDay}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    state.shortlistNotice = `Downloaded a source-linked brief for ${details.length} selected ${details.length === 1 ? 'opportunity' : 'opportunities'}.`;
  } catch (error) {
    state.shortlistNotice = error instanceof Error ? error.message : 'The brief could not be created.';
  }
  render();
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
  } else if (action === 'toggle-save' && control.dataset.id) {
    toggleSavedOpportunity(control.dataset.id);
  } else if (action === 'toggle-compare' && control.dataset.id) {
    const id = control.dataset.id;
    if (state.comparisonIds.includes(id)) state.comparisonIds = state.comparisonIds.filter((savedId) => savedId !== id);
    else if (state.comparisonIds.length < 3) state.comparisonIds = [...state.comparisonIds, id];
    else state.shortlistNotice = 'Choose up to three opportunities for a readable comparison.';
    render();
  } else if (action === 'refresh-desk') {
    void loadDesk();
  } else if (action === 'download-brief') {
    downloadBrief();
  } else if (action === 'reset-desk') {
    try {
      saveShortlist(window.localStorage, []);
      state.shortlistIds = [];
      state.comparisonIds = [];
      state.shortlistStatus = 'empty';
      state.shortlistNotice = 'Saved list cleared in this browser.';
    } catch {
      state.shortlistStatus = 'unavailable';
      state.shortlistNotice = 'This browser could not clear the saved list.';
    }
    render();
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
