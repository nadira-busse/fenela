# AGENTS.md — Fenéla

## Purpose

This file defines repository-wide instructions for AI coding agents working on Fenéla.

Fenéla is a public MIT-licensed accountability application.

Its purpose is simple:

> Help a user move from overwhelm to one small, personally meaningful action, then support gradual routine development through calm and limited accountability.

The product must remain small, understandable, predictable and maintainable.

Do not turn Fenéla into a general productivity platform, therapy application, coaching platform or generic AI assistant.

---

# 1. Repository principles

Prefer solutions that improve:

- product clarity;
- simplicity;
- maintainability;
- deterministic behavior;
- testability;
- traceability;
- explicit ownership;
- privacy;
- accessibility;
- low cognitive load.

Avoid:

- unnecessary abstraction;
- premature generalization;
- feature creep;
- hidden state;
- vague AI behavior;
- unnecessary dependencies;
- technology added only for architectural appearance;
- broad refactors without a concrete problem.

A working simple solution is preferable to a more sophisticated architecture that does not solve a current requirement.

---

# 2. Product boundary

Every change must support Fenéla's core loop:

```text
overwhelm
→ personally meaningful goal
→ small anchor
→ one action
→ gentle accountability
→ return
```

Fenéla supports persistent continuity and a limited weekly reflection while keeping the core product small.

Do not introduce without explicit approval:

- project management;
- project-management boards;
- generic task lists;
- calendar planning;
- time tracking;
- productivity scoring;
- performance percentages;
- leaderboards;
- competitive gamification;
- complex dashboards;
- general journaling;
- generic chat;
- psychological profiling;
- diagnoses;
- hidden personality models;
- broad life coaching.

Weekly reflection must remain short and supportive.

The existing monthly reflection primitives must not be expanded into a user-facing flow unless explicitly requested.

Reflection must not become an analytics dashboard or productivity report.

---

# 3. Current product state

Fenéla currently includes:

- authenticated users;
- user-owned persistence;
- historical action and friction data;
- optional reminders with authenticated device ownership;
- deterministic weekly reflection;
- technical monthly reflection primitives without a user-facing monthly flow;
- user-initiated account deletion;
- inactivity retention.

Treat these as established product and architecture behavior.

Do not rebuild, replace or reopen an established subsystem without:

- a concrete defect;
- a changed requirement;
- new evidence;
- an explicit task.

Do not add a monthly user-facing reflection unless a task explicitly requests it.

---

# 4. Read before changing

Before modifying a subsystem, read the relevant existing implementation and documentation first.

At minimum:

- inspect the files directly involved;
- locate related types;
- locate related tests;
- locate relevant documentation;
- inspect existing ADRs when the change touches an architectural decision.

Do not infer behavior from filenames or comments when executable code can establish the actual behavior.

If documentation and implementation disagree, report the inconsistency.

Do not silently choose one as correct.

---

# 5. Scope discipline

Follow the explicit task.

Do not fix unrelated issues encountered while working unless the task explicitly allows it.

If an unrelated issue is found:

1. report it;
2. explain its impact briefly;
3. leave it unchanged.

Do not expand a focused task into a repository-wide cleanup.

Do not introduce functionality outside the approved task or current product scope

---

# 6. Engineering decisions

For significant changes, be able to explain:

```text
problem
→ requirement
→ decision
→ trade-off
→ implementation
→ validation
```

Prefer explicit system boundaries over implicit behavior.

Relevant engineering principles include:

- separation of concerns;
- deterministic business logic;
- explicit ownership;
- idempotency where retries can duplicate effects;
- failure-safe behavior;
- minimal dependencies;
- predictable data flow;
- testable interfaces.

Do not add abstraction before multiple concrete responsibilities justify it.

---

# 7. Client and server responsibilities

Keep browser/UI concerns separate from persistent domain and security responsibilities.

Client-side state may contain:

- temporary form state;
- presentation state;
- loading state;
- unsaved input;
- short-lived optimistic UI state.

Persistent user-owned state must not rely solely on browser storage when it is required for:

