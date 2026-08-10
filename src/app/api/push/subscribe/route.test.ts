import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({ getOptionalKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getOptionalKvClient }));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const { getOptionalUser } = vi.hoisted(() => ({ getOptionalUser: vi.fn() }));
vi.mock("@/server/auth/requireUser", () => ({ getOptionalUser }));

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
    getOptionalUser.mockReset();
    savePushSubscriptionForOwnDevice.mockReset();

    kvSet = vi.fn().mockResolvedValue(undefined);
    kvSadd = vi.fn().mockResolvedValue(undefined);
    getOptionalKvClient.mockReturnValue({ set: kvSet, sadd: kvSadd });
  });

  it("authenticated success: writes KV only after DB ownership succeeds, and returns the verified device id", async () => {
    getOptionalUser.mockResolvedValue({ id: "user-a" });
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
    getOptionalUser.mockResolvedValue({ id: "user-a" });
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

  it("authenticated auth-infrastructure failure: fails closed and never falls back to the anonymous KV path", async () => {
    class AuthVerificationError extends Error {}
    getOptionalUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    const response = await POST(makeRequest(validBody()) as unknown as Request);
    const data = await response.json();

    expect(data.ok).toBe(false);
    expect(savePushSubscriptionForOwnDevice).not.toHaveBeenCalled();
    expect(kvSet).not.toHaveBeenCalled();
    expect(kvSadd).not.toHaveBeenCalled();
  });

  it("genuine anonymous request: existing KV-only legacy path still works, using the raw client device id", async () => {
    getOptionalUser.mockResolvedValue(null);

    const response = await POST(
      makeRequest(validBody("raw-client-device-id")) as unknown as Request
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, deviceId: "raw-client-device-id" });
    expect(savePushSubscriptionForOwnDevice).not.toHaveBeenCalled();
    expect(kvSet).toHaveBeenCalledWith("push:sub:raw-client-device-id", expect.any(Object));
    expect(kvSadd).toHaveBeenCalledWith("push:devices:set", "raw-client-device-id");
  });
});
