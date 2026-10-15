# Calendar browser S10 candidate tooling

`scripts/prepare-calendar-browser-release-v2.mjs` prepares an unsigned local
candidate from the exact signed S9 graph, using its pinned discovery archive when
present and the current discovery pair otherwise. This historical verification
does not authorize signing after the live channel advances. It never promotes
pending rows to reviewed, writes a production directory, accesses a private key,
or claims that editorial simulation is runtime authentication.

```sh
node scripts/prepare-calendar-browser-release-v2.mjs \
  --catalog PATH_TO_REVIEWED_CATALOG_JSON \
  --browser PATH_TO_REVIEWED_BROWSER_JSON \
  --evidence PATH_TO_CANDIDATE_REVIEW_JSON \
  --out NEW_NONPRODUCTION_DIRECTORY
```

All three input paths are explicit. Both payloads must already have
`review_status: "approved"` and the exact review's `approval_id`. The review has
schema `svetlost33-calendar-browser-candidate-review-1`, status
`APPROVED_FOR_LOCAL_CANDIDATE`, reviewer role `coordinator` or
`editorial_review_under_owner_scope`, a statement and `recorded_at` timestamp.
It records the exact payload lengths/hashes in catalog-then-browser order,
the S9 index/release hashes, S10 release identity/sequence, and exact
`feast_memberships`, `archive_start_date`, and `archive_days` under `scope`.

`approval_scope_record` and every `source_reviews` entry are file records
`{path,bytes,sha256}`. Relative evidence paths resolve from the repository root.
The owner scope record remains distinct from an exact payload review: its type is
`OWNER_SCOPE_APPROVAL_NOT_EXACT_PAYLOAD_RECEIPT`, its `exact_payload_review` is
null, and it contains the owner's original statements. The tooling copies the
captured, checked evidence bytes without upgrading their claims.

An empty archive is supported with null start and empty bindings/days. A nonempty
archive requires exact publication-evidence file records, or this explicitly
prospective plan in the candidate review:

```json
{
  "prospective_publication_plan": {
    "status": "PLANNED_NOT_PUBLISHED",
    "start_date": "2026-09-29",
    "end_date": "2026-12-31",
    "publish_before_utc": "2026-09-28T10:00:00Z",
    "policy_id": "calendar-week-v1",
    "policy_version": 1,
    "archive_bindings": ["EXACT_BROWSER_BINDING_OBJECTS"]
  }
}
```

The dates above illustrate the field format. A prospective deadline must still
be in the future and no later than the first date's midnight in UTC+14. Its rows
must be available assignments, with no invented correction or withdrawal.
Publication must occur before that deadline; a local candidate or signed stage
does not establish a public publication receipt. If that deadline is missed,
prepare and review a later start.

The builder replaces only `liturgical-catalog-v1`, adds optional
`calendar-browser-v1` with exactly `dependencies: []`, and preserves every old
signed module byte. It keeps the existing trust anchor, minimum clients, and
expiry. The result has seven modules within the unchanged sixteen-module limit.
Catalog bindings resolve to the actual preserved calendar/saints bytes; archive
manifest digests come from the preserved complete library/cycle manifests, with
matching references in both scripts. The final incoming catalog, browser, and
captured S10 generation undergo an isolated editorial simulation.
The emitted discovery timestamp is canonical UTC with whole seconds for the
existing iOS verifier; the exact local review retains its original timestamp.

The unsigned report checks twelve supported optional-capability profiles on
Android and iOS. Actual signature verification for new documents is explicitly
pending. `signing-request.json` declares `UNSIGNED_CANDIDATE`,
`runtime_authenticated: false` and `publication_authorized: false`.

## Separate local signing

`scripts/sign-calendar-browser-release-v2.mjs` has a separate explicit
`--coordinator-go` gate. Its API is:

```js
await signCalendarBrowserRelease({
  candidate, out, privateKeyPath, coordinatorGo: true,
  catalogPath, browserPath, evidencePath,
  // Optional sourceDirectory and now are for controlled verification.
});
```

It reconstructs and compares the exact unsigned file inventory, verifies the
live S9 discovery pair, checks a prospective deadline before key access and again
before output against the real wall clock independently of historical verification
time, and requires the selected external key's derived public DER to
match the existing production key. It writes only a new nonproduction directory.
It validates captured signed bytes and runs the unchanged M0 verifier for all
twelve profiles on both platforms. Its result is
`SIGNED_LOCAL_STAGE_NOT_PUBLISHED`. There is no installer or activation API;
native platform release approval remains required before any production action.

