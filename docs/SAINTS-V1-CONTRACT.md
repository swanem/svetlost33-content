# Saints v1 — optional short editorial library

Status: owner-approved seven-text implementation pilot, 19–25 September 2026.
The exact manuscript approval is `approvals/saints-pilot-2026-09-19/owner-approval.json`.
The approved manuscript SHA-256 is `5847568a2aab22446ef4ab875fbceceecc9e800fad9344e5f23df59c4931ee2a`.
This contract and its unsigned fixtures do not authorize production signing,
activation or publication. They do not claim clerical review or a complete list
of commemorations. Existing M0 signatures, byte hashes, minimum-client checks,
anti-replay, dependency checks and atomic activation remain unchanged.

## Transport identity and compatibility

| Field | Exact v1 value |
|---|---|
| module ID | `saints-v1` |
| module type | `library` |
| release entry `required` | `false` |
| manifest capabilities | `["saints-v1"]` |
| payload path | `data/saints-v1.json` |
| media / encoding | `application/json` / `utf-8` |
| payload schema | `svetlost33-saints-1` |
| payload version / revision | Exact manifest version / revision |

This is a separate article library, not the annual reading library. Native
projectors select their annual library by supported identity/capability; they
must not merge all `library` modules or reject two differently identified
libraries. A client lacking `saints-v1` must skip this optional module after
authenticating its manifest and before reading its payload or dependencies.
Annual source-commit/provenance extraction must also select the annual library;
do not count every `library/evidence/owner-approval.json` as annual provenance.
The saints library may legitimately carry its own separate owner approval.
No new M0 type enum is introduced. `module_type: saints` is invalid here and
would cause old parsers to reject an entire candidate before optional skipping.

For this pilot the manifest dependency is
`[{"module_id":"calendar-2026-r1","version":"2026.1.1"}]`.
The payload additionally binds its exact calendar revision, path and file hash.
A future changed calendar requires a matching saints revision or omission of
the optional module. A missing declared dependency still rejects the candidate
under existing M0 rules; this feature does not weaken transport validation.

## Exact payload shape

`schemas/saints-v1.schema.json` is authoritative for the closed wire shape.
Every object rejects unknown keys. Arrays have unique IDs/references as checked
by `validate-saints-v1.mjs`. The following is a structural sketch; ellipses are
documentation only. The complete valid seven-article example is
`fixtures/saints-v1/saints-v1.json`.

```text
{
  schema_version: "svetlost33-saints-1",
  version: "2026.9.19", revision: 1,
  approval_id: "saints-pilot-2026-09-19-owner-r1",
  review_status: "approved" | "draft" | "rejected",
  authorship: {
    kind: "editorial_summary", assistance: "ai",
    attribution: {"sr-Cyrl": string, "sr-Latn": string},
    clerical_review: null
  },
  calendar_binding: {module_id: string, version: string, revision: integer,
                     path: string, sha256: string},
  sources: [{id: string, kind: "calendar" | "article", title: string,
             url: string, publisher: string, original_author: string | null,
             published_on: "YYYY-MM-DD" | null, reviewed_on: "YYYY-MM-DD"}],
  articles: [{id: string, revision: integer, type: "saint" | "group" | "feast",
              subtype: null | "feast" | "commemoration_of_event",
              source_ids: [string],
              content: {
                "sr-Cyrl": {title: string, intro: string, body: [string], takeaway: string},
                "sr-Latn": {title: string, intro: string, body: [string], takeaway: string}
              }}],
  days: [{date: "YYYY-MM-DD", julian_date: "YYYY-MM-DD",
          calendar_title: {"sr-Cyrl": string, "sr-Latn": string},
          calendar_source_ids: [string], article_ids: [string],
          complete_saint_list: false,
          calendar_notes: [{kind: "forefeast" | "leavetaking",
                            label: {"sr-Cyrl": string, "sr-Latn": string},
                            related_article_id: string, source_ids: [string]}]}]
}
```

