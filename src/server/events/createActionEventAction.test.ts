import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { getOwnUserPreference } = vi.hoisted(() => ({ getOwnUserPreference: vi.fn() }));

vi.mock("@/server/preferences/getOwnUserPreference", () => ({
  getOwnUserPreference,
}));

const { createSupabaseServerClient, insertMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { createActionEventAction } = await import("./createActionEventAction");

const ANCHOR_ID = "9d3f6b0e-2c1a-4f7e-8b1a-1a2b3c4d5e6f";
const CLIENT_EVENT_ID = "6f5e4d3c-2b1a-4c8d-9e0f-1a2b3c4d5e6f";

function validInput() {
  return {
    anchorId: ANCHOR_ID,
    eventType: "COMPLETED" as const,
    clientEventId: CLIENT_EVENT_ID,
  };
}

describe("createActionEventAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    getOwnUserPreference.mockReset();
    insertMock.mockReset();
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockResolvedValue({ from: () => ({ insert: insertMock }) });
    requireUser.mockResolvedValue({ id: "user-a" });
    getOwnUserPreference.mockResolvedValue({ time_zone: "Europe/Amsterdam" });
    insertMock.mockResolvedValue({ error: null });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await createActionEventAction(validInput());

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid event type before calling the DB", async () => {
    const result = await createActionEventAction({
      ...validInput(),
      // @ts-expect-error deliberately invalid for the test
      eventType: "DONE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID anchor id before calling the DB", async () => {
    const result = await createActionEventAction({ ...validInput(), anchorId: "task-1" });

    expect(result.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("never sends a caller-supplied user id or timezone — ownership and time come from server context", async () => {
    await createActionEventAction(validInput());

    const insertArgs = insertMock.mock.calls[0][0];
    expect(insertArgs).not.toHaveProperty("user_id");
    expect(insertArgs.time_zone).toBe("Europe/Amsterdam");
  });

  it("inserts the mapped event and derives time metadata from the user's own preference", async () => {
    const result = await createActionEventAction(validInput());

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor_id: ANCHOR_ID,
        client_event_id: CLIENT_EVENT_ID,
        event_type: "COMPLETED",
        local_date: expect.any(String),
        time_zone: "Europe/Amsterdam",
      })
    );
    expect(result).toEqual({ ok: true });
  });

  it("treats a retried client_event_id (unique violation) as success, not a failure", async () => {
    insertMock.mockResolvedValue({
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "action_events_client_event_id_key"',
      },
    });

    const result = await createActionEventAction(validInput());

    expect(result).toEqual({ ok: true });
  });

  it("surfaces a genuine DB/RLS failure as a controlled result without leaking the raw error", async () => {
    insertMock.mockResolvedValue({
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    const result = await createActionEventAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("row-level security");
    }
  });

  it("fails closed with a controlled error when the user has no persisted timezone yet", async () => {
    getOwnUserPreference.mockResolvedValue(null);

    const result = await createActionEventAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
    }
    expect(insertMock).not.toHaveBeenCalled();
  });
});
