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

const { saveReminderPreferenceAction } = await import("./saveReminderPreferenceAction");

function validInput() {
  return { enabled: true, startTime: "08:00" };
}

describe("saveReminderPreferenceAction", () => {
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

    const result = await saveReminderPreferenceAction(validInput());

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid start time before touching the database", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });

    const result = await saveReminderPreferenceAction({ ...validInput(), startTime: "8am" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts with the server-derived user id, never a caller-supplied one", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({ error: null });

    const result = await saveReminderPreferenceAction(validInput());

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: "user-a", enabled: true, start_time: "08:00" },
      { onConflict: "user_id" }
    );
  });

  it("uses the user_id primary key as the upsert conflict target so a later save updates rather than duplicates", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({ error: null });

    await saveReminderPreferenceAction(validInput());

    const [, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id" });
  });

  it("saves enabled: false while still persisting a valid start_time (schema requires one)", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({ error: null });

    await saveReminderPreferenceAction({ enabled: false, startTime: "09:30" });

    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: "user-a", enabled: false, start_time: "09:30" },
      { onConflict: "user_id" }
    );
  });

  it("surfaces a database failure as a controlled result without leaking the raw error", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    upsertMock.mockResolvedValue({
      error: { message: "relation does not exist: some internal detail" },
    });

    const result = await saveReminderPreferenceAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("relation does not exist");
    }
  });
});
