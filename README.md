# NOFO Desk

NOFO Desk is a browser workbench for finding public funding opportunities and following their source documents. The live site is a thin client for [Grants.gov's public API](https://grants.gov/api/api-guide/); it needs no NOFO Desk server or API key.

| View | What it does | Source boundary |
| --- | --- | --- |
| Search | Search current opportunities and narrow by status, agency, applicant type, or Assistance Listing | Calls Grants.gov `search2` |
| Posting | Show dates, eligibility, funding fields, synopsis, and official posting link | Calls Grants.gov `fetchOpportunity` |
| Documents | List provider-supplied attachments and related links | Opens the original file; this edition does not extract its text |
| Fictional sample | Demonstrate document passages and literal search | Invented records and text, labeled throughout |

The default view uses live provider data. **View fictional sample** switches to invented examples; no sample passage is presented as a real NOFO requirement. The live view does not compare a proposal with a notice or decide submission readiness.

## Run or publish

With Node.js 24 and npm:

```sh
cd site
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm test` and `npm run build` from `site/` to check the adapter and create a static `dist/` build. The [Pages workflow](.github/workflows/pages.yml) publishes that build when enabled for this repository. See [site notes](site/README.md) for its source/export boundary.

## How the browser reaches Grants.gov

Both [search](https://www.grants.gov/api/common/search2) and [detail](https://www.grants.gov/api/common/fetchopportunity) are public, unauthenticated provider operations. The browser sends their JSON request body as `text/plain` to avoid a failing cross-origin preflight. This works in current browser tests, but Grants.gov documents `application/json`, so it is an observed compatibility path rather than a guaranteed contract. If the provider changes it, the app shows an error instead of substituting sample data. Search terms go from the user's browser directly to Grants.gov; this app does not store them.

The [`NofoDeskService` interface](site/src/types.ts), [provider mapping](site/src/provider-mapping.ts), and [browser transport](site/src/provider-direct-service.ts) are separate. Another source can be added without pretending its records are Grants.gov NOFOs. Open opportunities, policy notices, and past awards should remain distinct record types.

Grants.gov requires an attribution notice in products using its API; the live UI displays it prominently. Provider summaries and links are starting points. Confirm the original notice, amendments, and incorporated instructions before acting on an opportunity.
