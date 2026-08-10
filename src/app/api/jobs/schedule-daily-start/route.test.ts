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

const { getOptionalUser } = vi.hoisted(() => ({ getOptionalUser: vi.fn() }));
vi.mock("@/server/auth/requireUser", () => ({ getOptionalUser }));

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
    getOptionalUser.mockReset();
    verifyOwnDevice.mockReset();
    getOwnReminderPreference.mockReset();
    getOwnUserPreference.mockReset();
    makeJob.mockClear();
    storeJobForDevice.mockClear();
    removeJobForDevice.mockClear();

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

  it("uses the client-supplied startTime and the hardcoded zone for an unauthenticated (legacy) request", async () => {
    getOptionalUser.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ deviceId: "device-1", startTime: "07:30" }) as unknown as Request
    );
    const data = await response.json();

    expect(data.ok).toBe(true);
    expect(data.startTime).toBe("07:30");
    expect(data.timeZone).toBe("Europe/Amsterdam");
    expect(verifyOwnDevice).not.toHaveBeenCalled();
  });

  it("rejects when the authenticated caller's device id does not belong to them", async () => {
    getOptionalUser.mockResolvedValue({ id: "user-a" });
    verifyOwnDevice.mockResolvedValue(false);

    const response = await POST(
      makeRequest({ deviceId: "not-my-device", startTime: "07:30" }) as unknown as Request
    );

    expect(response.status).toBe(403);
    expect(getOwnReminderPreference).not.toHaveBeenCalled();
  });

  it("rejects when the authenticated caller has no enabled reminder preference, ignoring any client-supplied startTime", async () => {
    getOptionalUser.mockResolvedValue({ id: "user-a" });
    verifyOwnDevice.mockResolvedValue(true);
    getOwnReminderPreference.mockResolvedValue({ enabled: false, start_time: "07:30:00" });

    const response = await POST(
      makeRequest({ deviceId: "device-a", startTime: "23:00" }) as unknown as Request
    );

    expect(response.status).toBe(409);
    expect(makeJob).not.toHaveBeenCalled();
  });

  it("uses the canonical DB start_time and user timezone for an authenticated, enabled request — never the client-supplied startTime", async () => {
    getOptionalUser.mockResolvedValue({ id: "user-a" });
    verifyOwnDevice.mockResolvedValue(true);
    getOwnReminderPreference.mockResolvedValue({ enabled: true, start_time: "06:45:00" });
    getOwnUserPreference.mockResolvedValue({ time_zone: "America/Los_Angeles" });

    const response = await POST(
      // Deliberately different from the canonical DB value, to prove it is ignored.
      makeRequest({ deviceId: "device-a", startTime: "23:00" }) as unknown as Request
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.startTime).toBe("06:45");
    expect(data.timeZone).toBe("America/Los_Angeles");

    const storedJob = makeJob.mock.calls[0][0] as { meta: { startTime: string; timeZone: string } };
    expect(storedJob.meta).toEqual({ startTime: "06:45", timeZone: "America/Los_Angeles" });
  });
});
