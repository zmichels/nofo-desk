import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_SHORTLIST_ITEMS,
  SHORTLIST_STORAGE_KEY,
  addOpportunityId,
  buildComparisonRow,
  buildMarkdownBrief,
  loadShortlist,
  removeOpportunityId,
  saveShortlist,
} from '../src/shortlist.ts';

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[SHORTLIST_STORAGE_KEY, initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function detail(override = {}) {
  return {
    id: '359855', number: 'RFA-CA-27-020', title: 'Cancer | research [phase 2]',
    agency: 'National Institutes of Health', agencyCode: 'HHS-NIH11', status: 'posted',
    openDate: 'May 21, 2026', closeDate: 'Oct 19, 2026', aln: ['93.395'],
    synopsis: 'Provider synopsis.', fundingActivity: 'Health',
    sourceUrl: 'https://not-the-source.example.org/ignore', eligibility: 'Check the notice.',
    eligibleApplicantTypes: ['Private institutions'], awardCeiling: '$500,000',
    estimatedFunding: '$2,600,000', updatedAt: 'May 22, 2026',
    documents: [
      { title: 'Full [notice].html', kind: 'Full Announcement', url: 'https://www.grants.gov/notice.html' },
      { title: 'Local file', kind: 'Related link', url: 'https://files.internal/notice.pdf' },
      { title: 'Credential link', kind: 'Related link', url: 'https://user:pass@example.org/file' },
    ],
    ...override,
  };
}

test('stores only versioned public IDs, with a stable order and eight-item cap', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadShortlist(storage), { ids: [], status: 'empty' });
  const ids = Array.from({ length: MAX_SHORTLIST_ITEMS }, (_, index) => String(index + 1));
  saveShortlist(storage, ids);
  assert.deepEqual(loadShortlist(storage), { ids, status: 'ready' });
  assert.deepEqual(JSON.parse(storage.getItem(SHORTLIST_STORAGE_KEY)), { version: 1, ids });
  assert.deepEqual(addOpportunityId(ids, '1'), ids);
  assert.throws(() => addOpportunityId(ids, '9'), /at most 8/);
  assert.deepEqual(removeOpportunityId(ids, '3'), ['1', '2', '4', '5', '6', '7', '8']);
});

test('rejects malformed IDs, duplicates, extra fields and unknown schema versions', () => {
  for (const ids of [['0'], ['001'], ['abc'], ['1', '1'], ['1'.repeat(13)]]) {
    assert.throws(() => saveShortlist(memoryStorage(), ids), /distinct Grants.gov/);
  }
  assert.throws(() => addOpportunityId([], '1/2'), /valid numeric/);
  for (const raw of [
    '{', '[]', 'null', JSON.stringify({ version: 2, ids: ['1'] }),
    JSON.stringify({ version: 1, ids: ['1'], notes: 'private text' }),
    JSON.stringify({ version: 1, ids: ['1', '1'] }),
    'x'.repeat(513),
  ]) {
    assert.deepEqual(loadShortlist(memoryStorage(raw)), { ids: [], status: 'invalid' });
  }
});

test('reports unavailable browser storage rather than pretending it is empty', () => {
  assert.deepEqual(loadShortlist({ getItem() { throw new Error('blocked'); } }), {
    ids: [], status: 'unavailable',
  });
  assert.throws(() => saveShortlist({ setItem() { throw new Error('quota'); } }, ['1']), /quota/);
});

test('comparison rows distinguish forecast dates, missing values and merely listed files', () => {
  const row = buildComparisonRow(detail({
    status: 'forecasted', awardCeiling: '', sourceUrl: 'https://wrong.example.org',
  }));
  assert.deepEqual(row.deadline, { value: 'Oct 19, 2026', kind: 'forecast' });
  assert.equal(row.awardCeiling, null);
  assert.equal(row.sourceUrl, 'https://www.grants.gov/search-results-detail/359855');
  assert.equal(row.listedDocumentCount, 3);
  assert.equal(row.linkedDocumentCount, 1);
  assert.deepEqual(buildComparisonRow(detail()).deadline, {
    value: 'Oct 19, 2026', kind: 'stated',
  });
  assert.deepEqual(buildComparisonRow(detail({ closeDate: '' })).deadline, {
    value: null, kind: 'not_supplied',
  });
});

test('brief links the provider record, escapes Markdown and keeps source limits visible', () => {
  const brief = buildMarkdownBrief([
    detail({ status: 'forecasted', awardCeiling: '' }),
  ], new Date('2026-10-10T12:00:00Z'));
  assert.match(brief, /Generated 2026-10-10T12:00:00\.000Z/);
  assert.match(brief, /Cancer \\\| research \\\[phase 2\\\]/);
  assert.match(brief, /https:\/\/www\.grants\.gov\/search-results-detail\/359855/);
  assert.match(brief, /Oct 19, 2026 \(forecast; confirm\)/);
  assert.match(brief, /Not supplied/);
  assert.match(brief, /Listed source links \(contents not assessed in this brief\)/);
  assert.match(brief, /https:\/\/www\.grants\.gov\/notice\.html/);
  assert.doesNotMatch(brief, /files\.internal|user:pass|not-the-source/);
  assert.match(brief, /not endorsed or certified by the U\.S\. Department of Health and Human Services/);
  assert.throws(() => buildMarkdownBrief([detail(), detail()], new Date()), /distinct Grants.gov/);
  assert.throws(() => buildMarkdownBrief([], new Date('invalid')), /valid generation time/);
});
