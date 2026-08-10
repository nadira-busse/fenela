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
vi.mock("@/server/preferences/getOwnUserPreference", () => ({ getOwnUserPreference }));

const { getOwnHistoryForPeriod } = vi.hoisted(() => ({ getOwnHistoryForPeriod: vi.fn() }));
vi.mock("./getOwnHistoryForPeriod", () => ({ getOwnHistoryForPeriod }));

const { createSupabaseAdminClient, adminInsertMock, adminSelectMock, adminSingleMock } = vi.hoisted(
  () => ({
    createSupabaseAdminClient: vi.fn(),
    adminInsertMock: vi.fn(),
    adminSelectMock: vi.fn(),
    adminSingleMock: vi.fn(),
  })
);
vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { createSupabaseServerClient, rlsSelectMock, rlsEqMock, rlsMaybeSingleMock } = vi.hoisted(
  () => ({
    createSupabaseServerClient: vi.fn(),
    rlsSelectMock: vi.fn(),
    rlsEqMock: vi.fn(),
    rlsMaybeSingleMock: vi.fn(),
  })
);
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { createReflectionForPeriodCore } = await import("./createReflectionForPeriodCore");

const REFLECTION_ROW = {
  id: "reflection-1",
  user_id: "user-a",
  reflection_type: "WEEKLY",
  period_start: "2026-03-16",
  period_end: "2026-03-22",
  time_zone: "Europe/Amsterdam",
  facts_snapshot: { period: {}, activity: {}, friction: {} },
  generated_text: "You came back on 1 day.",
  generation_mode: "DETERMINISTIC",
  model: null,
  created_at: "2026-03-23T00:00:00.000Z",
};

const REFERENCE_INSTANT = new Date("2026-03-16T10:00:00.000Z");

describe("createReflectionForPeriodCore", () => {
  beforeEach(() => {
    requireUser.mockReset();
    getOwnUserPreference.mockReset();
    getOwnHistoryForPeriod.mockReset();
    createSupabaseAdminClient.mockReset();
    createSupabaseServerClient.mockReset();
    adminInsertMock.mockReset();
    adminSelectMock.mockReset();
    adminSingleMock.mockReset();
    rlsSelectMock.mockReset();
    rlsEqMock.mockReset();
    rlsMaybeSingleMock.mockReset();

    requireUser.mockResolvedValue({ id: "user-a" });
    getOwnUserPreference.mockResolvedValue({ time_zone: "Europe/Amsterdam" });
    getOwnHistoryForPeriod.mockResolvedValue({ actionEvents: [], frictionEvents: [] });

    adminInsertMock.mockReturnValue({ select: adminSelectMock });
    adminSelectMock.mockReturnValue({ single: adminSingleMock });
    adminSingleMock.mockResolvedValue({ data: REFLECTION_ROW, error: null });

    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: adminInsertMock }),
    });

    rlsEqMock.mockReturnValue({ eq: rlsEqMock, maybeSingle: rlsMaybeSingleMock });
    rlsSelectMock.mockReturnValue({ eq: rlsEqMock });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: rlsSelectMock }),
    });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await createReflectionForPeriodCore({
      type: "WEEKLY",
      referenceInstant: REFERENCE_INSTANT,
    });

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid reflection type before touching history/DB", async () => {
    const result = await createReflectionForPeriodCore({
      // @ts-expect-error deliberately invalid for the test
      type: "DAILY",
      referenceInstant: REFERENCE_INSTANT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(getOwnHistoryForPeriod).not.toHaveBeenCalled();
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid reference date before touching history/DB", async () => {
    const result = await createReflectionForPeriodCore({
      type: "WEEKLY",
      referenceInstant: new Date("not-a-date"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("fails closed with a controlled error when the user has no persisted timezone yet", async () => {
    getOwnUserPreference.mockResolvedValue(null);

    const result = await createReflectionForPeriodCore({
      type: "WEEKLY",
      referenceInstant: REFERENCE_INSTANT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NO_TIME_ZONE");
    }
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("creates a new reflection using the server-derived user id, the given period, and aggregated facts — never caller-supplied values", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [
        { eventType: "COMPLETED", localDate: "2026-03-16", occurredAt: "2026-03-16T08:00:00Z" },
      ],
      frictionEvents: [],
    });

    const maliciousInput = {
      type: "WEEKLY" as const,
      referenceInstant: REFERENCE_INSTANT,
      // Extra properties a caller might try to inject — the real type has
      // no such fields, so these are structurally impossible via the
      // public wrapper, but this proves the implementation never reads
      // them even if bypassed.
      userId: "someone-elses-id",
      facts_snapshot: { fabricated: true },
      generated_text: "fabricated text",
      model: "gpt-4",
    };

    const result = await createReflectionForPeriodCore(maliciousInput as never);

    expect(result).toEqual({
      ok: true,
      created: true,
      reflection: expect.objectContaining({ id: "reflection-1" }),
    });

    const insertArgs = adminInsertMock.mock.calls[0][0];
    expect(insertArgs.user_id).toBe("user-a");
    expect(insertArgs.reflection_type).toBe("WEEKLY");
    expect(insertArgs.period_start).toBe("2026-03-16");
    expect(insertArgs.period_end).toBe("2026-03-22");
    expect(insertArgs.time_zone).toBe("Europe/Amsterdam");
    expect(insertArgs.generation_mode).toBe("DETERMINISTIC");
    expect(insertArgs.model).toBeNull();
    expect(insertArgs.facts_snapshot.activity.completedCount).toBe(1);
    expect(insertArgs).not.toHaveProperty("userId");
  });

  it("treats a unique-constraint conflict (same period requested again) as success and returns the existing row, without duplicating", async () => {
    adminSingleMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "reflections_period_unique"',
      },
    });
    rlsMaybeSingleMock.mockResolvedValue({ data: REFLECTION_ROW, error: null });

    const result = await createReflectionForPeriodCore({
      type: "WEEKLY",
      referenceInstant: REFERENCE_INSTANT,
    });

    expect(result).toEqual({
      ok: true,
      created: false,
      reflection: expect.objectContaining({ id: "reflection-1" }),
    });
    expect(rlsEqMock).toHaveBeenCalledWith("user_id", "user-a");
    expect(rlsEqMock).toHaveBeenCalledWith("reflection_type", "WEEKLY");
  });

  it("surfaces a genuine database failure as a controlled result without leaking the raw error", async () => {
    adminSingleMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    const result = await createReflectionForPeriodCore({
      type: "WEEKLY",
      referenceInstant: REFERENCE_INSTANT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("row-level security");
    }
  });
});
