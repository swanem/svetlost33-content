# Liturgical catalog v1 — frozen I2 technical contract

Status: **technical freeze reviewed and approved by coordination on 2026-09-20**. This freezes the technical contract/schema and shared 79-case suite, not the metadata's owner approval. Implements only the bounded I2 metadata/catalog contract referenced by canonical SPEC v0.27 TR-03/TR-08/TR-09. It does not replace the product specification, approve new religious text, authorize publication, migrate preferences or implement I3–I6. Candidate metadata remains `review_status: pending`, `approval_id: null`. Test-only approved states are synthetic test inputs, never owner approval records.

## Transport

| Field | Value |
|---|---|
| module ID / capability | `liturgical-catalog-v1` / `["liturgical-catalog-v1"]` |
| module type / required | `library` / `false` |
| exactly one manifest payload | `data/liturgical-catalog-v1.json` |
| payload format / encoding / schema | `application/json` / `utf-8` / `svetlost33-liturgical-catalog-1` |
| payload version / revision | exactly the verified manifest values |
| raw UTF-8 payload limit | 524,288 bytes (512 KiB), before parsing |

Existing M0/calendar/saints wire shapes and bytes stay unchanged. The existing manifest record uses `content_type: application/json` and `encoding: utf-8`; do **not** add a `media_type`/`mediaType` field. All objects in the new payload are closed. Existing M0 allows at most 16 unique module IDs; S6 has five, the catalog makes six. A fuller existing profile with optional backgrounds may make seven: native known-role bounds must account for that without ignoring unknown required roles. Native projectors distinguish annual Bible, saints and catalog libraries by ID/capability, not the first/all `library` modules.

Existing platform transport behavior is deliberately preserved, not redesigned by I2:

| Validator/client | Unknown optional capability | Bad optional manifest or supported optional payload | Missing dependency of a downloaded supported module |
|---|---|---|---|
| Node content reference validator | Verify manifest, skip payload and that module's dependency assertions | Reject candidate | Reject candidate |
| iOS audited updater | Verify manifest, skip unsupported module | Reject candidate, keep previous generation | Reject candidate, keep previous generation |
| Android audited updater | Skip unsupported module; optional failures are caught | Existing skip/retention policy, not whole-release failure in every optional-error case | Existing global downloaded-set dependency gate rejects candidate |

Skipping one module's dependency assertions does not skip independent calendar/saints modules in the release. Do not add broad dependency pruning or alter rollback/retention policy. In particular a retained Android optional revision must pass the new resolver's exact **generation triple AND payload bindings** before it can expose a date/article. Semantic rejection makes catalog functionality unavailable, not a new transport rule. `tests/liturgical-catalog-transport.test.mjs` proves Node behavior only; native regression evidence remains separate.

Dependencies are the unique exact `module_id + version` pairs actually referenced by `calendar_bindings` and `article_bindings`, sorted by module ID. The initial calendar dependency is `calendar-2026-r1@2026.1.1`. Add `saints-v1@2026.9.19` only when article links exist. Do not declare nonexistent 2027 modules, add a Bible dependency without using Bible content, or silently fetch dependencies from another generation. Payload binding additionally checks revision/path/SHA-256. Release min-client values remain separately reviewed release metadata: no production min-client change is authorized here; native clients need the new capability/parser first.

## Closed payload

```text
{
 schema_version, version, revision,
 review_status: "pending" | "approved" | "rejected", approval_id: string | null,
 calendar_profiles: [{id, name:{sr-Cyrl,sr-Latn}}],
 sources: [{id,title,url,publisher,original_author:string|null,
            checked_on:date|null, review_status:"pending"|"reviewed",
            rights_status:"pending"|"recorded_elsewhere"}],
 subjects: [{id,type:"saint"|"group",name:{sr-Cyrl,sr-Latn},aliases,
             source_ids,review_status:"pending"|"reviewed"}],
 observances: [{id,kind:"saint_commemoration"|"group_commemoration"|"feast"|"event",
               name:{sr-Cyrl,sr-Latn},description:{sr-Cyrl,sr-Latn},
               subject_ids,aliases,source_ids,review_status}],
 calendar_bindings: [{id,calendar_profile_id,year,module_id,version,revision,path,sha256}],
 occurrences: [{id,observance_id,calendar_binding_id,date,julian_date,
                calendar_title:{sr-Cyrl,sr-Latn},calendar_source_ids,
                source_ids,review_status}],
 day_reviews: [{calendar_binding_id,date,julian_date,calendar_title,
                calendar_source_ids,status:"confirmed_none"|"unresolved",
                source_ids,review_status}],
 article_bindings: [{id,module_id,version,revision,path,sha256}],
 article_links: [{observance_id,article_binding_id,article_id,source_ids,review_status}],
 legacy_slava_links: [{legacy_id,observance_ids,review_status}],
 coverage: [{calendar_profile_id,year,calendar_binding_id:string|null,
             status:"limited_catalog"|"unavailable",mapped_dates,occurrences,
             complete_saint_list:false}]
}
aliases = [{text,locale:"sr-Cyrl"|"sr-Latn",kind:"popular"|"name_variant"|"legacy_label",source_ids}]
```

