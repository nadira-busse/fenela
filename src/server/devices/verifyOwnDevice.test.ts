import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("@/server/auth/requireUser", () => ({ requireUser }));

const { createSupabaseServerClient, eqMock, isMock, maybeSingleMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { verifyOwnDevice } = await import("./verifyOwnDevice");

describe("verifyOwnDevice", () => {
  beforeEach(() => {
    requireUser.mockReset();
    eqMock.mockReset();
    isMock.mockReset();
    maybeSingleMock.mockReset();

    eqMock.mockReturnValue({ eq: eqMock, is: isMock });
    isMock.mockReturnValue({ maybeSingle: maybeSingleMock });

    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) }),
    });

    requireUser.mockResolvedValue({ id: "user-a" });
  });

  it("returns true when the device belongs to the authenticated user", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "device-a" }, error: null });

    await expect(verifyOwnDevice("device-a")).resolves.toBe(true);
  });

  it("returns false when the device belongs to a different user or does not exist", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(verifyOwnDevice("someone-elses-device")).resolves.toBe(false);
  });

  it("scopes the check to the server-derived user id, never a caller-supplied one", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "device-a" }, error: null });

    await verifyOwnDevice("device-a");

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("fails closed (propagates) when there is no authenticated user", async () => {
    class UnauthenticatedError extends Error {}
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    await expect(verifyOwnDevice("device-a")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("throws a controlled error on a database failure", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(verifyOwnDevice("device-a")).rejects.toThrow(/Failed to verify device/);
  });
});
