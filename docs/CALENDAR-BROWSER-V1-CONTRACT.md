# Calendar browser v1 — additive technical contract

This contract implements the technical part of SPEC v0.28's calendar and shared
public reading archive. It does not approve feast membership, new religious
text, historical publication claims, signing or publication. The only supplied
data is synthetic test material under `fixtures/calendar-browser-v1`; none is
a production candidate. Existing schemas, signed payloads, indexes and approvals
remain immutable.

## Transport and exact wire format

| Field | Value |
|---|---|
| Module ID and capability | `calendar-browser-v1`, `["calendar-browser-v1"]` |
| Module type / required | `library` / `false` |
| Exactly one payload | `data/calendar-browser-v1.json` |
| Content type / encoding | `application/json` / `utf-8` |
| Schema | `svetlost33-calendar-browser-1` |
| Raw payload limit | 1,048,576 bytes, checked before decoding |

Version/revision equal the verified manifest. The schema is
`schemas/calendar-browser-v1.schema.json`; all objects are closed. No new M0
module type is added. Existing 16-module limits, signature/hash/expiry/replay
checks and platform optional-module retention behavior remain unchanged.
Unsupported optional capabilities are skipped under existing rules. A retained
optional revision cannot expose data unless its full generation triple and
exact bindings match the captured verified generation. Distinguish annual,
saints, liturgical catalog and browser `library` modules by ID/capability.

```text
{
 schema_version,version,revision,
 review_status:"pending"|"approved"|"rejected",approval_id:ID|null,
 calendar_profile_id,
 catalog_binding:{module_id,version,revision,path,sha256}|null,
 feast_memberships:[{observance_id,occurrence_ids:[ID],
                    review_status:"pending"|"reviewed",source_ids:[ID]}],
 archive_start_date:date|null,
 archive_bindings:[{id,policy_id,policy_version,
                    library_binding:ManifestBinding,
                    cycles_binding:ManifestBinding}],
 archive_days:[{date,binding_id,status:"available"|"corrected"|"withdrawn",
                correction_id:ID|null,
                phases:[{phase:"morning"|"noon"|"evening",cycle_day_id,
                         slot_id,psalm_id,verse_numbers:[integer],prayer_id}]}]
}
ManifestBinding = {module_id,version,revision,manifest_sha256}
```

Catalog binding is exactly `liturgical-catalog-v1` and
`data/liturgical-catalog-v1.json`. A null binding requires no memberships and
allows an archive without calendar metadata. Manifest bindings include all
library/cycle files and both scripts, not just one psalm file. Host manifest
digests come from verified exact manifest bytes, never payload claims.
Manifest dependencies are exactly `[]`. These are optional domain references,
checked by the feature resolver. A dependency declaration is a mandatory M0
transport requirement even for an optional module; declaring every old archive
binding would reject the whole candidate when old content is absent. This does
not skip or weaken any existing transport check. Different historical bindings
may name different versions of the same module, but only a uniquely matching
current-generation context is usable; M0 permits each module ID only once.

Limits: 128 memberships; 16 occurrence IDs and eight sources per membership;
eight archive bindings; 1,464 explicit dates; three phases per date; 176 ordered
distinct verse numbers per phase. Dates are strict proleptic Gregorian civil
dates 0001–9999. IDs and revisions use existing safe-integer M0 conventions.
Membership IDs, archive dates, binding IDs and phases within a date are unique.
Verse numbers strictly ascend. Available rows have at least one phase;
withdrawn rows have no phases. Null archive start requires empty archive rows
and bindings. With an archive, its start equals its first recorded date;
no row may precede it. Array order is deterministic, with archive dates ascending
and phase order morning/noon/evening. Every archive binding is used.

## Reviewed feast membership

Membership means selection into this reviewed browser list, not an inferred
liturgical rank. Evidence must specifically support that selection and the
annual occurrence for the declared profile. Never infer it from `kind=feast`,
a title, wallpaper ID, popularity, recurrence, a 13-day offset or Easter math.
Sources are canonical catalog source IDs. A future production approval must
review their relevance to membership; a technically valid source reference alone
does not constitute editorial approval. No real membership is supplied here.

