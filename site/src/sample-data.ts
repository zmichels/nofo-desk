import type { OpportunityDetail, ReadDocumentResult, RequirementCandidate } from './types';

// Fictional records keep the preview useful without implying a live posting exists.
export const sampleOpportunities: OpportunityDetail[] = [
  {
    id: '991001',
    number: 'SAMPLE-HRO-27-001',
    title: 'Collaborative Community Health Research Networks',
    agency: 'Sample Health Research Office',
    agencyCode: 'SHRO',
    status: 'posted',
    openDate: '2026-09-21',
    closeDate: '2027-01-29',
    aln: ['93.000'],
    synopsis: 'Supports multi-site teams studying practical ways to improve access to community-based health services.',
    fundingActivity: 'Health',
    eligibility: 'Public and private nonprofit institutions may apply. Partnerships with community organizations are encouraged.',
    eligibleApplicantTypes: ['Nonprofit institutions', 'Public institutions'],
    awardCeiling: '$750,000 per year',
    estimatedFunding: '$8 million',
    updatedAt: '2026-10-02',
    deadlineNotes: 'The full notice would govern any local-time or letter-of-intent conditions.',
    documents: [
      {
        title: 'Funding opportunity notice.pdf',
        kind: 'Notice',
        sourceDocumentId: '771001',
        description: 'Fictional notice text for this sample preview.',
      },
      {
        title: 'Application instructions.pdf',
        kind: 'Application guide',
        sourceDocumentId: '771002',
        description: 'Fictional application guidance for this sample preview.',
      },
    ],
  },
  {
    id: '991002',
    number: 'SAMPLE-BRI-27-014',
    title: 'Early Career Translational Methods Awards',
    agency: 'Sample Biomedical Research Institute',
    agencyCode: 'SBRI',
    status: 'posted',
    openDate: '2026-10-05',
    closeDate: '2027-02-16',
    aln: ['93.001'],
    synopsis: 'Invites early career investigators to test methods that connect laboratory findings with clinical practice.',
    fundingActivity: 'Research',
    eligibility: 'Domestic nonprofit research institutions may nominate eligible early career investigators.',
    eligibleApplicantTypes: ['Nonprofit institutions'],
    awardCeiling: '$350,000 per year',
    estimatedFunding: '$4 million',
    updatedAt: '2026-10-06',
    documents: [
      { title: 'Program announcement.pdf', kind: 'Notice', sourceDocumentId: '771003' },
    ],
  },
  {
    id: '991003',
    number: 'SAMPLE-RHO-27-008',
    title: 'Rural Care Access Pilot Studies',
    agency: 'Sample Rural Health Office',
    agencyCode: 'SRHO',
    status: 'forecasted',
    openDate: '2026-11-18',
    closeDate: '2027-03-12',
    aln: ['93.002'],
    synopsis: 'A forecast for pilot projects exploring access to specialty care in rural communities.',
    fundingActivity: 'Health services',
    eligibility: 'Applicant details will be established in the posted notice.',
    eligibleApplicantTypes: ['Public institutions', 'Nonprofit institutions'],
    awardCeiling: 'To be announced',
    estimatedFunding: 'To be announced',
    updatedAt: '2026-09-29',
    documents: [],
  },
  {
    id: '991004',
    number: 'SAMPLE-PHO-27-022',
    title: 'Data Methods for Public Health Preparedness',
    agency: 'Sample Public Health Office',
    agencyCode: 'SPHO',
    status: 'posted',
    openDate: '2026-08-17',
    closeDate: '2026-12-04',
    aln: ['93.003'],
    synopsis: 'Supports reusable data methods for detecting and responding to emerging public health needs.',
    fundingActivity: 'Public health',
    eligibility: 'State and local public agencies and nonprofit research institutions are eligible to apply.',
    eligibleApplicantTypes: ['Public institutions', 'Nonprofit institutions'],
    awardCeiling: '$1.2 million total',
    estimatedFunding: '$6 million',
    updatedAt: '2026-09-12',
    documents: [
      { title: 'Notice and technical appendix.pdf', kind: 'Notice', sourceDocumentId: '771004' },
    ],
  },
  {
    id: '991005',
    number: 'SAMPLE-ESO-26-031',
    title: 'Environmental Exposure and Health Outcomes',
    agency: 'Sample Environmental Science Office',
    agencyCode: 'SESO',
    status: 'closed',
    openDate: '2026-05-08',
    closeDate: '2026-09-30',
    aln: ['93.004'],
    synopsis: 'A completed funding cycle for studies connecting environmental exposure measures with health outcomes.',
    fundingActivity: 'Environmental health',
    eligibility: 'Universities and nonprofit research organizations were eligible.',
    eligibleApplicantTypes: ['Nonprofit institutions'],
    awardCeiling: '$500,000 per year',
    estimatedFunding: '$3 million',
    updatedAt: '2026-09-30',
    documents: [
      { title: 'Archived notice.pdf', kind: 'Notice', sourceDocumentId: '771005' },
    ],
  },
  {
    id: '991006',
    number: 'SAMPLE-WIO-27-005',
    title: 'Clinical Workforce Innovation Planning',
    agency: 'Sample Workforce Innovation Office',
    agencyCode: 'SWIO',
    status: 'posted',
    openDate: '2026-10-01',
    closeDate: '2027-01-08',
    aln: ['93.005'],
    synopsis: 'Funds planning partnerships that examine training pathways and regional clinical workforce needs.',
    fundingActivity: 'Education and training',
    eligibility: 'Public institutions, nonprofit institutions, and local government partnerships may apply.',
    eligibleApplicantTypes: ['Public institutions', 'Nonprofit institutions', 'Local government'],
    awardCeiling: '$250,000 total',
    estimatedFunding: '$2 million',
    updatedAt: '2026-10-03',
    documents: [
      { title: 'Planning grant notice.pdf', kind: 'Notice', sourceDocumentId: '771006' },
    ],
  },
];

