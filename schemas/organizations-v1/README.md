# Organizations registry v1 — shared contract foundation

The original draft fixture below remains unchanged, including `28-jun-rs`.
A later approved, separate reviewed payload with NURDOR, Fondacija NORBS+ and
Srbi za Srbe is documented in
[the exact v0.24.3 implementation record](../../approvals/charity-cards-2026-09-18/IMPLEMENTATION.md).
That record does not change this wire schema, authorize payment rails or imply
that unsigned bytes have become authenticated runtime content.

This is the public **data-only** contract for Dobročinstvo v0.24. It does not
publish a registry, activate payment instructions, verify an organization, or
change any M0 manifest, signed artifact, release, key, discovery address or app.
Private self-reported records and reminders belong to the native private-data
contract, never to this repository's public registry schema.

## Exact module and payload identity

| Field | Wire value |
|---|---|
| M0 module ID (recommended stable ID) | `organizations-v1` |
| M0 `module_type` | `organizations` |
| Release-set module entry `required` | `false` |
| Manifest `capabilities` | `["organizations-v1"]` |
| Manifest JSON file `path` | `data/organizations-v1.json` |
| File media/encoding | `application/json`, `utf-8` |
| Payload `schema_version` | `svetlost33-organizations-1` |
| Payload `version` / `revision` | Exactly equal to that module manifest's values |

Existing M0 v2 carries authentication, hashes, size checks, platform/minimum-client
compatibility, dependencies, atomic activation and anti-replay. This standalone
validator does **not** replace or extend those checks. No signed production
module is created here. A future signed registry must use the one shared
review/approval channel for both platforms. An organization/rail/link update is
new immutable content with an appropriately incremented module revision and M0
sequence; an account change requires an explicit recipient/payment review.

An unsupported optional capability is skipped; existing reading, widgets,
wallpapers and previously valid content remain usable. If this optional module
is structurally invalid, report registry unavailable/rejected and keep the last
structurally valid registry only where its **current** eligibility still allows
the action. Never reactivate an expired or already revoked payment instruction
through fallback. Native hosts must keep revocation/highest accepted revision
state across local recovery; do not weaken M0 anti-replay.

## Payload fields and stable identity

The JSON Schema is authoritative for shape, enums, maximum sizes and required
fields; `validate-organizations-v1.mjs` adds referential and eligibility rules.
Unknown keys are rejected throughout. Registry bytes are bounded to 256 KiB.
Strings are plain text; clients render them as text, never HTML/Markdown/script.

- `dataset_kind`: `candidate`, `reviewed`, or `synthetic_test_only`. Candidate
  organizations, links and rails must all remain `draft`. Candidates cannot
  enable actions even when wrapped in an authenticated test context. Reviewed
  denotes editorial state, not proof of payment or cryptographic provenance.
  Synthetic data is forbidden by default and is never a runtime build input.
- `version`: stable M0-compatible string, with integer `revision` (1 through
  9,007,199,254,740,991). UTC timestamps are exact second-precision
  `YYYY-MM-DDTHH:MM:SSZ`; `issued_at < expires_at`. The candidate's issue/expiry
  are fixture metadata, not an approved review-validity period or private
  donation-record retention policy.
- `organizations`: zero to 100 records, unique stable `id`. Initial real IDs
  are `nurdor-rs`, `norbs-plus-rs`, and `28-jun-rs`. They are not a schema enum:
  future reviewed additions/removals can arrive without a binary update.
  Never reuse an ID for a different legal recipient.
- Each organization has localized `name` and `description` objects with exactly
  `sr-Latn` and `sr-Cyrl`, separate exact `legal_name`, `country`, `status`,
  `sources`, `links`, and `payment_rails`. `legal_name` may be null **only** while
  the organization is draft. Branding/transliteration is not payee identity.
- `status`: `draft`, `active`, `suspended`, or `revoked` independently on an
  organization, each link and each rail. A parent organization must be active
  before any child action can be enabled. Suspend/revoke takes effect for all
  child actions. Do not present `self_reported` as an organization/rail status.
