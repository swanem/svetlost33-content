# Svetlost33 data-only update contract v1

This is the single transport boundary shared by Android and iOS for v0.14.
Product rules remain in `docs/SPECIFIKACIJA.md`; this document fixes only the
bytes and validation order used by both clients.

An update consists of exact UTF-8 `manifest.json` bytes, detached
`manifest.sig`, and every relative path in `manifest.files`. The signature is
`SHA256withRSA` over the exact manifest bytes. `manifest.signing_key_id` selects
one public key pinned in the application; unknown keys fail closed. Private
keys never enter a mobile application or repository.

Clients perform these steps in order:

1. Limit manifest, file count, individual paths and total uncompressed size.
2. Verify the detached signature before trusting any manifest field.
3. Require an exact file set and verify UTF-8 byte length plus SHA-256 for every file.
4. Require compatible schema, package identity, both locales, component gates,
   all references and complete structural validation.
5. Write to a new staging directory, make every file durable, rename the whole
   directory, then atomically replace the active pointer.
6. Keep the previous complete directory and the bundled application fallback.

Missing, extra, traversing, changed, oversized, unsigned, unknown-key,
incompatible or unapproved packages are rejected without changing the active
pointer. Retrying an already installed package is idempotent. A reader keeps
the package revision and date from its route until the user leaves it.

The annual review package `svetlost33-annual-2026-review-1` is a negative
fixture: its release gates are closed and it must not activate. A future
published revision must preserve the same schema and receive a new manifest,
signature and exact review; changing a Boolean is not an approval process.

`update-fixtures.json` is the frozen cross-platform decision matrix. Android
executes its schedule cases directly and covers the candidate boundaries with
installer tests. The iOS client must consume the same cases before either
platform can activate a published annual package.