Frozen v1 array caps: profiles 4, sources 256, subjects 256, observances 512, calendar bindings 4, occurrences 2,048, day reviews 1,464, article bindings 4, article links 256, legacy links 64, coverage records 8. At most eight aliases/source references per entity, eight subjects per observance, eight candidate observances per legacy link. IDs use the existing 3–64-character ASCII M0 identity grammar. Names are at most 200 Unicode scalars, descriptions 300, aliases 120; all reader-facing strings are plain text. No HTML/Markdown execution, unsafe control/bidi characters, network scraping or query telemetry.

An article ID is only an article identity, never a saint ID. A saint may have several observances; a group is not automatically split into persons. A feast/event may have no person subject. Observance aliases may intentionally collide. Legacy wallpaper IDs are inventoried as migration candidates, not authoritative entity/date sources and not automatically written into settings.

`calendar_profiles` explicitly declares the intended SPC/RS/BA profile; location never chooses it. Initial profile ID is `spc-rs-ba-julian-v1`. Calendar bindings are yearly, while subjects/observances/articles remain stable. Initial 2026 binding is calendar module `calendar-2026-r1`, version `2026.1.1`, revision 2, path `data/calendar.2026.json`, SHA-256 `a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`. There is no approved 2027 calendar binding in this candidate.

## Calendar and article resolution

The host supplies independently authenticated module identities, payload records, calendar days and `generation: {id, sequence, decision_sha256}`. `id` is a nonempty generation ID, `sequence` is a positive safe integer, and `decision_sha256` is the 64-lowercase-hex digest of the verified discovery/index decision. All three values must equal the root context's triple on the catalog module, every bound calendar context and every supplied bound article context. Same ID with a different sequence or digest is rejected. Never authenticate a binding from the catalog's own claims. Binding equality is exact module/version/revision/path/hash. An occurrence date must belong to its binding year; the unique active calendar day must match exact date, Julian date, ordered source IDs and original Cyrillic title (UTF-8 bytes, no Unicode normalization; Swift canonical string equality is insufficient). Latin title is the deterministic transliteration, not an independent authority. Require `commemoration.status == SOURCE_RECORDED`; do not require that the incomplete calendar title enumerate every linked subject, but require separately reviewed evidence for that link.

The calendar's title remains the visible canonical calendar title, even when an alias or a separately sourced additional commemoration is found. Catalog occurrences are checked assertions against that verified day, not a second independently authoritative date table. No annual recurrence, arithmetic +13, Easter calculation, publication-date inference or copying readings into 2027.

No occurrence/day review for a date means **uncovered/unknown**, never confirmed absence. `day_reviews.confirmed_none` means explicitly reviewed absence of links within this catalog's declared limited scope, not "no saints today" or a complete liturgical schedule. It must bind an actual verified calendar day and reviewed sources; it cannot coexist with occurrences for that date. `unresolved` is distinct, and cannot supply confirmed dates. The initial candidate has no confirmed-none claims. Coverage counts are derived from the catalog rows, not a claim that the underlying 365-day calendar has complete saint coverage. 2027 is explicitly unavailable **for this observance catalog**, with zero mapped dates/occurrences and null binding; this does not deny the separate existing 31-day January fasting fallback in the apps.

Article links resolve only against an exact authenticated saints payload in the same generation triple, its existing approved status and exact calendar binding; `authenticated` must be boolean `true`, not truthy text. The article must exist and have a compatible saint/group/feast type for the observance. They do not copy prose or bypass saints-v1's 64-article/256KiB limits. Missing, unapproved, mismatched or unreviewed article content/link is reported by empty `article_ids`, separately from known catalog identity/date availability. A declared runtime dependency is nevertheless governed by existing transport rules. A 2027 search can return a stable identity and an existing correctly bound approved article while showing `date_state: unavailable`, empty dates and empty occurrence IDs: the article does **not** create a 2027 occurrence.

