# Approved collection 104 — isolated S13 preparation

This folder prepares an unsigned production candidate from authenticated S12 and
the separately authorized original 42 bilingual summaries. It does not promote
the test fixture or alter pending manuscripts. The original 62 articles and four
unrelated modules, including organizations, remain unchanged.

Source-page rights remain honestly pending; the owner authorization concerns the
original attributed summaries, not third-party page licensing, clergy review or
legal clearance. Packages A/B are outside this candidate.

Production signing requires a separate explicit coordinator GO and an external
existing production key. No key is supplied or located automatically. Publication
and exact-generation native acceptance remain separate gates. No performance
work or 366-content expansion is included.

Run `node drafts/saints104-release-2026-10-06/verify.mjs --check` for the single
targeted suite. Its ephemeral RSA key exists only in memory; temporary copies of
the graph are removed after tests. This does not exercise a production private key
or claim native acceptance.

`handoff/native-acceptance.json` is the requested host-side harness descriptor.
Its `accepted_at` is a fixed validation-clock anchor, not an actual acceptance
event. Keep it outside the exact signed/public tree; adapters may stage it as a
test-only sidecar. The signed S13 graph retains the full S12 predecessor under
`discovery-archive/shared-calendar-saints-2026-10-02-m0v2-s12/`.

Publication must recheck public HEAD and both discovery bytes, use precisely the
15-path signing-request allowlist, reject changed immutable paths, preserve all
other public files, and commit atomically against the checked parent. The provided
publication guard is read-only; it does not implement a push or bypass native gates.
