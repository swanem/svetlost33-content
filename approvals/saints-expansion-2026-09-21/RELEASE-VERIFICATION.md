# S8 — signed package and publication verification

Status: **signed staging and both native gates verified; public activation authorized by coordinator**.
Recorded 2026-09-20. This is a shared content update, not a new app binary.

## Authorization and source review

The owner's exact `objavi sadržaj i nastavi` approval is bound in
[owner-publication-approval.json](owner-publication-approval.json).
[SOURCE-RECHECK.md](SOURCE-RECHECK.md) records consistency checks for all seven
unchanged manuscripts: four reviewed by a separate agent and three independently
finished by the coordinator. The coordinator read that report and the new
exporter, preparer, signer/installer, approval and tests before signing.
No material source contradiction remained within the approved prose scope.
No new legal clearance, clergy endorsement or canonical relationships are claimed.

## Signed staging

- Preparation commit: `94cebb067617e0ff9d6b0fd844286f7e0b52a386`.
- Source recheck commit: `18363a4`.
- Exact unsigned stage: `/private/tmp/svetlost33-s8-prep.kpNttp/unsigned`.
- Signed stage: `build/saints-expansion-v027-s8-signed`.
- Release: `shared-saints-expansion-2026-09-21-m0v2-s8`, sequence **8**.
- Index SHA-256: `33309c9f1a8474a04971c01734cfaa647ffe3589ecb15b936adf41de21fc7674`.
- Release-set SHA-256: `32a819ed12cb883bc4d7ba6213c1be5f379c7bf8107d3faece7330113f2601bd`.
- Saints payload: `2026.9.21 r2`, 60,425 bytes,
  `e85c725d109a322c109e8455bf94c6ddd28c113e67cd77dde9f34642d3559a21`.
- Catalog payload: `2026.9.20 r3`, 39,772 bytes,
  `f202bff8a92f4d4f84a6c025ea67144bf61c2df3fe38030fc446de2116d82e8c`.

The signer reconstructed every candidate byte before reading the existing
external signing key, matched its derived public SPKI to the existing trust
anchor and signed only four new documents. No key or new trust anchor was
copied into the repository. All **8 signed checks** (two platform profiles ×
four capability sets) passed. All six manifests remain verified even where
older clients skip unsupported optional payloads. The four base modules,
minimum client versions and discovery expiry remain unchanged.

## Native and regression evidence

- Coordinator relevant Node regression: **232/232 PASS**, no skipped tests.
- Android `M0SaintsExpansionS8IntegrationTest`: actual JUnit report at
  `2026-09-20T20:38:00`, **1 test, 0 failures/errors/skips**, 1.166 s.
  Authenticated S7 → S8 installation passes through the native downloader,
  installer and annual/saints/catalog repositories; all 14 days and articles
  have both scripts. Existing catalog counts remain 15 observances, 13 dated
  occurrences and two article links; no new article receives an inferred Save
  identity. Core M0 downloader/installer/saints repository paths are unchanged
  from the already released Android implementation.
- Native iOS `ProductionSaintsExpansionStagingV027Tests`: coordinator read the
  entire test and independently ran the already compiled Swift test at
  **2026-09-20 20:47:47 UTC**: **1 test in 1 suite PASS**, 13.851 s. This is the
  Swift Testing result, not the separate XCTest runner's zero-test summary.
  Existing key DER is hash-pinned. The real signed S7 installs, upgrades to S8,
  retains its previous snapshot, and S8 reinstallation is idempotent. Both
  scripts, all 14 days/articles, annual library (150 psalms / 18 prayers),
  exact new payload hashes and the existing catalog links pass through native
  authentication, installation and runtime projection. Core updater/saints
  paths remain unchanged from the released implementation. Initial sandbox
  execution failed on compiler-cache access; the approved retry executed the
  existing test binary successfully. No application build or phone install
  was required for this content gate.
- Clean content snapshot `94cebb0` post-install rehearsal: **484/484 PASS**,
  zero failures or skips, after installing the real signed S8 only inside a
  new temporary tree. Root checked the complete-run summary in
  `/private/tmp/svetlost33-s8-rehearsal.4n1fTU/npm-test-post-s8.log`, SHA-256
  `e4afb39844a8f3a93f4cfccd2d6c588063e935c5c8d0e831279486f2b20f9838`.
  The first isolated run lacked the expected sibling canonical-source path;
  restoring that temporary read-only-used path allowed the unchanged suite to
  run completely. This is a clean content snapshot test, not a claim that the
  whole sibling native working tree is clean. Main production remained S7 and
  the unrelated dirty charity test kept its original SHA-256
  `599a8aabed9e78931b6513d9570bdf11334cab8d401b01a09eef02118476d3ed`.

Both native gates and the clean post-install regression are now PASS. The
coordinator authorizes the separate S7 compare-and-swap installation and
normal scoped publication using the owner's recorded authorization.
Public-channel byte/signature verification is still pending; signing and
local installation alone must not be reported as public availability.
