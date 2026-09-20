# Bible reference v1 — shared semantic adapter

Scope: SPEC v0.27 TR-02/TR-08/TR-09 and implementation I0/I1. This is a shared **in-memory semantic contract and test fixture**, not a new production module, schema field, trust anchor, translation, manuscript or authorization. Published payload bytes remain unchanged. Production authentication remains the existing M0 signature/hash/dependency/approval gates; passing this validator does not authenticate content or confirm a liturgical schedule.

## Reference and identity

```json
{
  "book_id": "MAT",
  "translation_id": "VUK_KARADZIC_EBIBLE_SRP1868",
  "versification_id": "EBIBLE_SRP1868_SOURCE_CHAPTER_AND_VERSE",
  "ranges": [
    {"start": {"chapter": 1, "verse": 25}, "end": {"chapter": 2, "verse": 2}},
    {"start": {"chapter": 2, "verse": 5}, "end": {"chapter": 2, "verse": 6}}
  ]
}
```

The reference has exactly these four fields. Each range has exactly `start`/`end`; each endpoint exactly `chapter`/`verse`. Endpoints are positive integral JSON numbers representable without loss (JavaScript safe integers); strings, zero, fractions and invented verse-zero superscriptions are invalid. `ranges` is required, nonempty, at most 64 ranges; selection is limited to 4,096 verses. A valid book ID alone is not a valid passage. Identity never comes from parsing a UI label.

| Semantic book | Existing source adapter | Translation identity | Versification identity |
|---|---|---|---|
| `PSA` | `psalms[].psalm_number` is chapter; `id: psalm-N` remains the unmodified resource ID | `danicic-ebible-srp1868`, existing cycle `quote.translation_id` | `DANICIC_EBIBLE_SRP1868`, existing Psalm/quote `numbering` |
| `MAT`, `MRK`, `LUK`, `JHN` | Existing Gospel `books[].id`, `chapters[].number` | `VUK_KARADZIC_EBIBLE_SRP1868`, existing `books[].text_base` | `EBIBLE_SRP1868_SOURCE_CHAPTER_AND_VERSE`, existing Gospel root `numbering` |

`PSA` is an explicitly normalized book identifier for Psalms, **not an existing production `book_id` field or a renamed `psalm-N` resource**. Gospels do not have a production `translation_id`; the adapter uses their existing `text_base` identity without adding a wire field. Calendar names map only as `Matthew→MAT`, `Mark→MRK`, `Luke→LUK`, `John→JHN`; `segments` maps losslessly to `ranges`. Preserve source IDs/URLs, translation and versification values. Unknown identity/numeration is unavailable, never guessed.

## Range policy and text

- Preserve range order. Within one reference, each start is at or before its end; a later start must be strictly after the previous end. Reject reversed, duplicated, overlapping or unordered ranges. Adjacent ranges are allowed and retained, not merged for display. Do not sort/repair a source passage.
- Validate every selected chapter and verse, including all intervening records in cross-chapter ranges; existing endpoints alone are insufficient. Require exactly one record for each selected verse and nonempty source text, chapter bounds and source ID. Gaps/duplicate selected records are rejected.
- Independent `calendar.days[].gospel.readings` retain the recorded order and are **not globally sorted or merged**. The current calendar includes dates whose separate readings are intentionally not ascending by chapter.
- Quote equivalence is exact **UTF-8 byte equality** to the ordered selected verse text joined with one U+0020 space. No trimming, ellipsis removal, NFC/NFD normalization, canonical-equivalence substitution, paraphrasing, added superscription or scripture rewriting. Swift `String ==` alone is insufficient because it accepts canonically equivalent composed/decomposed text; compare UTF-8 byte sequences. The fixture rejects an NFD Latin quote against unchanged NFC source bytes. Apply the same exact text policy to asserted formatted labels and attribution. Locale selects that same generation's `sr-Cyrl` or `sr-Latn` corpus. Superscriptions and headings remain separate original metadata.
- The complete reference may be navigation-only (no quote). If quote/label/attribution/source IDs are supplied, they must match. `source_ids` is the unique chapter source IDs in first-encounter order. Calendar source IDs describe who supplied the reading selection, not the source of the Bible text.
- Approved widget excerpts remain separate objects under their frozen `widget-excerpt-v1` gate. Their text, boundaries and stored reference are not rewritten or incorrectly required to equal the complete parent quote. New UI can format their own approved verse subset via this semantic adapter.
- `lxx_psalm_number` may describe whole-Psalm correspondence only. `lxx_verse_mapping:null` is not a mapping; do not subtract/add an offset, label the Daničić text LXX or manufacture corresponding verses. A reference requesting `LXX` is rejected as unknown versification until separately reviewed mapping exists.

