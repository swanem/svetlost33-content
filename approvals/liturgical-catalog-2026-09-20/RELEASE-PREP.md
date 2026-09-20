# Approved catalog S7 — staged release

The owner explicitly approved the bounded catalog with “Da, objavi i taj katalog”. The exact question and scope are recorded in `owner-publication-approval.json`. This is a new approval record; prior approvals and the frozen pending I2 fixture remain unchanged.

## Scope and provenance

- Frozen source commit: `b755d06be30905d531c0e34477b50cd978607824`.
- Frozen candidate SHA-256: `3722e9fbbf53bbd75b1a76289b59965f6ae929d693e0f700cdf1a6d6ff48015b`.
- Publication approval SHA-256: `abc161c755997f3db2203d3687cd1aa6245715b766b665be94ed10d7398642e4`.
- Approved payload: `modules/liturgical-catalog-v1/2026.9.20-r2/data/liturgical-catalog-v1.json`, 39,774 bytes; SHA-256 `18a581b5bb1a3c881d48a9af3fc3e05596d3528c82ba29bfe53cedd54ec7f910`.
- Exactly 62 scalar changes: root revision/status/approval ID and 59 review statuses. All names, aliases, dates, source order, source metadata and exact bindings are unchanged. The 10 legacy-slava migration links and all 17 source rights statuses remain pending. This approval does not assert a new licence, translation clearance or clerical endorsement.
- Coverage: 12 subjects, 15 observances, 13 verified 2026 occurrences, two links to existing approved articles. Nektarije and Stefan Dečanski remain undated. Catalog occurrence coverage for 2027 is unavailable; this does not deny other existing 2027 app data. No new religious text or I4 migration is included.

## Shared immutable package

Release ID `shared-liturgical-catalog-2026-09-20-m0v2-s7`, sequence **7**. Module `liturgical-catalog-v1`, type `library`, capability `liturgical-catalog-v1`, version `2026.9.20`, revision **2**, `required: false`. Exactly one manifest payload file: `data/liturgical-catalog-v1.json`; approval/source-review evidence sits outside `manifest.files`.

Dependencies are precisely `calendar-2026-r1@2026.1.1` and `saints-v1@2026.9.19`. All five active S6 module entries, manifest/payload bytes, trust anchor and minimum clients (Android 35, iOS 0.1.0) are preserved. Unrelated pending charity S5 is excluded.

| Document | SHA-256 |
| --- | --- |
| Catalog manifest | `5671ad411fc22349a22d628db001d422a3010d6963387d9f3dc630aa22f35774` |
| S7 release set | `07adbbb4fe394f79d526bc1d5635d296d6e669a62c8545c81495f68164127d80` |
| S7 discovery index | `955b4a8ccf3345ce8821dd2187583ae3e8604f66fc6480ecf9a410556248d144` |
| Preserved calendar payload | `a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c` |
| Preserved saints payload | `ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000` |

Unsigned staging is `build/catalog-v027-s7-unsigned`; signed staging is `build/catalog-v027-s7-signed`. The signer first reconstructs the exact approved graph, compares every candidate byte, and derives a public key from the supplied external private key to compare against the existing production trust anchor. No private key is stored in this repository or artifact. Existing RSA-PSS-SHA256/salt32 M0 signing and validation are reused.

## Gates and activation boundary

`prepare-liturgical-catalog-release-v2.mjs` is deterministic and cannot activate production. `sign-liturgical-catalog-release-v2.mjs` signs to a new staging directory only; the separate `--install-signed` step must wait for root coordination's explicit GO after both native QA checks. At this preparation stage the public and repository production pointer remain S6.

Signed staging validation checks both platform profiles at unchanged minimum versions: catalog-aware clients receive six modules, saints-aware older clients five, previous profiles four, and no-optional profiles three. Editorial preflight uses the actual preserved calendar and article payloads with the new verified generation triple; it is not a substitute for signatures. Native integrations must independently verify the actual signed staging package and fail closed on stale/mismatched contexts.

Preparation regression evidence: new bounded release tests **9/9 PASS**, previous saints/Bible tests **71/71 PASS**. The complete test suite on the exact staged tree excluding unrelated charity changes passes **409/409**; a separate temporary copy also passes **409/409** after installing the actual signed S7 package there. That rehearsal does not activate the main repository or public channel. Frozen candidate/shared expected hashes and unrelated dirty charity test bytes remain unchanged. The first staging write encountered ENOSPC; only that incomplete derived output was removed, and the complete signed retry was validated before native handoff.

Activation reconstructs and validates the signed graph again, checks that current discovery still equals S6 SHA `fa4a38a4c97f7634fe7554a03d94438b5a9486d1fcf89446bdd21abbaa2fd3fc`, refuses immutable collisions, archives the exact S6 discovery bytes and only then replaces local discovery. Public activation remains a separate reviewed normal Git commit/push. No force push or new channel is needed.

The existing public channel remains `https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production`. The module URL suffix is `releases/shared-liturgical-catalog-2026-09-20-m0v2-s7/modules/liturgical-catalog-v1-2026.9.20-r2/data/liturgical-catalog-v1.json`. Site's historical/fallback content mirror is not updated. Immutable source-commit URLs may be used for validation, not as a new runtime channel.

Existing replay/expiry protections remain intact. S6's archive is audit history, not a rollback by lowering sequence. If S7 must be withdrawn after installation, prepare a separately authorized higher-sequence signed release selecting a safe module set; clients that have accepted sequence 7 must not be told to accept sequence 6. A bad incoming candidate preserves the previous usable generation according to existing platform behavior. No broad optional-retention or dependency-policy changes are part of this release.