- Sources have `id`, official HTTPS `url`, and `fetched_on` (`YYYY-MM-DD`). The
  retrieval date records supplied editorial evidence; it does not mark a
  recipient, bank instruction or link verified. Country fields accept an
  uppercase two-letter ISO country-code shape; the initial candidate is RS.
  Native supported-country policy defaults to RS and disables unfamiliar
  countries while retaining their readable records. Future country additions
  need verified country/rail handling, not a country enum schema migration.
  IDs are unique within each
  organization's source, link and rail collections. Actions reference existing
  `source_ids` from that same organization.

The real candidate is **draft only**. Its three source URLs were supplied as
fetched on 2026-09-18. It has no payment rails, social handles, story claims,
logos or asserted logo permission. `Fondacija NORBS Plus` is recorded separately
from the NORBS organization. NURDOR's exact payee legal identity remains to be
reviewed; 28. Jun's exact Serbian payee legal identity is explicitly unresolved.

## External links and reviews

Each `links[]` record has `id`, `kind` (`website`, `story`, `donation`, `social`),
localized `label`, `url`, `source_ids`, `status`, `verified_at`, and `valid_until`.
Donation links are separately reviewed records: a valid website link never
implicitly approves its donation endpoint. Social/story links may be absent.

Review timestamps are either **both null** (unreviewed) or **both present**.
`active` links/rails require both. `verified_at < valid_until`, the source must
have been fetched by the verification date, and verification cannot occur after
the registry was issued. Expired, revoked and suspended records remain valid
historical structures but disable actions. The expiry boundary is exclusive:
`now >= valid_until` is disabled, including equality. The registry's expiry and
organization status also apply. Re-evaluate on app resume and immediately before
opening a link, copying/generating payment instructions or any equivalent action;
do not reuse an eligibility boolean saved while opening a detail screen. Native
implementations should use their persisted last-known trusted time/revision
policy when guarding against backward wall-clock changes.

URLs are HTTPS with a canonical lower-case ASCII DNS hostname. Credentials,
empty `@` authority, fragments (including empty `#`), explicit ports, IP literals,
single-label/local hostnames, whitespace, backslashes, control characters and
encoded controls/backslashes are rejected. Encoded/Unicode/punycode hostnames and
trailing dots are also rejected in v1. Reserved example domains work only for
explicitly allowed synthetic tests. A syntactically safe URL is **not** evidence
that it is an official source; editorial review must establish that identity.

Open eligible official links only after the user's explicit action. No remote
HTML/JS is embedded as executable app content, and no webpage is scraped into
the native reader. Redirected content cannot mutate the signed record or bank
details. Any HTTP fetch done by the native app must validate each redirect and
use its reviewed destination policy; this validator does not resolve DNS, fetch
pages or certify a redirect chain. When handed to the external browser, the
browser owns subsequent navigation; do not describe that as a verified final
payment destination or completed payment. The final iOS donation flow stays
outside the app. Returning to the app never marks a donation paid.

## Payment rails — independent domestic and international instructions

Rails have stable `id` within the organization, independently increasing
`revision`, discriminant `type`, `status`, `currency`, `payee`, `source_ids`,
`verified_at`, `valid_until`, `suggested_amount`, `source_marker`, and `details`.
`payee` contains `legal_name`, `address`, and `country`. Its legal name must
exactly match the reviewed organization's legal name; a changed payee is not
approved by matching a brand name. Payee and organization countries must match;
`domestic_rs` requires RS. A draft unresolved identity enables no rail. A future
rail `type` token is structurally preserved, with opaque bounded JSON `details`,
but always yields `rail_type_unsupported` until a client implements it. It must
never be treated as a domestic/SWIFT default. This validator supports only the
two rail types below. Unknown remote capabilities remain disabled through M0.

| `type` | Required `details` | Currency |
|---|---|---|
| `domestic_rs` | `account` (18 unformatted digits), `payment_code` (3 digits), localized `purpose`, nullable `model` (2 digits) and `reference` | `RSD` |
| `swift` | `iban`, `bic`, `bank_name`, `bank_address`, localized `instructions` | Explicit 3-letter currency code |

