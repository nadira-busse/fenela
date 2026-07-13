# ADR-001: Optional AI-Assisted Anchors

## Status

Accepted.

## Context

Fenéla helps a user who has one goal but does not know where to begin.

The user describes the goal, the current friction and why the goal matters. When AI assistance is enabled, Fenéla uses that context to generate three short anchor suggestions. The user can regenerate, edit or remove those suggestions and add manual anchors before saving a set of up to five.

The AI layer adds value only when it reduces the effort required to find a realistic starting point. A broader assistant would make the product less predictable and move it away from its accountability flow.

## Decision

Fenéla includes optional AI-assisted anchor suggestions.

The AI layer:

- uses the user's goal, friction and motivation;
- returns exactly three short, concrete suggestions;
- keeps the language calm and practical;
- leaves selection and editing with the user;
- remains separate from the manual anchor route.

The first generation call uses a temperature of `0.7`. This allows variation between suggestions while keeping the output bounded by a structured prompt and validation rules.

If the first response fails parsing, anchor or safety validation, Fenéla makes one repair attempt at `0.2`. The lower repair temperature reduces variation because the purpose of that call is to correct structure and constraint violations rather than create a different plan.

If the repaired output is still invalid, the route returns local deterministic suggestions.

## Reason

The AI feature addresses one specific point of friction: turning a stated goal into a practical place to begin.

Keeping the feature optional means the user can use Fenéla without relying on model-generated output. Separating generation, repair and fallback behavior also keeps the route predictable and testable.

## Trade-off

The AI does not behave as a general planner or open-ended assistant.

The application accepts this narrower role in exchange for:

- clearer product behavior;
- lower cognitive load;
- simpler validation;
- a manual alternative;
- deterministic fallback behavior.

The model configuration still allows some variation, so generated suggestions are not fully deterministic. Parsing, safety checks, validation, one repair attempt and local fallback constrain that variability.

## Impact

The public AI route remains:

```text
/api/ai/anchors
```

The route handler orchestrates the request and model calls. Parsing, sanitization, anchor validation, safety validation, repair handling and fallback behavior remain in reusable library code.

Unsafe input is rejected rather than converted into fallback anchors. When the user chooses manual anchor creation, the AI service is not called.

Any future expansion beyond anchor suggestions requires a separate product and architecture decision.