- account continuity;
- recovery;
- weekly reflection;
- ownership;
- historical accuracy.

Security-sensitive identity and authorization decisions belong on the server or in the database security layer.

Never trust caller-supplied identifiers as proof of ownership.

---

# 8. Authentication and authorization

Fenéla's authentication and persistence architecture is:

```text
Supabase Auth
+
Supabase PostgreSQL
```

Authentication establishes identity.

Authorization determines which resources that identity may access.

Do not confuse the two.

User-owned data must always be scoped to the authenticated user.

Do not design APIs that trust arbitrary client-provided `user_id` values.

Prefer deriving identity from the authenticated server session.

Where appropriate, use PostgreSQL Row Level Security as defense in depth.

RLS does not replace clear application authorization logic.

---

# 9. Database and persistence

The persistent domain is relational.

Expected conceptual relationships include:

```text
User
├── UserPreference
├── ReminderPreference
├── Goal
│   ├── Anchor
│   │   └── ActionEvent
│   └── FrictionEvent
├── Reflection
└── Device
    └── PushSubscription
```

This conceptual model is not permission to create unnecessary tables automatically.

Validate each entity against actual product requirements before implementation.

Use:

- foreign keys;
- appropriate nullability;
- uniqueness constraints;
- indexes based on actual access patterns;
- explicit deletion behavior;
- version-controlled migrations.

Do not rely on manually configured production-only database state.

---

# 10. ORM policy

Do not add Prisma, Drizzle or another ORM by default.

Start with the smallest maintainable typed data-access approach.

Introduce an ORM only when a demonstrated current problem justifies it, such as:

- excessive query boilerplate;
- difficult domain mapping;
- transaction complexity;
- significant query composition problems.

Do not add an ORM simply because PostgreSQL is present.

---

# 11. Historical events

Fenéla stores structured historical records such as:

- completed action;
- postponed action;
- skipped action;
- user-entered friction.

This does not make Fenéla an event-sourced system.

Do not introduce:

- CQRS;
- event buses;
- projection frameworks;
- generalized event-sourcing infrastructure;

unless a later concrete requirement requires them.

The purpose of event history is limited:

> reliably reconstruct relevant Fenéla activity for deterministic reflection.

---

# 12. User input rule

Fenéla must not ask users for information it cannot explain how it uses.

For every collected input, be able to answer:

- Why is this asked?
- What behavior does it influence?
- Does it need persistence?
- Which domain concept owns it?
- Does AI need access to it?
- How long should it exist?

If no meaningful use exists, prefer removing the question rather than storing unused personal data.

Do not collect speculative data for hypothetical future features.

---

# 13. Friction and reflection

User-entered friction must be treated as the user's own explanation of a specific action difficulty.

It may support:

- weekly reflection;
- deterministic reflection aggregation;
- adjustment of future anchors;
- factual identification of repeated in-app situations.

Do not transform this into psychological profiling.

Allowed:

> You postponed three steps this week and twice said the step felt too large.

Not allowed:

> You have perfectionistic avoidance tendencies.

Fenéla describes observed application history.

It does not infer diagnoses, personality traits or psychological conditions.

---

# 14. Reflection

Weekly reflection is the current user-facing reflection flow.

The codebase also contains deterministic monthly period and aggregation primitives. These are technical support only and must not be treated as an unfinished product feature.

Preferred architecture:

```text
stored domain history
        ↓
deterministic aggregation
        ↓
structured reflection facts
        ↓
optional AI wording
        ↓
validated output
        ↓
fallback when required
```

The AI model is not the source of truth for:

- counts;
- completion status;
- date ranges;
- event history;
- ownership;
- routine progress facts.

Weekly reflection supports small short-term adjustment.

Monthly reflection, if and when it ships a user-facing flow, would make gradual routine development visible.

Neither should become a detailed analytics or performance system.

---

# 15. AI boundary

AI is optional and bounded.

Use deterministic application logic whenever exact behavior is required.

AI may assist with:

- anchor suggestions;
- structured-output repair where already justified;
- human-readable wording based on validated facts.

AI must not control:

