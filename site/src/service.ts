/// <reference types="vite/client" />

import { sampleOpportunities, sampleReadings } from './sample-data';
import { searchSamplePassages } from './sample-passage-search';
import { providerDirectService } from './provider-direct-service';
import type {
  NofoDeskService,
  OpportunityDetail,
  SearchCriteria,
  SearchResult,
} from './types';

const opportunityById = new Map(sampleOpportunities.map((item) => [item.id, item]));

function matches(item: OpportunityDetail, criteria: SearchCriteria): boolean {
  const keyword = criteria.keyword.trim().toLocaleLowerCase();
  const searchable = [item.title, item.number, item.agency, item.synopsis, ...item.aln]
    .join(' ')
    .toLocaleLowerCase();
  return (!keyword || searchable.includes(keyword))
    && (criteria.status === 'all' || item.status === criteria.status)
    && (!criteria.agency || item.agencyCode === criteria.agency)
    && (!criteria.aln || item.aln.some((value) => value.includes(criteria.aln.trim())))
    && (!criteria.eligibility || item.eligibleApplicantTypes.includes(criteria.eligibility));
}

function sortItems(items: OpportunityDetail[], sortBy: SearchCriteria['sortBy']): void {
  if (sortBy === 'oppName|asc') {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'openDate|desc') {
    items.sort((a, b) => b.openDate.localeCompare(a.openDate));
  } else {
    items.sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  }
}

export const sampleService: NofoDeskService = {
  async searchOpportunities(criteria): Promise<SearchResult> {
    const items = sampleOpportunities.filter((item) => matches(item, criteria));
    sortItems(items, criteria.sortBy);
    const agencies = [...new Map(sampleOpportunities.map((item) => [
      item.agencyCode,
      { code: item.agencyCode, label: item.agency },
    ])).values()].sort((a, b) => a.label.localeCompare(b.label));
    const applicantTypes = [...new Set(sampleOpportunities.flatMap((item) => item.eligibleApplicantTypes))]
      .sort()
      .map((label) => ({ code: label, label }));
    return {
      total: items.length,
      offset: criteria.offset,
      limit: criteria.limit,
      items: items.slice(criteria.offset, criteria.offset + criteria.limit),
      facets: { agencies, applicantTypes },
      warnings: [],
    };
  },

  async getOpportunity(opportunityId): Promise<OpportunityDetail> {
    const item = opportunityById.get(opportunityId);
    if (!item) throw new Error('This sample opportunity is unavailable. Return to search.');
    return item;
  },

  async readListedDocument(opportunityId, sourceDocumentId) {
    const item = opportunityById.get(opportunityId);
    const listed = item?.documents.some((document) => document.sourceDocumentId === sourceDocumentId);
    const reading = sampleReadings[`${opportunityId}:${sourceDocumentId}`];
    if (!listed || !reading) throw new Error('This listed sample document cannot be read.');
    return reading;
  },

  async findSourcePassages(opportunityId, sourceDocumentId, query, limit) {
    const reading = await sampleService.readListedDocument(opportunityId, sourceDocumentId);
    return searchSamplePassages(reading, query, limit);
  },
};

// The sample is an explicit preview; the default reads public provider data.
const requestedMode = new URLSearchParams(window.location.search).get('mode');
export const serviceMode: 'sample' | 'provider-direct' = requestedMode === 'sample'
  ? 'sample' : 'provider-direct';
export const deskService: NofoDeskService = serviceMode === 'sample'
  ? sampleService : providerDirectService;
