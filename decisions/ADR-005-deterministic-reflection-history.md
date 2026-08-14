# ADR-005: Deterministic Reflection History

## Status

Accepted and implemented.

## Context

Fenéla asks the user for a small amount of information so the product can keep its guidance relevant without asking for a large profile or continuous journaling.

Some of that information is used immediately.

Screening preferences influence deterministic product behavior and, when AI suggestions are enabled, provide bounded context for optional anchor generation.

The harder problem appeared later: continuity over time.

During the accountability flow, the user may:

- start an anchor;
- complete an anchor;
- postpone an anchor;
- park an anchor for the day;
- explain why a specific step feels difficult.

For example, Fenéla may ask:

> What is making this step hard right now?

When the user deliberately submits a non-empty answer, that friction has a clear product purpose. It becomes part of the factual history of what happened during the accountability flow.

Once Fenéla started keeping this history, a new design question appeared.

If the product later reflects back on the user's week, where should the facts come from?

One option would be to give raw historical data to a language model and ask it to infer what happened.

That would be easy to prototype, but it would also move basic factual questions into a probabilistic system:

- How many anchors were completed?
- How often was something postponed?
- On which days was Fenéla used?
- Which period does this reflection cover?
- Which events belong to this user?

Those are not interpretation problems. They are application-state problems.

That created the architectural boundary for reflections:

> Fenéla should establish what happened deterministically before it says anything about that history.

## Decision

Historical facts are stored and aggregated deterministically.

The factual history consists primarily of:

```text
ActionEvent
FrictionEvent
```

### ActionEvent

`ActionEvent` records relevant in-app actions such as:

- started;
- completed;
- postponed;
- parked for today.

These events provide factual evidence of what the user recorded in Fenéla.

### FrictionEvent

`FrictionEvent` records an explanation the user deliberately submits about why a specific anchor feels difficult.

The event is connected to the relevant accountability context and exists because Fenéla may need that factual input later for continuity or reflection.

These records support Fenéla's own product flow.

They do not turn the application into a general-purpose event-sourcing or behavioral-analytics platform.

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

The current weekly reflection is rendered from deterministic facts through fixed product wording.

This is the MVP2 reflection boundary, not a decision that AI can never play a role in reflection.

MVP3 will evaluate whether AI can add useful personalization or interpretation without weakening the deterministic factual foundation. Any such extension must keep recorded facts, ownership, period boundaries and factual aggregation outside the model.

AI is not used to establish:

- event counts;
- completion state;
- postponement counts;
- active days;
- date ranges;
- ownership;
- historical records;
- current reflection wording.

The period and aggregation logic also support monthly periods, but Fenéla does not expose a monthly reflection flow in the current product.

Fenéla does not use free-text friction to construct hidden psychological profiles.

Reflection may describe observable product history.

For example:

> You postponed three steps this week and twice said the step felt too large.

It must not turn those observations into unsupported conclusions about:

- personality;
- diagnosis;
- motivation;
- mental state;
- capability;
- productivity or performance.

The weekly reflection remains short and may support one small adjustment.

It does not become a dashboard, score, behavioural profile or general analytics system.

## Reason

The main requirement for reflection is trustworthiness.

If Fenéla tells the user what happened during the week, that statement should be traceable to actual recorded product events.

Counts, date boundaries, ownership and event selection are deterministic application concerns.

Delegating those facts to a language model would make the result harder to:

- reproduce;
- test;
- audit;
- explain;
- debug;
- trace back to actual user interactions.

It would also expose more historical personal data to AI without a clear product need.

The deterministic approach keeps a stronger separation between two different responsibilities:

```text
Application logic
→ establish the facts

Product wording
→ present those facts clearly
```

For the current weekly reflection, even the wording remains deterministic.

This keeps the reflection path small, testable and explainable.

It also means Fenéla can make a stronger claim about the reflection:

> the reflection is based on recorded activity, not on an AI model deciding what probably happened.

The historical model remains intentionally narrow.

Fenéla stores factual history because the product needs continuity across days and weeks, not because the repository needs a generic event framework or analytics layer.

## Trade-off

Deterministic aggregation can only describe facts that Fenéla explicitly records.

It cannot provide open-ended behavioral interpretation or infer meaning from information that was never captured.

That limitation is intentional.

Fenéla accepts narrower reflection in exchange for:

- predictable behavior;
- reproducible results;
- simpler regression testing;
- clearer privacy boundaries;
- smaller AI data exposure;
- claims that can be traced back to actual product events.

Adding a new reflection fact therefore requires an explicit product and data-model decision rather than simply asking a model to infer more from existing history.

Persisting factual history also creates additional privacy responsibilities.

Only fields with an explicit product purpose are stored, and their lifecycle follows the same documented ownership, account-deletion and inactivity-retention boundaries as other account-owned Fenéla data.

The current MVP2 reflection wording is deliberately constrained as well. It prioritizes traceability and predictable behavior over richer personalization.

MVP3 may test whether a bounded AI layer can improve the usefulness of reflections without weakening the deterministic factual foundation. That work is future scope and does not change the current MVP2 implementation.

## Impact

Fenéla now:

- persists `ActionEvent` history as factual reflection input;
- persists deliberately submitted `FrictionEvent` history;
- uses stable client event IDs where retries could otherwise create duplicate factual events;
- derives weekly reflection facts deterministically;
- uses explicit timezone-aware period boundaries;
- keeps reflection output short;
- renders the current weekly reflection without AI;
- stores immutable reflection snapshots for historical consistency;
- keeps raw friction reasons out of persisted reflection snapshots;
- documents what historical personal data is stored and why.

The underlying period and aggregation logic also supports monthly periods.

The monthly period logic already exists, but there is no monthly reflection in the product.

Existing browser-local history helpers do not define the canonical reflection model.