Domestic `model` and `reference` must be both null or both populated. Reference
is limited to 25 ASCII letters/digits/spaces/hyphens in this conservative v1
contract, separately from the two-digit model. The combined legal name, one
newline and address must fit 70 Unicode scalar values. Each localized effective
purpose, including an enabled source marker, must fit 35 scalar values and must
contain no pipe or newline delimiter. No silent truncation or reference rewrite
is permitted. These bounds follow the NBS field constraints and a deliberately
narrower reference representation; see the official
[NBS IPS specification](https://www.nbs.rs/export/sites/NBS_site/documents/propisi/propisi-ps/odluka_transfer_2018_prilog.pdf).
Partial instructions cannot become a rail. Domestic and SWIFT fields are not merged;
cross-type keys are rejected. The format checks do not certify account checksum,
bank identity, supported currency, payment code, fee handling or regulatory
suitability. Those require the separate payment-source review before signing
active data. No real bank fields are supplied in these fixtures. The all-zero
domestic account/payment code and `ZZ00...`/`TESTZZ00` international identifiers
in the synthetic fixture are intentional non-payment placeholders, not bank
validation examples or defaults to copy into a real registry.

`suggested_amount` is null or a complete `{ "decimal": "1.00", "currency": "RSD" }`
object, strictly positive, maximum 9 integer digits and exactly two fractional
digits. It is an optional public suggestion, never a donor record or mandatory
amount. Currency must match the rail; no binary float, silent conversion,
partially specified amount or inherited currency. V1's amount representation is
for reviewed currencies with two decimal places; a different exponent needs a
contract change. Clients must validate user-entered amounts separately.

`source_marker` defaults to `{ "enabled": false, "value": null }`. An explicitly
agreed marker can instead use `{ "enabled": true, "value": "...",
"placement": "purpose", "agreement": { "id": "...", "source_ids": ["..."],
"status": "active", "verified_at": "...", "valid_until": "..." } }`.
The separate signed review must establish the recipient's agreement to that
exact marker. It uses the same source/time/status checks as a rail. Draft,
expired, suspended or revoked agreement disables the rail. This v1 renderer
supports the marker only on `domestic_rs`; join the exact existing localized
purpose, one space, and the marker value, within the 35-character final limit.
Never alter `model`, `reference`, payee, bank account or link URL. No automatic
app attribution or tracking marker is inserted. No real candidate has a marker.
This foundation implements no IPS QR encoder,
payment execution, payment callback, receipt, donor record or store-compliance
claim. Direct donations remain optional and never unlock app content.

## Optional packaged logos

An absent/null `logo` requires the neutral native placeholder. An optional
descriptor has `path` under `media/`, `sha256`, `content_type` (PNG/JPEG only),
`width`, `height` (each at most 2048), and `rights`. Rights include `license`,
localized `attribution`, `source_ids`, `status`, `verified_at`, `valid_until`.
They undergo independent review and expiry checks. A logo is enabled only when
its exact path/hash/media type/dimensions match an already authenticated,
verified and locally stored file from `moduleContext.files` (the existing M0
manifest file records). M0/native image decoding, byte size and pixel bounds
still apply. Missing file evidence or expired/revoked rights produce a neutral
placeholder and leave independent donation actions usable. No external image
download, SVG/script or inferred trademark permission is allowed. This change
adds only the descriptor contract: no real logo file or rights approval exists.

## Shared validator and result contract

Run with the existing local Node/Ajv dependencies:

```sh
node --test tests/organizations-v1.test.mjs
node scripts/validate-organizations-v1.mjs fixtures/organizations-v1/registry.candidate.json --now 2026-09-18T12:00:00Z
```

Exports:

```js
validateOrganizationsRegistry(payload, {
  now: '2026-09-18T12:00:00Z', // ISO string, epoch milliseconds, Date or clock function
  contentAuthenticated: true, // ONLY after M0 signature/hash/replay/activation checks
  paymentSessionFresh: true, // ONLY after a successful signed channel/revocation check in THIS payment session
  clientCapabilities: ['organizations-v1'],
  supportedCountries: ['RS'], // local client policy, never trusted from the payload
  moduleContext: {
    module_type: 'organizations', required: false,
    capabilities: ['organizations-v1'], payload_path: 'data/organizations-v1.json',
    version: authenticatedManifest.version, revision: authenticatedManifest.revision,
    files: authenticatedManifest.files // only after file verification/local activation
  }
});
```

The context must be extracted from authenticated M0 entry/manifest/file metadata,
not fabricated from untrusted payload values. `paymentSessionFresh` defaults to
false and gates every payment rail and `donation` link. Set it true only after
an actual successful check of the current signed channel/revocation state for
the current payment session. A valid cached signature, recent `issued_at`, app
startup, stale saved result, network failure or return from a browser is not
freshness proof. Expire/recheck the native session when resumed or interrupted;
this pure validator receives that decision and does not fetch the channel.
Website/story/social links and locally verified logos do not require a fresh
payment session, but still require their own valid status/review. No donation
result is derived from channel freshness.
`validateOrganizationsFile(path, options)` additionally reads
bounded, strictly UTF-8 JSON. The exported `ORGANIZATIONS_MODULE` constants carry
the exact identity above. `allowSynthetic: true` exists only for test harnesses;
no shipping loader or CLI invocation should set it. The CLI validates candidate
structure but deliberately offers no authenticity or synthetic override, so its
success can never be confused with enabled production donation actions.

Structural errors throw `OrganizationsValidationError` with a fixed `code` and
JSON Pointer `path`, never raw banking fields/URL content. The optional registry
consumer catches that error and leaves core app functions usable. Do not report
private donor data through telemetry. The standalone validator does not perform
the native host's transaction or fallback itself.

Structurally valid results have `valid: true`, identity fields, `dataset_kind`,
`evaluated_at`, `registry_eligible`, registry `blockers`, and organization results.
Each organization's `links` / `payment_rails` holds `{id, kind|type, enabled,
blockers}`. `enabled` is true only if all registry, organization and per-action
checks pass; optional logo results contain `{enabled, blockers}` or null.
A valid result does not certify a donation, legal compliance or
the underlying editorial judgment. `registry_eligible` alone never authorizes an
individual action. Unknown required capabilities disable this optional module.
Expired/status-disabled actions return blockers rather than a structural error.

Blockers are deterministic: registry (`content_not_authenticated`,
`candidate_only`, `registry_not_yet_valid`, `registry_expired`,
`capability_unsupported`, `module_context_missing`), organization
(`organization_draft|suspended|revoked`), action (`link_draft|suspended|revoked`
or `rail_draft|suspended|revoked`), review (`review_missing`,
`review_not_yet_valid`, `review_expired`), `country_unsupported`,
`legal_identity_unresolved`, `rail_type_unsupported`, and
`payment_session_not_fresh`. Markers add `marker_placement_unsupported`,
`marker_agreement_draft|suspended|revoked`, or `marker_review_*`; logos add
`logo_rights_draft|suspended|revoked`, `logo_review_*`, `logo_file_unverified`.
Render localized user-facing explanations in native UI.

## Portable cases and acceptance boundary

`fixtures/organizations-v1/cases.json` has an explicitly synthetic base registry,
`default_options`, and named cases. Each case clones `synthetic_registry` unless
`base: "candidate"`, which loads the sibling real candidate. Apply `patch` using
RFC 6902 `replace`, `remove`, `add`, `copy`; pointers follow RFC 6901 and `-`
appends to an array. Merge `options` at the top level over `default_options`
(nested `moduleContext` is replaced in full). Expected `error` is the exact fixed
validation code. Otherwise assert supplied result properties, `all_disabled`,
the ordered `enabled_links`/`enabled_rails` lists (`organization-id/action-id`),
and presence of `blocker` in registry or action blockers. Missing expected
properties are unconstrained. Both native teams should consume these same cases.

The targeted tests cover draft candidates, two synthetic rail kinds, expiry
boundaries, suspended/revoked parents and independent child actions, unknown
capabilities, context mismatch, unsafe URLs, duplicate IDs, partial account/
amount/review data, payee mismatch and unavailable source markers. They do not
replace native parsing, signed M0 N→N+1 activation, upgrade preservation,
accessibility, real external-opening QA or source/payment review. No current
real candidate is approved or production active by this foundation.

Before any native QR generation, a dedicated reviewed implementation must still
validate Serbian account check digits, authorized payment code, model-specific
reference format/checksum (including model 97), allowed characters/encoding,
actual user amount and applicable limits, final payload length and NBS IPS
format. Before international payment instructions, validate IBAN checksum,
country-specific length, BIC/currency/bank data against reviewed source evidence.
These checks are intentionally not implemented or certified by this foundation;
`enabled` is registry/action eligibility, not `ips_validated` or banking proof.
Do not create a QR from format-only synthetic placeholders or from an otherwise
eligible rail until the native payment validator passes.
