# ADR-005: Deterministic Reflection History

## Status

Accepted and implemented.

## Context

Fenéla asks the user for a small amount of information that helps keep guidance relevant.

Screening preferences affect deterministic product behavior and, where appropriate, the context used for optional anchor suggestions.

The larger continuity problem is historical context.

During the accountability flow, the user may:

- start an anchor;
- complete an anchor;
- postpone an anchor;
- park an anchor for the day;
- explain why a specific step feels difficult.

For example, Fenéla asks:

> What is making this step hard right now?

When the user deliberately submits a non-empty answer, that friction has a clear product purpose and is stored as factual history.

If Fenéla later reflects on what happened, it needs a reliable factual basis.

That creates an architectural boundary:

> Should a model infer what happened from raw history, or should Fenéla establish the facts deterministically first?

## Decision

Historical facts are stored and aggregated deterministically.

The factual history consists primarily of:

```text
ActionEvent
FrictionEvent
```

## ActionEvent

`ActionEvent` records relevant in-app actions such as:

- started;
- completed;
- postponed;
- parked for today.

## FrictionEvent

`FrictionEvent` records an explanation the user deliberately submits about why a specific anchor feels difficult.

These records exist to support Fenéla's own continuity and reflection.

They do not turn the application into a general-purpose event-sourcing system.

The reflection boundary is:

```text
stored factual history
↓
deterministic aggregation
↓
structured reflection facts
↓
deterministic product wording
```

The current weekly reflection is rendered from deterministic facts through a fixed template.

AI is not used to establish:

- event counts;
- completion state;
- postponement counts;
- active days;
- date ranges;
- ownership;
- historical records;
- current reflection wording.

The period and aggregation logic also support monthly periods, but Fenéla does not expose a monthly reflection flow.

Fenéla does not build hidden psychological profiles from free-text friction.

Reflection may describe observable product history.

For example:

> You postponed three steps this week and twice said the step felt too large.

It must not convert those facts into unsupported conclusions about personality, diagnosis, motivation or mental state.

The weekly reflection remains short and may support one small adjustment.

It does not become a productivity dashboard, performance score or general analytics system.

## Reason

Reflection depends on historical accuracy.

Counts, periods and ownership are deterministic application concerns.

Delegating those facts to a language model would make the result harder to:

- reproduce;
- test;
- audit;
- explain;
- trace back to actual user interactions.

Keeping factual aggregation outside AI provides:

- traceability;
- reproducibility;
- simpler regression tests;
- clear ownership boundaries;
- smaller data exposure;
- deterministic output.

The historical model remains intentionally narrow.

Fenéla stores factual history because the product needs continuity, not because the repository needs a generic event framework.

## Trade-off

Deterministic aggregation can describe only facts that the application explicitly records.

It does not provide open-ended behavioral interpretation.

That limitation is intentional.

Fenéla accepts narrower interpretation in exchange for:

- predictable behavior;
- testable results;
- privacy clarity;
- claims that can be traced back to actual product events.

Persisting historical activity also increases privacy responsibilities.

Only fields with an explicit product purpose are stored, and their lifecycle is governed by the documented account-deletion and retention model.

## Impact

Fenéla now:

- persists ActionEvent history as factual reflection input;
- persists deliberately submitted FrictionEvent history;
- uses stable client event IDs where retries could otherwise create duplicate factual events;
- derives weekly facts deterministically;
- uses explicit timezone-aware period boundaries;
- keeps reflection output short;
- renders the current weekly reflection without AI;
- stores immutable reflection snapshots for historical consistency;
- keeps raw friction reasons out of persisted reflection snapshots;
- documents what historical personal data is stored and why.

The underlying period and aggregation logic also supports monthly periods.

That technical capability is not treated as an unfinished user-facing feature.

Existing browser-local history helpers do not define the canonical reflection model.
