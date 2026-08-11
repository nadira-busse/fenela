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

const { createSupabaseServerClient, rlsSelectMock, rlsEqMock, rlsMaybeSingleMock, rlsFromMock } =
  vi.hoisted(() => ({
    createSupabaseServerClient: vi.fn(),
    rlsSelectMock: vi.fn(),
    rlsEqMock: vi.fn(),
    rlsMaybeSingleMock: vi.fn(),
    rlsFromMock: vi.fn(),
  }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { resolveWeeklyReflectionCore } = await import("./resolveWeeklyReflectionCore");

const MEANINGFUL_FACTS_SNAPSHOT = {
  period: { type: "WEEKLY", start: "2026-08-17", end: "2026-08-23", timeZone: "Europe/Amsterdam" },
  activity: {
    activeDays: 1,
    startedCount: 0,
    completedCount: 1,
    postponedCount: 0,
    parkedCount: 0,
  },
  friction: { entriesCount: 0 },
};

const EMPTY_FACTS_SNAPSHOT = {
  period: { type: "WEEKLY", start: "2026-08-17", end: "2026-08-23", timeZone: "Europe/Amsterdam" },
  activity: {
    activeDays: 0,
    startedCount: 0,
    completedCount: 0,
    postponedCount: 0,
    parkedCount: 0,
  },
  friction: { entriesCount: 0 },
};

const FRICTION_ONLY_FACTS_SNAPSHOT = {
  period: { type: "WEEKLY", start: "2026-08-17", end: "2026-08-23", timeZone: "Europe/Amsterdam" },
  activity: {
    activeDays: 1,
    startedCount: 0,
    completedCount: 0,
    postponedCount: 0,
    parkedCount: 0,
  },
  friction: { entriesCount: 1 },
};

const EXISTING_REFLECTION_ROW = {
  id: "reflection-1",
  user_id: "user-a",
  reflection_type: "WEEKLY",
  period_start: "2026-08-17",
  period_end: "2026-08-23",
  time_zone: "Europe/Amsterdam",
  facts_snapshot: MEANINGFUL_FACTS_SNAPSHOT,
  generated_text: "You came back on 1 day.",
  generation_mode: "DETERMINISTIC",
  model: null,
  created_at: "2026-08-24T00:00:00.000Z",
};

const EXISTING_EMPTY_REFLECTION_ROW = {
  ...EXISTING_REFLECTION_ROW,
  id: "reflection-empty",
  facts_snapshot: EMPTY_FACTS_SNAPSHOT,
  generated_text: "There was no recorded activity in this period.",
};

const EXISTING_FRICTION_ONLY_REFLECTION_ROW = {
  ...EXISTING_REFLECTION_ROW,
  id: "reflection-friction-only",
  facts_snapshot: FRICTION_ONLY_FACTS_SNAPSHOT,
  generated_text: "You came back on 1 day.\nYou noted 1 moment of friction.",
};

// A Monday — the eligible previous completed week is 2026-08-17..2026-08-23.
const REFERENCE_INSTANT = new Date("2026-08-24T10:00:00.000Z");

describe("resolveWeeklyReflectionCore", () => {
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
    rlsFromMock.mockReset();

    requireUser.mockResolvedValue({ id: "user-a" });
    getOwnUserPreference.mockResolvedValue({ time_zone: "Europe/Amsterdam" });
    getOwnHistoryForPeriod.mockResolvedValue({ actionEvents: [], frictionEvents: [] });

    adminInsertMock.mockReturnValue({ select: adminSelectMock });
    adminSelectMock.mockReturnValue({ single: adminSingleMock });
    adminSingleMock.mockResolvedValue({ data: null, error: null });

    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: adminInsertMock }),
    });

    // No existing row by default — the SELECT-before-create lookup and the
    // post-conflict re-read share this same chain shape.
    rlsEqMock.mockReturnValue({ eq: rlsEqMock, maybeSingle: rlsMaybeSingleMock });
    rlsSelectMock.mockReturnValue({ eq: rlsEqMock });
    rlsFromMock.mockReturnValue({ select: rlsSelectMock });
    rlsMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockResolvedValue({ from: rlsFromMock });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("fails closed with a controlled error when the user has no persisted timezone yet", async () => {
    getOwnUserPreference.mockResolvedValue(null);

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("NO_TIME_ZONE");
    }
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("resolves the PREVIOUS completed week, not the current one containing referenceInstant", async () => {
    await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(rlsEqMock).toHaveBeenCalledWith("period_start", "2026-08-17");
    expect(rlsEqMock).toHaveBeenCalledWith("period_end", "2026-08-23");
    expect(getOwnHistoryForPeriod).toHaveBeenCalledWith({
      start: "2026-08-17",
      end: "2026-08-23",
    });
  });

  it("reuses an existing MEANINGFUL reflection for the eligible period unchanged — no UPDATE, no duplicate INSERT", async () => {
    rlsMaybeSingleMock.mockResolvedValue({ data: EXISTING_REFLECTION_ROW, error: null });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({
      ok: true,
      reflection: expect.objectContaining({
        id: "reflection-1",
        generatedText: "You came back on 1 day.",
      }),
    });
    expect(getOwnHistoryForPeriod).not.toHaveBeenCalled();
    expect(adminInsertMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("suppresses an already-persisted reflection whose facts_snapshot is empty — never mutates or deletes it", async () => {
    rlsMaybeSingleMock.mockResolvedValue({ data: EXISTING_EMPTY_REFLECTION_ROW, error: null });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({ ok: true, reflection: null });
    expect(getOwnHistoryForPeriod).not.toHaveBeenCalled();
    expect(adminInsertMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("shows an already-persisted FRICTION-ONLY reflection (activeDays > 0 via friction alone, zero action counts)", async () => {
    rlsMaybeSingleMock.mockResolvedValue({
      data: EXISTING_FRICTION_ONLY_REFLECTION_ROW,
      error: null,
    });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reflection).not.toBeNull();
      expect(result.reflection?.id).toBe("reflection-friction-only");
      expect(result.reflection?.factsSnapshot.activity.activeDays).toBeGreaterThan(0);
      expect(result.reflection?.factsSnapshot.friction.entriesCount).toBeGreaterThan(0);
      expect(result.reflection?.factsSnapshot.activity.completedCount).toBe(0);
      expect(result.reflection?.factsSnapshot.activity.startedCount).toBe(0);
      expect(result.reflection?.factsSnapshot.activity.postponedCount).toBe(0);
      expect(result.reflection?.factsSnapshot.activity.parkedCount).toBe(0);
    }
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("returns reflection: null and never inserts when the eligible week has zero activity", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({ actionEvents: [], frictionEvents: [] });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({ ok: true, reflection: null });
    expect(adminInsertMock).not.toHaveBeenCalled();
  });

  it("creates a new reflection when the eligible week has recorded activity", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [
        { eventType: "COMPLETED", localDate: "2026-08-18", occurredAt: "2026-08-18T08:00:00Z" },
      ],
      frictionEvents: [],
    });
    adminSingleMock.mockResolvedValue({ data: EXISTING_REFLECTION_ROW, error: null });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({
      ok: true,
      reflection: expect.objectContaining({ id: "reflection-1" }),
    });

    const insertArgs = adminInsertMock.mock.calls[0][0];
    expect(insertArgs.user_id).toBe("user-a");
    expect(insertArgs.reflection_type).toBe("WEEKLY");
    expect(insertArgs.period_start).toBe("2026-08-17");
    expect(insertArgs.period_end).toBe("2026-08-23");
    expect(insertArgs.generation_mode).toBe("DETERMINISTIC");
    expect(insertArgs.model).toBeNull();
  });

  it("treats a friction-only week (no ActionEvents) as meaningful activity", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [],
      frictionEvents: [
        { reason: "Too tired", localDate: "2026-08-19", occurredAt: "2026-08-19T08:00:00Z" },
      ],
    });
    adminSingleMock.mockResolvedValue({ data: EXISTING_REFLECTION_ROW, error: null });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result.ok).toBe(true);
    expect(adminInsertMock).toHaveBeenCalledTimes(1);
  });

  it("treats a unique-constraint conflict (concurrent resolution) as success and returns the existing row, without duplicating", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [
        { eventType: "COMPLETED", localDate: "2026-08-18", occurredAt: "2026-08-18T08:00:00Z" },
      ],
      frictionEvents: [],
    });
    adminSingleMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "reflections_period_unique"',
      },
    });
    rlsMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    rlsMaybeSingleMock.mockResolvedValueOnce({ data: EXISTING_REFLECTION_ROW, error: null });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({
      ok: true,
      reflection: expect.objectContaining({ id: "reflection-1" }),
    });
  });

  it("suppresses an empty reflection returned by the 23505 conflict re-read path", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [
        { eventType: "COMPLETED", localDate: "2026-08-18", occurredAt: "2026-08-18T08:00:00Z" },
      ],
      frictionEvents: [],
    });

    adminSingleMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "reflections_period_unique"',
      },
    });

    rlsMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    rlsMaybeSingleMock.mockResolvedValueOnce({
      data: EXISTING_EMPTY_REFLECTION_ROW,
      error: null,
    });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result).toEqual({ ok: true, reflection: null });
    expect(adminInsertMock).toHaveBeenCalledTimes(1);
  });

  it("scopes every read to the caller's own user id — cross-user isolation", async () => {
    await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(rlsEqMock).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("surfaces a genuine SELECT failure as a controlled result without leaking the raw error", async () => {
    rlsMaybeSingleMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("row-level security");
    }
  });

  it("surfaces a genuine INSERT failure as a controlled result without leaking the raw error", async () => {
    getOwnHistoryForPeriod.mockResolvedValue({
      actionEvents: [
        { eventType: "COMPLETED", localDate: "2026-08-18", occurredAt: "2026-08-18T08:00:00Z" },
      ],
      frictionEvents: [],
    });
    adminSingleMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    const result = await resolveWeeklyReflectionCore({ referenceInstant: REFERENCE_INSTANT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("row-level security");
    }
  });
});
