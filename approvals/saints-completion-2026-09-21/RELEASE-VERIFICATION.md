# Shared saints completion S9 — publication record

## Exact authorization

Owner statement on 21 September 2026: **„odobravam dopunu za zajedničku objavu
na iOS-u i Androidu”**. This authorizes the exact eighteen texts handed off
in draft commit `8371d5f3c5c0bff4a9caa962b560ba9c5bd3dcab`, not importing the
subsequently suggested Pravoslavni Dom books, changing native applications,
publishing an APK, installing an iPhone build, or inventing canonical links.

The immutable approval JSON SHA-256 is
`8a103bf8ba8508360d377236517660320708cf1221caf8c279fe91fefb78df06`.
It records the exact original Cyrillic manuscript, deterministic Latin,
all input hashes and the prior owner's text-rights assertion. It does not
claim an independently verified license, legal clearance or clerical review.
Historical draft files remain unchanged as preparation evidence.

## Payload and scope

- Release: `shared-saints-completion-2026-09-21-m0v2-s9`, sequence 9.
- Eighteen new short articles, 3–20 October 2026; previous fourteen articles,
  days, notes and sources preserved. Saints total: 32 articles / 32 days.
- The requested 21 September–20 October window is covered on all 30 days;
  19–20 September also remain in the collection. This is neither a full year
  nor a claim to list every saint commemorated on each date.
- Saints `2026.9.21 r3`, 138927 bytes:
  `5551b12abc73777ee02bc3c150f52a3375a1101c548be11de50e78196e0e0000`.
- Saints manifest:
  `f3189c163ce1bf9563c5075ea13e2f28eb3d5a882c8a9ee27b45b7e3cda4f33d`.
- Catalog `2026.9.20 r4`, 39773 bytes:
  `13113be5f9bd3aeebc349cb5a89fee88439f7da57e9db9f6d9f1877e3da89774`.
- Catalog manifest:
  `2e88d37c99299b2bda53bc3927921c998c0776f49734558301a2054259cc7d5a`.
- Release set:
  `d95c571945fe6ea8f93adf47623b3de2ec40220c5f54cd13785800f26815cdf0`.
- Index:
  `3205118f271828771b5fef50d645fc3636e2cd4d7e92201844c7c20da2c1f01a`.

The catalog changes only its revision, approval identifier and existing
saints binding. Its 12 subjects, 15 observances, 13 dated 2026 occurrences
and two article links remain unchanged. Miholjdan's new readable article
does not acquire an inferred Save identity. There are no new 2027 dates.
The 4 October Cross leavetaking note remains distinct from the Quadratus
article and points to the already published `exaltation-cross` article.

Annual library, daily cycles, calendar and organizations remain byte-for-byte
unchanged. Existing minimum clients, production channel, RSA-PSS trust anchor
and discovery expiry (`2027-02-01T00:00:00Z`) are retained.

## Pre-signing and signed staging verification

- Independent exact manuscript/source/identity audit: PASS, 18 articles,
  27 source records, 67 claims and all 30 calendar rows checked against the
  previously pinned inputs. No Pravoslavni Dom import occurred.
- Root read the exporter, approval, packaging, signer and public verifier;
  independent review found and verified the correction of a stale-live
  signing gap. Live S8 discovery and signature are now checked before private
  key access, even when a valid S8 archive is present.
- Root repeated draft + S9 + S8 tests: **36/36 PASS**, zero skips/failures.
  New S9 tests cover frozen approvals, exact text, both scripts, preserved
  data, source/binding mismatch, missing capabilities, candidate tampering,
  symlink ancestors, and advanced discovery before key access.
- The coordinator then authorized signing only. Signed staging:
  `build/saints-completion-v027-s9-signed`.
- Signed validation: **8/8 platform/capability checks PASS** with the existing
  pinned key. All six manifests authenticate; supported optional modules
  project correctly in the four client-capability profiles on each OS.

Native S8→S9 gates and the clean post-install rehearsal are the next separate
activation gates. At this checkpoint, live production remains S8. This record
does not yet claim public activation or per-device download.
