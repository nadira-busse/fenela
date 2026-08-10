import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClient, deleteMock, eqMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { deleteOwnPushSubscription } = await import("./deleteOwnPushSubscription");

describe("deleteOwnPushSubscription", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    deleteMock.mockReset();
    eqMock.mockReset();

    deleteMock.mockReturnValue({ eq: eqMock });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: deleteMock }),
    });
  });

  it("deletes the push_subscriptions row scoped to the given device id", async () => {
    eqMock.mockResolvedValue({ error: null });

    const result = await deleteOwnPushSubscription("device-a");

    expect(result).toEqual({ ok: true });
    expect(eqMock).toHaveBeenCalledWith("device_id", "device-a");
  });

  it("treats a missing row as idempotent success", async () => {
    eqMock.mockResolvedValue({ error: null });

    const first = await deleteOwnPushSubscription("device-a");
    const second = await deleteOwnPushSubscription("device-a");

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
  });

  it("surfaces a database failure as a controlled result without leaking the raw error", async () => {
    eqMock.mockResolvedValue({
      error: { message: "new row violates row-level security policy" },
    });

    const result = await deleteOwnPushSubscription("device-a");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain("row-level security");
    }
  });
});
