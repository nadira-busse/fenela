import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({
  getOptionalKvClient: vi.fn(),
}));

vi.mock("@/lib/kv", () => ({
  getOptionalKvClient,
}));

const { makeJob, storeJobForDevice } = vi.hoisted(() => ({
  makeJob: vi.fn((input: Record<string, unknown>) => ({
    ...input,
    id: "test-job-id",
    attempts: 0,
  })),
  storeJobForDevice: vi.fn(),
}));

vi.mock("@/lib/jobs", () => ({
  DEVICES_SET_KEY: "push:devices:set",
  makeJob,
  storeJobForDevice,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// These existing tests exercise the unauthenticated/legacy path (Phase 4D
// §9 added authenticated Device ownership verification on top, unchanged
// for anonymous callers).
vi.mock("@/server/auth/requireUser", () => ({
  getOptionalUser: vi.fn().mockResolvedValue(null),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/jobs/schedule-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/schedule-reminder", () => {
  beforeEach(() => {
    getOptionalKvClient.mockReturnValue({ sadd: vi.fn() });
    makeJob.mockClear();
    storeJobForDevice.mockClear();
  });

  it("truncates an oversized title and body instead of storing them in full", async () => {
    const request = makeRequest({
      deviceId: "device-1",
      payload: {
        title: "t".repeat(200),
        body: "b".repeat(500),
      },
    });

    const response = await POST(request as unknown as Request);
    expect(response.status).toBe(200);

    const storedJob = makeJob.mock.calls[0][0] as { payload: { title: string; body: string } };

    expect(storedJob.payload.title.length).toBeLessThanOrEqual(80);
    expect(storedJob.payload.body.length).toBeLessThanOrEqual(240);
  });

  it("replaces an external url with the root path", async () => {
    const request = makeRequest({
      deviceId: "device-1",
      payload: { url: "https://evil.example.com" },
    });

    await POST(request as unknown as Request);

    const storedJob = makeJob.mock.calls[0][0] as { payload: { url: string } };

    expect(storedJob.payload.url).toBe("/");
  });

  it("falls back to the default dueInMs when the value is invalid or exceeds the maximum", async () => {
    const request = makeRequest({
      deviceId: "device-1",
      dueInMs: 999 * 24 * 60 * 60 * 1000, // far beyond the 24h maximum
    });

    const before = Date.now();

    await POST(request as unknown as Request);

    const storedJob = makeJob.mock.calls[0][0] as { dueAt: number };
    const maxExpectedDueAt = before + 30 * 60 * 1000 + 1000; // default window + margin

    expect(storedJob.dueAt).toBeLessThanOrEqual(maxExpectedDueAt);
  });
});
