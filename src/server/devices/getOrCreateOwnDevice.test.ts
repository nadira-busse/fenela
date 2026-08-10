import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("@/server/auth/requireUser", () => ({ requireUser }));

const {
  createSupabaseServerClient,
  fromMock,
  selectMock,
  eqMock,
  isMock,
  maybeSingleMock,
  updateMock,
  updateEqMock,
  insertMock,
  insertSelectMock,
  singleMock,
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  updateMock: vi.fn(),
  updateEqMock: vi.fn(),
  insertMock: vi.fn(),
  insertSelectMock: vi.fn(),
  singleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { getOrCreateOwnDevice } = await import("./getOrCreateOwnDevice");

describe("getOrCreateOwnDevice", () => {
  beforeEach(() => {
    requireUser.mockReset();
    fromMock.mockReset();
    selectMock.mockReset();
    eqMock.mockReset();
    isMock.mockReset();
    maybeSingleMock.mockReset();
    updateMock.mockReset();
    updateEqMock.mockReset();
    insertMock.mockReset();
    insertSelectMock.mockReset();
    singleMock.mockReset();

    // .select("id").eq().eq().is().maybeSingle()
    selectMock.mockReturnValue({ eq: eqMock });
    eqMock.mockReturnValue({ eq: eqMock, is: isMock });
    isMock.mockReturnValue({ maybeSingle: maybeSingleMock });

    // .update(...).eq()
    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });

    // .insert(...).select().single()
    insertMock.mockReturnValue({ select: insertSelectMock });
    insertSelectMock.mockReturnValue({ single: singleMock });

    fromMock.mockReturnValue({ select: selectMock, update: updateMock, insert: insertMock });
    createSupabaseServerClient.mockResolvedValue({ from: fromMock });
    requireUser.mockResolvedValue({ id: "user-a" });
  });

  it("reuses an existing owned device and touches last_seen_at", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "device-a" }, error: null });

    const result = await getOrCreateOwnDevice("device-a");

    expect(result).toEqual({ id: "device-a" });
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });

  it("scopes the lookup to the server-derived user id, never a caller-supplied one", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "device-a" }, error: null });

    await getOrCreateOwnDevice("device-a");

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("creates a new device when the candidate id does not resolve to one owned by this user (e.g. a stale id from a different account, Phase 4D §11)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    singleMock.mockResolvedValue({ data: { id: "device-new" }, error: null });

    const result = await getOrCreateOwnDevice("someone-elses-device");

    expect(result).toEqual({ id: "device-new" });
    expect(insertMock).toHaveBeenCalledWith({ user_id: "user-a" });
  });

  it("creates a new device when there is no candidate id at all (first-ever registration)", async () => {
    singleMock.mockResolvedValue({ data: { id: "device-new" }, error: null });

    const result = await getOrCreateOwnDevice(null);

    expect(result).toEqual({ id: "device-new" });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("still returns the device id even if updating last_seen_at fails (non-critical bookkeeping)", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "device-a" }, error: null });
    updateEqMock.mockResolvedValue({ error: { message: "update failed" } });

    await expect(getOrCreateOwnDevice("device-a")).resolves.toEqual({ id: "device-a" });
  });

  it("throws a controlled error when device creation fails", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    singleMock.mockResolvedValue({ data: null, error: { message: "insert failed" } });

    await expect(getOrCreateOwnDevice("unknown")).rejects.toThrow(/Failed to create device/);
  });
});
