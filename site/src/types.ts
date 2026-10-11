export type OpportunityStatus = 'posted' | 'forecasted' | 'closed' | 'archived' | 'other';
export type SearchStatus = Exclude<OpportunityStatus, 'other'> | 'all';
export type SortBy = 'closeDate|asc' | 'openDate|desc' | 'oppName|asc';

export interface SearchCriteria {
  keyword: string;
  status: SearchStatus;
  agency: string;
  aln: string;
  eligibility: string;
  sortBy: SortBy;
  offset: number;
  limit: number;
}

export interface OpportunitySummary {
  id: string;
  number: string;
  title: string;
  agency: string;
  agencyCode: string;
  status: OpportunityStatus;
  openDate: string;
  closeDate: string;
  aln: string[];
  synopsis: string;
  fundingActivity: string;
  sourceUrl?: string;
}

export interface ListedDocument {
  title: string;
  kind: string;
  sourceDocumentId?: string;
  url?: string;
  description?: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  eligibility: string;
  eligibleApplicantTypes: string[];
  awardCeiling: string;
  estimatedFunding: string;
  documents: ListedDocument[];
  deadlineNotes?: string;
  updatedAt: string;
}

export interface SearchResult {
  total: number;
  offset: number;
  limit: number;
  items: OpportunitySummary[];
  facets: {
    agencies: { code: string; label: string }[];
    applicantTypes: { code: string; label: string }[];
  };
  retrievedAt?: string;
  warnings: string[];
}

export interface SourceBlock {
  id: string;
  locator: string;
  text: string;
}

export interface RequirementCandidate {
  id: string;
  category: string;
  quote: string;
  blockId: string;
  locator: string;
}

export interface ReadDocumentResult {
  fileName: string;
  status: 'read' | 'partial' | 'unreadable' | 'unknown';
  pageCount?: number;
  blocks: SourceBlock[];
  requirementScan: {
    candidates: RequirementCandidate[];
    exhaustive: false;
    truncated: boolean;
  };
  warnings: string[];
  sourceUrl?: string;
  sourceVersion?: string;
  retrievedAt?: string;
}

export interface SourcePassage {
  blockId: string;
  locator: string;
  matchKind: 'phrase' | 'all_words';
  text: string;
  truncated: boolean;
}

export interface PassageSearchResult {
  query: string;
  matchCount: number;
  returnedCount: number;
  resultsTruncated: boolean;
  passages: SourcePassage[];
  status: ReadDocumentResult['status'];
  warnings: string[];
  sourceVersion?: string;
  sourceUrl?: string;
  retrievedAt?: string;
}

// Each method maps to one read-only Desk operation; clients choose their view.
export interface NofoDeskService {
  searchOpportunities(criteria: SearchCriteria): Promise<SearchResult>;
  getOpportunity(opportunityId: string): Promise<OpportunityDetail>;
  readListedDocument(opportunityId: string, sourceDocumentId: string): Promise<ReadDocumentResult>;
  findSourcePassages(opportunityId: string, sourceDocumentId: string, query: string, limit: number): Promise<PassageSearchResult>;
}
