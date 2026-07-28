# data/bsb.txt — provenance

- **Source:** https://bereanbible.com/bsb.txt (official whole-Bible download of
  the Berean Standard Bible)
- **Fetched:** 2026-07-28 (UTC), via `curl` with the same User-Agent as
  `scripts/build-fixtures.js`
- **SHA-256:** `4ff20e60a9e12e2150b49caaa5e757936751c142a3ca0926ac82e11152f7676f`
- **License:** the file's own header states: "This text of God's Word has been
  dedicated to the public domain."
- **Format:** tab-separated, one verse per line: `Book Chapter:Verse<TAB>Text`,
  preceded by 3 header lines. 31,102 verses, 66 books.
- **Committed byte-for-byte as downloaded** — never edited by hand and never
  written from model memory. To refresh it, re-run the download and update the
  hash here:

  ```sh
  curl -sS -A "scripture-grounding-mcp fixture builder" \
    https://bereanbible.com/bsb.txt -o data/bsb.txt
  shasum -a 256 data/bsb.txt
  ```

This file is the whole-Bible keyless corpus behind `src/bible.js` (chapter,
cross-chapter, and whole-book retrieval with no API key). The curated
per-passage fixtures in `fixtures/bsb/*.json` are still built from the same
source by `scripts/build-fixtures.js` and remain the ground-truth corpus for
the benchmark and misattribution search.
