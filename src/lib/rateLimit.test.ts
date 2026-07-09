import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({
  getOptionalKvClient: vi.fn(),
}));

vi.mock("@/lib/kv", () => ({
  getOptionalKvClient,
}));

import { checkRateLimit, getClientIp } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    getOptionalKvClient.mockReset();
  });

  it("fails open when KV is not configured", async () => {
    getOptionalKvClient.mockReturnValue(null);

    const allowed = await checkRateLimit({ key: "test", limit: 1, windowSeconds: 60 });

    expect(allowed).toBe(true);
  });

  it("fails open when the KV client throws", async () => {
    getOptionalKvClient.mockReturnValue({
      incr: vi.fn().mockRejectedValue(new Error("KV unavailable")),
      expire: vi.fn(),
    });

    const allowed = await checkRateLimit({ key: "test", limit: 1, windowSeconds: 60 });

    expect(allowed).toBe(true);
  });

  it("allows requests up to the limit and blocks beyond it", async () => {
    let count = 0;
    const expire = vi.fn();

    getOptionalKvClient.mockReturnValue({
      incr: vi.fn().mockImplementation(async () => {
        count += 1;
        return count;
      }),
      expire,
    });

    const results: boolean[] = [];

    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit({ key: "test", limit: 3, windowSeconds: 60 }));
    }

    expect(results).toEqual([true, true, true, false]);
    // expire is only set once, on the first increment, so the window has a TTL.
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("test", 60);
  });
});

describe("getClientIp", () => {
  it("returns the first IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });

    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    const req = new Request("http://localhost/api/test");

    expect(getClientIp(req)).toBe("unknown");
  });
});
