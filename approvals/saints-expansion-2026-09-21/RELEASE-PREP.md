# S8 — unsigned saints expansion preparation

Status: **UNSIGNED; signing, installation and push remain on coordinator HOLD.** This file records preparation, not completed publication or a new church endorsement.

## Exact scope

The owner said `objavi sadržaj i nastavi` after the handoff linking the seven drafts. The separate [owner-publication-approval.json](owner-publication-approval.json) pins manuscript SHA-256 `0f912a46cff2f1558018d43d8e2c564d5b0d44e56fb7ab2eafd7971c1676d0ba` and preserves the exact quote.

The approved transformation retains the previous seven articles, their day records/calendar notes, source records and authorship unchanged, then appends seven original editorial summaries for **2026-09-26 through 2026-10-02**. There are 14 articles and 14 days in the resulting saints library. In the 30-day I3 window this would provide 12 days after publication, leaving 18 uncovered. No unwritten text is approved or generated here.

The catalog update changes exactly five scalar leaves: root revision and approval ID, plus the sole existing saints article binding's version, revision and payload hash. It retains all 12 subjects, 15 observances, 13 dated 2026 occurrences, two article links, unresolved cases, pending legacy links, source rights metadata and unavailable 2027 coverage. No new article-to-subject inference or Save relationship is introduced.

The new approval relies on the historical owner rights attestation `može prava racunaj da imamo`, whose original record is linked. It does not claim source publishers issued a public licence, independent legal verification, new rights to images/audio, clergy review or permission to copy source texts. The original drafts and their pending source-ledger fields remain immutable historical inputs; the separate exact-text publication approval does not rewrite them.

## Candidate and hashes

Unsigned staging prepared at:

`/private/tmp/svetlost33-s8-prep.kpNttp/unsigned`

It contains 51 files / 5,617,775 bytes: the exact selected S7 source graph plus its archived discovery pair, new immutable S8 documents, editorial evidence outside both payload manifests, and an unsigned signing request. No new signature files exist. The stage does not change the repository production pointer.

| Artifact | Version/revision or size | SHA-256 |
|---|---|---|
| New saints payload | 2026.9.21 r2 / 60,425 B | `e85c725d109a322c109e8455bf94c6ddd28c113e67cd77dde9f34642d3559a21` |
| Updated catalog payload | 2026.9.20 r3 / 39,772 B | `f202bff8a92f4d4f84a6c025ea67144bf61c2df3fe38030fc446de2116d82e8c` |
| Saints manifest | 585 B | `c7605443c41686114ebef1abef397855e35ade468e83eb39afe6a10515d8a81c` |
| Catalog manifest | 695 B | `173c8f34cb921a6587e21ca6364e346e09e8bcbc9b8f5bed2a920ba91bb5d67b` |
| S8 release set | 3,396 B | `32a819ed12cb883bc4d7ba6213c1be5f379c7bf8107d3faece7330113f2601bd` |
| Candidate index | 591 B | `33309c9f1a8474a04971c01734cfaa647ffe3589ecb15b936adf41de21fc7674` |
| Owner publication approval | 6,348 B | `9fbf94f2ad68366e0157b7aec3754d84acdde883362fb297f1b0afec12efb20b` |

Release ID: `shared-saints-expansion-2026-09-21-m0v2-s8`; sequence **8**. Index `issued_at` is the actual approval-record time `2026-09-20T20:24:08Z`; inherited expiry stays `2027-02-01T00:00:00Z`.

Both updated modules retain `module_type=library`, `required=false`, their existing individual capability and **exactly one** manifest payload file:
- `data/saints-v1.json`
- `data/liturgical-catalog-v1.json`

The saints dependency remains `calendar-2026-r1@2026.1.1`, with exact payload binding r2/hash `a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`. Catalog dependencies are that same calendar plus `saints-v1@2026.9.21`; its article binding also requires saints revision 2 and the exact new payload hash. Generation equality and native authenticated context remain mandatory. Metadata claims and JavaScript editorial preflight do not authenticate a runtime generation.

The annual library, daily cycles/widget excerpts, calendar and existing organizations module retain their exact S7 active entries and bytes. Minimum clients remain **Android 35 / iOS 0.1.0**. Pending charity S5 and all unrelated dirty files remain excluded.

## Checks completed

