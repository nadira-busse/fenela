# ADR-005: Deterministic Reflection History

## Status

Accepted.

## Context

Fenéla already asks the user for information that can help make guidance more personal.

Most current screening preferences already affect deterministic copy, the interaction flow or AI prompt context.

MVP2 does not need to rebuild that personalization from scratch.

The larger gap is continuity over time.

For example, the current coaching flow asks:

> What is making this step hard right now?

The pause-reason textarea is now persisted as a factual FrictionEvent when the user deliberately submits non-empty text.

If Fenéla asks a question like this, the answer should have a clear purpose.

MVP2 is intended to preserve selected user-owned history so Fenéla can return to relevant patterns during short weekly and monthly reflections.

This introduces a design question:

> Should an AI model interpret the raw history and decide what happened, or should Fenéla first establish the facts itself?

## Decision

Historical facts will be stored and aggregated deterministically.

The conceptual history includes:

```text
ActionEvent
FrictionEvent
```

ActionEvent represents relevant in-app actions such as completion or postponement.

FrictionEvent represents an explanation the user deliberately enters about why a specific step is difficult.

These records exist to support Fenéla's own continuity.

They do not turn the application into a general event-sourced architecture.

Weekly and monthly reflections will follow this boundary:

stored history
↓
deterministic aggregation
↓
structured reflection facts
↓
optional AI wording
↓
validated output or fallback

The AI model will not be the source of truth for:

event counts;
completion status;
postponement counts;
active days;
date ranges;
ownership;
historical records.

Where AI is used, it may help turn already established facts into concise human-readable wording.

The model will receive only the context needed for that specific reflection.

Fenéla will not build hidden psychological profiles from free-text friction.

Reflection may describe observable product history.

For example:

You postponed three steps this week and twice said the step felt too large.

It must not convert that into unsupported statements about personality or mental state.

Weekly reflection will support one small short-term adjustment.

Monthly reflection will make gradual development of a user-chosen routine visible.

Neither becomes a productivity dashboard, performance score or general analytics system.

## Reason

The reflection feature depends on historical accuracy.

Counts, periods and ownership are deterministic application concerns.

Delegating those facts to a language model would make the result harder to reproduce, test and explain.

Keeping factual aggregation outside AI provides:

traceability;
reproducibility;
simpler regression tests;
smaller model context;
clearer privacy boundaries;
a deterministic fallback path.

The historical records are intentionally narrow.

They exist because Fenéla needs to remember what happened over weeks and months, not because the project needs an event-sourcing framework.

## Trade-off

Deterministic aggregation can only describe facts the application explicitly records.

It will not produce broad psychological interpretation or open-ended behavioral analysis.

This limits the apparent intelligence of the reflection feature.

That limitation is intentional.

Fenéla accepts narrower interpretation in exchange for predictable behavior and claims that can be traced back to actual user interactions.

Historical persistence also increases privacy responsibilities.

Only fields with an explicit product purpose should be stored, and retention must be defined before production use.

## Impact

MVP2 implementation must:

use persisted FrictionEvent data as factual reflection input;
use persisted ActionEvent history as factual reflection input;
make duplicate event writes safe where retries are possible;
derive weekly and monthly facts deterministically;
define user-timezone behavior before calendar-based aggregation is finalized;
keep reflection output short;
validate any AI-assisted wording;
provide non-AI fallback behavior;
document what personal data is stored and why.

Existing unused history helpers such as the current DayLog code do not define the MVP2 model.

They should only be reused if they match the accepted domain requirements after implementation review.
