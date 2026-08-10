import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { requireUser, getOptionalUser, UnauthenticatedError, AuthVerificationError } =
  await import("./requireUser");

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

  it("fails closed with UnauthenticatedError for a genuine no-session state", async () => {
    mockGetUser({ data: { user: null }, error: new AuthSessionMissingError() });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("fails closed with UnauthenticatedError when there is no session and no error", async () => {
    mockGetUser({ data: { user: null }, error: null });

    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("does not downgrade a real Auth verification/infrastructure failure into UnauthenticatedError (Phase 4D hardening)", async () => {
    mockGetUser({
      data: { user: null },
      error: new AuthApiError("Auth service unavailable", 500, undefined),
    });

    await expect(requireUser()).rejects.toBeInstanceOf(AuthVerificationError);
    await expect(requireUser()).rejects.not.toBeInstanceOf(UnauthenticatedError);
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

describe("getOptionalUser", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("returns the user when authenticated", async () => {
    mockGetUser({
      data: { user: { id: "user-1", email: "person@example.com" } },
      error: null,
    });

    await expect(getOptionalUser()).resolves.toEqual({ id: "user-1", email: "person@example.com" });
  });

  it("returns null for a genuine no-session state — the legacy anonymous path is allowed", async () => {
    mockGetUser({ data: { user: null }, error: new AuthSessionMissingError() });

    await expect(getOptionalUser()).resolves.toBeNull();
  });

  it("propagates (does not swallow) an Auth verification/infrastructure failure — never silently falls back to anonymous", async () => {
    mockGetUser({
      data: { user: null },
      error: new AuthApiError("Auth service unavailable", 500, undefined),
    });

    await expect(getOptionalUser()).rejects.toBeInstanceOf(AuthVerificationError);
  });
});