- Exact-master export and existing closed saints/catalog validation: PASS.
- 14 calendar/date/title/source bindings, original seven articles/notes and Cyrillic-to-Latin parity: PASS.
- New prose word counts: **131, 129, 138, 141, 133, 137, 141** in either script.
- Deterministic candidate, inherited expiry/minimum clients, M0 document schemas and single-file manifests: PASS.
- Four unsigned capability/dependency profiles: 6/5/4/3 active modules, with catalog/saints/organizations skipped according to capabilities. A supported catalog with missing saints dependency is rejected, not repaired.
- Existing catalog links resolve against the new exact saints binding; stale binding exposes no article; 2027 exposes no false date.
- Separate signing/install GO guards and tampered-candidate rejection before key access: PASS.
- Focused suite: `node --test tests/saints-expansion-release-v2.test.mjs`, **10/10 PASS**.
- Coordinator independently ran the combined relevant suite: **232/232 PASS**. After the future-discovery correction, the full same relevant set was rerun locally: **232/232 PASS** (saints v1, saints S6, catalog v1/transport/S7, saved subjects and S8).
- Fresh ordinary public GET during preparation: HTTP 200, sequence 7, index SHA `955b4a8ccf3345ce8821dd2187583ae3e8604f66fc6480ecf9a410556248d144`. This is not a future activation authorization.

The two live-index non-mutation checks compare captured pre/post hashes, not a permanent assumption that current discovery remains S7. Historical reconstruction still pins the exact S7 index and release hashes. No full dirty-worktree suite is presented as clean-commit proof.

## Commands and remaining gates

From the content repository:

```sh
node scripts/export-saints-expansion-v1.mjs --check
node --test tests/saints-expansion-release-v2.test.mjs
```

To regenerate an unsigned candidate, select a **new, nonexistent** output directory; existing trees are never overwritten:

```sh
node scripts/prepare-saints-expansion-release-v2.mjs --out <new-unsigned-directory>
```

The independent source/identity review, especially the shortened Dorotheus calendar title, and explicit coordinator signing GO remain required. The signer reconstructs the whole approved candidate before reading the explicitly selected existing external key. It matches the derived public SPKI to the unchanged production trust anchor and writes only a new output directory. Four documents are signed: two manifests, release set and index. The key is neither printed nor copied into the repository.

**Only after signing GO**, the coordinator may run:

```sh
node scripts/sign-saints-expansion-release-v2.mjs --candidate /private/tmp/svetlost33-s8-prep.kpNttp/unsigned --out /private/tmp/svetlost33-s8-prep.kpNttp/signed --private-key /Users/nemanjaveselic/Documents/ChatGPT/Projects/svetlost33-signing-private/annual-content-private.pem --coordinator-go
node scripts/sign-saints-expansion-release-v2.mjs --validate-signed /private/tmp/svetlost33-s8-prep.kpNttp/signed
```

The actual signed validator runs eight production-key M0 checks (two OS contexts × four capability profiles), exact approved payload checks and calendar/catalog resolution. Only then should native tasks test this signed S8 package. The unsigned preflight is not a replacement for these checks.

**Only after both native checks and a separate activation GO**:

```sh
node scripts/sign-saints-expansion-release-v2.mjs --install-signed /private/tmp/svetlost33-s8-prep.kpNttp/signed --coordinator-go
```

Installation revalidates the exact signed file set, compares existing immutable files and requires current discovery SHA **S7 `955b4a8c…`** as a compare-and-swap precondition. If discovery advanced, stop and replan; never force replacement. It creates missing immutable artifacts and updates only the discovery pair. A reviewed scoped commit and normal non-force push to the existing public GitHub content channel are separate remaining steps. No Site mirror or new URL channel is introduced.

After activation, verify the public index, release set, both manifests/payloads, signatures and unchanged base modules. If a later rollback is necessary, use the existing monotonic M0 process with a new authorized sequence; do not lower sequence, overwrite immutable S8 bytes or force push. A failed signature/dependency/native check leaves the previous generation active.

## Source and evidence boundary

[The source ledger](../../drafts/saints-expansion-2026-09-21/sources.json) separates existing calendar date proof from church-tradition narratives and records search-index-only access where origin-page opening failed. Hagiographic claims are not reclassified as independently proven history. The dedication year is deliberately absent where sources disagree. No manuscript prose has changed after the owner-linked SHA above.
