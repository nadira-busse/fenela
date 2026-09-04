import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit }));

// Canonical AI-assistance enforcement: route.ts reads
// the authenticated user's own canonical anchor_choice_mode preference
// through this exact helper before ever considering an OpenAI call — mocked
// at this boundary (the same way requireUser/checkRateLimit already are)
// rather than mocking Supabase internals, since route.ts depends on this
// function directly, not on how it's implemented.
const { getOwnUserPreference } = vi.hoisted(() => ({ getOwnUserPreference: vi.fn() }));
vi.mock("@/server/preferences/getOwnUserPreference", () => ({ getOwnUserPreference }));

// Mocking the OpenAI client boundary lets the generation, repair, and
// fallback orchestration run deterministically without network access.
// The pure helpers have separate coverage in aiAnchors.test.ts.
// MockAPIError stands in for the real openai package's `APIError` export
// (src/app/api/ai/anchors/route.ts does `import { APIError } from "openai"`
// and checks `error instanceof APIError` to decide whether structured
// fields — status/code/type/requestID — are safe to log). The mock below
// must export something under that same name for that `instanceof` check to
// even run without throwing, and tests that want to exercise the
// "structured APIError" logging branch must construct their thrown error
// with this exact class (re-exported below), not a lookalike subclass of
// plain Error — only this one is `instanceof` the openai module's own
// APIError from route.ts's point of view.
const { createCompletion, MockAPIError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number | null;
    code: string | null;
    type: string | null;
    requestID: string | null;

    constructor(options: {
      status?: number;
      code?: string;
      type?: string;
      requestID?: string;
      message?: string;
    }) {
      super(options.message ?? "mock API error");
      this.name = "MockAPIError";
      this.status = options.status ?? null;
      this.code = options.code ?? null;
      this.type = options.type ?? null;
      this.requestID = options.requestID ?? null;
    }
  }

  return { createCompletion: vi.fn(), MockAPIError };
});
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
  },
  APIError: MockAPIError,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ai/anchors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    mode: "I_DECIDE",
    intake: {
      goal: "Finish my portfolio",
      struggle: "I keep overthinking",
      goalWhy: "I want to apply for jobs",
    },
    ...overrides,
  };
}

