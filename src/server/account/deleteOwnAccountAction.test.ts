import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError, AuthVerificationError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {
    constructor(message = "No authenticated user.") {
      super(message);
      this.name = "UnauthenticatedError";
    }
  }
  class AuthVerificationError extends Error {
    constructor(message = "Could not verify authentication.") {
      super(message);
      this.name = "AuthVerificationError";
    }
  }
  return { requireUser: vi.fn(), UnauthenticatedError, AuthVerificationError };
});

vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { deleteAccountForUser } = vi.hoisted(() => ({ deleteAccountForUser: vi.fn() }));
vi.mock("@/server/account/deleteAccountForUser", () => ({ deleteAccountForUser }));

const { deleteOwnAccountAction } = await import("./deleteOwnAccountAction");

describe("deleteOwnAccountAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    deleteAccountForUser.mockReset();
  });

  it("derives the user id from requireUser() and calls the deletion core with exactly that id", async () => {
    requireUser.mockResolvedValue({ id: "user-1", email: "person@example.com" });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    const result = await deleteOwnAccountAction();

    expect(result).toEqual({ ok: true });
    expect(deleteAccountForUser).toHaveBeenCalledWith("user-1");
    expect(deleteAccountForUser).toHaveBeenCalledTimes(1);
  });

  it("blocks unauthenticated callers and never invokes the deletion core", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError());

    const result = await deleteOwnAccountAction();

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again.",
    });
    expect(deleteAccountForUser).not.toHaveBeenCalled();
  });

  it("fails closed on an Auth verification/infrastructure error rather than the deletion core running", async () => {
    requireUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    await expect(deleteOwnAccountAction()).rejects.toBeInstanceOf(AuthVerificationError);
    expect(deleteAccountForUser).not.toHaveBeenCalled();
  });

  it("cannot be steered to delete another user's account — the boundary accepts no id input", async () => {
    // deleteOwnAccountAction() takes no arguments at all: there is no
    // parameter through which a caller could supply a different user id.
    expect(deleteOwnAccountAction.length).toBe(0);

    requireUser.mockResolvedValue({ id: "user-1" });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    await deleteOwnAccountAction();

    expect(deleteAccountForUser).toHaveBeenCalledWith("user-1");
  });

  it("returns a controlled failure when the deletion core reports failure", async () => {
    requireUser.mockResolvedValue({ id: "user-1" });
    deleteAccountForUser.mockResolvedValue({
      ok: false,
      stage: "operational_cleanup",
      message: "kv unavailable",
    });

    const result = await deleteOwnAccountAction();

    expect(result).toEqual({
      ok: false,
      error: "DELETION_FAILED",
      message: "Could not delete your account right now. Please try again.",
    });
  });
});
