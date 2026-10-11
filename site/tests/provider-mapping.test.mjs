import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSearchRequest,
  mapDetailResponse,
  mapSearchResponse,
} from '../src/provider-mapping.ts';

const criteria = {
  keyword: ' cancer ', status: 'posted', agency: 'HHS-NIH11', aln: '93.395',
  eligibility: '06', sortBy: 'closeDate|asc', offset: 10, limit: 10,
};

function envelope(data) {
  return { errorcode: 0, data };
}

test('search2 request uses provider filter codes and the live ALN key', () => {
  assert.deepEqual(buildSearchRequest(criteria), {
    keyword: 'cancer', agencies: 'HHS-NIH11', oppStatuses: 'posted',
    rows: 10, startRecordNum: 10, sortBy: 'closeDate|asc',
    cfda: '93.395', eligibilities: '06',
  });
  const all = buildSearchRequest({ ...criteria, status: 'all', agency: '', aln: '', eligibility: '' });
  assert.equal(all.oppStatuses, '');
  assert.equal('cfda' in all, false);
  assert.equal('eligibilities' in all, false);
});

test('search2 request rejects malformed codes and pagination before a connector call', () => {
  for (const override of [
    { agency: 'HHS / NIH' }, { aln: 'Health' }, { eligibility: '01|02' },
    { offset: -1 }, { limit: 101 }, { keyword: 'x'.repeat(251) },
  ]) {
    assert.throws(() => buildSearchRequest({ ...criteria, ...override }));
  }
});

test('search response keeps source IDs, codes, counts, and omitted-hit warning', () => {
  const result = mapSearchResponse(envelope({
    hitCount: 89,
    oppHits: [
      { id: '359855', number: 'RFA-CA-27-020', title: 'Cancer &amp; informatics',
        agencyCode: 'HHS-NIH11', agency: 'National Institutes of Health',
        oppStatus: 'posted', openDate: '05/21/2026', closeDate: '10/19/2026',
        cfdaList: ['93.395'] },
      { id: 'missing-number', title: 'Incomplete' },
    ],
    agencies: [{ value: 'HHS', label: 'Health and Human Services', subAgencyOptions: [
      { value: 'HHS-NIH11', label: 'National Institutes of Health' },
    ] }],
    eligibilities: [{ value: '06', label: 'Public institutions' }],
  }), criteria);
  assert.equal(result.total, 89);
  assert.equal(result.offset, 10);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'Cancer & informatics');
  assert.equal(result.items[0].sourceUrl, 'https://www.grants.gov/search-results-detail/359855');
  assert.deepEqual(result.items[0].aln, ['93.395']);
  assert.deepEqual(result.facets.agencies.find((item) => item.code === 'HHS-NIH11'), {
    code: 'HHS-NIH11', label: 'National Institutes of Health',
  });
  assert.deepEqual(result.facets.applicantTypes, [{ code: '06', label: 'Public institutions' }]);
  assert.deepEqual(result.warnings, ['1 incomplete Grants.gov result(s) omitted.']);
});

test('posted detail presents provider fields and identifies listed attachments for reading', () => {
  const detail = mapDetailResponse(envelope({
    id: 359855, opportunityNumber: 'RFA-CA-27-020',
    opportunityTitle: 'Cancer <b>informatics</b>', owningAgencyCode: 'HHS-NIH11',
    ost: 'POSTED', docType: 'synopsis', originalDueDateDesc: 'Original deadline note.',
    synopsis: {
      agencyName: 'National Institutes of Health', postingDate: 'May 21, 2026',
      responseDate: 'Oct 19, 2026', responseDateDesc: 'Closes at 5 p.m. Eastern.',
      lastUpdatedDate: 'May 22, 2026', synopsisDesc: '<p>A source &amp; its context.</p>',
      applicantEligibilityDesc: 'Public institutions may apply.',
      awardCeilingFormatted: '$500,000', estimatedFundingFormatted: '$2,600,000',
      fundingActivityCategories: [{ id: 'HL', description: 'Health' }],
      applicantTypes: [{ id: '06', description: 'Public institutions' }],
    },
    cfdas: [{ cfdaNumber: '93.395' }],
    synopsisAttachmentFolders: [{ folderType: 'Full Announcement', synopsisAttachments: [
      { id: 352323, fileName: 'Full notice.html', fileDescription: 'Publisher file' },
    ] }],
    synopsisDocumentURLs: [
      { title: 'Agency notice', url: 'https://www.nih.gov/example' },
      { title: 'Unsafe link', url: 'javascript:alert(1)' },
    ],
  }), '359855');
  assert.equal(detail.title, 'Cancer informatics');
  assert.equal(detail.synopsis, 'A source & its context.');
  assert.equal(detail.fundingActivity, 'Health');
  assert.deepEqual(detail.eligibleApplicantTypes, ['Public institutions']);
  assert.deepEqual(detail.aln, ['93.395']);
  assert.equal(detail.awardCeiling, '$500,000');
  assert.equal(detail.deadlineNotes, 'Closes at 5 p.m. Eastern.');
  assert.equal(detail.documents.length, 2);
  assert.deepEqual(detail.documents[0], {
    title: 'Full notice.html', kind: 'Full Announcement', description: 'Publisher file',
    sourceDocumentId: '352323',
    url: 'https://apply07.grants.gov/grantsws/rest/opportunity/att/download/352323',
  });
  assert.equal(detail.documents[1].sourceDocumentId, undefined);
  assert.equal(detail.documents[1].url, 'https://www.nih.gov/example');
});

test('forecast detail prefers current forecast over retained synopsis', () => {
  const detail = mapDetailResponse(envelope({
    id: '359855', opportunityNumber: 'FORECAST-1', opportunityTitle: 'Forecast',
    docType: 'forecast', ost: 'FORECASTED',
    synopsis: { synopsisDesc: 'Outdated posted synopsis.' },
    forecast: {
      forecastDesc: 'Current forecast text.',
      estApplicationResponseDateDesc: 'Expected close at 11:59 p.m. ET.',
      agencyName: 'Forecast agency',
    },
  }), '359855');
  assert.equal(detail.synopsis, 'Current forecast text.');
  assert.equal(detail.status, 'forecasted');
  assert.equal(detail.deadlineNotes, 'Expected close at 11:59 p.m. ET.');
  assert.equal(detail.closeDate, '');
});

test('provider errors, malformed result lists, and mismatched IDs fail closed', () => {
  assert.throws(() => mapSearchResponse({ errorcode: 1, data: {} }, criteria), /did not complete/);
  assert.throws(() => mapSearchResponse(envelope({ hitCount: 1, oppHits: null }), criteria), /result list/);
  assert.throws(() => mapDetailResponse(envelope({ id: 123, opportunityTitle: 'Wrong' }), '359855'), /mismatched/);
  assert.throws(() => mapDetailResponse(envelope({ id: 359855, opportunityTitle: 'Incomplete' }), '359855'), /incomplete/);
});
