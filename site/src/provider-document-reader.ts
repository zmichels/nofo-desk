import { DOMParser as InertDOMParser } from 'linkedom';
import { searchSamplePassages } from './sample-passage-search.ts';
import type {
  PassageSearchResult,
  ReadDocumentResult,
  RequirementCandidate,
  SourceBlock,
} from './types.ts';

const ATTACHMENT_URL = /^https:\/\/apply07\.grants\.gov\/grantsws\/rest\/opportunity\/att\/download\/([1-9]\d{0,11})$/;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 150;
const MAX_BLOCKS = 1_000;
const MAX_TOTAL_CHARS = 400_000;
const MAX_BLOCK_CHARS = 3_000;
const SKIP_HTML = new Set(['head', 'script', 'style', 'noscript', 'svg', 'iframe', 'template']);
const BREAK_HTML = new Set([
  'address', 'article', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'li', 'main',
  'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul',
]);

interface ExtractedText {
  blocks: SourceBlock[];
  pageCount?: number;
  warnings: string[];
  partial: boolean;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mimeType(value: string | null): string {
  return (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  return /^\s*(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/i.test(prefix);
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

async function downloadListedFile(url: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
  let response: Response;
  try {
    // Redirects are refused so a publisher ID never becomes an arbitrary fetch.
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error('The listed Grants.gov document could not be reached from this browser.');
  }
  if (!response.ok) throw new Error(`Grants.gov returned HTTP ${response.status} for this document.`);
  if (response.redirected || response.url !== url) {
    throw new Error('The listed Grants.gov document redirected; it was not read.');
  }
  if (!response.body) throw new Error('The listed Grants.gov document had no readable response body.');
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    await response.body.cancel();
    throw new Error('The listed document exceeds the 5 MB browser limit.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('The listed document exceeds the 5 MB browser limit.');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('5 MB browser limit')) throw error;
    throw new Error('The listed document could not be fully downloaded.');
  }
  if (!size) throw new Error('The listed Grants.gov document is empty.');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, mediaType: mimeType(response.headers.get('content-type')) };
}

function appendLimited(
  result: ExtractedText,
  value: string,
  locator: string,
  idPrefix: string,
  usedCharacters: { value: number },
): void {
  let remaining = normalize(value);
  while (remaining) {
    if (result.blocks.length >= MAX_BLOCKS || usedCharacters.value >= MAX_TOTAL_CHARS) {
      result.partial = true;
      if (!result.warnings.includes('Text was stopped at the browser reading limit.')) {
        result.warnings.push('Text was stopped at the browser reading limit.');
      }
      return;
    }
    let end = Math.min(remaining.length, MAX_BLOCK_CHARS, MAX_TOTAL_CHARS - usedCharacters.value);
    if (end < remaining.length) {
      const space = remaining.lastIndexOf(' ', end);
      if (space > end / 2) end = space;
    }
    const part = remaining.slice(0, end).trim();
    remaining = remaining.slice(end).trimStart();
    if (!part) continue;
    const number = result.blocks.length + 1;
    result.blocks.push({ id: `${idPrefix}-${number}`, locator, text: part });
    usedCharacters.value += part.length;
  }
}

function readHtml(bytes: Uint8Array): ExtractedText {
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The listed HTML document is not valid UTF-8 text.');
  }
  // This parser creates detached nodes without loading linked images or frames.
  const document = new InertDOMParser().parseFromString(html, 'text/html');
  const metaNodes = document.querySelectorAll('meta') as unknown as ArrayLike<Element>;
  const metaRefresh = Array.from(metaNodes).some(
    (meta) => meta.getAttribute('http-equiv')?.trim().toLowerCase() === 'refresh',
  );
  if (metaRefresh) throw new Error('This attachment redirects to another page; open its source link to review it.');
  if (!document.body) throw new Error('The listed HTML document has no readable body.');

  const result: ExtractedText = { blocks: [], warnings: [], partial: false };
  const usedCharacters = { value: 0 };
  let pending = '';
  let section = '';
  const flush = () => {
    const text = normalize(pending);
    pending = '';
    if (text) {
      const locator = section ? `section “${section.slice(0, 90)}”, text block` : 'HTML text block';
      appendLimited(result, text, locator, 'html', usedCharacters);
    }
  };
  const visit = (node: Node, depth: number): void => {
    if (result.partial) return;
    if (depth > 100) {
      result.partial = true;
      result.warnings.push('Deeply nested HTML was not fully read.');
      return;
    }
    if (node.nodeType === 3) {
      pending += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (SKIP_HTML.has(tag) || element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      section = normalize(element.textContent ?? '');
      if (section) appendLimited(result, section, `heading “${section.slice(0, 90)}”`, 'html', usedCharacters);
      return;
    }
    const boundary = BREAK_HTML.has(tag);
    if (boundary) flush();
    for (const child of Array.from(element.childNodes)) visit(child, depth + 1);
    if (boundary) flush();
  };
  visit(document.body, 0);
  flush();
  if (!result.blocks.length) result.warnings.push('No readable text was found in this HTML document.');
  return result;
}

function readPlainText(bytes: Uint8Array): ExtractedText {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The listed text document is not valid UTF-8.');
  }
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text)) {
    throw new Error('The listed text contains binary control characters and was not read.');
  }
  const result: ExtractedText = { blocks: [], warnings: [], partial: false };
  const usedCharacters = { value: 0 };
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (result.partial) break;
    appendLimited(result, line, `line ${index + 1}`, 'text', usedCharacters);
  }
  if (!result.blocks.length) result.warnings.push('No readable text was found in this file.');
  return result;
}

