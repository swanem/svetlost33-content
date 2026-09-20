# Saved subjects v1 — I3 local semantics

Status: **technical freeze reviewed by coordination**, 2026-09-20. Implements canonical SPEC v0.27
TR-04 only. This is a shared native/test contract, NOT a remote payload, owner
content approval, production migration map or authorization to publish.
Existing frozen saints-v1, liturgical-catalog-v1 and M0 schemas stay unchanged.
Coordination reviewed the reference, 55 shared cases and independent parser
tests. The saved-subject suite passes 65/65; combined catalog/saints/transport
regression passes 210/210. These are Node results, not native UI or storage proof.

## Scope and identity

The key is exactly `{kind: "saint"|"group"|"observance", id: ID}`. ID uses
the existing ASCII M0 grammar `[a-z0-9][a-z0-9._-]{2,63}`; equality includes
kind and is byte-exact. Do not derive identity from article ID, name, date,
image, normalized search query or a similar saint. Text favorites and slava
preferences remain separate.

An explicit verified catalog search/detail result offers its **observance**
as the Save target. A saint/group context can offer its explicitly supplied
reviewed subject, but I3 need not add a new subject browser. For an article
opened without explicit catalog context, collect exact eligible reviewed
observance links to that article in the same authenticated generation: one
distinct observance allows Save; zero omits Save; more than one omits the
unqualified Save action (catalog search remains available for explicit choice).
Do not infer a person merely because an observance has a single subject.
An event such as the Miracle at Chonae remains an observance, not a save of
Archangel Michael. Duplicate links to one exact target do not add ambiguity.
The date-based **Danas slavimo** title/date alone never supplies a Save ID;
use the currently selected article's unique observance or an explicit catalog key.

Only existing validated/approved catalog resolution supplies trusted views.
Per-record reviewed status, source checks, exact calendar/article bindings,
generation `{id,sequence,decision_sha256}` and existing approval checks all
remain mandatory. Fixture booleans never become production authentication.

## Local persistence

Logical storage shape (native serialization may differ, semantics may not):

```text
{schema_version:"svetlost33-saved-subjects-local-1", entries:[
 {key:{kind,id}, last_known_name:{"sr-Cyrl":string,"sr-Latn":string}}
]}
```

- At most 256 unique typed keys; max serialized input 512 KiB. Closed objects;
  safe UTF-8/plain-text names 1–200 Unicode scalars, existing Serbian Latin
  transliteration parity. No timestamps, reading history, duplicated articles,
  dates or private user identifiers. Array order is most-recently-saved first.
- First save inserts at front. Saving an already saved key is idempotent:
  update its verified name without moving it. Explicit remove of absent key
  is a no-op. Removing and later explicitly saving inserts at front again.
- Save revalidates the **same key** in a snapshot of the current verified
  catalog inside the serialized mutation, after acquiring the lock/transaction,
  immediately before preparing the mutation. Do not capture the snapshot before
  waiting for that lock. Use its current name,
  never an untrusted incoming label. A key no longer available cannot be newly
  saved. Remove is permitted even without any content/catalog. UI confirmation
  follows successful durable persistence, not the tap.
- Mutations are serialized/transactional, with atomic replace and prior value
  preserved on write failure; no lost updates on double taps or rapid Save/
  Remove. Native store absent means valid empty; corrupt/unknown-version means
  unavailable/read-only, original bytes retained, not automatic empty reset.
  Do not use a preference decoder that clears unrelated settings on failure.
  Keep this store separate from `AppSettings.favorites` and other preferences;
  on Android do not install a corruption handler that replaces it with empty data.
- OTA activation never writes/clears this store. Current verified names are
  preferred for display; last-known labels persist after a successful explicit
  save and may be refreshed transactionally from a trusted same-key view.
  Such refresh does not reorder or create entries, and failure is non-destructive.
- Storage survives normal upgrade/relaunch/offline. No app-level cloud sync.
  Inspect native OS backup behavior; do not promise 'never leaves device' if
  system backups include it. Do not silently change all-app backup policy.

## Display and opening

One unobtrusive entry **Sačuvani svetitelji i praznici** / **Сачувани светитељи
и празници** in Čitanje, separate from text favorites and without a new main
tab. Empty state explains Save from a supported detail. Each row has the
current verified canonical name or last-known localized name, an honest
availability label where necessary and explicit Remove. No dates are guessed.
Buttons have accessible labels/state; heart alone is insufficient.

Resolving an opening takes one latest verified generation snapshot, not the
historic generation at save time. For observance use its reviewed bound
article links. For saint/group use reviewed observances explicitly containing
the matching subject, then their reviewed bound links. Each link must pass the
existing resolver in that same generation; do not mix retained article bytes
from another generation or silently fall back to cached historic prose.

Deduplicate identical `{article_binding_id,article_id}` targets; preserve all
linked observance IDs as provenance and sort those IDs ASCII. Sort targets by
article_binding_id then article_id (ASCII). With zero articles show the known
identity and 'Tekst trenutno nije dostupan.' With one open the exact article;
with multiple show a titled selection list, never silently select first.
Selection creates the existing pinned reader context including exact generation
and binding. Further OTA must not change that open text, position or Back path.
Local Save status may change without replacing the reader's content.

Availability (names are conceptual test enums, not raw UI text):

