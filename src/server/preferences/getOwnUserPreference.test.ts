import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { createSupabaseServerClient, maybeSingleMock, eqMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  maybeSingleMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { getOwnUserPreference } = await import("./getOwnUserPreference");

describe("getOwnUserPreference", () => {
  beforeEach(() => {
    requireUser.mockReset();
    eqMock.mockReset();
    maybeSingleMock.mockReset();
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) }),
    });
  });

  it("fails closed (propagates) when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    await expect(getOwnUserPreference()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("scopes the read to the server-derived user id, not a caller-supplied one", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: { user_id: "user-a" }, error: null });

    await getOwnUserPreference();

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("returns null when no row exists yet", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getOwnUserPreference()).resolves.toBeNull();
  });

  it("throws a controlled error on a database failure", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(getOwnUserPreference()).rejects.toThrow(/Failed to load user_preferences/);
  });
});
