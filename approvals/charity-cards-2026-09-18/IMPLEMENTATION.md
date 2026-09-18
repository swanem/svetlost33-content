# Exact shared charity payload — v0.24.3

The existing [owner decision](README.md) approves the three cards, their exact
bilingual descriptions, neutral icons and six external links for both platforms.
[payload-approval.json](payload-approval.json) binds the resulting implementation
to that scope; it does not claim a subsequent owner signature over a hash.
[source-review.json](source-review.json) records official self-identification and
destination review, with the limits of that review stated explicitly.

Canonical payload: `modules/organizations-v1/2026.9.18-r1/data/organizations-v1.json`.
Its 5,565 UTF-8 bytes have SHA-256
`4654b5c05b7c4e0ada963d022491c8683ac9d329c5db937a522925f6d10d89d7`.
The M0 module is `organizations-v1`, type `organizations`, optional, capability
`organizations-v1`, version `2026.9.18`, revision `1`, with the wire payload at
`data/organizations-v1.json`. `payment_rails` is empty and `logo` is null for all
three organizations. The absent logo requests the neutral native placeholder.

Review/issue time is `2026-09-18T10:35:15Z`. The exclusive expiry is
`2026-10-18T10:35:15Z`: 30 days chosen as an operational re-review cutoff, not a
guarantee of unchanged external pages, legal status or payment services. Native
clients re-evaluate time/status when resuming and when an action is requested.
Donation links additionally require a successful current signed channel check.

`npm run prepare:charity:v2 -- --out build/charity-v0243-candidate-archived-s2` produces a
new unsigned discovery candidate, preserving every existing base module's bytes,
manifest and signature. Existing output directories are refused. The default
base is the immutable archived production sequence 2 and the new release is sequence 3,
`shared-charity-2026-09-18-m0v2-s3`. Its three missing signatures are listed in
`signing-request.json`; the preparation command never accepts or reads a private
key, signs content, changes the checked-in release, or publishes anything.

The production public trust anchor and source index/release hashes are pinned.
The exact old `index.json` and `index.sig` are retained under
`releases/v2/production/discovery-archive/shared-annual-2026-r1-m0v2-s2/`.
The preparer selects its source files from the pinned historical inventory, so
advancing the live pointer or adding later release directories cannot alter
this candidate. The public validator's optional `indexPath` and
`indexSignaturePath` select those signed, root-confined archive files for
offline historical checks; its default live behavior is unchanged.
Before signing, compare the live discovery sequence with this source. A newer
public base requires a new explicitly prepared candidate; do not replay sequence
3 over a newer channel. After adding detached signatures with the existing
authorized production key, validate the complete M0 graph for both platforms,
then test actual native activation and external navigation before publication.

The separate signer accepts only an explicit external key path, checks its
public half against the existing production anchor, reconstructs and compares
every candidate byte, and writes a new output directory:

```sh
node scripts/sign-charity-release-v2.mjs \
  --candidate build/charity-v0243-candidate-archived-s2 \
  --out build/charity-v0243-signed \
  --private-key /explicit/external/production-key.pem
```

No default key path or environment lookup exists. The preparation agent did
not access a production private key. The signer verifies all four modules for
both platforms and verifies that clients without `organizations-v1` still load
the three annual modules. Signing is separate from native QA and publication.

Verification at preparation: `npm test` passed all 137 tests, including exact
payload/approval binding, 95 pre-existing immutable fixture/release files,
unsigned reproducibility, six-link eligibility, fresh-session gating, exclusive
expiry, a temporary test-key signed M0 graph for both platforms, older-client
skip, tamper/replay rejection, output preservation and wrong-key rejection.
An isolated simulated publication also proves identical regeneration after the
live pointer advances; the real production pointer remains untouched by that test.
The temporary signing test uses an explicit test trust anchor and does not
exercise or disclose the production private key.

This first organizations module leaves the annual three modules unchanged.
Backgrounds remain under their separate release workflow. No sacred text,
calendar assertion, source marker, account, IPS/SWIFT payload, social link,
photograph or copied story is introduced. The historical `28-jun-rs` candidate
and all previous fixtures/signed release bytes remain unchanged.

## Local signing checkpoint — 2026-09-18

The coordinating release owner signed the reviewed candidate with the existing
production key using the explicit-path signer. No key bytes were printed or
added to the repository. The output is `build/charity-v0243-signed` (not a public
distribution path). Both current-capability platform validations and both
previous-client optional-module skip validations passed.

- release set: `shared-charity-2026-09-18-m0v2-s3`, sequence `3`;
- release-set SHA-256: `34d98c1b975fda17e2e81daaf7bbcbcf180e1bc7c30c165b3c1b2578253cae45`;
- discovery SHA-256: `edb65e95d11370f2e29f32a1dbc36fd67646f1182afab68bd2da428d77e98724`;
- organization manifest SHA-256: `f961e6bfb2fd8c3443533f1fedd40a64e06342de019c8314d72c0dbfaf5cc8ad`.

The public channel was independently read as sequence 2 immediately before
signing. Root also reran all 137 tests successfully. The native implementation
tasks received the signed output for isolated acceptance. This checkpoint is
not publication approval without the remaining native QA gates, and is not
evidence that users already received sequence 3.
