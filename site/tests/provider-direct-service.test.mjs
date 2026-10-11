import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerDirectService } from '../src/provider-direct-service.ts';

const criteria = {
  keyword: 'cancer', status: 'posted', agency: '', aln: '', eligibility: '',
  sortBy: 'closeDate|asc', offset: 0, limit: 10,
};

async function withFetch(replacement, run) {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { await run(); } finally { globalThis.fetch = original; }
}

function providerResponse(data) {
  return new Response(JSON.stringify({ errorcode: 0, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

test('search posts JSON as browser-simple text/plain and maps the provider result', async () => {
  let call;
  await withFetch(async (url, options) => {
    call = { url, options };
    return providerResponse({
      hitCount: 1,
      oppHits: [{ id: '359855', number: 'RFA-CA-27-020', title: 'Cancer informatics',
        agency: 'NIH', oppStatus: 'posted', cfdaList: ['93.395'] }],
      agencies: [], eligibilities: [],
    });
  }, async () => {
    const result = await providerDirectService.searchOpportunities(criteria);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].sourceUrl, 'https://www.grants.gov/search-results-detail/359855');
  });
  assert.equal(call.url, 'https://api.grants.gov/v1/api/search2');
  assert.equal(call.options.method, 'POST');
  assert.deepEqual(call.options.headers, { 'Content-Type': 'text/plain' });
  assert.deepEqual(JSON.parse(call.options.body), {
    keyword: 'cancer', agencies: '', oppStatuses: 'posted', rows: 10,
    startRecordNum: 0, sortBy: 'closeDate|asc',
  });
});

test('detail sends a numeric ID and returns original source links', async () => {
  let sent;
  await withFetch(async (url, options) => {
    assert.equal(url, 'https://api.grants.gov/v1/api/fetchOpportunity');
    sent = JSON.parse(options.body);
    return providerResponse({
      id: 359855, opportunityNumber: 'RFA-CA-27-020', opportunityTitle: 'Cancer informatics',
      docType: 'synopsis', synopsis: { synopsisDesc: 'Official summary.' },
      synopsisAttachmentFolders: [{ folderType: 'Full Announcement', synopsisAttachments: [
        { id: 352323, fileName: 'Full notice.html' },
      ] }],
    });
  }, async () => {
    const detail = await providerDirectService.getOpportunity('359855');
    assert.equal(detail.synopsis, 'Official summary.');
    assert.equal(detail.documents[0].url,
      'https://apply07.grants.gov/grantsws/rest/opportunity/att/download/352323');
    assert.equal(detail.documents[0].sourceDocumentId, undefined);
  });
  assert.deepEqual(sent, { opportunityId: 359855 });
});

test('invalid IDs and provider failures do not become plausible results', async () => {
  await withFetch(async () => { throw new Error('fetch should not run'); }, async () => {
    await assert.rejects(providerDirectService.getOpportunity('359855/other'), /numeric/);
  });
  await withFetch(async () => new Response('{}', { status: 429 }), async () => {
    await assert.rejects(providerDirectService.searchOpportunities(criteria), /limiting requests/);
  });
  await withFetch(async () => providerResponse(null), async () => {
    await assert.rejects(providerDirectService.searchOpportunities(criteria), /no usable data/);
  });
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await assert.rejects(providerDirectService.searchOpportunities(criteria), /could not reach/);
  });
});

test('direct provider mode links documents but cannot claim source reading', async () => {
  await assert.rejects(providerDirectService.readListedDocument('359855', '352323'), /unavailable/);
  await assert.rejects(providerDirectService.findSourcePassages('359855', '352323', 'budget', 5), /source reader/);
});
