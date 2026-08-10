import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { verifyOwnDevice } = vi.hoisted(() => ({ verifyOwnDevice: vi.fn() }));
vi.mock("@/server/devices/verifyOwnDevice", () => ({ verifyOwnDevice }));

const { deleteOwnPushSubscription } = vi.hoisted(() => ({ deleteOwnPushSubscription: vi.fn() }));
vi.mock("@/server/devices/deleteOwnPushSubscription", () => ({ deleteOwnPushSubscription }));

const { cleanupOperationalPushState } = vi.hoisted(() => ({
  cleanupOperationalPushState: vi.fn(),
}));
vi.mock("@/lib/pushOperationalCleanup", () => ({ cleanupOperationalPushState }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    requireUser.mockReset();
    verifyOwnDevice.mockReset();
    deleteOwnPushSubscription.mockReset();
    cleanupOperationalPushState.mockReset().mockResolvedValue({ cleanedJobs: 0 });

    requireUser.mockResolvedValue({ id: "user-a" });
    deleteOwnPushSubscription.mockResolvedValue({ ok: true });
  });

  it("own device: cleans up KV and deletes the own PushSubscription", async () => {
    verifyOwnDevice.mockResolvedValue(true);

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-a");
    expect(deleteOwnPushSubscription).toHaveBeenCalledWith("device-a");
  });

  it("foreign device: returns 403 and performs no cleanup at all", async () => {
    verifyOwnDevice.mockResolvedValue(false);

    const response = await POST(
      makeRequest({ deviceId: "someone-elses-device" }) as unknown as Request
    );

    expect(response.status).toBe(403);
    expect(cleanupOperationalPushState).not.toHaveBeenCalled();
    expect(deleteOwnPushSubscription).not.toHaveBeenCalled();
  });

  it("missing deviceId: rejected before any ownership check", async () => {
    const response = await POST(makeRequest({}) as unknown as Request);

    expect(response.status).toBe(400);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
  });

  it("unauthenticated: fails closed with 401 and performs no cleanup", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);

    expect(response.status).toBe(401);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
    expect(cleanupOperationalPushState).not.toHaveBeenCalled();
    expect(deleteOwnPushSubscription).not.toHaveBeenCalled();
  });

  it("DB cleanup failure is surfaced as a controlled error (KV cleanup still already ran)", async () => {
    verifyOwnDevice.mockResolvedValue(true);
    deleteOwnPushSubscription.mockResolvedValue({ ok: false, message: "db unavailable" });

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-a");
  });
});
