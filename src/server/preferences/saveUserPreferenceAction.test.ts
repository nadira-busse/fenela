import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { createSupabaseServerClient, upsertMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { saveUserPreferenceAction } = await import("./saveUserPreferenceAction");

function validInput() {
  return {
    displayName: "Nadira",
    anchorChoiceMode: "I_DECIDE" as const,
    resistancePattern: "DELAY" as const,
    mainChallenge: "START" as const,
    actionTrigger: "SMALL" as const,
    antiHelp: ["PRESSURE" as const],
    timeZone: "Europe/Amsterdam",
  };
}

describe("saveUserPreferenceAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    upsertMock.mockReset();
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await saveUserPreferenceAction(validInput());

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });

    const result = await saveUserPreferenceAction({ ...validInput(), displayName: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-IANA timezone before touching the database (the browser is not a trust boundary)", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });

    const result = await saveUserPreferenceAction({ ...validInput(), timeZone: "banana" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts with the server-derived user id and mapped anchor_choice_mode, never a caller-supplied id", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({ error: null });

    const result = await saveUserPreferenceAction({
      ...validInput(),
      anchorChoiceMode: "SUGGEST_ANCHORS",
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-a",
        anchor_choice_mode: "FENELA_SUGGESTS",
        display_name: "Nadira",
      }),
      { onConflict: "user_id" }
    );
  });

  it("uses the user_id primary key as the upsert conflict target so a later save updates rather than duplicates", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({ error: null });

    await saveUserPreferenceAction(validInput());

    const [, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id" });
  });

  it("surfaces a database failure as a controlled result without leaking the raw error", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({
      error: { message: "relation does not exist: some internal detail" },
    });

    const result = await saveUserPreferenceAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("relation does not exist");
    }
  });
});
