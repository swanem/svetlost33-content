# Test-only calendar browser fixtures

`cases.json` is a deterministic cross-platform suite with synthetic future
identities, placeholder source records, trust and review. It is not production
data, a feast classification, an archive publication claim or owner approval.
Do not bundle it as application runtime content or publish/sign it.

The baseline browser payload is pending. Each case clones both inputs, optionally
applies `synthetic_test_setup_mutations`, then applies payload/context mutations.
A path `[]` replaces the entire root. Execute the case operation and compare the
complete expected result; the approved flags exist only within tests.

Verify determinism with `node scripts/generate-calendar-browser-fixtures.mjs`.
Run `node --test tests/calendar-browser-v1.test.mjs tests/calendar-browser-candidate.test.mjs`.
The generator's `--patch` prints a patch; it never writes production content.

The separate candidate planner accepts an explicit range, evidence identifier
and an already independently verified normalized source context. Its JSON input
cannot itself authenticate those assertions. It emits only a pending proposal to
stdout, labeled `UNREVIEWED_ARCHIVE_CANDIDATE_NOT_PUBLICATION_HISTORY`; publication
evidence still needs a concrete review. It never writes, signs, fetches, publishes,
changes indexes or fills in earlier dates implicitly.
