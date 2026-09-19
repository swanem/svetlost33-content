# Shared saints pilot — signed production release S6

The owner authorized publication with: “Pokreni objavu novog sadržaja android i
iPhone šta još treba?” The separate continuation record is
`publication-continuation-approval.json`; the original manuscript/implementation
approval remains unchanged. This record does not claim a physical-device install,
clerical review, a complete saints calendar or additional texts outside 19–25
September 2026.

## Exact signed generation

- Release: `shared-saints-2026-09-19-m0v2-s6`, sequence **6**, Android + iOS.
- Existing trust key: `svetlost33-content-2026-key-1`, unchanged.
- Existing public-key PEM SHA-256:
  `9671cc745a71f3b35ac2281bfd4e8da9335db9c6a44beda0ae5cf380b292c1f6`.
- Minimum clients remain Android versionCode 35 and iOS `0.1.0`.
- Saints is a separate optional `library`, ID/capability `saints-v1`, version
  `2026.9.19`, revision 1. Clients without this capability skip it.
- Its manifest contains exactly **one** file, `data/saints-v1.json`.
  Approval evidence is retained separately under the release's `evidence/`
  directory, outside `manifest.files`; those copies are documentary evidence,
  not independently signed runtime payloads.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Discovery index | 561 | `fa4a38a4c97f7634fe7554a03d94438b5a9486d1fcf89446bdd21abbaa2fd3fc` |
| Release set | 2831 | `3e9b1ef707ebb4e0cd71fa5c59f1ee1df1cb99bb0572d1729e29cadeacde8e28` |
| Saints manifest | 585 | `899cf39e9220b2289b17db86dfb87cb808742fba3373be2d0478725f5bf1df59` |
| Saints payload | 30924 | `ab4ced9bbbec3f0765e9c6d45c866c13e76b0adc20d6eb75693be778c7cab000` |

The exact calendar dependency remains `calendar-2026-r1` version `2026.1.1`,
revision 2, payload SHA-256
`a1b6a5d5911ae03f77802bd466227f0c1ea4fe97708b1b6f92cd4b08847c7c9c`.
Neither calendar bytes nor the approved manuscript/fixture were changed.

## Preserved content and excluded draft

All four active S4 module entries, manifests, signatures and files remain
byte-identical: `library-annual-2026-r1` 2026.1.1, `daily-cycles-r1` 2026.1.2,
`calendar-2026-r1` 2026.1.1, and `organizations-v1` 2026.9.18. The five existing
widget excerpt pairs are unchanged. The original S4 index/signature are archived
under `discovery-archive/shared-widget-excerpts-2026-09-18-m0v2-s4/`.

Sequence 5 belongs to a previously prepared, **unsigned** charity-details
candidate. That candidate and its separate working-tree edits are not included
or activated. A later charity publication must be replanned against the then-live
release and use a higher sequence; its old S5 index cannot replace this S6 index.

## Verification and reproducibility

Before signing, the live S4 discovery, signature, public key, release, module
manifests and twenty active payload/evidence files were fetched and compared
byte-for-byte with the locally signature-validated S4 graph. The production
key was used only through the signer; its derived public SPKI matched the
existing public key. No replacement trust anchor or private-key copy was made.

The signing script reconstructs all approved candidate bytes before opening a
private key, rejects unexpected files or candidate drift, and refuses existing
output directories. The preparation is deterministic; RSA-PSS signatures use
their required randomized salt. Three documents receive detached signatures:
the new saints manifest, new release set and new discovery index.

The signed candidate passes existing M0 signature/hash/dependency/sequence
checks for both platforms with 5 modules for new capabilities, 4 modules when
saints is unsupported, and 3 when both optional capabilities are unsupported.
The seven articles' two-script parity, exact day/calendar binding and all forty
shared positive/negative cases remain covered. The repository's scoped release
tests also verify one-file packaging, preserved S4 bytes and rejection of a
modified signing request before key access.

The exact staged/commit-only tree passed **239/239** tests in an isolated
checkout, without the unrelated untracked charity preparation/signing files.
The broader existing working tree also passed 246 tests; that larger count is
not presented as proof of the published tree. The only necessary historical
test correction reads the pinned S4 discovery from its archive after the live
pointer advances. It is self-contained and adds no charity publishing logic.
The pre-existing dirty charity test remained byte-identical in the worktree
(SHA-256 `599a8aabed9e78931b6513d9570bdf11334cab8d401b01a09eef02118476d3ed`).

```sh
node scripts/prepare-saints-release-v2.mjs --out <new-unsigned-directory>
node scripts/sign-saints-release-v2.mjs --candidate <unsigned-directory> --out <new-signed-directory> --private-key <explicit-existing-external-key>
node --test tests/saints-v1.test.mjs tests/saints-release-v2.test.mjs
```

Normal non-force Git publication is the public activation boundary. Public
verification and native OTA acceptance are reported separately with their exact
commit/build evidence; a local signing success is not itself that evidence.
