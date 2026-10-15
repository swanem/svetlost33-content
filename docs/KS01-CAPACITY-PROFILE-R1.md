# KS-01 explicit shared validation profile

Implementation authority: `ks01-capacity-366-r1`, decision SHA-256
`5452b8728adad35a1fc300ec04967a3b70d3cac3a175b06136c9aff39b0c781b`.
This implements shared content validation. It does not approve content, select
minimum client versions, authenticate files, sign or publish a release.

Callers opt in by importing the named profile:

```js
import { KS01_CAPACITY_PROFILE as profile } from './scripts/validate-ks01-capacity.mjs';

const saints = profile.saints.parseSaintsPayload(saintsBytes);
const catalog = profile.catalog.parseCatalogPayload(catalogBytes);
const browser = profile.browser.parseCalendarBrowserPayload(browserBytes);

// Host contexts must come from independently authenticated files in one generation.
const result = profile.catalog.searchCatalog(catalog.payload, catalogContext, {
  query: 'Јован', locale: 'sr-Cyrl', year: 2026,
  calendar_profile_id: 'spc-rs-ba-julian-v1',
});
const feasts = profile.browser.upcomingBrowserFeasts(browser.payload, browserContext, {
  from_date: '2026-10-08', locale: 'sr-Cyrl',
});
```

Check each parse result's `valid` flag before reading its payload. The API names,
result shapes, rejection ordering and authenticated host-context requirements
match the existing v1 APIs. Profile selection is a caller implementation choice;
there is no payload field or downloaded setting that raises limits.

| Bound | Historical default | Explicit KS-01 |
|---|---:|---:|
| Saints articles | 64 | 366 |
| Saints raw UTF-8 bytes | 262,144 | 1,572,864 |
| Catalog sources | 256 | 512 |
| Catalog subjects | 256 | 512 |
| Catalog article links | 256 | 512 |
| Catalog raw UTF-8 bytes | 524,288 | 1,048,576 |

All other bounds remain unchanged, including browser bytes/memberships, saints
sources/days, catalog observances, per-record source counts and global transport
limits. Counts and raw bytes are simultaneous constraints, not a guarantee that
every field may reach its maximum at once.

The historical schemas and default validator files remain byte-identical.
`scripts/ks01-capacity/schemas.mjs` derives the same closed shapes with exactly
four explicit array-count changes. The additive saints/catalog semantic modules
contain ordinary static code and share existing safe date/transliteration/module
helpers. They do not load or rewrite validator source, evaluate strings, or
import the synthetic fixture's test-only reference implementation. Static semantic
blocks are intentionally separate so historical source hashes and fixtures remain
reproducible; shared semantic corrections must be reviewed in both profiles.

The browser profile reuses the unchanged browser parser, structural validation,
eligibility and archive API. Only upcoming-feast evaluation selects the KS-01
catalog evaluator, preventing an expanded catalog from accidentally going
through the historical 256-row/512 KiB gate. Exact catalog hashes and generation
checks remain mandatory.

Targeted verification:

```sh
node --test tests/ks01-capacity-profile.test.mjs
```

This suite checks hash-pinned 62/A/104/366 fixtures, legacy 64/65 rejection,
366/367, 512/513 collections, exact/+1 raw bytes, script parity, closed shapes,
duplicates, approval and exact bindings. Synthetic fixtures remain nonpublishable.
Real expanded content must be approved and measured before release; native
performance/retention acceptance and whole-release signed minimum-client gating
remain separate requirements. Existing callers continue to use historical limits
until explicitly switched by an authorized exporter or implementation.
