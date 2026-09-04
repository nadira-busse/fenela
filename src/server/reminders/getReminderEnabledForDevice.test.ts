import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createSupabaseAdminClient,
  fromMock,
  deviceSelectMock,
  deviceEqMock,
  prefSelectMock,
  prefEqMock,
} = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  fromMock: vi.fn(),
  deviceSelectMock: vi.fn(),
  deviceEqMock: vi.fn(),
  prefSelectMock: vi.fn(),
  prefEqMock: vi.fn(),
}));

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { getReminderEnabledForDevice } = await import("./getReminderEnabledForDevice");

describe("getReminderEnabledForDevice", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    fromMock.mockReset();
    deviceSelectMock.mockReset();
    deviceEqMock.mockReset();
    prefSelectMock.mockReset();
    prefEqMock.mockReset();

    deviceSelectMock.mockReturnValue({ eq: deviceEqMock });
    prefSelectMock.mockReturnValue({ eq: prefEqMock });

    fromMock.mockImplementation((table: string) => {
      if (table === "devices") return { select: deviceSelectMock };
      if (table === "reminder_preferences") return { select: prefSelectMock };
      throw new Error(`Unexpected table: ${table}`);
    });

    createSupabaseAdminClient.mockReturnValue({ from: fromMock });
  });

  it("returns enabled: true when the owning user's canonical preference is enabled", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-1" }, error: null }),
    });
    prefEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { enabled: true }, error: null }),
    });

    const result = await getReminderEnabledForDevice("device-1");

    expect(result).toEqual({ ok: true, enabled: true });
    expect(deviceEqMock).toHaveBeenCalledWith("id", "device-1");
    expect(prefEqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns enabled: false when the owning user's canonical preference is disabled", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-1" }, error: null }),
    });
    prefEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { enabled: false }, error: null }),
    });

    const result = await getReminderEnabledForDevice("device-1");

    expect(result).toEqual({ ok: true, enabled: false });
  });

  it("returns enabled: false (not an error) when the device no longer exists", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await getReminderEnabledForDevice("deleted-device");

    expect(result).toEqual({ ok: true, enabled: false });
    // Never queries reminder_preferences for a device that no longer exists.
    expect(prefEqMock).not.toHaveBeenCalled();
  });

  it("returns enabled: false when the user has no reminder_preferences row at all", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-1" }, error: null }),
    });
    prefEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await getReminderEnabledForDevice("device-1");

    expect(result).toEqual({ ok: true, enabled: false });
  });

  it("fails with ok:false when the device lookup itself errors", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "connection reset" } }),
    });

    const result = await getReminderEnabledForDevice("device-1");

    expect(result).toEqual({
      ok: false,
      message: "Failed to look up device owner: connection reset",
    });
    expect(prefEqMock).not.toHaveBeenCalled();
  });

  it("fails with ok:false when the reminder_preferences lookup itself errors", async () => {
    deviceEqMock.mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user-1" }, error: null }),
    });
    prefEqMock.mockReturnValue({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "permission denied" } }),
    });

    const result = await getReminderEnabledForDevice("device-1");

    expect(result).toEqual({
      ok: false,
      message: "Failed to load reminder preference: permission denied",
    });
  });
});
