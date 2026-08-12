import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({ getOptionalKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getOptionalKvClient }));

const { makeJob, storeJobForDevice, removeJobForDevice } = vi.hoisted(() => ({
  makeJob: vi.fn((input: Record<string, unknown>) => ({
    ...input,
    id: "test-job-id",
    attempts: 0,
  })),
  storeJobForDevice: vi.fn(),
  removeJobForDevice: vi.fn(),
}));
vi.mock("@/lib/jobs", () => ({
  DEVICES_SET_KEY: "push:devices:set",
  makeJob,
  storeJobForDevice,
  removeJobForDevice,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}));

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { verifyOwnDevice } = vi.hoisted(() => ({ verifyOwnDevice: vi.fn() }));
vi.mock("@/server/devices/verifyOwnDevice", () => ({ verifyOwnDevice }));

const { getOwnReminderPreference } = vi.hoisted(() => ({ getOwnReminderPreference: vi.fn() }));
vi.mock("@/server/reminders/getOwnReminderPreference", () => ({ getOwnReminderPreference }));

const { getOwnUserPreference } = vi.hoisted(() => ({ getOwnUserPreference: vi.fn() }));
vi.mock("@/server/preferences/getOwnUserPreference", () => ({ getOwnUserPreference }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/jobs/schedule-daily-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/schedule-daily-start", () => {
  let kvGet: ReturnType<typeof vi.fn>;
  let kvSet: ReturnType<typeof vi.fn>;
  let kvSadd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requireUser.mockReset();
    verifyOwnDevice.mockReset();
    getOwnReminderPreference.mockReset();
    getOwnUserPreference.mockReset();
    makeJob.mockClear();
    storeJobForDevice.mockClear();
    removeJobForDevice.mockClear();

    requireUser.mockResolvedValue({ id: "user-a" });

    kvGet = vi.fn((key: string) =>
      Promise.resolve(
        key.startsWith("push:sub:") ? { endpoint: "https://push.example.com/abc" } : null
      )
    );
    kvSet = vi.fn().mockResolvedValue(undefined);
    kvSadd = vi.fn().mockResolvedValue(undefined);
    removeJobForDevice.mockResolvedValue(undefined);

    getOptionalKvClient.mockReturnValue({ get: kvGet, set: kvSet, sadd: kvSadd });
  });

  it("missing deviceId: rejected before any auth check", async () => {
    const response = await POST(makeRequest({}) as unknown as Request);

    expect(response.status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("unauthenticated: rejected with 401 and no job is stored", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const response = await POST(makeRequest({ deviceId: "device-1" }) as unknown as Request);

    expect(response.status).toBe(401);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
    expect(storeJobForDevice).not.toHaveBeenCalled();
  });

  it("auth verification/infrastructure failure: fails closed and no job is stored", async () => {
    class AuthVerificationError extends Error {}
    requireUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    const response = await POST(makeRequest({ deviceId: "device-1" }) as unknown as Request);
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
    expect(storeJobForDevice).not.toHaveBeenCalled();
  });

  it("rejects when the authenticated caller's device id does not belong to them", async () => {
    verifyOwnDevice.mockResolvedValue(false);

    const response = await POST(makeRequest({ deviceId: "not-my-device" }) as unknown as Request);

    expect(response.status).toBe(403);
    expect(getOwnReminderPreference).not.toHaveBeenCalled();
  });

  it("rejects when the authenticated caller has no enabled reminder preference", async () => {
    verifyOwnDevice.mockResolvedValue(true);
    getOwnReminderPreference.mockResolvedValue({ enabled: false, start_time: "07:30:00" });

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);

    expect(response.status).toBe(409);
    expect(makeJob).not.toHaveBeenCalled();
  });

  it("uses the canonical DB start_time and user timezone for an authenticated, enabled request", async () => {
    verifyOwnDevice.mockResolvedValue(true);
    getOwnReminderPreference.mockResolvedValue({ enabled: true, start_time: "06:45:00" });
    getOwnUserPreference.mockResolvedValue({ time_zone: "America/Los_Angeles" });

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.startTime).toBe("06:45");
    expect(data.timeZone).toBe("America/Los_Angeles");

    const storedJob = makeJob.mock.calls[0][0] as { meta: { startTime: string; timeZone: string } };
    expect(storedJob.meta).toEqual({ startTime: "06:45", timeZone: "America/Los_Angeles" });
  });
});
