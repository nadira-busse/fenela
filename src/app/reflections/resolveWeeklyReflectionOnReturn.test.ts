import { describe, expect, it, vi } from "vitest";
import { resolveWeeklyReflectionOnReturn } from "./resolveWeeklyReflectionOnReturn";

const REFLECTION = { id: "reflection-1", generatedText: "You came back on 2 days." } as never;

describe("resolveWeeklyReflectionOnReturn", () => {
  it("never calls the resolver when disabled (anonymous user, or no active goal yet)", async () => {
    const resolveWeeklyReflection = vi.fn();
    const getLastSeenId = vi.fn().mockReturnValue(null);

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: false,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: false });
    expect(resolveWeeklyReflection).not.toHaveBeenCalled();
  });

  it("shows a meaningful, not-yet-seen reflection", async () => {
    const resolveWeeklyReflection = vi.fn().mockResolvedValue({ ok: true, reflection: REFLECTION });
    const getLastSeenId = vi.fn().mockReturnValue(null);

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: true,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: true, reflection: REFLECTION });
  });

  it("does not show a reflection that has already been seen on this device", async () => {
    const resolveWeeklyReflection = vi.fn().mockResolvedValue({ ok: true, reflection: REFLECTION });
    const getLastSeenId = vi.fn().mockReturnValue("reflection-1");

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: true,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: false });
  });

  it("shows a different reflection again once the last-seen id no longer matches", async () => {
    const resolveWeeklyReflection = vi.fn().mockResolvedValue({ ok: true, reflection: REFLECTION });
    const getLastSeenId = vi.fn().mockReturnValue("some-older-reflection-id");

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: true,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: true, reflection: REFLECTION });
  });

  it("does not show anything when there is no eligible/meaningful reflection (empty week)", async () => {
    const resolveWeeklyReflection = vi.fn().mockResolvedValue({ ok: true, reflection: null });
    const getLastSeenId = vi.fn().mockReturnValue(null);

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: true,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: false });
  });

  it("does not show anything when the resolver returns a controlled failure", async () => {
    const resolveWeeklyReflection = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "DATABASE_ERROR", message: "nope" });
    const getLastSeenId = vi.fn().mockReturnValue(null);

    const result = await resolveWeeklyReflectionOnReturn({
      enabled: true,
      resolveWeeklyReflection,
      getLastSeenId,
    });

    expect(result).toEqual({ show: false });
  });

  it("fails open — a thrown/rejected resolver call does not show anything and does not throw", async () => {
    const resolveWeeklyReflection = vi.fn().mockRejectedValue(new Error("network error"));
    const getLastSeenId = vi.fn().mockReturnValue(null);

    await expect(
      resolveWeeklyReflectionOnReturn({ enabled: true, resolveWeeklyReflection, getLastSeenId })
    ).resolves.toEqual({ show: false });
  });
});
