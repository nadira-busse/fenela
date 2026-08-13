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

const { saveUserPreferenceAction } = vi.hoisted(() => ({
  saveUserPreferenceAction: vi.fn(),
}));

vi.mock("./saveUserPreferenceAction", () => ({
  saveUserPreferenceAction,
}));

const { updateAiAssistanceAction } = await import("./updateAiAssistanceAction");

function existingRow() {
  return {
    user_id: "user-a",
    display_name: "Nadira",
    anchor_choice_mode: "USER_DECIDES",
    resistance_pattern: "FORCE",
    main_challenge: "SUSTAIN",
    action_trigger: "WHY",
    anti_help: ["PRESSURE"],
    time_zone: "Europe/Amsterdam",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("updateAiAssistanceAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    eqMock.mockReset();
    maybeSingleMock.mockReset();
    saveUserPreferenceAction.mockReset();
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) }),
    });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(saveUserPreferenceAction).not.toHaveBeenCalled();
  });

  it("reports a controlled error when the current row cannot be read", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const result = await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
    }
    expect(saveUserPreferenceAction).not.toHaveBeenCalled();
  });

  it("refuses to change AI assistance before screening has ever been completed", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(saveUserPreferenceAction).not.toHaveBeenCalled();
  });

  it("writes back the full row with every other preference preserved, changing only anchorChoiceMode", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: existingRow(), error: null });
    saveUserPreferenceAction.mockResolvedValue({ ok: true });

    const result = await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(result).toEqual({ ok: true });
    expect(saveUserPreferenceAction).toHaveBeenCalledWith({
      displayName: "Nadira",
      anchorChoiceMode: "SUGGEST_ANCHORS",
      resistancePattern: "FORCE",
      mainChallenge: "SUSTAIN",
      actionTrigger: "WHY",
      antiHelp: ["PRESSURE"],
      timeZone: "Europe/Amsterdam",
    });
  });

  it("can turn AI assistance off (SUGGEST_ANCHORS -> I_DECIDE) the same way", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({
      data: { ...existingRow(), anchor_choice_mode: "FENELA_SUGGESTS" },
      error: null,
    });
    saveUserPreferenceAction.mockResolvedValue({ ok: true });

    await updateAiAssistanceAction("I_DECIDE");

    const [input] = saveUserPreferenceAction.mock.calls[0];
    expect(input.anchorChoiceMode).toBe("I_DECIDE");
  });

  it("propagates a failure from the underlying save (e.g. validation or database error)", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: existingRow(), error: null });
    saveUserPreferenceAction.mockResolvedValue({
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not save your preferences right now. Please try again.",
    });

    const result = await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(result.ok).toBe(false);
  });

  it("scopes the read to the server-derived user id, not a caller-supplied one", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    maybeSingleMock.mockResolvedValue({ data: existingRow(), error: null });
    saveUserPreferenceAction.mockResolvedValue({ ok: true });

    await updateAiAssistanceAction("SUGGEST_ANCHORS");

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-a");
  });
});