Article IDs are stable editorial identities, not calendar titles, civil dates
or asserted IDs of every saint. `type: feast` requires a non-null subtype;
`saint` and `group` require null. Article sources must have `kind: article`;
calendar sources are not sufficient evidence for a biography. Source publisher
and original source author remain separate from authorship of this new summary.
Source bibliographic strings remain in their original script and are not
presented as authored by the summary's editor. Rights are recorded separately
as the owner's attestation, not an invented public license.

`body` is an ordered paragraph array. `intro + body + takeaway` contain the
approved 100–200-word short text. The UI labels for these sections are local UI
strings, not part of the reading or word count. Metadata and editorial warnings
from the Markdown manuscript are not reader prose. Rendering is plain text:
no Markdown/HTML execution, embedded remote pages, images, audio or web scraping.
Source URLs may only open externally after an explicit user action; syntactic
URL validity does not certify a publisher or redirect destination.

## Exact calendar binding and day resolution

The pilot binding is:

```json
{
  "module_id": "calendar-2026-r1",
  "version": "2026.1.1",
  "revision": 2,
  "path": "data/calendar.2026.json",
  "sha256": "a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c"
}
```

The host supplies this identity from the genuinely verified active calendar
manifest/file record, never by copying the saints payload's claims. Both
calendar and saints content must be authenticated by M0 or the existing
equivalent verified bundled-content mechanism. `review_status: approved` is
editorial state and never authenticates bytes.

Select by civil date in the user's local time zone. Never substitute the
reading's effective day, a manually selected Morning/Day/Evening period, a
publication date, today's date for an archive request, or a calculated annual
recurrence. Dates outside the explicitly supplied day mappings have no article.
No 2027 mapping is implied by this 2026 pilot.

For the requested date, exactly one active calendar day must match. Require:

- exact `date` and `julian_date`;
- active `commemoration.status == SOURCE_RECORDED`;
- byte-for-byte UTF-8 equality of `commemoration.title_cyrl` and
  `calendar_title.sr-Cyrl`, without trimming, normalization or title inference;
- exact ordered equality of active `commemoration.source_ids` and
  `calendar_source_ids`;
- active `commemoration.complete_saint_list_verified == false` for this v1
  selected-commemorations contract.

The existing calendar contains no authoritative Latin title. Latin calendar
title, notes, article title/prose and attribution must equal the deterministic
transliteration of their Cyrillic counterparts. Use the existing Android
ContentParser character mapping (`Љ→Lj`, `Њ→Nj`, `Џ→Dž`, and lowercase forms),
with all other characters unchanged. Do not apply normalization or locale-aware
uppercase rewriting. The exporter performs this conversion; readers consume
and validate the supplied scripts without runtime content translation.

Forefeast on 20 September and leavetaking on 25 September are separate notes
linked to `nativity-theotokos`. A note must reference an existing `feast`
article, cite only its day's calendar source IDs, and have its exact Cyrillic
label present in that day's canonical title. These notes are not saint
biographies. The original calendar name remains authoritative and visible.

## Limits and validation

| Item | Limit |
|---|---|
| Raw UTF-8 payload bytes, including whitespace | 262,144 (256 KiB) |
| Articles / sources / mapped days | 64 / 512 / 366 |
| Article or calendar source references | 1–8, unique |
| Article references per day | 1–8, unique |
| Notes per day | 0–4; no duplicate note kind |
| Stable IDs and versions | 3–64 ASCII `[a-z0-9][a-z0-9._-]{2,63}` |
| Revisions | Integer 1–9,007,199,254,740,991 |
| Article title, localized label/attribution | 1–200 Unicode scalar values |
| Source title, publisher, original author | 1–300 Unicode scalar values |
| Source URL | HTTPS, at most 2,048 characters |
| Intro / takeaway | Each 1–1,000 Unicode scalar values |
| Body | 1–8 paragraphs, each 1–3,000 Unicode scalar values |
| Intro + body + takeaway, joined by one space | 100–200 words and ≤4,000 Unicode scalar values per script |

The 64-article cap is a real v1 library limit, not a promise of year-round
coverage. Future additions remain within it or require an explicit contract
revision; the 366-day mapping limit does not imply 366 supplied articles.

