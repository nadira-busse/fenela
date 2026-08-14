import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit }));

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

    requireUser.mockResolvedValue({ id: "user-a" });
    checkRateLimit.mockResolvedValue(true);
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
});
