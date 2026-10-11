import { buildSearchRequest, mapDetailResponse, mapSearchResponse } from './provider-mapping.ts';
import { findProviderPassages, readProviderDocument } from './provider-document-reader.ts';
import type { NofoDeskService, ReadDocumentResult } from './types';

const PROVIDER_API = 'https://api.grants.gov/v1/api';
const readingByDocument = new Map<string, ReadDocumentResult>();

function readingKey(opportunityId: string, sourceDocumentId: string): string {
  return `${opportunityId}:${sourceDocumentId}`;
}

async function providerPost(path: string, body: object): Promise<unknown> {
  let response: Response;
  try {
    // Grants.gov accepts JSON bytes as text/plain. This keeps the cross-origin
    // browser request simple, avoiding the provider's failing OPTIONS preflight.
    response = await fetch(`${PROVIDER_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('The browser could not reach Grants.gov. Please try again later.');
  }
  if (response.status === 429) {
    throw new Error('Grants.gov is limiting requests. Please wait before trying again.');
  }
  if (!response.ok) {
    throw new Error(`Grants.gov returned HTTP ${response.status}. Please try again later.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Grants.gov returned an unreadable response.');
  }
}

// Source reading is limited to a listed Grants.gov attachment; a link to an
// external agency page is never fetched through this browser adapter.
export const providerDirectService: NofoDeskService = {
  async searchOpportunities(criteria) {
    const request = buildSearchRequest(criteria);
    return mapSearchResponse(await providerPost('/search2', request), criteria);
  },

  async getOpportunity(opportunityId) {
    if (!/^[1-9]\d{0,11}$/.test(opportunityId)) {
      throw new Error('A valid numeric Grants.gov opportunity ID is required.');
    }
    const response = await providerPost('/fetchOpportunity', {
      opportunityId: Number(opportunityId),
    });
    return mapDetailResponse(response, opportunityId);
  },

  async readListedDocument(opportunityId, sourceDocumentId) {
    if (!/^[1-9]\d{0,11}$/.test(sourceDocumentId)) {
      throw new Error('A valid listed Grants.gov attachment ID is required.');
    }
    const opportunity = await providerDirectService.getOpportunity(opportunityId);
    const listed = opportunity.documents.find((document) => document.sourceDocumentId === sourceDocumentId);
    if (!listed?.url) throw new Error('This attachment is not listed on the current provider record.');
    const reading = await readProviderDocument(listed.url);
    reading.fileName = listed.title;
    const key = readingKey(opportunityId, sourceDocumentId);
    if (readingByDocument.size >= 3) readingByDocument.delete(readingByDocument.keys().next().value ?? '');
    readingByDocument.set(key, reading);
    return reading;
  },

  async findSourcePassages(opportunityId, sourceDocumentId, query, limit) {
    const key = readingKey(opportunityId, sourceDocumentId);
    const reading = readingByDocument.get(key)
      ?? await providerDirectService.readListedDocument(opportunityId, sourceDocumentId);
    return findProviderPassages(reading, query, limit);
  },
};