`validateCalendarBrowserSignedRelease(directory, options)` provides read-only
validation with the same explicit reviewed payload/evidence inputs and current
or archived S9 source. Signing separately requires the live S9 discovery pair to
remain unchanged. The preparation and signing tools reject symlinks and existing output
directories. Tests do not access a private key or generate signatures.
The signing CLI accepts `--now` only with the read-only `--validate-signed` mode.

## Separately gated local installation

`scripts/install-calendar-browser-release-v2.mjs` defaults to read-only inspection:

```sh
node scripts/install-calendar-browser-release-v2.mjs \
  --signed EXISTING_SIGNED_STAGE \
  --catalog PATH_TO_REVIEWED_CATALOG_JSON \
  --browser PATH_TO_REVIEWED_BROWSER_JSON \
  --evidence PATH_TO_CANDIDATE_REVIEW_JSON
```

The equivalent API is `inspectCalendarBrowserInstallation(options)` or
`installCalendarBrowserRelease({...options, dryRun: true})`. Missing coordinator
or native GO records produce explicit blockers and no writes. The signed tree
must still pass exact inventory, byte, public-signature, and all 24 platform/profile
checks. The production discovery pair must be exact S9, or an already installed
byte-identical S10 with all immutable files present.

Actual local installation additionally requires `dryRun: false`,
`coordinatorActivationGo: true`, and `nativeGoPaths: {android, ios}`. The CLI
spells these gates `--install --coordinator-activation-go --android-go FILE
--ios-go FILE`. Both native proof files use this shape:

```text
{
  schema_version: "svetlost33-native-calendar-release-go-1",
  platform: "android" | "ios",
  status: "GO_FOR_S10_ACTIVATION",
  release_set_id: "shared-calendar-browser-2026-09-27-m0v2-s10",
  sequence: 10,
  index_sha256: exact signed discovery SHA-256,
  release_sha256: exact signed release-set SHA-256,
  recorded_at: ISO timestamp,
  artifacts: [{path,bytes,sha256}, ...]
}
```

At least one real status/build artifact is mandatory per platform. Relative
artifact paths resolve from the content repository root. The installer checks
the actual artifact bytes and binds both proofs to this exact signed index and
release. It rereads the proofs and artifacts immediately before switching the
discovery pair. Tests create no native GO confirmations.

Mutations use actual wall time independently of caller-supplied `now`; the CLI
allows `--now` only for read-only inspection. A private key is never needed.
The installer acquires its own exclusive lock, checks the exact S9 index and
signature before copying and again before the final discovery switch, rejects
immutable collisions, and reads written files back. A retry can reuse exact
immutable files copied before an interrupted switch. An already complete,
byte-identical S10 is a verified no-op while the same prospective deadline and
native GO gates remain valid. This is not an indefinite post-deadline installer.

As in the existing repository installer, the two discovery files cannot be
replaced in one filesystem operation. A crash can leave a mixed pair; that state,
an incomplete live S10, or a leftover lock requires coordinator inspection and
is never repaired automatically. Installation does not push or publish. Public
publication remains a distinct operation after all local checks pass.

```sh
node --test tests/calendar-browser-release-candidate.test.mjs
```

## Ordinary public readback

After the separately authorized normal Git push, use
`scripts/verify-calendar-browser-public-v2.mjs --signed-stage EXACT_SIGNED_STAGE
--catalog REVIEWED_CATALOG --browser REVIEWED_BROWSER --evidence REVIEW_JSON`.
The isolated stage is required explicitly: production retains historical extras
and is not an exact staging inventory. The read-only tool fetches the ordinary
public main-channel URLs without cache busting or redirects, compares every
active document/payload to reviewed bytes, verifies the pinned signatures, and
checks the actual deadline again after all responses finish. It does not write
a receipt or claim a successful local check is public availability.

`SVETLOST_CALENDAR_READBACK_STAGE=EXACT_SIGNED_STAGE node --test
tests/calendar-browser-public-readback.test.mjs` tests the network verifier with
mocked responses. Those tests are explicitly not publication evidence.
