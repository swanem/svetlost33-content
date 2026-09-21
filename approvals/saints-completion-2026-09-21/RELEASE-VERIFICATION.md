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

## Clean post-install rehearsal

The coordinator extracted clean content commit `46dcb71` into the dedicated
temporary tree `/private/tmp/svetlost33-s9-rehearsal.XW0ago/svetlost33-content`.
Only that copy's production discovery was advanced from S8 to the real signed
S9 by the guarded installer. All eight signed checks passed after installation.
The full unchanged tracked suite plus the new committed tests then passed:
**510/510 tests, zero failures/skips**, about 8 seconds.

Full log: `/private/tmp/svetlost33-s9-rehearsal.XW0ago/npm-test-post-s9.log`,
SHA-256 `3a93c95dc1922aabed2561557abed2771cd00195bededd2559a93f6011f4d2f8`.
Existing dependencies and the expected sibling canonical source path were
linked for this test; no source-repository output was written by the rehearsal.
This is a clean content snapshot test, not a claim that native worktrees are clean.

At 05:51 UTC the real production index was independently rechecked as the
unchanged S8 hash, and the unrelated dirty charity test retained SHA-256
`599a8aabed9e78931b6513d9570bdf11334cab8d401b01a09eef02118476d3ed`.
That test and the unrelated charity candidates are excluded from publication.

## Native S8→S9 acceptance

- Android: **1/1 PASS**, zero skips/failures/errors. XML timestamp
  `2026-09-21T05:54:29Z`, 1.703 seconds in the test; Gradle 36 seconds.
  Native test/evidence commit `f92c38bd130f65750509f448c19094785fd1d00e`.
  Root read the complete test and final diff, XML and evidence note. Exact XML
  SHA-256: `4d4b0e73225a1885699bfba619e7d849038918a2b9702a86e8753c3822deafd0`;
  test source: `e1611187b87f0ae8b78c8871a4c2b02d8be30c14066a11a929bf18705ba1d5fb`.
  The first two development attempts exposed only new test-expectation bugs
  (the enclosing release package ID necessarily advances and revision is Long).
  They were corrected without changing application runtime code.
- iOS: **1 test in 1 suite PASS**, 13.553 seconds; actual Swift Testing output,
  not a zero-test XCTest result. Only the new targeted core test was built/run.
  Pinned test commit `e073d5840329215ac9ebb2ee42629c5577035562`; evidence
  commit `123e476`. Root read the full test and final pinned values and checked
  the actual log. Test SHA-256:
  `886219bf2017cfa25ce02f95e2dad24dcd328c569c3ec3124a06ce8a74fc77a6`.
  Log `svetlost33-ios/docs/evidence/v0.27/s9-native-acceptance.log`, SHA-256:
  `f68de2764fa7ee0f08041a089dcfe89e566ff4933676cbbc91f60d8b8d23715b`.

Both tests use the same real signed S9 and existing hash-pinned PEM/DER trust
anchor. They validate S8 installation followed by atomic S9 upgrade, both
scripts and all 32 articles/dates, unchanged calendar/base modules and old
fourteen texts, the 4 October note, no 2027 expansion, exactly two existing
catalog links, retained previous generation and idempotent reinstallation.
The iOS test also rejects a tampered S9 payload without changing the active S8.

At 05:57 UTC the coordinator accepted both native gates and the clean 510-test
rehearsal and authorized guarded S8 compare-and-swap installation plus normal
scoped Git publication under the owner's recorded approval. This does not
authorize native application release/installation or new content beyond the
frozen eighteen texts. Public readback remains the final verification step.

## Public activation completed

Guarded installation passed all eight checks. Scoped content publication
commit **`236cd99`** was pushed normally to the existing `main`, advancing
remote `b06969d` without a force push. No unrelated dirty files were included.

At **2026-09-21T05:58:32.052Z**, the read-only public verifier returned **PASS**
against the ordinary production channel (no cache-busting or commit-specific URL):

- Exact S9 index and release-set hashes listed above.
- All **8 RSA-PSS signatures**, **22 payload files**, **38 downloaded files**
  and **5,525,696 transferred bytes** verified against the approved local bytes.
- Saints r3 and catalog r4 are active together; the four other modules are unchanged.
- Full machine-readable receipt: [public-verification.json](public-verification.json).

Reproduce the read-only public check from this content checkout:

```sh
node scripts/verify-saints-completion-public-v2.mjs
```

Current compatible Android and iOS apps can acquire S9 through their existing
content updater. Manual entry is Settings / Sadržaj i ažuriranja, followed by
Android **Proveri novi sadržaj** or iOS **Proveri ažuriranje**. Device-specific
successful download is not claimed by this public-channel verification.
No new APK, website download, iPhone installation or native version was made.

The pending native I3 accessibility/physical-upgrade/app-release gates remain
separate. Published readable texts do not invent extra canonical Save links.
