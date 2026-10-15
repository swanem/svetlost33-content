# KS-01 shared capacity fixtures — TEST ONLY

These files are never publishable content or owner approval. `generated/` holds
an exact S12 baseline, copied synthetic loads of 104 and 366 articles, and a
separate reviewed simulation of frozen package A. There are no release sets,
signatures or production keys. Synthetic authentication/generation fields are
test-harness inputs only.

The generator retains all 62 existing article objects and IDs exactly. Extra
articles copy approved short prose and use visible TEST ONLY titles, IDs and
reserved `example.invalid` source URLs. The catalog adds one distinct dummy
identity, source, observance and link per article, including all 366 in the large
fixture, while keeping S12 catalog rows. Dummy feast subjects exercise counts;
they are not claims that a feast is a person. Real new content is still absent.

All dates come from existing source-bound 2026 rows. Synthetic articles are
distributed over the 62 existing article days, with at most six per day in the
366 corpus. This deliberately measures 366 articles, not 366 distinct dates in
non-leap 2026. Calendar bytes and all original annual facts remain unchanged.
Synthetic identity/date associations are test data, not distribution claims.
Browser memberships and archive assignments remain identical to S12.

## Outputs and native use

- `generated/common/calendar.2026.json`: exact S12 annual bytes.
- `generated/baseline-62/`: raw S12 saints/catalog/browser and synthetic host contexts.
- `generated/synthetic-104/` and `generated/synthetic-366/`: coherent test generations.
- `generated/package-a-test-view/`: only review flags/test approval promoted from
  the frozen pending A bytes; the browser hash binds the exact promoted catalog.
- Each directory includes `manifest.json` with exact file hashes and `TEST-ONLY.json`.
- `contexts.json` includes the full calendar days and article identity contexts
  once. Its assembly field explains how to supply them to existing native APIs.
  The deliberately empty archive contexts do not claim archive resolver acceptance.
  Native transport harnesses may sign these only with their ephemeral test keys.
- `profile-proposal.json`, cloned test schemas, `verification.json` and
  `handoff.json` record finite limits, measurements, checks and source hashes.

The test profile preserves the closed wire shapes and validation behavior.
It clones schemas in memory and imports the exact historical reference logic
with only the explicit proposed count/byte changes. Browser validation logic
is unchanged and uses the test catalog resolver. Original schema/validator
files are read and hashed, never edited.

Coordinator-directed test limits: saints 366 articles / 1,572,864 bytes;
catalog 512 sources, subjects and article links / 1,048,576 bytes. Saints
sources 512, days 366, catalog observances 512 and all other existing bounds
remain unchanged. Raw bytes and count bounds apply together; they do not promise
that every field can simultaneously reach its scalar maximum. Browser and global
transport limits are unchanged. The final shared contract remains root-owned.

## Reproduction

From the content repository, initial export to an absent output tree:

```sh
node fixtures/ks01-capacity-2026-10-06/generate.mjs --package-a
node fixtures/ks01-capacity-2026-10-06/generate.mjs --corpus
node fixtures/ks01-capacity-2026-10-06/verify.mjs --write-evidence
```

Read-only recheck of existing outputs:

```sh
node fixtures/ks01-capacity-2026-10-06/generate.mjs --check
node fixtures/ks01-capacity-2026-10-06/verify.mjs --check
```

Generation refuses overwrite. One focused check set covers 366/367 articles,
512/513 dependent collections, exact/+1 raw bytes, legacy rejection, preserved
sources/articles, script parity, duplicates, closed shapes and exact same-generation
bindings. Node timings are five in-process structural-parse samples; they are
neither cold-device benchmarks nor native peak-memory/UI acceptance.

Before a real release, measure and review the actual up-to-104 content, complete
the shared native performance/retention gates, choose the first compatible
minimum clients, and obtain the required content/signing/publication authority.
Synthetic 104/366 data enables technical work now; it does not replace those gates.
