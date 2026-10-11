# NOFO Desk site

This Vite site runs in a browser and builds to static files for GitHub Pages. Its default mode searches public Grants.gov records, reads eligible listed attachments, and keeps a small shortlist. Add `?mode=sample` to view fictional opportunities and example located passages. The visible mode switch moves between them.

```sh
npm ci
npm run dev
npm test
npm run build
```

The live adapter implements all four `NofoDeskService` operations: search, detail, read a listed attachment, and find literal passages within its extracted text. It accepts a current Grants.gov attachment ID only after checking that the attachment is listed on the current opportunity record. It never fetches an arbitrary agency link. The sample adapter uses invented records and text. A provider or reading error never silently switches the user to sample data.

The source reader accepts HTML, plain text, and PDFs with extractable text. It keeps HTML section or text-block locations and PDF page/text-part locations, records a SHA-256 digest of the retrieved file, and shows partial-read warnings. Its topic cues nominate candidate passages about deadlines, eligibility, materials, format, and budget for human review. Literal passage search covers only text that was actually read. A zero-match result cannot prove that an instruction is absent.

| Browser reading limit | Current bound |
| --- | --- |
| Attachment download | 5 MB; 20-second request timeout |
| PDF parsing | First 150 pages; 20-second parse window |
| Extracted text | Up to 1,000 blocks and 400,000 characters |
| Candidate leads | First 40 matching passages |

Scanned/image-only PDFs need OCR, which this site does not provide. Password-protected PDFs and other file types are not read. A full notice may also include amendments or linked instructions outside the listed file; always open the original source before making a decision.

**My desk** stores at most eight numeric Grants.gov opportunity IDs in this browser's local storage. It fetches current details when opened, compares up to three available records, and exports those selected records to a Markdown brief with original posting and listed public source links. The brief contains provider metadata only: no document excerpts, user notes, or claim that eligibility or requirements have been verified. Missing provider values remain "Not supplied," and forecast dates stay labeled tentative. The list is local to this browser and is not a shared team workspace.

This focused reading and shortlist workflow complements [Simpler.Grants.gov's search](https://simpler.grants.gov/search), which already offers a broader set of discovery filters and account features. NOFO Desk does not apply for funding or review a proposal.

## Distribution boundary

The presentation and sample modules were adapted from the NOFO Desk Code App; the pure provider mapper was adapted from its direct-provider connector path. This edition contains no Power Platform packages, generated connector, tenant ID, credentials, organization-specific URLs, or Python API service. Search and detail use the two public Grants.gov API operations described in the root README; reading additionally downloads only a verified provider-listed attachment. The browser keeps extracted text in memory for the current session rather than saving it with the shortlist.