type Passage = Pick<RequirementCandidate, 'category' | 'quote' | 'locator'>;

function sampleReading(
  fileName: string,
  passages: Passage[],
  options: { status?: ReadDocumentResult['status']; warnings?: string[] } = {},
): ReadDocumentResult {
  const blocks = passages.map((passage, index) => ({
    id: `block-${index + 1}`,
    locator: passage.locator,
    text: passage.quote,
  }));
  return {
    fileName,
    status: options.status ?? 'read',
    pageCount: Math.max(1, ...passages.map((passage) => Number(passage.locator.match(/\d+/)?.[0] ?? 1))),
    blocks,
    requirementScan: {
      candidates: passages.map((passage, index) => ({
        id: `candidate-${index + 1}`,
        blockId: `block-${index + 1}`,
        ...passage,
      })),
      exhaustive: false,
      truncated: false,
    },
    warnings: options.warnings ?? [],
  };
}

// Each location and quotation below is illustrative; no underlying PDF exists.
export const sampleReadings: Record<string, ReadDocumentResult> = {
  '991001:771001': sampleReading('Funding opportunity notice.pdf', [
    { category: 'Applicant eligibility', locator: 'Page 3', quote: 'Applicants must be public or private nonprofit institutions with a documented community research partnership.' },
    { category: 'Project scope', locator: 'Page 5', quote: 'Projects should involve at least two study sites and describe how community partners will shape the research questions.' },
    { category: 'Budget', locator: 'Page 8', quote: 'The requested direct costs may not exceed $750,000 in any project year.' },
    { category: 'Submission', locator: 'Page 11', quote: 'Applications must include a partnership plan and a data-sharing approach.' },
  ]),
  '991001:771002': sampleReading('Application instructions.pdf', [
    { category: 'Submission', locator: 'Page 2', quote: 'Submit the project narrative, budget justification, and letters of collaboration as separate attachments.' },
    { category: 'Format', locator: 'Page 4', quote: 'The project narrative may not exceed twelve pages, excluding references.' },
  ]),
  '991002:771003': sampleReading('Program announcement.pdf', [
    { category: 'Applicant eligibility', locator: 'Page 2', quote: 'The applicant organization must nominate an investigator within the stated early career window.' },
    { category: 'Project scope', locator: 'Page 6', quote: 'The research plan should explain a credible path from method development to clinical evaluation.' },
    { category: 'Submission', locator: 'Page 9', quote: 'Include a mentoring statement signed by the proposed mentor and department chair.' },
  ]),
  '991004:771004': sampleReading('Notice and technical appendix.pdf', [
    { category: 'Project scope', locator: 'Page 4', quote: 'Proposed methods should support reuse by public health partners across jurisdictions.' },
    { category: 'Data and reporting', locator: 'Page 12', quote: 'The application must describe data governance, access controls, and an evaluation plan.' },
    { category: 'Submission', locator: 'Page 18', quote: 'The technical appendix should identify key data sources and anticipated limitations.' },
  ], { status: 'partial', warnings: ['Sample extraction covers selected pages only; the full notice is not represented here.'] }),
  '991005:771005': sampleReading('Archived notice.pdf', [
    { category: 'Applicant eligibility', locator: 'Page 3', quote: 'Eligible applicants included universities and nonprofit research organizations.' },
    { category: 'Project scope', locator: 'Page 7', quote: 'Applications were expected to link exposure measures with defined health outcomes.' },
  ]),
  '991006:771006': sampleReading('Planning grant notice.pdf', [
    { category: 'Applicant eligibility', locator: 'Page 3', quote: 'Applications must identify a regional training partner and a clinical delivery partner.' },
    { category: 'Budget', locator: 'Page 5', quote: 'Planning awards may request up to $250,000 in total costs.' },
    { category: 'Submission', locator: 'Page 8', quote: 'Provide a workforce needs assessment outline and a partner engagement schedule.' },
  ]),
};
