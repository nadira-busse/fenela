import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOrCreateOwnDevice } = vi.hoisted(() => ({ getOrCreateOwnDevice: vi.fn() }));

vi.mock("./getOrCreateOwnDevice", () => ({ getOrCreateOwnDevice }));

const { createSupabaseServerClient, upsertMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { savePushSubscriptionForOwnDevice } = await import("./savePushSubscriptionForOwnDevice");

function validInput() {
  return {
    candidateDeviceId: "device-a",
    endpoint: "https://push.example.com/abc",
    p256dh: "p256dh-key",
    authKey: "auth-key",
  };
}

describe("savePushSubscriptionForOwnDevice", () => {
  beforeEach(() => {
    getOrCreateOwnDevice.mockReset();
    upsertMock.mockReset();
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    });
    getOrCreateOwnDevice.mockResolvedValue({ id: "device-a" });
    upsertMock.mockResolvedValue({ error: null });
  });

  it("resolves the owned device and upserts the subscription under it, conflict target device_id", async () => {
    const result = await savePushSubscriptionForOwnDevice(validInput());

    expect(result).toEqual({ ok: true, deviceId: "device-a" });
    expect(getOrCreateOwnDevice).toHaveBeenCalledWith("device-a");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        device_id: "device-a",
        endpoint: "https://push.example.com/abc",
        p256dh: "p256dh-key",
        auth_key: "auth-key",
      },
      { onConflict: "device_id" }
    );
  });

  it("surfaces a database failure (e.g. the endpoint already belongs to another device) as a controlled result without leaking the raw error", async () => {
    upsertMock.mockResolvedValue({
      error: {
        message: 'duplicate key value violates unique constraint "push_subscriptions_endpoint_key"',
      },
    });

    const result = await savePushSubscriptionForOwnDevice(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("push_subscriptions_endpoint_key");
    }
  });

  it("propagates device resolution failure rather than writing an unowned subscription", async () => {
    getOrCreateOwnDevice.mockRejectedValue(new Error("no session"));

    await expect(savePushSubscriptionForOwnDevice(validInput())).rejects.toThrow("no session");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
