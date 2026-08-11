import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, selectMock, eqMock } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { listDeviceIdsForUser } = await import("./listDeviceIdsForUser");

describe("listDeviceIdsForUser", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    selectMock.mockReset();
    eqMock.mockReset();

    selectMock.mockReturnValue({ eq: eqMock });
    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    });
  });

  it("returns every device id owned by the given user, filtered explicitly since the admin client bypasses RLS", async () => {
    eqMock.mockResolvedValue({ data: [{ id: "device-a" }, { id: "device-b" }], error: null });

    const result = await listDeviceIdsForUser("user-1");

    expect(result).toEqual(["device-a", "device-b"]);
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns an empty list for a user with zero devices", async () => {
    eqMock.mockResolvedValue({ data: [], error: null });

    await expect(listDeviceIdsForUser("user-1")).resolves.toEqual([]);
  });

  it("throws on a database error rather than silently returning an incomplete list", async () => {
    eqMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(listDeviceIdsForUser("user-1")).rejects.toThrow("connection reset");
  });
});
