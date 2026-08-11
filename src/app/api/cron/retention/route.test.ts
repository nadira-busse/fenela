import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { runAccountRetentionBatch } = vi.hoisted(() => ({
  runAccountRetentionBatch: vi.fn(),
}));
vi.mock("@/server/account/runAccountRetentionBatch", () => ({ runAccountRetentionBatch }));

const { GET } = await import("./route");

function makeRequest(authHeader: string | null) {
  const headers = new Headers();
  if (authHeader !== null) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/retention", { headers }) as unknown as Parameters<
    typeof GET
  >[0];
}

describe("GET /api/cron/retention", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    runAccountRetentionBatch.mockReset();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects an unauthorized request with 401 and never runs the retention batch", async () => {
    const response = await GET(makeRequest("Bearer wrong-secret"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ ok: false, error: "Unauthorized" });
    expect(runAccountRetentionBatch).not.toHaveBeenCalled();
  });

  it("rejects a request with no authorization header at all", async () => {
    const response = await GET(makeRequest(null));

    expect(response.status).toBe(401);
    expect(runAccountRetentionBatch).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when CRON_SECRET itself is not configured, and never runs the batch", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(makeRequest("Bearer anything"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ ok: false, error: "Missing CRON_SECRET" });
    expect(runAccountRetentionBatch).not.toHaveBeenCalled();
  });

  it("runs the retention batch exactly once for an authorized request and returns its structured result", async () => {
    runAccountRetentionBatch.mockResolvedValue({
      scanned: 3,
      expired: 1,
      deleted: 1,
      failed: 0,
      truncated: false,
      failures: [],
    });

    const response = await GET(makeRequest("Bearer test-cron-secret"));
    const data = await response.json();

    expect(runAccountRetentionBatch).toHaveBeenCalledTimes(1);
    expect(runAccountRetentionBatch.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      scanned: 3,
      expired: 1,
      deleted: 1,
      failed: 0,
      truncated: false,
      failures: [],
    });
  });

  it("surfaces a system-level failure (e.g. Auth enumeration unavailable) as a controlled 500", async () => {
    runAccountRetentionBatch.mockRejectedValue(new Error("Failed to list Auth users: 503"));

    const response = await GET(makeRequest("Bearer test-cron-secret"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ ok: false, error: "Failed to list Auth users: 503" });
  });
});