- authentication;
- authorization;
- persistence truth;
- ownership;
- event state;
- date calculations;
- exact counts;
- deletion;
- security decisions.

Minimize the personal context sent to AI providers.

Only include information required for the specific request.

Do not send complete user histories when a smaller context is sufficient.

---

# 16. Privacy

Treat all persistent personal data as intentional product data with an explicit purpose.

Apply:

- data minimization;
- purpose limitation;
- clear ownership;
- appropriate retention;
- user control;
- secure handling.

Do not expose:

- secrets;
- service-role keys;
- tokens;
- credentials;
- private environment values;

to client-side code or the public repository.

Account deletion must remove associated user-owned application data according to the approved data lifecycle.

---

# 17. Reminders and devices

A device is not a user identity.

```text
User
→ Device
→ PushSubscription
```

Reminder operations must be scoped to authenticated ownership.

Do not use caller-provided device identifiers as authorization credentials.

Rate limiting remains separate from authentication and authorization.

Do not remove existing abuse controls simply because authentication is introduced.

---

# 18. Time and timezone

Timezone behavior must be explicit.

Calendar-based reflection aggregation and reminder scheduling must not rely on an undocumented timezone assumption.

When modifying date/time behavior, define:

- authoritative user timezone;
- day boundary;
- week boundary;
- month boundary;
- DST behavior;
- stored timestamp convention.

Prefer storing absolute timestamps consistently and applying user timezone deliberately when deriving user-facing periods.

Do not silently change timezone semantics.

---

# 19. Idempotency

Consider duplicate execution whenever a write may be retried.

Important writes such as action completion or scheduling must not create duplicate logical effects unintentionally.

Prefer simple operation-specific safeguards such as:

```text
stable event identifier
+
ownership
+
unique database constraint
```

Do not introduce a generic idempotency framework unless multiple real operations require one.

---

# 20. Error handling

Do not silently lose important user state.

Explicitly handle relevant failure modes, including:

- authentication failure;
- expired session;
- authorization denial;
- database read/write failure;
- duplicate operation;
- reminder failure;
- expired push subscription;
- AI failure.

UI success state must not imply persistence succeeded when it did not.

Prefer clear fallback behavior over hidden failure.

---

# 21. Accessibility

Do not intentionally disable standard browser accessibility features without a demonstrated requirement.

Preserve:

- text scaling;
- pinch-to-zoom;
- keyboard accessibility;
- meaningful labels;
- sufficient interaction clarity.

When modifying UI, consider the product context:

> Fenéla is used when the user may already feel overwhelmed.

Reduce cognitive load rather than adding configuration or choices.

---

# 22. Testing

Testing must follow risk, not arbitrary coverage targets.

Prioritize:

- authentication;
- authorization;
- cross-user isolation;
- persistence;
- duplicate writes;
- reminder ownership;
- deterministic reflection facts;
- failure paths;
- privacy/security boundaries.

For deterministic logic:

> identical input should produce identical factual output.

AI-generated anchor wording may vary.

AI inputs, validation and fallback behavior must still be testable.

Do not delete or weaken tests merely to make a change pass.

---

# 23. Required validation

Use the repository's existing scripts and package configuration as the source of truth for exact commands.

For code-changing tasks, run the relevant available checks before completion.

The current expected validation set includes:

```text
format / format check
lint
tests
production build
internal documentation link check
```

If a required command cannot run because of the environment:

- report the exact command;
- report the exact failure;
- distinguish environment failure from code failure.

Do not claim a check passed if it was not actually executed successfully.

### Formatting responsibility

When you modify repository text/code files, format the files you changed before returning the task for review.

Use Prettier in write mode only on the files changed by the current task.

Do not run the full repository `npm run format:check` unless the task explicitly asks for final repository validation.

Formatting is part of completing an edit; it is not considered a full validation pass.

Before reporting `READY FOR REVIEW`, changed Prettier-managed files must already match repository formatting.

---

# 24. Documentation

Documentation is part of the engineering output.

When runtime behavior changes, update relevant documentation as part of the same change unless the task explicitly separates documentation work.