| State | Meaning / UI |
|---|---|
| `catalog_unavailable` | no eligible current catalog; keep fallback name/Remove |
| `identity_unavailable` | key absent/unreviewed in eligible catalog; keep name/Remove |
| `text_unavailable` | identity known, no valid article target; canonical name/Remove |
| `one_article` | one exact current verified target |
| `choose_article` | multiple exact current verified targets, explicit selection |

Unavailable date/year alone does not invalidate a known identity or an
independently valid article. Catalog absence is NOT proof of withdrawal.
No current schema has a tombstone/withdrawn field; do not display 'withdrawn'
or delete a record based on absence. No automatic substitution by alias.

## Identity changes / future merge gate

I3 accepts **no production merge map**. There is no such authenticated schema
or reviewed payload in current M0. Missing/retired IDs remain unavailable with
their original values intact. This meets the preservation requirement without
inventing a redirect. A future separate versioned contract must require exact
reviewed same-identity typed mappings, no type change, cycles or conflicting
sources, exact revision/provenance, resolvable targets, retained original keys
and migration history, idempotent atomic application, collision coalescence
without loss, and explicit removal of every represented origin. Test-only
cycle/conflict/unreviewed redirect attempts in I3 must be ignored/rejected;
they are not authority for remapping. No new fields in closed catalog v1.

## Shared semantic fixture adapter

`fixtures/saved-subjects-v1/expected.json` contains **synthetic local semantics**,
not deployable religious content or authentication. Reference implementation:
`scripts/saved-subjects-v1.mjs`. Tests load a fresh case independently.

Adapters supply a verified view only after actual native catalog validation:

```text
view = null | {generation:{id,sequence,decision_sha256}, identities:[
 {key,name:{sr-Cyrl,sr-Latn}, article_targets:[
   {article_binding_id,article_id,observance_ids:[ID]}
 ]}
]}
```

Duplicate identity keys or invalid generation makes the view unavailable.
The view and each nested object are closed: malformed keys, names/parity or
article-target fields make the entire view unavailable, not partially trusted.
Every article target has at least one valid `observance_ids` provenance ID;
duplicates are permitted and become one sorted ID during target deduplication.
Article targets are already filtered by actual native authentication/binding
checks; adapter tests MUST separately prove rejection of unapproved, stale or
cross-generation links. A typed view is not an authentication replacement.

Reference operations and exact expected shapes:

```text
target({explicit_key:null|typedKey, candidate_keys:[typedKey], view}) ->
  {state:"available",key} | {state:"unavailable"|"ambiguous"}
resolve({record,view}) ->
  {state, key, name, article_targets:[...], generation:triple|null}
mutate({store,action:"save"|"remove",key,view,write_succeeds:boolean}) ->
  {state:"saved"|"removed"|"unchanged"|"identity_unavailable"|
         "limit_reached"|"write_failed"|"store_unavailable",
   store:originalOrCommittedStore}
```

`target` with explicit key never falls back to inferred candidates when that
key is unavailable. With no explicit key, filter/deduplicate incoming trusted
observance keys against the view; only exactly one may resolve. Non-observance
inferred candidates are invalid and cannot produce a Save target. `mutate`
never commits proposed changes when write_succeeds is false; no-op returns
unchanged without a write. Shared tests exercise storage shape failures but
native filesystem atomicity/process concurrency need native-specific tests.

`null` or missing logical `store` represents absent storage; mutation results
normalize it to `{schema_version:"svetlost33-saved-subjects-local-1",entries:[]}`
when there is no committed entry. An existing file containing JSON `null` is
corrupt, not an absent file. Corrupt/unknown-version logical values are returned
unchanged with `store_unavailable`; do not repair or mutate them.
Invalid operation arguments (action, typed key, record or non-boolean
`write_succeeds`) are programming errors: the reference throws `TypeError`
without including supplied values. Native adapters must contain such errors
without logging sensitive arguments. Invalid views produce unavailable states.
Non-observance/malformed inferred candidates are filtered out; an invalid
explicit key is a programming error and never triggers inferred fallback.

The auxiliary `validateLocalStore` returns `{valid,reason:null|"malformed"|
"unsupported_schema"}`; `parseLocalStore(Uint8Array|null)` additionally returns
the canonical `store` on success. It checks the raw 512 KiB bound and fatal
UTF-8 before JSON parsing; BOM/invalid JSON fails. Shared JSON cases exercise
`target`, `resolve`, `mutate`; raw bytes, invalid UTF-8, scalar limits and
invalid operation arguments have additional Node parser/unit tests and need
native-specific equivalents. Fixtures do not prove filesystem atomicity.

## Required evidence and privacy

Shared cases: typed collision, explicit/unique/missing/ambiguous target,
unavailable catalog/identity/text, zero/one/multiple/deduplicated targets,
renaming, save idempotence/order, remove offline, remove+resave, limit, write
failure and corrupt/unknown schema. Native integration: real trusted-view
adapter filtering, changed article revision on reopen, OTA during reader,
future redirect refusal, both scripts/themes/large text, VoiceOver/TalkBack
limitations, restart/upgrade and preserved unrelated settings/favorites.

No Analytics/Crashlytics events, parameters, user properties, breadcrumbs,
logged screen route arguments, serialized-store errors or hashes revealing Save,
saints, observances, text choice or search terms. Existing generic technical
diagnostics must not include the new paths/IDs. No notifications/slava/daily
selection/widget/wallpaper changes. Content review and native implementation
do not imply production publication approval.
Internal typed/pinned reader routes are allowed; the prohibition is on sending
or logging their sensitive arguments, not on local navigation itself.
