# AI and Ethical Use Guardrails

Fenéla uses AI only for bounded anchor suggestions.

AI is not the product. The product is the loop:

```text
overwhelm -> one small action -> gentle accountability -> daily return
```

The AI layer exists only to help a user turn their own goal, friction and motivation into small anchor suggestions.

## AI scope

AI may help with:

- suggesting smaller actions;
- rephrasing vague input into practical anchors;
- reducing a large intention into one realistic next step;
- using the user's stated motivation to make suggestions less generic.

AI must not become:

- a therapist;
- a medical advisor;
- a crisis support system;
- a life coach;
- a full planner;
- a broad productivity assistant.

## Bounded route

The AI route is:

```text
/api/ai/anchors
```

It is intentionally narrow. It should generate anchor suggestions, not open-ended coaching output.

The parsing, validation and fallback logic for AI-assisted anchors should remain in testable library code, separate from the route handler. The route should orchestrate the request; the reusable logic should remain easy to test.

## Input quality guardrails

Fenéla should reject very low-quality input before AI generation.

Examples that should be rejected:

```text
j
jjj
abc
me
```

The goal is not perfect language understanding. The goal is to avoid asking the AI to rescue meaningless input.

## Ethical use guardrails

Fenéla should not help users turn harmful, abusive, illegal or exploitative intentions into small actions.

The AI-assisted flow should reject or avoid generating suggestions for goals involving:

- violence or threats;
- stalking or harassment;
- fraud or theft;
- weapons or physical harm;
- illegal drug activity;
- sexual exploitation or abuse;
- malware, hacking or unauthorized access;
- evading law enforcement or legal accountability;
- self-harm or harm to others.

When unsafe input is detected, Fenéla should ask the user to choose a safe, lawful and respectful goal instead.

## Output guardrails

AI output should be:

- short;
- practical;
- non-clinical;
- non-diagnostic;
- non-pressuring;
- limited to small anchors.

AI output should avoid:

- medical claims;
- therapy claims;
- diagnosis;
- crisis handling;
- promises of transformation;
- pressure-based coaching language;
- broad wellness boilerplate.

## Safety boundary

Fenéla includes a basic pattern-based safety filter.

This is not comprehensive content moderation, crisis detection or a therapeutic safety system. It is an MVP-level guardrail that blocks obvious unsafe patterns and documents the limits of the public project.

## Product boundary

Allowed:

```text
Help me make this action smaller.
```

```text
Suggest a realistic first step.
```

```text
Turn this into a daily anchor.
```

Not allowed for MVP:

```text
Create a full life plan.
```

```text
Analyze my mental health.
```

```text
Act as my therapist.
```

```text
Help me do something harmful or illegal.
```

## Validation boundary

The AI-assisted flow should be validated with automated tests for the highest-risk behavior:

- low-quality input rejection;
- unsafe input rejection;
- AI response parsing;
- anchor validation;
- fallback behavior;
- API route validation.

These tests do not prove full safety. They reduce regression risk for the bounded MVP behavior.

## Result

Fenéla uses AI where it reduces friction.

It does not use AI to expand scope, increase dependency or normalize unsafe intent.
