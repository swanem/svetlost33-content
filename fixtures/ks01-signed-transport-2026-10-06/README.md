# KS-01 local signed transport fixtures

TEST ONLY. Never publish these releases or trust their public key in a production app.
The generator uses a fresh ephemeral RSA-2048 private KeyObject in memory, signs
with RSA-PSS/SHA-256 and 32-byte salt, and writes only `trusted-public-key.pem`.
No production key, signer, network endpoint, native code or build is used.

Each directory (`baseline62`, `packageA`, `synthetic104`, `synthetic366`) is an
independent flat relative-path-to-raw-bytes release map. Read all its regular files
for iOS `ModularSignedPackage(files:)`, or map the same relative paths beneath a
local fake HTTPS root for Android's existing HTTP fixture downloader. There are
no `contexts.json` files. The test trust anchor is outside these transport trees.

- Test key ID: `ks01-test-transport-key-1`.
- Fixed clock: `2026-10-06T12:00:00Z`; validity is October 6 to October 7 UTC.
- Channel: `production` for existing native wire compatibility only.
- Sequences: baseline62 = 100, packageA = 101, synthetic104 = 102, synthetic366 = 103.
- Old test client: Android 1000 / iOS 99.0.0. New test client: Android 1001 / iOS 99.0.1.
  The first two releases accept both; the expanded releases require the new pair.
  These numbers are not actual app release decisions.

All library/cycles/calendar payloads and their historical evidence come byte-for-byte
from the pinned S12 release graph. Unrelated organizations are omitted. Six modules
remain: the three required core modules plus optional saints, catalog and browser.
Saints and catalog payloads are exact pinned capacity-corpus bytes. Core manifest
`key_id` must change for test trust, so browser archive bindings receive the two
resulting library/cycles manifest hashes. Those are the only browser payload changes;
archive days, feast memberships and catalog binding stay unchanged. Per-dataset
handoff records describe every derivative and every raw output hash. Original
production, pending draft and shared capacity-corpus files are never rewritten.

Generate once with `node fixtures/ks01-signed-transport-2026-10-06/generate.mjs --write-new`.
It refuses overwrite. Signatures/key generation are intentionally nondeterministic;
do not regenerate to verify. Then use `verify.mjs --write-evidence` once and
`verify.mjs --check` for read-only verification. The latter verifies actual RSA,
transport schemas/limits, old/new client gates, raw file pins and exact content graph.
Reference checks prove no native runtime behavior, retained preferences, offline
restart, interruption recovery or performance. Native owners must test those paths
using these same signed bytes, without replacing the real calendar with a stub.
