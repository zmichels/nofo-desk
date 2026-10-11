import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOMParser } from 'linkedom';
import { findProviderPassages, readProviderDocument } from '../src/provider-document-reader.ts';

globalThis.DOMParser = DOMParser;
const listedUrl = 'https://apply07.grants.gov/grantsws/rest/opportunity/att/download/352323';

async function withDocument(body, contentType, run, extra = {}) {
  const original = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    const response = new Response(body, {
      headers: { 'Content-Type': contentType, ...extra },
    });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  try { await run(() => requested); } finally { globalThis.fetch = original; }
}

test('reads a listed HTML file with section locations and traceable literal matches', async () => {
  const html = `<!doctype html><html><body>
    <h2>Application package</h2>
    <p>Applicants must attach a budget narrative by the due date.</p>
    <script>Applicants must attach a secret.</script>
    <h2>Eligibility</h2><p>Only eligible institutions may apply.</p>
  </body></html>`;
  await withDocument(html, 'text/html; charset=utf-8', async (getRequest) => {
    const reading = await readProviderDocument(listedUrl);
    assert.equal(reading.status, 'read');
    assert.equal(reading.requirementScan.exhaustive, false);
    assert.equal(reading.sourceUrl, listedUrl);
    assert.match(reading.sourceVersion, /^sha256:[a-f0-9]{64}$/);
    assert.ok(reading.blocks.some((block) =>
      block.locator.includes('Application package') && block.text.includes('budget narrative')));
    assert.ok(!reading.blocks.some((block) => block.text.includes('secret')));
    assert.ok(reading.requirementScan.candidates.some((lead) => lead.category === 'deadline'));
    const passage = findProviderPassages(reading, 'budget narrative', 5);
    assert.equal(passage.matchCount, 1);
    assert.equal(passage.passages[0].matchKind, 'phrase');
    assert.match(passage.passages[0].locator, /Application package/);
    assert.equal(passage.sourceVersion, reading.sourceVersion);
    assert.equal(getRequest().options.redirect, 'error');
    assert.equal(getRequest().url, listedUrl);
  });
});

test('rejects unlisted hosts and attachment IDs before network access', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('fetch must not run'); };
  try {
    await assert.rejects(readProviderDocument('https://example.org/352323'), /Only a listed/);
    await assert.rejects(readProviderDocument(`${listedUrl}/other`), /Only a listed/);
    await assert.rejects(readProviderDocument(`${listedUrl}?redirect=https://example.org`), /Only a listed/);
  } finally { globalThis.fetch = original; }
});

test('rejects HTML redirect placeholders and content-type mismatches', async () => {
  await withDocument('<html><head><meta http-equiv="refresh" content="0;url=https://other.example"></head><body>Wait</body></html>',
    'text/html', async () => {
      await assert.rejects(readProviderDocument(listedUrl), /redirects to another page/);
    });
  await withDocument('<!doctype html><html><body>Content</body></html>',
    'application/pdf', async () => {
      await assert.rejects(readProviderDocument(listedUrl), /no PDF signature/);
    });
  await withDocument('<!doctype html><html><body>Content</body></html>',
    'application/octet-stream', async () => {
      await assert.rejects(readProviderDocument(listedUrl), /cannot be read in the browser/);
    });
  await withDocument('Budget\0must be submitted.', 'text/plain', async () => {
    await assert.rejects(readProviderDocument(listedUrl), /binary control characters/);
  });
});

test('stops before downloading a declared file larger than 5 MB', async () => {
  await withDocument('Too large', 'text/plain', async () => {
    await assert.rejects(readProviderDocument(listedUrl), /5 MB browser limit/);
  }, { 'Content-Length': String(5 * 1024 * 1024 + 1) });
});

test('plain text keeps line numbers and empty files cannot appear read', async () => {
  await withDocument('General notice\nBudget must be submitted.\n', 'text/plain', async () => {
    const reading = await readProviderDocument(listedUrl);
    assert.equal(reading.status, 'read');
    assert.equal(reading.blocks[1].locator, 'line 2');
  });
  await withDocument('\n\n', 'text/plain', async () => {
    const reading = await readProviderDocument(listedUrl);
    assert.equal(reading.status, 'unreadable');
    assert.match(reading.warnings.join(' '), /No readable text/);
  });
});

test('a capped reading is visibly partial, never reported as complete', async () => {
  await withDocument(`Budget must be submitted. ${'review text '.repeat(40_000)}`,
    'text/plain', async () => {
      const reading = await readProviderDocument(listedUrl);
      assert.equal(reading.status, 'partial');
      assert.ok(reading.blocks.every((block) => block.text.length <= 3_000));
      assert.ok(reading.blocks.reduce((sum, block) => sum + block.text.length, 0) <= 400_000);
      assert.match(reading.warnings.join(' '), /reading limit/);
      assert.equal(reading.requirementScan.exhaustive, false);
    });
});
