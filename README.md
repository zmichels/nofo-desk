# NOFO Desk

NOFO Desk is a small research workbench for finding public funding opportunities, reading listed notice files, and keeping a few candidates in view. [Open the live site](https://zmichels.github.io/nofo-desk/). It calls [Grants.gov's public API](https://grants.gov/api/api-guide/) directly from the browser; it needs no NOFO Desk server or API key.

| View | What it does | Source boundary |
| --- | --- | --- |
| Search | Search current opportunities and narrow by status, agency, applicant type, or Assistance Listing | Calls Grants.gov `search2` |
| Posting | Show dates, eligibility, funding fields, synopsis, and official posting link | Calls Grants.gov `fetchOpportunity` |
| Source reader | Read bounded text from a listed Grants.gov HTML, plain-text, or text-based PDF attachment; find source-located passages and topic-based candidate leads | Reads only that listed attachment in the browser; never treats leads as a complete requirements list |
| My desk | Save up to eight public opportunity IDs in this browser, compare up to three current provider records, and download a source-linked Markdown brief | Refreshes details from Grants.gov; persists no proposal, PI notes, or document text |
| Fictional sample | Explore invented records and passages without live provider data | Every sample is labeled fictional |

The default view uses live provider data. **View fictional sample** switches to invented examples. NOFO Desk complements [Simpler.Grants.gov's broader search](https://simpler.grants.gov/search): its focus is a compact, source-aware reading and comparison workspace for a few opportunities. It does not compare a proposal with a notice or decide institutional eligibility or submission readiness.

## Run or publish

With Node.js 24 and npm:

```sh
cd site
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm test` and `npm run build` from `site/` to check the app and create a static `dist/` build. The [Pages workflow](.github/workflows/pages.yml) publishes that build. See [site notes](site/README.md) for reading limits and the brief's boundaries.

## How the browser reaches Grants.gov

Both [search](https://www.grants.gov/api/common/search2) and [detail](https://www.grants.gov/api/common/fetchopportunity) are public, unauthenticated provider operations. The browser sends their JSON request body as `text/plain` to avoid a failing cross-origin preflight. This works in current browser tests, but Grants.gov documents `application/json`, so it is an observed compatibility path rather than a guaranteed contract. If the provider changes it, the app shows an error instead of substituting sample data. Search terms go from the user's browser directly to Grants.gov; this app does not store them.

The [`NofoDeskService` interface](site/src/types.ts), [provider mapping](site/src/provider-mapping.ts), [browser transport](site/src/provider-direct-service.ts), [source reader](site/src/provider-document-reader.ts), and [shortlist model](site/src/shortlist.ts) are separate. Another source can be added without pretending its records are Grants.gov NOFOs. Open opportunities, policy notices, and past awards should remain distinct record types.

The reader has file-size, page, and text limits and cannot OCR scanned PDFs. Unsupported files, blocked downloads, partial reads, and missing data stay visible rather than becoming guessed requirements. Grants.gov requires an attribution notice in products using its API; the live UI displays it prominently. Confirm the original notice, amendments, and incorporated instructions before acting on an opportunity.
