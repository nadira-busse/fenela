import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { performSignOut, type SignOutDeps } from "./signOutOrchestration";

describe("performSignOut", () => {
  let deps: {
    getDeviceId: Mock<SignOutDeps["getDeviceId"]>;
    cleanupServerPushState: Mock<SignOutDeps["cleanupServerPushState"]>;
    unsubscribeBrowserPush: Mock<SignOutDeps["unsubscribeBrowserPush"]>;
    clearLocalState: Mock<SignOutDeps["clearLocalState"]>;
    signOut: Mock<SignOutDeps["signOut"]>;
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    deps = {
      getDeviceId: vi.fn(() => "device-a" as string | null),
      cleanupServerPushState: vi.fn(async () => {}),
      unsubscribeBrowserPush: vi.fn(async () => {}),
      clearLocalState: vi.fn(() => {}),
      signOut: vi.fn(async () => {}),
    };
  });

  it("runs every step in order: server cleanup, browser unsubscribe, local cleanup, then signOut", async () => {
    const order: string[] = [];
    deps.cleanupServerPushState.mockImplementation(async () => {
      order.push("server");
    });
    deps.unsubscribeBrowserPush.mockImplementation(async () => {
      order.push("browser");
    });
    deps.clearLocalState.mockImplementation(() => {
      order.push("local");
    });
    deps.signOut.mockImplementation(async () => {
      order.push("signOut");
    });

    await performSignOut(deps);

    expect(order).toEqual(["server", "browser", "local", "signOut"]);
  });

  it("skips server cleanup when there is no local device id, but still signs out", async () => {
    deps.getDeviceId.mockReturnValue(null);

    await performSignOut(deps);

    expect(deps.cleanupServerPushState).not.toHaveBeenCalled();
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when server push cleanup fails", async () => {
    deps.cleanupServerPushState.mockRejectedValue(new Error("network error"));

    await performSignOut(deps);

    expect(deps.unsubscribeBrowserPush).toHaveBeenCalledTimes(1);
    expect(deps.clearLocalState).toHaveBeenCalledTimes(1);
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when the browser pushManager.unsubscribe() throws", async () => {
    deps.unsubscribeBrowserPush.mockRejectedValue(new Error("no service worker"));

    await performSignOut(deps);

    expect(deps.clearLocalState).toHaveBeenCalledTimes(1);
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out even if local cleanup itself throws", async () => {
    deps.clearLocalState.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    await performSignOut(deps);

    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when every cleanup step fails", async () => {
    deps.cleanupServerPushState.mockRejectedValue(new Error("a"));
    deps.unsubscribeBrowserPush.mockRejectedValue(new Error("b"));
    deps.clearLocalState.mockImplementation(() => {
      throw new Error("c");
    });

    await performSignOut(deps);

    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });
});