Resolve the exact authenticated catalog and run its unchanged validator with
its authenticated calendar/article contexts. All generation triples must match
the browser context. Referenced observance, occurrence and calendar profile must
exist and agree. Unknown references invalidate the feast view; pending membership,
source, observance, subject or occurrence does not appear. Calendar dates and
names come from canonical catalog rows; no names or dates are duplicated here.
Catalog coverage remains limited. An empty result means no **known reviewed
occurrence within the available scope**, never no feast or a complete calendar.
Results sort by date, stored membership array order (explicit editorial priority),
then occurrence ID. Keep the first 50 results, extending through the whole final
date group so Još N never hides a known same-date item (absolute maximum 2,048
canonical occurrences). Set truncation only when a later date group is omitted.
`from_date` is today's local civil
date, excluded from upcoming items. Each item includes Gregorian `days_away`.
Today groups all items at the earliest date with `1 <= days_away <= 7`: D+1 is
Sutra, D+7 is included and D+8 is excluded from the announcement. The calendar
list retains later items, grouped by date/month. The full item group preserves
editorial order for its first item and accessible Još N detail. No priority is
derived from IDs, kind or popularity.

## Shared archive, scope and limitations

An archive row asserts a reviewed public day/phase assignment. It is not device
history, a personal activity log or evidence that every offline device displayed
that text. A future production review must provide the publication evidence,
explicit archive start, exact module manifests and approved policy that support
each interval. Release issuance/expiry, repository timestamps, current weekdays
and old device anchors do not supply that evidence. No backdated rows are
published or proposed as historical fact by this change.

The current approved selector is `policy_id: calendar-week-v1`,
`policy_version: 1`: Monday is cycle day 1 through Sunday 7. Legacy payload
metadata still describes a null per-device start anchor and 05/11/18 times;
SPEC DC-01/DC-05 supersede those metadata without changing frozen payload bytes.
The live selector before the user's morning time belongs to the previous effective
day. The archive's explicitly selected date and phase use that date directly;
they never manufacture a clock time to call live Today. Its 7 × 3 references
repeat by policy, but this does not prove a public historical assignment.

V1 resolves only exact library/cycle modules independently authenticated within
the captured current generation. Every supplied matching archive context must
match `{id,sequence,decision_sha256}` and exact module/version/revision/manifest
digest. The cycle slot and all psalm/prayer/verse references must match explicitly;
its `cycle_day` must equal the Gregorian ISO weekday of the selected date.
That is validation of a recorded claim, never a fallback reconstruction.
An old revision that is not present is unavailable, never replaced with the
latest slot. Carrying several old revisions would require independently reviewed
archive module identities/projectors within current M0 bounds; activating old
release sets, lowering anti-replay minimums, bypassing expiry or silently trusting
an old retained generation is forbidden. This implementation does not add such
an archive-content distribution system.

The archive never changes active content, preferences, live phase, reading
schedule, widget timeline, wallpapers or telemetry. A returned selection captures
its generation and bindings. An opened reader retains that exact selection across
midnight or OTA; if it cannot retain the exact authenticated content, it reports
unavailable. A currently authenticated withdrawal overrides a stale open copy.
Do not resolve an archive reference through an unqualified latest-library lookup.

Before the start, with no archive, or after known rows, absence is unknown data,
not confirmed absence of text. Missing phases remain explicitly unavailable.
Withdrawal preserves the day tombstone but exposes no reading references.
A corrected row requires a nonnull `correction_id` identifying the reviewed
correction evidence in the new module approval; all other rows require null.
The UI visibly marks the day as corrected. The new module version/revision and
that marker disclose a replacement; it must never masquerade as unchanged
original text. If corrected bodies are unavailable, the correction ID remains
in the result alongside content unavailability. This is an editorial correction,
not a new local re-resolution against the latest cycle.
Calendar/gospel/saint metadata and archive psalm/prayer availability are separate;
loss of calendar coverage does not erase a valid archive selection.

