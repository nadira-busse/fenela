# AI and Ethical Use Guardrails

Fenéla uses AI for one limited purpose: generating three anchor suggestions from the user's goal, current friction and motivation.

AI supports the user when they know what they want to do but cannot easily decide where to begin. It does not choose the goal or replace the deterministic application flow.

## AI scope

When AI assistance is enabled, Fenéla:

- turns the user's goal into three short, concrete anchor suggestions;
- uses the stated friction and motivation to make those suggestions more relevant;
- turns vague input into practical starting points;
- reduces the mental effort required to decide where to begin.

The user remains in control. Suggestions can be kept, regenerated, edited or removed, and manual anchors can be added before the set is saved.

Fenéla does not use AI as:

- an open-ended chatbot;
- a therapist or medical advisor;
- a crisis support system;
- a life coach;
- a full planner;
- a broad productivity assistant.

The technical route flow, validation sequence and fallback behavior are documented in [`architecture-overview.md`](../../architecture/architecture-overview.md).

## Input quality guardrails

Fenéla rejects input that does not contain enough meaningful context.

Examples include:

```text
j
jjj
abc
me
```

The validation is deliberately simple. It checks whether the input contains enough words and variation to support a useful request.

It does not attempt full language understanding. Its purpose is to avoid sending meaningless input to the model and asking AI to infer a goal that the user did not provide.

## Safety boundary

Fenéla must not turn harmful, abusive, illegal or exploitative intentions into actionable steps.

The current safety layer combines:

1. a deterministic, pattern-based filter for user input and saved anchors;
2. prompt instructions that prevent the model from generating unsafe suggestions;
3. output validation before generated anchors are accepted.

The filter targets explicit patterns involving:

- violence, threats, stalking or harassment;
- theft, fraud, phishing or unauthorized access;
- weapon-related harm;
- drug dealing or smuggling;
- sexual abuse or exploitation;
- evading law enforcement or destroying evidence;
- self-harm, suicide or harm to others.

When unsafe intent is detected, Fenéla rejects the input and asks the user to choose a safe, lawful and respectful goal instead.

The patterns are intentionally selective because some words also occur in harmless phrases, such as:

```text
kill it at my interview
attack my todo list
shoot for a promotion
habit hack
secret weapon
```

Several checks therefore require a person, malicious object or other harmful context before blocking the input.

This reduces avoidable false positives, but indirect or unusual unsafe phrasing may still be missed. The filter is deliberately narrow and does not provide comprehensive intent detection.

## Generation and output validation

The generation and repair prompts instruct the model to:

- stay close to the user's goal, friction and motivation;
- return exactly three short and actionable anchors;
- keep the wording calm and non-pressuring;
- avoid medical, therapeutic, diagnostic or crisis language;
- avoid harmful, illegal, abusive or exploitative suggestions.

Prompt instructions alone do not guarantee valid output.

Every response is therefore parsed and checked for:

- the expected structure;
- exactly three anchors;
- anchor length and quality;
- relevance to the user's input;
- safety.

If the first response fails validation, Fenéla makes one constrained repair attempt.

If the repaired response also fails, the app returns local deterministic suggestions instead of displaying invalid AI output.

## Validation and tests

The automated tests cover:

- low-quality input rejection;
- explicit self-harm detection;
- direct violence against a person;
- selected theft, fraud and cyber-abuse patterns;
- selected Dutch violence patterns;
- benign phrases that should not be blocked;
- validation of individual anchors and anchor lists;
- AI response parsing;
- fallback behavior;
- API route validation.

These tests reduce regression risk for known behavior. They do not prove comprehensive moderation or complete safety coverage.

## Known limits

The current guardrails do not provide comprehensive content moderation, crisis assessment or reliable detection of every unsafe intention.

The pattern filter can produce false positives and false negatives. Prompt instructions and model output can also fail.

These limits are documented explicitly rather than hidden.
