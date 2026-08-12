import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({ getOptionalKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getOptionalKvClient }));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { savePushSubscriptionForOwnDevice } = vi.hoisted(() => ({
  savePushSubscriptionForOwnDevice: vi.fn(),
}));
vi.mock("@/server/devices/savePushSubscriptionForOwnDevice", () => ({
  savePushSubscriptionForOwnDevice,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(deviceId = "raw-client-device-id") {
  return {
    deviceId,
    subscription: {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    },
  };
}

describe("POST /api/push/subscribe", () => {
  let kvSet: ReturnType<typeof vi.fn>;
  let kvSadd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requireUser.mockReset();
    savePushSubscriptionForOwnDevice.mockReset();

    requireUser.mockResolvedValue({ id: "user-a" });

    kvSet = vi.fn().mockResolvedValue(undefined);
    kvSadd = vi.fn().mockResolvedValue(undefined);
    getOptionalKvClient.mockReturnValue({ set: kvSet, sadd: kvSadd });
  });

  it("authenticated success: writes KV only after DB ownership succeeds, and returns the verified device id", async () => {
    savePushSubscriptionForOwnDevice.mockResolvedValue({
      ok: true,
      deviceId: "verified-device-id",
    });

    const response = await POST(makeRequest(validBody()) as unknown as Request);
    const data = await response.json();

    expect(data).toEqual({ ok: true, deviceId: "verified-device-id" });
    expect(kvSet).toHaveBeenCalledWith("push:sub:verified-device-id", expect.any(Object));
    expect(kvSadd).toHaveBeenCalledWith("push:devices:set", "verified-device-id");
  });

  it("authenticated DB failure: fails closed, never writes KV, never falls back to the raw client device id", async () => {
    savePushSubscriptionForOwnDevice.mockResolvedValue({
      ok: false,
      message: "Could not save your push subscription right now.",
    });

    const response = await POST(
      makeRequest(validBody("raw-client-device-id")) as unknown as Request
    );
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(kvSet).not.toHaveBeenCalled();
    expect(kvSadd).not.toHaveBeenCalled();
  });

  it("unauthenticated: rejected with 401, never reaches DB or KV writes", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const response = await POST(makeRequest(validBody()) as unknown as Request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(savePushSubscriptionForOwnDevice).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
    expect(kvSadd).not.toHaveBeenCalled();
  });

  it("auth verification/infrastructure failure: fails closed, distinct from a genuine unauthenticated request", async () => {
    class AuthVerificationError extends Error {}
    requireUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    const response = await POST(makeRequest(validBody()) as unknown as Request);
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(savePushSubscriptionForOwnDevice).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
    expect(kvSadd).not.toHaveBeenCalled();
  });
});