Global catalog approval is necessary but insufficient. An observance and all its linked subjects/source records must be `reviewed` to appear in runtime search. A pending occurrence must never contribute a date; a pending article link must never open a text. Sources marked reviewed require a checked date. These per-record checks do not turn a pending candidate into approved content. Candidate/editorial preview is separate from runtime APIs; no production `allowDraft` switch exists.

## Deterministic search

Search is local and has no query/result/saint ID logs or analytics. Search fields are observance canonical names and aliases plus canonical names/aliases of their explicitly linked subjects. Never search wallpaper art titles as religious aliases. Do not change stored display/bibliographic strings.

Normalize search keys only: use the same explicit Serbian Cyrillic→Latin map as saints-v1; lowercase ASCII A–Z plus ČĆĐŠŽ; replace `đ` with `dj`; apply Unicode NFD and remove combining U+0300–U+036F; extract `[a-z0-9]+` tokens joined by one ASCII space. Thus both scripts, case, `č/ć/c`, `š/s`, `ž/z`, `љ/lj` and `đ/dj` are supported; no fuzzy spelling or fabricated synonyms. Empty/punctuation/emoji-only query returns an empty-query state, not the whole catalog. Maximum query length is 128 Unicode scalars; a longer query returns `query_too_long`, never silent truncation.

Match rank: exact normalized field 0, full-field prefix 1, otherwise every query token prefixes some field token 2; unmatched fields do not match. Each observance appears once at its best rank. Sort by rank, then earliest verified occurrence date for the requested profile/year (missing dates sort last), then stable observance ID in ASCII order. At most 50 results with an explicit truncation flag. Different matching observances remain distinct; there is no automatic "best" selection. Results carry canonical name, kind, description, subject IDs and verified occurrences for the requested year, or explicit date-unavailable state. A query for a name in 2027 may return the known identity with no date; it must never reuse its 2026 date.

Both display scripts use supplied text with strict deterministic Latin parity. Bibliographic source strings retain their supplied original language/script and publisher/author distinction. Search normalization is deliberately not used for identity, source text, article matching or calendar binding (these use exact UTF-8 equality).

## Exact API and shared test harness

The production payload shape is defined by `schemas/liturgical-catalog-v1.schema.json`; the following host/test context is **not a new production wire format**. Generation and authentication values must originate in the existing verified native snapshot, never in the payload or user preferences.

```text
context = {
 generation: {id:string, sequence:positiveSafeInteger, decision_sha256:lowercaseSHA256},
 contentAuthenticated:boolean,
 moduleContext: {module_id,module_type,required,capabilities,payload_path,
                 version,revision,generation,dependencies:[{module_id,version}]},
 calendarContexts: [{module_id,version,revision,path,sha256,year,
                    generation,authenticated:boolean,days:[existingCalendarDay]}],
 articleContexts: [{module_id,version,revision,path,sha256,generation,
                   authenticated:boolean,review_status,
                   calendar_binding:{module_id,version,revision,path,sha256},
                   articles:[{id,type}]}]
}
```

Fixture contexts may also contain the catalog's binding `id` and profile/year annotations for readability; these are not authentication inputs. `moduleContext.dependencies` uses the deterministic sorted dependency sequence described above; JSON object key order is immaterial. Hosts must supply unique matching calendar contexts; duplicate matching contexts are unavailable. Article context duplication results in no available linked article. The complete matching generation triple is checked even when a supplied article is unapproved or otherwise unavailable, so stale retained-module metadata cannot silently cross generations.

Reference function signatures and result shapes:

```text
validateCatalogPayload(payload) -> {valid:boolean, reason:string|null}
parseCatalogPayload(utf8Bytes)   -> {valid:true, reason:null, payload}
                                  | {valid:false, reason:string}
evaluateCatalog(payload,context) -> {eligible:boolean, reason:string|null}
resolveCatalogDay(payload,context,{date,calendar_profile_id}) ->
  {eligible:false,reason:string}
  | {eligible:true,reason:null,state,occurrence_ids:[ID]}
searchCatalog(payload,context,{query,locale,year,calendar_profile_id}) ->
  {eligible:false,reason:string}
  | {eligible:true,reason:null,state,truncated:boolean,results:[{
      observance_id,kind,name,description,subject_ids:[ID],
      date_state:"source_recorded"|"unavailable",dates:[civilDate],
      occurrence_ids:[ID],article_ids:[existingArticleID]
    }]}
```

Day states are `source_recorded`, `confirmed_none`, `unresolved`, `uncovered`, `year_unavailable`. Day occurrence IDs are ASCII-sorted. Search states are `empty_query`, `matches`, `no_match`; results use the rank/date/ID order above. Within a result, occurrences sort by civil date then ID, dates are unique in that order, article IDs are unique ASCII-sorted, and subject IDs preserve the explicit stored order. No `reason` value is direct user-facing copy; native UI localizes the corresponding state. An unavailable article is an empty `article_ids` array, not a different guessed text or a forged reading route.