## Host context and pure APIs

The following is a test/host API, not authenticated wire data. Authentication
booleans must be literal `true`, supplied by the verifier. Never deserialize them
from remote content or preferences.

```text
context = {
 generation:{id,sequence,decision_sha256},contentAuthenticated:boolean,
 moduleContext:{module_id,module_type,required,capabilities,payload_path,
                version,revision,generation,dependencies:[{module_id,version}]},
 catalogContext:null|{
   module_id,version,revision,path,sha256,generation,authenticated:boolean,
   payload:existingCatalogPayload,context:existingCatalogHostContext},
 archiveContexts:[{
   binding_id,generation,authenticated:boolean,review_status:"approved",
   library:{module_id,version,revision,manifest_sha256,
            psalms:[{id,verse_numbers:[integer]}],prayer_ids:[ID]},
   cycles:{module_id,version,revision,manifest_sha256,
           days:[{id,cycle_day,slots:[{id,phase,psalm_id,verse_numbers,prayer_id}]}]}
 }]
}

validateCalendarBrowserPayload(payload) -> {valid,reason}
parseCalendarBrowserPayload(bytes) -> {valid:true,reason:null,payload}|{valid:false,reason}
evaluateCalendarBrowser(payload,context) -> {eligible,reason}
upcomingBrowserFeasts(payload,context,{from_date,locale}) ->
 {eligible:false,reason} | {eligible:true,reason:null,state,
   coverage:"limited_catalog",coverage_years:[year],truncated:boolean,
   items:[{date,days_away,observance_id,occurrence_id,name}]}
resolveBrowserArchiveDay(payload,context,{date}) ->
 {eligible:false,reason} | {eligible:true,reason:null,date,state,correction_id,phases:[{
   phase,state,selection:null|{cycle_day_id,slot_id,psalm_id,verse_numbers,
     prayer_id,policy_id,policy_version,library_binding,cycles_binding,generation}
 }]}
```

Feast states: `matches`, `no_known_occurrence`, `unavailable`.
Archive day states: `available`, `corrected`, `archive_unavailable`, `uncovered`, `withdrawn`,
`content_unavailable`. Phase states: `available`, `phase_unavailable`,
`content_unavailable`, `withdrawn`. Nonavailable days have empty phase arrays;
available/content-unavailable recorded days return all three phase positions.
Missing metadata maps to `unavailable`, separately from the archive API.
Names use requested supplied `sr-Cyrl` or `sr-Latn`, never search-normalized text.
Reason keys are diagnostics for native localization, not direct UI copy.

Rejection precedence: absent → unsupported schema → malformed → unapproved →
content_not_authenticated → module_mismatch → generation_mismatch → invalid_context.
Then validate API arguments. In the feast API invalid/missing/unapproved catalog,
wrong catalog generation, binding or reference means feast state unavailable.
In the archive API unavailable date boundary/tombstone precedes content checks;
missing/duplicate/untrusted/withdrawn archive context, wrong generation/binding,
unsupported policy or invalid slot/library reference means content unavailable.
No optional feature failure changes existing updater policy.

## Test and future candidate preparation

`fixtures/calendar-browser-v1/cases.json` contains only synthetic identities,
trust and review. Its purpose marker is
`TEST_ONLY_SYNTHETIC_NOT_PUBLICATION_OR_OWNER_APPROVAL`. For each case, clone the
baseline payload/context, apply path mutations, call its `evaluate`, `upcoming`
or `archive` operation, and compare the complete result. A root path `[]`
replaces the whole baseline. Fixed independent assertions supplement deterministic
generation. No development keys are needed and no signatures are created.

The candidate planner `scripts/prepare-calendar-browser-archive-candidate.mjs`
is a pure proposal tool: exact already approved cycle/library inputs, explicit
start/end, publication evidence identifier and policy are mandatory. Its output
is pending, with null approval; it does not claim those rows were historically
published. A human must review the actual publication interval before a separately
authorized release. It cannot sign, update indexes, publish, fetch or activate.
