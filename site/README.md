# NOFO Desk site

This Vite site runs in a browser and builds to static files for GitHub Pages. Its default mode searches and opens public Grants.gov records directly. Add `?mode=sample` to view fictional opportunities and example located passages. The visible mode switch moves between them.

```sh
npm ci
npm run dev
npm test
npm run build
```

The live adapter implements the `NofoDeskService` search and detail methods. It returns official posting and listed-document links; in-app document reading and passage search are deliberately unavailable for live records. The sample adapter implements those two methods only for invented text. The UI never silently falls back to sample content after a provider error.

## Export boundary

The presentation and sample modules were adapted from the NOFO Desk Code App; the pure provider mapper was adapted from its direct-provider connector path. This edition contains no Power Platform packages, generated connector, tenant ID, credentials, organization-specific URLs, or Python API service. The browser transport calls only the two public Grants.gov operations described in the root README.
