import { buildSearchRequest, mapDetailResponse, mapSearchResponse } from './provider-mapping.ts';
import type { NofoDeskService } from './types';

const PROVIDER_API = 'https://api.grants.gov/v1/api';

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

// This browser-only path supplies provider metadata and original links. Reading
// a listed file or locating passages still needs the separate source reader.
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

  async readListedDocument() {
    throw new Error('In-app document reading is unavailable here. Open the original source instead.');
  },

  async findSourcePassages() {
    throw new Error('Located passage search requires the optional NOFO Desk source reader.');
  },
};
