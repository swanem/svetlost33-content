# S7 public verification — 2026-09-20

Publication commit: **`a9ef1656b9e86f736493d173df07f0576045a9d1`**. Preparation commit: `1da08b9197c6110ec7a86e8589df88c2a0b17bcd`. Normal, non-force push to the existing `swanem/svetlost33-content` `main` branch succeeded. No Site mirror or new content channel was introduced.

Root coordination gave explicit activation GO after actual signed-S7 native integration checks: iOS 247/39 passed and Android `M0LiturgicalCatalogS7IntegrationTest` reported one test, zero skipped/failures. These are coordinator-reported native results, distinct from the content checks below. The exact signed staging package was then installed with the pinned S6 discovery compare-and-swap guard; no payload or approval transformation changed after signing.

## Public result

At **2026-09-20 18:11:42 UTC**, ordinary HTTP fetches of the existing native channel returned S7:

- [Production index](https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/index.json): sequence **7**, generation `shared-liturgical-catalog-2026-09-20-m0v2-s7`; SHA-256 `955b4a8ccf3345ce8821dd2187583ae3e8604f66fc6480ecf9a410556248d144`.
- [Release set](https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/releases/shared-liturgical-catalog-2026-09-20-m0v2-s7/release-set.json): SHA-256 `07adbbb4fe394f79d526bc1d5635d296d6e669a62c8545c81495f68164127d80`.
- [Catalog manifest](https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/releases/shared-liturgical-catalog-2026-09-20-m0v2-s7/modules/liturgical-catalog-v1-2026.9.20-r2/manifest.json): SHA-256 `5671ad411fc22349a22d628db001d422a3010d6963387d9f3dc630aa22f35774`.
- [Catalog payload](https://raw.githubusercontent.com/swanem/svetlost33-content/main/releases/v2/production/releases/shared-liturgical-catalog-2026-09-20-m0v2-s7/modules/liturgical-catalog-v1-2026.9.20-r2/data/liturgical-catalog-v1.json): **39,774 bytes**, SHA-256 `18a581b5bb1a3c881d48a9af3fc3e05596d3528c82ba29bfe53cedd54ec7f910`.

The public index, release set and all **six module manifest signatures** verify under the existing production public key with RSA-PSS-SHA256/salt32. All **22 manifest payload files** have exact declared lengths and SHA-256 values and match the published local bytes. The complete graph was also verified through immutable commit URLs for `a9ef1656b9e86f736493d173df07f0576045a9d1` at 18:06:58 UTC.

Normal discovery initially served valid cached S6 while the new immutable catalog URL already served the correct S7 bytes. At 18:11:42 UTC normal discovery returned `X-Cache: MISS`, `Age: null`, `Cache-Control: max-age=300`, `Via: 1.1 varnish`, and ETag `W/"b84b03bb78debd68004fbbab808f9e49bda77e0adbf5a2e0723a418d22adea0b"`. No sequence, payload, signature or channel was changed to work around cache propagation.

## Regression and preservation

- Exact publication commit, extracted into an isolated test copy excluding unrelated dirty charity work: **409/409 tests passed**. Earlier exact prepared tree and isolated signed-S7 installation rehearsal also passed 409/409.
- Actual installed signed graph validation: both Android/iOS profiles pass at unchanged minimum versions **35 / 0.1.0**. Catalog-aware clients receive six modules; older capability profiles safely receive five, four or three as before.
- All five S6 module entries and signed payload bytes are preserved; S5 charity is excluded. S6 discovery bytes are archived unchanged. Existing replay/expiry protections remain in effect.
- Frozen pending candidate and shared test fixture are unchanged. Catalog source rights statuses and legacy-slava migration links remain pending. The approved bounded coverage is still 15 observances / 13 verified 2026 occurrences / two undated observances / no catalog occurrences for 2027.
- Unrelated dirty charity test SHA-256 remains `599a8aabed9e78931b6513d9570bdf11334cab8d401b01a09eef02118476d3ed`; unrelated files were not staged or published.
- Temporary isolated test copies were removed after successful verification to recover approximately 34.9 MiB. The signed staging package, source repository, production artifacts and external signing key were preserved.

No content publication blocker remains. Device/runtime and app artifact distribution checks are owned by the native/Site release tasks and must not be inferred from these content transport results.
