import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { requireUser, UnauthenticatedError } = await import("./requireUser");

function mockGetUser(result: { data: { user: unknown }; error: unknown }) {
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue(result),
    },
  });
}

describe("requireUser", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("returns the authenticated user's id and email", async () => {
    mockGetUser({
      data: { user: { id: "user-1", email: "person@example.com" } },
      error: null,
    });

    const user = await requireUser();

    expect(user).toEqual({ id: "user-1", email: "person@example.com" });
  });

  it("fails closed when there is no session", async () => {
    mockGetUser({ data: { user: null }, error: null });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("does not treat a provider/server error as an authenticated success", async () => {
    mockGetUser({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("omits email when the user has none", async () => {
    mockGetUser({
      data: { user: { id: "user-2", email: null } },
      error: null,
    });

    const user = await requireUser();

    expect(user).toEqual({ id: "user-2", email: undefined });
  });
});