## Display and local attribution

Only `sr-Cyrl` and `sr-Latn` are supported here. Book labels are `Псалам/Psalam`, `Мт/Mt`, `Мк/Mk`, `Лк/Lk`, `Јн/Jn`. Format `book chapter, verse`; use U+2013 en dash without surrounding spaces for a range, omitting the second chapter only within one chapter. Separate ranges with semicolon plus one space; each range repeats its chapter. No internal edition identifier or translator suffix in the main label.

| Example | Cyrillic | Latin |
|---|---|---|
| Psalm | `Псалам 16, 7` | `Psalam 16, 7` |
| One chapter | `Мт 19, 16–26` | `Mt 19, 16–26` |
| Cross chapter | `Јн 5, 30–6, 2` | `Jn 5, 30–6, 2` |
| Multiple ranges | `Мт 1, 25–2, 2; 2, 5–6` | `Mt 1, 25–2, 2; 2, 5–6` |

Passage attribution is exactly `Превод: Ђура Даничић` / `Prevod: Đura Daničić` for Psalms and `Превод: Вук Караџић` / `Prevod: Vuk Karadžić` for the four Gospels. The original Gospel bibliography may give his fuller name, Vuk Stefanović Karadžić. A combined Bible rights record is not a reason to attribute each passage to both translators. No blanket Bible attribution for prayers or saints.

Local **О извору / O izvoru** uses the existing generation's source record(s), original translation/edition metadata, existing rights/licence record and numeration notes. `publisher: eBible.org` is not the translator or author. Localize UI field labels, not original bibliographic metadata, source publisher/author, URLs, stable IDs or snapshots. Preserve source metadata in its supplied language/script; do not invent new platform-specific translations. The fixture includes original translation, source URL and non-verse metadata from the current corpus as test context. It is not a new rights attestation or a full replacement source registry.

## Route and generation binding

Test input shape is `{locale, reference, quote?, formatted_label?, attribution?, source_ids?, route?}`. Optional `route` is `{generation_id, reference, legacy_target_id?}`. Its reference must have the same identities and exact ordered ranges, and its generation must match the caller's selected corpus generation. JSON object key order is not identity; ordered range arrays are. A valid but different verse is still the wrong destination. Do not navigate by formatted label or silently use an older/newer generation's passage.

`legacy_target_id` is an extra consistency check for existing resource navigation: single-Psalm references use `psalm-N`; Gospels use their book ID. A cross-Psalm reference can be semantically valid, but **cannot be represented by the existing single-Psalm resource route**. Supplying that legacy target for a multi-Psalm passage yields `unsupported_legacy_route`. The positive cross-Psalm fixture exercises semantic selection only and omits a legacy target; it does not claim the current single-Psalm reader implements that route. Native callers must refuse unsupported navigation, not truncate to the first Psalm. Future typed-route support is distinct from this adapter.

The corpus context's `generation_id` is supplied by the already verified native generation; the string alone is not authentication. Keep captured reading context during an OTA change or explicitly report unavailable/re-resolve safely. This contract does not alter M0 rollback, signature, dependency or expiry checks. Select the annual library by its existing identity/capabilities, **not merely `module_type: library`**: `saints-v1` also has library type.