Rejection precedence is normative for shared tests:

1. Structural validation: absent → unsupported schema → malformed closed shape, unsafe/plain-text constraints, scalar/raw limits, IDs/relations/dates/parity/coverage. `parseCatalogPayload` checks the **raw** 512KiB bound and fatal UTF-8 before JSON parsing; BOM/invalid JSON fail malformed. Numeric booleans are not integers; revisions/sequences must be safe integers, not floating-point coercions.
2. Catalog runtime eligibility: unapproved → content_not_authenticated → module_mismatch (including version/revision/capability/required/dependencies) → catalog generation_mismatch → invalid_context for missing calendar/article arrays.
3. Calendar bindings in stored order: calendar_not_authenticated (missing/duplicate/non-boolean trust) → generation_mismatch → calendar_mismatch (exact identity/year) → calendar_day_mismatch (unique actual day, Julian date, recorded status, exact UTF-8 title, ordered source IDs, incomplete-list marker).
4. Supplied bound article contexts: generation_mismatch. Article authentication/type/approval/file-binding/calendar-binding problems otherwise suppress only linked articles at search resolution.
5. Day arguments: invalid_date → unknown_profile; then year_unavailable / reviewed occurrences / reviewed day assertion / uncovered. Search arguments: unsupported_locale → invalid_query → query_too_long → invalid_year → unknown_profile; then normalization, reviewed-record filtering, matching and deterministic sorting.

Fixture files are `fixtures/liturgical-catalog-v1/catalog-candidate.json` and `expected.json`. The candidate is the actual pending metadata draft; its hash/byte count and source file bindings are recorded in expected. The expected file's schema tag is `svetlost33-liturgical-catalog-test-cases-1`, purpose `TEST_ONLY_SYNTHETIC_TRUST_AND_REVIEW_NOT_OWNER_APPROVAL`. It contains `context`, `synthetic_test_setup_mutations`, `cases`, and descriptive `compatibility` entries. Each executable case has exactly:

```text
{id, operation:"evaluate"|"search"|"day", input,
 synthetic_setup:boolean, payload_mutations:[{path:[string|integer],value:JSON}],
 context_mutations:[{path:[string|integer],value:JSON}], expected:APIResult}
```

For **each** case: deep-clone decoded candidate and decoded context; if `synthetic_setup` is true, apply setup mutations to the candidate clone only; apply that case's payload mutations, then context mutations; invoke its operation and compare the complete result with `expected`. A mutation replaces the value at its path (numeric components address arrays); it does not merge/sort or normalize. Never mutate the baseline across cases. Setup marks metadata reviewed and supplies a conspicuously synthetic approval ID only inside the test harness. Production parsing/resolution has no equivalent bypass. Expected results are backed by independent fixed assertions for named identities, ambiguity order, year separation, pending/auth rejection and generation mismatch; deterministic regeneration alone is not proof of correctness.

The Node-only transport tests exercise ephemeral development keys in isolated temporary directories. They do not sign a production candidate or claim native transport parity; the platform policy table above and native regressions own those differences.

## Candidate and evidence boundaries

The small candidate contains 12 subjects, 15 observances, 13 bound 2026 occurrences, two proposed links to existing articles and all ten current offered-slava IDs. It covers Miholjdan/Kirijak, two distinct Nicholas observances, two Michael observances, the Peter/Paul group and Nativity feast. See [I2 source review](I2-CALENDAR-SOURCE-REVIEW.md) for exact source/legacy inventory and live-fetch limitations: this work does not claim a fresh refetch of the full 2026 calendar. Source review and owner approval remain separate. An existing approved article does not approve new subject identities/aliases/date links. Unknown personal slava values remain outside the closed candidate inventory; no settings migration is implemented in I2.

Current calendar titles for 22 November and 24 November mention other saints, not the offered Nektarije/Stefan Dečanski wallpaper labels. Because the calendar explicitly has an incomplete saint list, this is not evidence those commemorations are absent. Additional identity/date links require their own reviewed source evidence; wallpaper month/day is not evidence. Keep unresolved candidate gaps visible rather than rewriting those calendar titles.

Artifacts will include one deterministic candidate payload, the shared expected semantic/search/compatibility cases, exact repository source hashes and a separate coverage/source-review inventory. Runtime-approved test mutations must be prominently labeled synthetic; no production manifest, index, signature, owner approval or published artifact is created by this work.
