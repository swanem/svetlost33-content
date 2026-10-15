# KS-01 real draft104: local test input, never publish

This isolated fixture compares exact S12 baseline62 with the real 62+42 year-end
draft, not synthetic104. Neither choosing 104-first nor successful tests approve
the 42 drafts, rights, canonical metadata, or Package A. Package A/B deltas are
absent. The final approved merged graph needs exact validation and relevant
remeasurement. Do not alter the frozen pending originals.

`baseline62/` and `realDraft104/` contain the same six-module transport layout used
by the existing native harnesses. Both use one fresh test RSA-PSS key. Only
`trusted-public-key.pem` is retained; no private key is read from disk or saved.
The old fixture's discarded private key is neither assumed nor recreated.

Use the key ID/public-key hash, fixed clock, min-client values, sequences, index
and payload hashes in `handoff.json`. The wire channel is `production` solely for
parser compatibility; these are local test endpoints, not production trust.
Test clients are Android 1000/1001 and iOS 99.0.0/99.0.1. This does not select real
release versions. Use a clean isolated test store for the new key/generation pair.

All 104 article objects and source records are exact drafts. Only root approval
fields, pending catalog review flags and dependent hashes are changed in copies;
`provenance.json` enumerates these substitutions. Rights stay pending. Unrelated
S12 library/cycles/calendar bytes and archive assignments remain exact. Because
core manifests have a test key ID, browser archive manifest hashes are rebound.

`pending/` preserves the three original combined in-memory payload bytes with
their existing draft hashes. `reference/*.contexts.json` contains explicitly
test-only semantic contexts derived from the exact graph. Native acceptance must
authenticate the raw transport and derive its own contexts; do not inject these
sidecars as a trust shortcut. The sidecars include real calendar and archive
reference projections, not an empty archive context.

Recheck without regenerating or re-signing:

```sh
node fixtures/ks01-real-draft104-2026-10-06/verify.mjs --check
```

Optional explicit local HTTP fixture:

```sh
node fixtures/ks01-real-draft104-2026-10-06/serve.mjs --port 0
```

The server binds only `127.0.0.1`, exposes only the two hash-checked raw transport
trees, accepts GET/HEAD, and has no writes. Native harnesses may instead load the
relative-path maps directly. Android emulator routing is the owner's test concern;
no public server or production URL is configured here.

Generation uses `generate.mjs --write-new`, refuses overwrites and intentionally
has non-deterministic signatures. Do not regenerate a pinned handoff. The initial
verification writes `verification.json`; later `--check` must reproduce it.
No native result, startup threshold, retention behavior or release authorization
is implied by shared reference verification. No 366 work is included.