Word splitting uses exactly Unicode White_Space code points:
`U+0009–000D,0020,0085,00A0,1680,2000–200A,2028–2029,202F,205F,3000`.
Count nonempty tokens after joining prosaic fields with one ASCII space. Titles,
section labels, dates, metadata, attribution and source records are excluded.
No language-specific tokenizer is used. Scalar counting is not UTF-16 length.

Fatal UTF-8 decoding and raw-byte bounds precede JSON parsing. Invalid shape,
duplicate IDs/dates, dangling/wrong-kind references, missing script, script
parity failure, unpaired surrogates, control characters, angle brackets, bidi
embedding/isolation controls or leading/trailing whitespace invalidate the
entire optional payload, not selected fragments. Source URLs reject credentials,
non-HTTPS, explicit nondefault ports, local/IP hosts, whitespace/backslashes and
encoded control/backslash characters; URL fragments are allowed as citations.
Real calendar dates are validated without Date.parse normalization; Julian leap
years use divisibility by four, not Gregorian century rules. The binding checks
the actual supplied Julian label; it never synthesizes a second calendar table.

## Shared parser and eligibility API

```js
parseSaintsPayload(utf8Bytes)
// {valid:true, reason:null, payload} or {valid:false, reason}
validateSaintsPayload(payload)
// {valid:true, reason:null} or {valid:false, reason}
evaluateSaintsDay(payload, {
  contentAuthenticated: true, // only AFTER trusted host verification
  moduleContext: {
    module_id: 'saints-v1', module_type: 'library', required: false,
    capabilities: ['saints-v1'], payload_path: 'data/saints-v1.json',
    version: '2026.9.19', revision: 1
  },
  calendarAuthenticated: true, // only AFTER trusted host verification
  calendarContext: {module_id, version, revision, path, sha256, days},
  date: '2026-09-19'
})
// {eligible:true, reason:null, day, articles} or {eligible:false, reason}
```

Calendar `days` are the host's parsed active canonical days, not this module's
`days`. The transport has already matched actual payload bytes/hash. Runtime
must not set authentication flags merely because a local fixture exists or
because the payload contains approved status/hash strings. No new rollback,
trust key, alternate authoritative calendar, discovery URL or production
activation path is added.

Deterministic rejection precedence: `absent`, `unsupported_schema`, `malformed`,
`unapproved`, `content_not_authenticated`, `module_mismatch`,
`calendar_not_authenticated`, `calendar_mismatch`, `invalid_date`,
`uncovered_date`, `calendar_day_mismatch`. Structural failure invalidates the
whole optional library; a valid library's mismatched active day disables only
that day. In every case normal calendar text and reading remain available.
Never fall back to an unrelated article or use a cached article with a different
calendar identity. Bad M0 signatures/hashes still reject a candidate through
existing transport behavior and retain the prior valid generation.

## Deterministic export and shared tests

`export-saints-pilot-v1.mjs` reads, but never changes, the approved Markdown,
pilot metadata, owner approval and exact canonical calendar. It checks the
manuscript hash, exports only named reading sections, derives Latin once, and
validates all seven day links. It does not sign, modify indexes or contact a
service. `--write-new` creates only the fixed development fixture files and
refuses to overwrite; `--check` verifies byte-identical reproducibility.

```sh
node scripts/export-saints-pilot-v1.mjs --check
node scripts/validate-saints-v1.mjs fixtures/saints-v1/saints-v1.json
node --test tests/saints-v1.test.mjs
```

`fixtures/saints-v1/expected.json` contains the payload hash/bytes, script word
counts, both calendar-note expectations and shared positive/negative day cases.
For tests only, load the exact hash-checked canonical calendar at its documented
repository path and construct the host context; no secondary calendar fixture
becomes runtime authority. Each mutation replaces/adds a property in a fresh
deep copy using string keys or zero-based array indexes. Native test suites can
consume the same cases. Development fixtures are not authenticated production
modules and must not silently enter a production runtime bundle.
