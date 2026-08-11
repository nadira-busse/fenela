import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, deleteUserMock } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  deleteUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { deleteAuthUserById } = await import("./deleteAuthUserById");

describe("deleteAuthUserById", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    deleteUserMock.mockReset();

    createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { deleteUser: deleteUserMock } },
    });
  });

  it("deletes the exact authenticated user id via the Auth Admin API", async () => {
    deleteUserMock.mockResolvedValue({ error: null });

    const result = await deleteAuthUserById("user-1");

    expect(result).toEqual({ ok: true });
    expect(deleteUserMock).toHaveBeenCalledWith("user-1");
  });

  it("surfaces an Auth Admin failure as a controlled result", async () => {
    deleteUserMock.mockResolvedValue({ error: { message: "user not found" } });

    const result = await deleteAuthUserById("user-1");

    expect(result).toEqual({ ok: false, message: "user not found" });
  });
});
