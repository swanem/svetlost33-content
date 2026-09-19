# Organization details — unsigned r2 preparation

Status: **prepared for coordinating-task review; unsigned and unpublished**.
One proposed shared payload serves Android and iOS under canonical specification
v0.24.8, commit `c67d96c`, DB-12.

The current user request authorizes list logos, organization details opened by
Podrži, descriptions, official website/social links and removal of self-reported
payments. [decision-draft.json](decision-draft.json) records that scope without
inventing a separate owner signature or permission from a logo rights holder.
The application behavior is implemented in the native tasks, not in this payload.

## Exact proposed content

`modules/organizations-v1/2026.9.19-r2/data/organizations-v1.json`

- Version `2026.9.19`, revision `2`, `dataset_kind: reviewed`.
- 11,073 UTF-8 bytes; SHA-256
  `ad1fa507b83da7186a4bf66fdb3eb2695cbb0703e45e21d42ddfadbdcd4709a0`.
- Review/issue timestamp `2026-09-19T10:23:18Z`, recorded from the current UTC
  clock after official-page inspection.
- Exclusive expiry remains `2026-10-18T10:35:15Z`; no old review is extended.
- The same three organizations, localized descriptions, legal identities,
  original sources and six complete donation/story records are preserved.
- Nine new records add one website, Instagram and Facebook link per organization.
  Their evidence is each organization's official page publishing the exact URL,
  not an independent audit of the social account.
- All `payment_rails` remain empty and all `logo` fields remain null. No new bank
  instructions, donor data, tracking parameters or source markers are introduced.

| Organization | Website | Instagram | Facebook |
|---|---|---|---|
| NURDOR | https://www.nurdor.org/ | https://www.instagram.com/nurdor_srbija/ | https://www.facebook.com/nurdor/ |
| Fondacija NORBS+ | https://norbs.rs/fondacija-norbs-plus/ | https://www.instagram.com/norbsplus/ | https://www.facebook.com/NORBSPlus |
| Srbi za Srbe | https://www.srbizasrbe.org/ | https://www.instagram.com/srbizasrbe | https://www.facebook.com/srbizasrbe |

The NORBS+ website link opens the official foundation identity page. Its existing
donation link remains `https://1jeposeban.rs/`. The parent NORBS association's
accounts, logo and general donation destination are not substituted.

## Logo-source findings

[source-review.json](source-review.json) records exact official asset URLs,
observed dimensions, role and limits. NURDOR and Srbi za Srbe expose standalone
PNG header logos. Their publication establishes provenance; no reusable license
or written permission was established by this review.

The NORBS+ identity page contains a photograph with its wordmark and an
illustration with an anniversary mark. The separate 1 je poseban images are
campaign marks. A clean standalone NORBS+ foundation asset remains unverified.
The listed norbsplus.rs site was under construction with a broken image. No image
was downloaded, packaged, synthesized or recorded as licensed.

## Verification and handoff boundaries

Run the focused checks from the repository root:

```sh
node --test tests/organizations-v1.test.mjs tests/charity-details-r2.test.mjs
node scripts/validate-organizations-v1.mjs modules/organizations-v1/2026.9.19-r2/data/organizations-v1.json --now 2026-09-19T10:23:18Z
```

The focused tests verify the exact nine added destinations, unchanged original
records and pinned historical/current discovery bytes, evidence binding,
unauthenticated rejection, payment-session freshness and exclusive expiry.
Editorial eligibility checks use explicit hypothetical authenticated context;
they do not authenticate this unsigned payload or create a shipping release.

Preparation verification: the focused command passed **69 tests, 0 failures**.
The CLI returned `valid: true` and `registry_eligible: false` with every action
disabled because this source file is unauthenticated and has no runtime module
context. `git diff --exit-code` confirmed that no pre-existing tracked file
changed; the only additions are this review folder, the new r2 payload and its
focused test file.

No module manifest, release-set, detached signature or publication was created.
Existing modules, approvals, preparation/signing scripts and signed releases are
unchanged. The observed current local production pointer is sequence 4. After
review, any separate candidate packaging must preserve the then-current base
modules and use a new release sequence; the historical sequence-2-to-3 charity
preparer is not a preparation path for this revision.
