# Widget excerpt v1 — frozen shared optional inline contract

Wire location: `days[].slots[].quote.widget_excerpt` inside the existing
`daily-cycles-r1` module's `data/legacy-cycle.sr-Cyrl.json` and
`data/legacy-cycle.sr-Latn.json`. It is optional. The module remains type
`cycles`, required, with its existing `cycle-v1`, `sr-Cyrl`, `sr-Latn`
capabilities and library dependency. No new capability or module type is added.
Existing Android explicitly reads known quote keys; existing iOS synthesized
`Quote: Codable` ignores unknown keys. Full quotes and reading actions remain
unchanged for clients that do not implement this extension.

The existing Android adapter additionally checks cycle bytes against the old
annual manifest. Therefore sequence 4 requires Android versionCode **35** and
the native adapter's authenticated-M0 projection fix; older Android clients
must reject the new release at the minimum-version check and retain known-good
local content. The old library manifest is not rewritten. iOS minimum remains
`0.1.0`; its old quote decoder ignores the optional object.

## Frozen fields

All fields below are required within a present object; unknown fields are
rejected for v1. The JSON schema fixes types and bounds.

| Field | Meaning |
|---|---|
| `schema_version` | Exactly `svetlost33-widget-excerpt-1` |
| `locale` | Exactly `sr-Cyrl` or `sr-Latn`, matching the actual active locale |
| `source_slot_id` | Exact containing slot ID, never a separate quote identity |
| `text` | Approved literal, contiguous prefix of the full active `quote.text` |
| `text_sha256` | SHA-256 of UTF-8 decoded `text`, without normalization |
| `reference` | Exact localized reference for the selected verses, **without** the visible label |
| `verse_numbers` | Nonempty ordered leading subset of the full quote's verse numbers |
| `source_range` | `{ "start": 0, "end": N }`, half-open range in Unicode scalar values of full `quote.text`; N is excerpt length |
| `source_text_sha256` | SHA-256 of UTF-8 decoded full active `quote.text`, without normalization |
| `psalm_id` | Exact full quote/local psalm ID |
| `source_id` | Exact full quote/local psalm source ID |
| `source_url` | Exact full quote source URL, including its original verse anchor |
| `numbering` | Exactly `DANICIC_EBIBLE_SRP1868`, also equal to the full quote |
| `approval_id` | Shared editorial approval identity carried in authenticated content |
| `review_status` | Must be `approved` to be eligible; other review states enable nothing |

There is no remote label field. Native UI appends the fixed visible label
`извод` / `izvod`, e.g. `Пс 92,1 · Даничић · извод` and
`Ps 92,1 · Daničić · izvod`. The containing full quote still references
`Пс 92,1–2 · Даничић` / `Ps 92,1–2 · Daničić` and opens its original psalm.

The first approved objects use approval ID
`shared-widget-excerpts-five-2026-09-18-r1` for exactly these five slots in
both scripts: `general-day-2-morning`, `general-day-4-morning`,
`general-day-5-morning`, `general-day-6-morning`, `general-day-6-noon`.
The other six rows of the prior proposal remain unapproved and absent.
Clients must not hardcode these text pairs or infer approval from a slot ID;
they consume the authenticated optional object. Future approved selections
can use a new signed content revision and approval ID under the same contract.

The host normalizes its selected script context to `sr-Cyrl`/`sr-Latn` before
calling validation: historical source roots use `sr-Cyrl-RS`/`sr-Latn-RS`, while
iOS projected roots use the canonical two-part forms. This normalization is
only of known host locale identifiers, never of the excerpt or Scripture text.

## Binding and fallback

The host must first establish the existing M0 signature, file hash, activation
and anti-replay checks (or equivalently verified bundled content). No object
can authenticate itself. Revalidate against the actual active slot, locale,
full quote and local full psalm; never against copies supplied by the excerpt.

The reference validator exports:

```js
evaluateWidgetExcerpt(excerpt, {
  contentAuthenticated: true,
  locale: 'sr-Cyrl',
  slotId: activeSlot.id,
  quote: activeSlot.quote,
  psalm: activePsalm // id, source_id, numbering, verses[{number,text}]
})
// { eligible: true, reason: null } or { eligible: false, reason: <fixed code> }
```

Validation checks the exact schema, approved status, slot/locale/source
identity, both text hashes, literal strict prefix, scalar range, selected
verse numbers and exact reference. It also reconstructs the full quote from
its listed local psalm verses joined by one ASCII space, requiring byte-exact
text equality. The excerpt must fit within the same joined text for its
selected verses. Numbers must be increasing consecutive verses and the
leading subset of the containing quote. Daničić references are exactly
`Пс N,V · Даничић` / `Ps N,V · Daničić`, using an en dash for a multi-verse
range. No whitespace/case/Unicode normalization, transliteration, punctuation
repair, inserted ellipsis or range truncation occurs at runtime.

Missing/null, unknown-schema, malformed, unapproved, unauthenticated or
mismatched objects are **ignored**, never grounds to reject otherwise valid
full content. The native renderer continues its existing full-quote/reference
fallback. An eligible excerpt is merely available to the approved small-widget
layout; it must still be measured with the fixed visible label and user/system
type size. If it cannot fit, retain the allowed reference/read action fallback.
No excerpt replaces the full reader, full quote or wallpaper automatically.
Existing `slot.widget.full_quote_required: true` remains unchanged for old
clients. New small-widget rendering may use this explicit approved extension
only after all checks pass; otherwise the original whole-quote/reference policy
retains precedence. The selected excerpt itself must be rendered in full.

Deterministic reasons, checked in this order: `absent`, `unsupported_schema`,
`malformed`, `unapproved`, `content_not_authenticated`, `source_mismatch`,
`source_hash_mismatch`, `text_hash_mismatch`, `not_literal_prefix`,
`range_mismatch`, `verse_mismatch`, `reference_mismatch`. Success is
`{ "eligible": true, "reason": null }`. Structural failure is returned rather
than thrown so the optional extension never disables reading.

## Portable fixtures

`fixtures/widget-excerpt-v1/cases.json` is test input only. Its `contexts`
contain the real approved quote/psalm evidence, and its `excerpts` contain the
ten approved optional objects. One additional explicitly marked
`synthetic_context_ids` entry uses a non-BMP character solely to distinguish
Unicode scalar counts from UTF-16 counts; it is not a Scripture selection or
runtime input. A case selects both by the same `base` ID
(`slot-id/locale`), clones them into `{ excerpt, context }`, then applies
RFC 6902 `add`, `replace`, or `remove` operations from `patch` using JSON
Pointers. Compare the whole result to `expected`. These are not runtime text
tables, and native clients must not load fixtures as live content.

The final fixture has 36 cases, including a paraphrase with a recomputed hash,
an excerpt equal to the full quote, and the synthetic scalar/UTF-16 boundary.

The new cycles revision and its evidence live at unique paths. Old s2/s3
signed artifacts stay immutable; a sequence-4 release references the new
cycles manifest and the unchanged library/calendar/organizations manifests.