describe("POST /api/ai/anchors", () => {
  beforeEach(() => {
    requireUser.mockReset();
    checkRateLimit.mockReset();
    createCompletion.mockReset();
    getOwnUserPreference.mockReset();

    requireUser.mockResolvedValue({ id: "user-a" });
    checkRateLimit.mockResolvedValue(true);
    // Default: canonical AI assistance is ON — matches every pre-existing
    // test's implicit assumption (they exercise rate limiting/generation
    // behavior, not the canonical-preference guard itself), so those tests
    // don't need to know the guard exists unless they're specifically
    // testing it.
    getOwnUserPreference.mockResolvedValue({ anchor_choice_mode: "FENELA_SUGGESTS" });
  });

  function completionWith(content: string) {
    return { choices: [{ message: { content } }] };
  }

  const VALID_AI_JSON = JSON.stringify({
    personalAnchorInterpretation: {
      directionLine: "You want to finish this report",
      whyLine: "It matters because you chose it",
      frictionLine: "Overthinking may make it feel bigger",
      returnLine: "One small step is enough today",
    },
    anchors: [
      { text: "Write the first sentence of your report" },
      { text: "Open your notes and reread one page" },
      { text: "Send a short message to your mentor" },
    ],
  });

  it("unauthenticated: rejected with 401 before any generation runs", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const request = makeRequest(validBody());
    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("auth verification/infrastructure failure: fails closed, distinct from a genuine unauthenticated request", async () => {
    class AuthVerificationError extends Error {}
    requireUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    const request = makeRequest(validBody());
    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("authenticated: returns deterministic output when mode is I_DECIDE (no OpenAI call needed)", async () => {
    const request = makeRequest(validBody());

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.source).toBe("deterministic");
    expect(body.anchors).toEqual([]);

    expect(body.personalAnchorInterpretation).toBeDefined();
    expect(body.personalAnchorInterpretation.directionLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.whyLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.frictionLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.returnLine.length).toBeGreaterThan(0);
  });

  it("authenticated, no OpenAI configuration: still receives a deterministic fallback for a mode that needs anchors", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const request = makeRequest(validBody({ mode: "SUGGEST_ANCHORS" }));
      const response = await POST(request as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.source).toBe("fallback");
      expect(Array.isArray(body.anchors)).toBe(true);
      expect(body.anchors.length).toBeGreaterThan(0);
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("authenticated, rate limit exceeded: receives the fallback instead of calling OpenAI", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    checkRateLimit.mockResolvedValue(false);

    try {
      const request = makeRequest(validBody({ mode: "SUGGEST_ANCHORS" }));
      const response = await POST(request as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(checkRateLimit).toHaveBeenCalled();
      expect(body.source).toBe("fallback");
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("rate-limit key is keyed by the authenticated user.id, not the client-supplied deviceId", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    requireUser.mockResolvedValue({ id: "user-a" });

    try {
      const first = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", deviceId: "device-1" }));
      await POST(first as Parameters<typeof POST>[0]);

      const second = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", deviceId: "device-2" }));
      await POST(second as Parameters<typeof POST>[0]);

      expect(checkRateLimit).toHaveBeenCalledTimes(2);
      const firstKey = checkRateLimit.mock.calls[0][0].key;
      const secondKey = checkRateLimit.mock.calls[1][0].key;

      expect(firstKey).toBe("rate:ai-anchors:user-a");
      expect(secondKey).toBe("rate:ai-anchors:user-a");
      expect(firstKey).toBe(secondKey);
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("rate-limit key differs between different authenticated users, even with the same deviceId", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    try {
      requireUser.mockResolvedValue({ id: "user-a" });
      const first = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", deviceId: "shared-device" }));
      await POST(first as Parameters<typeof POST>[0]);

      requireUser.mockResolvedValue({ id: "user-b" });
      const second = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", deviceId: "shared-device" }));
      await POST(second as Parameters<typeof POST>[0]);

      expect(checkRateLimit).toHaveBeenCalledTimes(2);
      const firstKey = checkRateLimit.mock.calls[0][0].key;
      const secondKey = checkRateLimit.mock.calls[1][0].key;

      expect(firstKey).toBe("rate:ai-anchors:user-a");
      expect(secondKey).toBe("rate:ai-anchors:user-b");
      expect(firstKey).not.toBe(secondKey);
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("rejects invalid intake input", async () => {
    const request = makeRequest(
      validBody({
        intake: {
          goal: "",
          struggle: "",
          goalWhy: "",
        },
      })
    );

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.code).toBe("BAD_REQUEST");
  });

  it("rejects intake text that exceeds the maximum length", async () => {
    const request = makeRequest(
      validBody({
        intake: {
          goal: "a".repeat(501),
          struggle: "I keep overthinking",
          goalWhy: "I want to apply for jobs",
        },
      })
    );

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.code).toBe("BAD_REQUEST");
  });

  describe("OpenAI generation through the mocked client boundary", () => {
    async function makeAiRequest(overrides: Record<string, unknown> = {}) {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      try {
        const request = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", ...overrides }));
        const response = await POST(request as Parameters<typeof POST>[0]);
        return { response, body: await response.json() };
      } finally {
        if (originalKey === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    }

    it("valid first response: reaches source 'ai' with exactly one OpenAI call, no repair attempt", async () => {
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("ai");
      expect(body.anchors).toHaveLength(3);
      expect(createCompletion).toHaveBeenCalledTimes(1);
    });

    it("malformed first response: triggers exactly one repair call, and a valid repair response is used", async () => {
      createCompletion
        .mockResolvedValueOnce(completionWith("not valid json"))
        .mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("ai");
      expect(createCompletion).toHaveBeenCalledTimes(2);
      // The repair call uses the lower, correction-oriented temperature
      // (ADR-001) — distinct from the initial call's temperature.
      expect(createCompletion.mock.calls[1][0].temperature).toBe(0.2);
    });

    it("first response fails anchor validation (wrong count): still triggers exactly one repair call", async () => {
      const tooFewAnchors = JSON.stringify({
        personalAnchorInterpretation: JSON.parse(VALID_AI_JSON).personalAnchorInterpretation,
        anchors: [{ text: "Write the first sentence of your report" }],
      });

      createCompletion
        .mockResolvedValueOnce(completionWith(tooFewAnchors))
        .mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("ai");
      expect(createCompletion).toHaveBeenCalledTimes(2);
    });

    it("both the first response and the repair response are invalid: falls back to deterministic anchors, never returns invalid AI output", async () => {
      createCompletion
        .mockResolvedValueOnce(completionWith("not valid json"))
        .mockResolvedValueOnce(completionWith("still not valid json"));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      expect(Array.isArray(body.anchors)).toBe(true);
      expect(body.anchors.length).toBeGreaterThan(0);
      expect(createCompletion).toHaveBeenCalledTimes(2);
    });

    it("provider throws (network error/timeout): falls back to deterministic anchors instead of surfacing a 500", async () => {
      createCompletion.mockRejectedValueOnce(new Error("Request timed out."));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      // The route's own try/catch never re-attempts generation after a
      // thrown provider error — one call, then straight to fallback.
      expect(createCompletion).toHaveBeenCalledTimes(1);
    });

    it("every OpenAI call carries the explicit request timeout, so a hanging provider response cannot outlast the route's own fallback logic", async () => {
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      await makeAiRequest();

      expect(createCompletion).toHaveBeenCalledTimes(1);
      expect(createCompletion.mock.calls[0][1]).toEqual({ timeout: 10_000 });
    });

    it("unsafe AI-generated anchor output is rejected and never reaches the response, even though it is syntactically valid JSON", async () => {
      const unsafeJson = JSON.stringify({
        personalAnchorInterpretation: JSON.parse(VALID_AI_JSON).personalAnchorInterpretation,
        anchors: [
          { text: "Hack their account tonight quietly" },
          { text: "Open your notes and reread one page" },
          { text: "Send a short message to your mentor" },
        ],
      });

      createCompletion
        .mockResolvedValueOnce(completionWith(unsafeJson))
        .mockResolvedValueOnce(completionWith(unsafeJson));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      expect(body.anchors.some((anchor: { text: string }) => /hack/i.test(anchor.text))).toBe(
        false
      );
    });
  });

  describe("canonical AI-assistance enforcement", () => {
    async function makeAiRequest(overrides: Record<string, unknown> = {}) {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      try {
        const request = makeRequest(validBody({ mode: "SUGGEST_ANCHORS", ...overrides }));
        const response = await POST(request as Parameters<typeof POST>[0]);
        return { response, body: await response.json() };
      } finally {
        if (originalKey === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    }

    it("returns the deterministic fallback without calling OpenAI when canonical AI assistance is off", async () => {
      getOwnUserPreference.mockResolvedValue({ anchor_choice_mode: "USER_DECIDES" });
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      expect(createCompletion).not.toHaveBeenCalled();
      // The canonical preference is checked before rate limiting too — a
      // request that can never reach OpenAI should not spend rate-limit
      // budget either.
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it("uses the normal OpenAI flow when canonical AI assistance is on", async () => {
      getOwnUserPreference.mockResolvedValue({ anchor_choice_mode: "FENELA_SUGGESTS" });
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("ai");
      expect(createCompletion).toHaveBeenCalledTimes(1);
    });

    it("fails closed to the deterministic fallback when the canonical preference lookup throws", async () => {
      getOwnUserPreference.mockRejectedValue(new Error("connection reset"));
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      expect(createCompletion).not.toHaveBeenCalled();
    });

    it("C2. no canonical preference row yet: fails closed the same as an explicit OFF, never assumes consent", async () => {
      getOwnUserPreference.mockResolvedValue(null);
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      const { response, body } = await makeAiRequest();

      expect(response.status).toBe(200);
      expect(body.source).toBe("fallback");
      expect(createCompletion).not.toHaveBeenCalled();
    });

    it("keeps I_DECIDE deterministic without a canonical-preference lookup or OpenAI call", async () => {
      const request = makeRequest(validBody({ mode: "I_DECIDE" }));
      const response = await POST(request as Parameters<typeof POST>[0]);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.source).toBe("deterministic");
      expect(getOwnUserPreference).not.toHaveBeenCalled();
      expect(createCompletion).not.toHaveBeenCalled();
    });

    it("does not send provider-bound data before canonical permission is established", async () => {
      getOwnUserPreference.mockResolvedValue({ anchor_choice_mode: "USER_DECIDES" });
      checkRateLimit.mockResolvedValue(true);
      createCompletion.mockResolvedValueOnce(completionWith(VALID_AI_JSON));

      await makeAiRequest();

      expect(getOwnUserPreference).toHaveBeenCalledTimes(1);
      expect(createCompletion).not.toHaveBeenCalled();
    });
  });

  describe("privacy-safe AI failure logging", () => {
    async function makeAiRequest() {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key";

      try {
        const request = makeRequest(validBody({ mode: "SUGGEST_ANCHORS" }));
        const response = await POST(request as Parameters<typeof POST>[0]);
        return { response, body: await response.json() };
      } finally {
        if (originalKey === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    }

    it("logs only bounded structured metadata for a provider error", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const sensitiveMessage =
          "Invalid value for messages[1].content: 'goal: my very private struggle text'";
        createCompletion.mockRejectedValueOnce(new Error(sensitiveMessage));

        await makeAiRequest();

        expect(warnSpy).toHaveBeenCalledWith(
          "aiAnchors.providerError",
          expect.objectContaining({
            userId: "user-a",
            mode: "SUGGEST_ANCHORS",
            errorClass: "Error",
            status: null,
            code: null,
            type: null,
            requestId: null,
          })
        );

        const [, payload] = warnSpy.mock.calls.find(
          (call) => call[0] === "aiAnchors.providerError"
        )!;

        expect(JSON.stringify(payload)).not.toContain("sensitive");
        expect(JSON.stringify(payload)).not.toContain("struggle text");
        expect(payload).not.toHaveProperty("message");
        expect(payload).not.toHaveProperty("error");
        expect(payload).not.toHaveProperty("stack");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("F2. provider error carrying structured OpenAI APIError fields: those bounded fields are logged, not the free-form message or raw response body", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        // Must be an actual instance of the mocked "openai" module's own
        // APIError export (see the vi.mock("openai", ...) header above) —
        // route.ts's summarizeProviderError only trusts status/code/type/
        // requestId from an `instanceof APIError`, precisely so an
        // arbitrary thrown object cannot spoof those fields.
        createCompletion.mockRejectedValueOnce(
          new MockAPIError({
            status: 429,
            code: "rate_limit_exceeded",
            type: "requests",
            requestID: "req_abc123",
            message: "please include the user's goal text here for context",
          })
        );

        await makeAiRequest();

        expect(warnSpy).toHaveBeenCalledWith(
          "aiAnchors.providerError",
          expect.objectContaining({
            userId: "user-a",
            mode: "SUGGEST_ANCHORS",
            status: 429,
            code: "rate_limit_exceeded",
            type: "requests",
            requestId: "req_abc123",
          })
        );

        const [, payload] = warnSpy.mock.calls.find(
          (call) => call[0] === "aiAnchors.providerError"
        )!;

        expect(JSON.stringify(payload)).not.toContain("goal text");
        expect(payload).not.toHaveProperty("message");
        expect(payload).not.toHaveProperty("error");
        expect(payload).not.toHaveProperty("stack");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("logs no raw prompt, model output, or free-form message when output repair fails", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const modelOutputWithSensitiveText =
          "not valid json, but mentions the user's private goal: my very private struggle text";

        createCompletion
          .mockResolvedValueOnce(completionWith(modelOutputWithSensitiveText))
          .mockResolvedValueOnce(completionWith(modelOutputWithSensitiveText));

        const { body } = await makeAiRequest();

        expect(body.source).toBe("fallback");
        expect(warnSpy).toHaveBeenCalledWith("aiAnchors.generationInvalid", {
          userId: "user-a",
          mode: "SUGGEST_ANCHORS",
        });

        const [, payload] = warnSpy.mock.calls.find(
          (call) => call[0] === "aiAnchors.generationInvalid"
        )!;

        expect(JSON.stringify(payload)).not.toContain("struggle text");
        expect(payload).not.toHaveProperty("rawResponse");
        expect(payload).not.toHaveProperty("message");
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
