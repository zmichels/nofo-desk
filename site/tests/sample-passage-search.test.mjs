import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchSamplePassages } from '../src/sample-passage-search.ts';

test('sample passage search ranks a phrase first and keeps source limits', () => {
  const reading = {
    status: 'partial', warnings: ['Some pages could not be read.'],
    sourceVersion: 'sample:1',
    blocks: [
      { id: 'b1', locator: 'page 1, line 1', text: 'Budget and justification are separate.' },
      { id: 'b2', locator: 'page 2, line 1', text: 'Include a budget justification.' },
    ],
  };
  const result = searchSamplePassages(reading, 'budget justification', 1);
  assert.equal(result.matchCount, 2);
  assert.equal(result.resultsTruncated, true);
  assert.equal(result.passages[0].blockId, 'b2');
  assert.equal(result.passages[0].matchKind, 'phrase');
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.warnings, reading.warnings);
  assert.equal(result.sourceVersion, 'sample:1');
  assert.throws(() => searchSamplePassages(reading, '!!', 1), /searchable/);
});

test('sample passage search does not confuse Phase I with Phase II', () => {
  const reading = {
    status: 'read', warnings: [], blocks: [
      { id: 'b1', locator: 'page 1', text: 'Phase II applicants may apply.' },
      { id: 'b2', locator: 'page 2', text: 'Phase I applicants may apply.' },
    ],
  };
  const result = searchSamplePassages(reading, 'Phase I', 10);
  assert.equal(result.matchCount, 1);
  assert.equal(result.passages[0].blockId, 'b2');
  assert.equal(result.passages[0].matchKind, 'phrase');
});

test('sample passage search requires whole words for phrase and fallback matches', () => {
  const reading = {
    status: 'read', warnings: [], blocks: [
      { id: 'b1', locator: 'page 1', text: 'The postcard modeling appendix is optional.' },
      { id: 'b2', locator: 'page 2', text: 'Read the model card.' },
      { id: 'b3', locator: 'page 3', text: 'The card documents the model.' },
    ],
  };
  const result = searchSamplePassages(reading, 'model card', 10);
  assert.equal(result.matchCount, 2);
  assert.deepEqual(result.passages.map((passage) => passage.blockId), ['b2', 'b3']);
  assert.deepEqual(result.passages.map((passage) => passage.matchKind), ['phrase', 'all_words']);
});