Keep claims aligned with implementation.

Use precise status language:

- implemented;
- tested;
- manually verified;
- designed;
- planned;
- not implemented.

Architecture documentation may use precise technical language.

README and product documentation should remain accessible and problem-oriented.

Avoid marketing language and inflated claims.

---

# 25. ADRs

Use ADRs for meaningful architectural decisions, not routine code changes.

An ADR should normally record:

- context;
- decision;
- reason;
- trade-off;
- impact.

Before changing an accepted architectural decision:

1. read the existing ADR;
2. identify the changed requirement;
3. document the new decision appropriately.

Do not silently contradict an accepted ADR.

---

# 26. Public repository discipline

Assume every committed file is visible to:

- developers;
- hiring managers;
- recruiters;
- other users.

Keep the repository:

- understandable;
- reproducible;
- professional;
- free of private data;
- free of stale local tooling;
- free of generated junk;
- free of unnecessary files.

Do not commit:

- real environment files such as `.env`, `.env.local`, `.env.development`, `.env.test` or `.env.production`;
- credentials;
- API keys, tokens or other secrets;
- local private files;
- debug dumps;
- temporary exports;
- machine-specific artifacts.

`.env.example` is the public configuration template and may be committed. It must contain placeholders only and never real secrets.

Respect `.gitignore`, but also verify that previously tracked files are appropriate for publication.

---

# 27. Private agent working context

Local development uses a Git-ignored directory for non-public working context:

```text
.agent-private/
```

This directory is reserved for temporary AI-assisted development context and must never be committed.

Examples include:

implementation plans;
architecture working notes;
review notes;
temporary audits;
agent findings;
phase handovers;
unresolved questions;
local decision-support documents.

Rules:

.agent-private/ must remain ignored by Git.
Do not stage or commit files from .agent-private/.
Do not link to .agent-private/ from public repository documentation.
Files in .agent-private/ may be read and updated when the active task explicitly uses them.
Public architectural decisions must be distilled into the appropriate public repository artifacts, such as ADRs or architecture documentation.
Do not treat private working notes as implemented product behavior or accepted architecture unless a public decision document confirms that status.
Do not move public documentation into .agent-private/ merely to avoid maintaining it.

---

# 28. Dependency discipline

Do not add an npm package when the platform or existing dependencies already provide the required capability adequately.

Before adding a dependency, explain:

- what problem it solves;
- why existing tools are insufficient;
- maintenance/security cost;
- whether it is necessary now.

Remove unused dependencies when their removal is within task scope and safe.

---

# 29. Refactoring discipline

Large files are not automatically defects.

Refactor when a file contains multiple meaningful responsibilities that should evolve or be tested independently.

Good reasons include separating:

- UI rendering;
- persistence;
- reminder orchestration;
- authorization;
- reflection aggregation;
- domain rules.

Bad reason:

> the file has many lines.

Do not perform broad restructuring during an unrelated task.

---

# 30. Coding-agent behavior

For every task:

1. read this file;
2. read the task carefully;
3. inspect relevant implementation before editing;
4. identify assumptions;
5. make the smallest coherent change that satisfies the requirement;
6. run required validation;
7. report exactly what changed.

Do not improvise additional features.

Do not continue into additional work or scope without explicit instruction.

If a task says analysis-only or documentation-only, do not modify runtime code.

---

# 31. Final response requirements

At the end of a coding task, report:

## Changed

List changed files and the reason for each change.

## Validation

List every command actually run and its result.

## Not changed

Mention explicitly important areas that were intentionally left untouched when relevant.

## Open issues

List unresolved ambiguity, environment limitations or discovered out-of-scope problems.

## Assumptions

State any material assumption required to complete the task.

Do not claim:

- tests passed when they were not run;
- runtime behavior was manually verified when it was not;
- future work is implemented;
- an assumption is a fact.

---

# 32. Core rule

When choosing between a larger technically impressive solution and a smaller solution that fully satisfies Fenéla's real requirement:

> choose the smaller correct solution.

Fenéla should become more professional as its architecture evolves, not more complicated for its own sake.
