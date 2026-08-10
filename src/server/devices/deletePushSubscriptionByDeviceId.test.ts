import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, deleteMock, eqMock } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { deletePushSubscriptionByDeviceId } = await import("./deletePushSubscriptionByDeviceId");

describe("deletePushSubscriptionByDeviceId", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    deleteMock.mockReset();
    eqMock.mockReset();

    deleteMock.mockReturnValue({ eq: eqMock });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: deleteMock }),
    });
  });

  it("deletes the push_subscriptions row scoped to the given device id", async () => {
    eqMock.mockResolvedValue({ error: null });

    const result = await deletePushSubscriptionByDeviceId("device-a");

    expect(result).toEqual({ ok: true });
    expect(eqMock).toHaveBeenCalledWith("device_id", "device-a");
  });

  it("treats a missing row (already deleted) as idempotent success, not an error", async () => {
    // Supabase reports no error even when zero rows matched a delete.
    eqMock.mockResolvedValue({ error: null });

    const first = await deletePushSubscriptionByDeviceId("device-a");
    const second = await deletePushSubscriptionByDeviceId("device-a");

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
  });

  it("surfaces a genuine database failure as a controlled result", async () => {
    eqMock.mockResolvedValue({ error: { message: "connection reset" } });

    const result = await deletePushSubscriptionByDeviceId("device-a");

    expect(result).toEqual({ ok: false, message: "connection reset" });
  });
});