## Shared fixture and evaluator

- Fixture: `fixtures/bible-reference-v1/cases.json` (UTF-8 JSON, final newline).
- Validator/adapters: `scripts/validate-bible-reference-v1.mjs`.
- Deterministic generator: `scripts/generate-bible-reference-fixtures.mjs`; default verifies existing bytes, `--write` intentionally regenerates the test artifact.
- Tests: `tests/bible-reference-v1.test.mjs`.

Fixture root has `schema_version: svetlost33-bible-reference-test-fixtures-1`, `purpose: TEST_ONLY_ADAPTER_NOT_PRODUCTION_WIRE_FORMAT`, exact immutable `source_bindings` (path/bytes/SHA-256), a default `context`, and `cases`. This is a deliberately partial corpus containing complete selected chapters in both scripts, not production coverage.

Context is `{generation_id, books:[{book_id, translation_id, versification_id, locale, chapters:[{number,verse_count,source_id,verses:[{number,text}],...originalMetadata}],...originalMetadata}]}`. Each case contains `id`, `input`, `expected`, and optional `context_override`, which **replaces the entire default context** to test missing/duplicate records. Native tests should execute every case, not only decode the fixture or count records. Positive expected results contain exact `valid:true, reason:null, label, attribution, text, verse_keys, source_ids`; negative results are `{valid:false,reason}`. `verse_keys` is test identity `BOOK:chapter:verse`, not a new production ID.

Evaluation order is context → locale → reference shape → book → translation → versification → nonempty/count ranges → each range shape/order/chapter/verse/source → quote → label → attribution → sources → route generation/reference/legacy target. Negative cases isolate their intended failure. Reasons are stable test outcomes, not user-facing UI messages. Source-only bibliography outside the available corpus must remain bibliography, not a falsely active internal link.

## Candidate gates and legacy baseline

`validateBibleCandidate` adapts candidate Psalm/Gospel files and checks all complete daily quotes, action targets/highlights, source actions, and each calendar reading. The real annual export and widget-excerpt prepare paths invoke its throwing gate before producing candidates; their existing signers therefore retain the same upstream checks. This adds semantic validation alongside existing approvals and signed transport; it does not mutate the payload or sign/publish anything itself.

The old stored Psalm label `Пс N,V–V · Даничић` / `Ps N,V–V · Daničić` is checked against the existing contiguous quote's identity without demanding new display typography in unchanged bytes. Calendar `source_reference` is checked against the recorded book, zachalo and segments with its existing `Јеванђеље по …, зачало N. C,V-V` grammar (cross-chapter supported; `-`/`–`, optional post-comma spacing and `; ` for disjoint segments). This parsing verifies legacy metadata only; runtime identity still comes from typed fields. Unsupported source-label grammar blocks a new candidate for editorial review rather than guessing or silently changing it. Future additional formats need explicit reviewed adapter tests.

Read-only baseline on the current S6 graph: 42 complete daily quotes (21 per script), 252 calendar readings per script, all selected intermediate verses and 22 cross-chapter readings per script pass. There are no real multi-segment calendar readings yet; the multi-range fixture is a technical selection of existing verses, not a new liturgical assertion. Existing labels are semantically consistent but retain old typography; source payloads retain historical draft flags superseded by later signed approval evidence. Neither is silently rewritten. UNRESOLVED calendar days remain unresolved; a valid text range does not establish service assignment, comprehensive saint coverage, theological review or a complete church schedule.

If later legacy defects are discovered, record exact generation/path/hash and failure separately and correct only through a new approved content revision. Do not weaken the new-candidate rule or change old signed bytes. The CLI semantic audit reads local production paths only and expressly reports that it does not perform authentication; publication must still run the existing transport gates.