function requirementLeads(blocks: SourceBlock[]): {
  candidates: RequirementCandidate[]; truncated: boolean;
} {
  // These cues nominate exact passages for review; they do not interpret the NOFO.
  const directive = /\b(?:must|shall|required|mandatory|cannot|prohibited|no later than|due date)\b/i;
  const categories: [string, RegExp][] = [
    ['deadline', /\b(?:deadline|due date|no later than|submission date)\b/i],
    ['eligibility', /\b(?:eligible|eligibility|ineligible|may apply)\b/i],
    ['pageFormat', /\b(?:page limit|pages?|font|margins?|word limit|format)\b/i],
    ['requiredMaterial', /\b(?:attachment|document|form|narrative|statement|letter|file|biosketch)\b/i],
    ['budget', /\b(?:budget|cost sharing|indirect costs?|direct costs?)\b/i],
  ];
  const candidates: RequirementCandidate[] = [];
  for (const block of blocks) {
    const cue = directive.exec(block.text);
    if (!cue) continue;
    const category = categories.find(([, pattern]) => pattern.test(block.text))?.[0];
    if (!category) continue;
    if (candidates.length === 40) return { candidates, truncated: true };
    const startBound = Math.max(0, cue.index - 160);
    const endBound = Math.min(block.text.length, cue.index + 320);
    // Clip at word boundaries and mark omitted context instead of showing a
    // sentence fragment that looks like the complete source passage.
    const start = startBound ? (block.text.indexOf(' ', startBound) + 1 || startBound) : 0;
    const lastSpace = endBound < block.text.length ? block.text.lastIndexOf(' ', endBound) : -1;
    const end = lastSpace > start ? lastSpace : endBound;
    const quote = `${start ? '…' : ''}${block.text.slice(start, end).trim()}${end < block.text.length ? '…' : ''}`;
    candidates.push({
      id: `${block.id}-lead`, category, quote, blockId: block.id, locator: block.locator,
    });
  }
  return { candidates, truncated: false };
}

/** Read only a provider-listed attachment URL, keeping extraction limits visible. */
export async function readProviderDocument(url: string): Promise<ReadDocumentResult> {
  const match = ATTACHMENT_URL.exec(url);
  if (!match) throw new Error('Only a listed Grants.gov attachment can be read here.');
  const { bytes, mediaType } = await downloadListedFile(url);
  // PDF.js may transfer its input buffer to a worker, so record the source
  // digest before handing the bytes to a parser.
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let extracted: ExtractedText;
  if (isPdf(bytes)) {
    if (mediaType && mediaType !== 'application/pdf' && mediaType !== 'application/octet-stream') {
      throw new Error('The attachment content conflicts with its declared media type.');
    }
    const { readPdf } = await import('./provider-pdf-reader.ts');
    extracted = await readPdf(bytes, {
      maxPages: MAX_PAGES, maxBlocks: MAX_BLOCKS,
      maxCharacters: MAX_TOTAL_CHARS, maxBlockCharacters: MAX_BLOCK_CHARS,
    });
  } else if (mediaType === 'application/pdf') {
    throw new Error('The listed PDF has no PDF signature and was not read.');
  } else if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') {
    if (!looksLikeHtml(bytes)) throw new Error('The listed HTML did not contain an HTML document.');
    extracted = readHtml(bytes);
  } else if (mediaType === 'text/plain') {
    if (looksLikeHtml(bytes)) throw new Error('The listed text is actually HTML and was not read.');
    extracted = readPlainText(bytes);
  } else {
    throw new Error(`This attachment type (${mediaType || 'unknown'}) cannot be read in the browser.`);
  }
  const status = extracted.blocks.length ? (extracted.partial ? 'partial' : 'read') : 'unreadable';
  const leads = requirementLeads(extracted.blocks);
  return {
    fileName: `Grants.gov attachment ${match[1]}`,
    status,
    pageCount: extracted.pageCount,
    blocks: extracted.blocks,
    requirementScan: { ...leads, exhaustive: false },
    warnings: extracted.warnings,
    sourceUrl: url,
    sourceVersion: `sha256:${sha256}`,
    retrievedAt: new Date().toISOString(),
  };
}

/** Search only text that was actually read from the listed file. */
export function findProviderPassages(
  reading: ReadDocumentResult, query: string, limit: number,
): PassageSearchResult {
  return searchSamplePassages(reading, query, limit);
}
