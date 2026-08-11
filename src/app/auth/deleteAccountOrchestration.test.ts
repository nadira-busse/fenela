import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { performAccountDeletion, type DeleteAccountDeps } from "./deleteAccountOrchestration";

describe("performAccountDeletion", () => {
  let deps: {
    deleteAccount: Mock<DeleteAccountDeps["deleteAccount"]>;
    clearSupabaseSession: Mock<DeleteAccountDeps["clearSupabaseSession"]>;
    unsubscribeBrowserPush: Mock<DeleteAccountDeps["unsubscribeBrowserPush"]>;
    clearLocalState: Mock<DeleteAccountDeps["clearLocalState"]>;
    leaveToAuth: Mock<DeleteAccountDeps["leaveToAuth"]>;
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    deps = {
      deleteAccount: vi.fn(async () => ({ ok: true }) as const),
      clearSupabaseSession: vi.fn(async () => {}),
      unsubscribeBrowserPush: vi.fn(async () => {}),
      clearLocalState: vi.fn(() => {}),
      leaveToAuth: vi.fn(() => {}),
    };
  });

  it("runs every step in order on success: server deletion, clear Supabase session, browser unsubscribe, local cleanup, then leaving to /auth", async () => {
    const order: string[] = [];
    deps.deleteAccount.mockImplementation(async () => {
      order.push("server");
      return { ok: true };
    });
    deps.clearSupabaseSession.mockImplementation(async () => {
      order.push("session");
    });
    deps.unsubscribeBrowserPush.mockImplementation(async () => {
      order.push("browser");
    });
    deps.clearLocalState.mockImplementation(() => {
      order.push("local");
    });
    deps.leaveToAuth.mockImplementation(() => {
      order.push("leave");
    });

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["server", "session", "browser", "local", "leave"]);
  });

  it("stops immediately on server deletion failure — no session clear, no browser cleanup, no local cleanup, no navigation", async () => {
    deps.deleteAccount.mockResolvedValue({ ok: false, message: "Please try again." });

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: false, message: "Please try again." });
    expect(deps.clearSupabaseSession).not.toHaveBeenCalled();
    expect(deps.unsubscribeBrowserPush).not.toHaveBeenCalled();
    expect(deps.clearLocalState).not.toHaveBeenCalled();
    expect(deps.leaveToAuth).not.toHaveBeenCalled();
  });

  it("still completes and navigates when clearing the Supabase session fails, since the account is already deleted server-side", async () => {
    deps.clearSupabaseSession.mockRejectedValue(new Error("network error"));

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.unsubscribeBrowserPush).toHaveBeenCalledTimes(1);
    expect(deps.clearLocalState).toHaveBeenCalledTimes(1);
    expect(deps.leaveToAuth).toHaveBeenCalledTimes(1);
  });

  it("still completes and navigates when browser push unsubscribe fails, since the account is already deleted server-side", async () => {
    deps.unsubscribeBrowserPush.mockRejectedValue(new Error("no service worker"));

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.clearLocalState).toHaveBeenCalledTimes(1);
    expect(deps.leaveToAuth).toHaveBeenCalledTimes(1);
  });

  it("still completes and navigates when local cleanup itself throws", async () => {
    deps.clearLocalState.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.leaveToAuth).toHaveBeenCalledTimes(1);
  });

  it("still completes and navigates when every best-effort step fails", async () => {
    deps.clearSupabaseSession.mockRejectedValue(new Error("a"));
    deps.unsubscribeBrowserPush.mockRejectedValue(new Error("b"));
    deps.clearLocalState.mockImplementation(() => {
      throw new Error("c");
    });

    const result = await performAccountDeletion(deps);

    expect(result).toEqual({ ok: true });
    expect(deps.leaveToAuth).toHaveBeenCalledTimes(1);
  });
});
