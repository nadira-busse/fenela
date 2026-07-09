# ADR-002: Optional AI-Assisted Anchors

## Status

Accepted.

## Context

Fenéla helps a user move from overwhelm to one small action.

AI can support this by helping the user phrase a realistic anchor. That is useful when the user knows something needs to happen but cannot reduce it to a small next step.

There is also a risk. If AI becomes too central, Fenéla can turn into a planner, coach or advice system. That would make the product heavier and less predictable.

## Decision

Fenéla includes AI-assisted anchor suggestions, but AI remains optional and supporting.

AI may help with:

- suggesting a smaller action;
- rephrasing a vague intention;
- offering calm wording;
- reducing a task to something realistic for today.

AI must not become:

- the main product;
- a therapist;
- a medical advisor;
- a life coach;
- a full planner;
- an advanced productivity assistant.

## Reason

The core value of Fenéla is not AI. The core value is the loop:

```text
overwhelm -> one small action -> gentle accountability -> daily return
```

AI is useful only when it helps the user reach the “one small action” part faster and with less mental effort.

Keeping AI optional also makes the product easier to understand. A user should not need to trust an AI system before they can use the app.

## Trade-off

A limited AI role means Fenéla will not behave like a broad assistant or planner.

I accept that because a broad assistant is not the MVP. The MVP needs calm, predictable support.

## Impact

The AI routes should stay narrow:

```text
/api/ai/anchors
```

The AI experience should:

- use short, practical language;
- avoid inflated claims;
- avoid diagnosis or treatment advice;
- keep the user in control;
- support one anchor rather than generating a full plan.

The app should remain explainable without AI.

## Product boundary

Allowed AI behavior:

```text
“Make this action smaller.”
```

```text
“Suggest one realistic next step.”
```

```text
“Help me turn this into a daily anchor.”
```

Not allowed for the MVP:

```text
“Create a full life plan.”
```

```text
“Analyze my mental health.”
```

```text
“Act as my therapist.”
```

```text
“Manage all my habits and goals.”
```

## Safety boundary

Fenéla should not present AI output as professional advice.

The app should avoid:

- medical claims;
- therapy claims;
- diagnosis;
- crisis handling;
- promises of transformation;
- pressure-based coaching language.

If AI cannot produce a small, safe and practical suggestion, it should fail calmly rather than overreach.

## Maintenance boundary

AI increases maintenance work because prompts, error handling and environment variables must be kept clean.

For this MVP, that cost is acceptable only because the AI role is narrow.

If the AI layer grows beyond anchor suggestions, it should be treated as a future version decision, not a small MVP adjustment.

## Result

Fenéla uses AI where it helps reduce friction, not where it adds dependency.

The app remains a small accountability product with optional AI support, not an AI planning platform.
