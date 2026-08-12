import { describe, expect, it, vi, beforeEach } from "vitest";

const { getOptionalKvClient } = vi.hoisted(() => ({ getOptionalKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getOptionalKvClient }));

const { removeJobForDevice } = vi.hoisted(() => ({ removeJobForDevice: vi.fn() }));
vi.mock("@/lib/jobs", () => ({ removeJobForDevice }));

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { verifyOwnDevice } = vi.hoisted(() => ({ verifyOwnDevice: vi.fn() }));
vi.mock("@/server/devices/verifyOwnDevice", () => ({ verifyOwnDevice }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/jobs/cancel-daily-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/cancel-daily-start", () => {
  let kvGet: ReturnType<typeof vi.fn>;
  let kvDel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requireUser.mockReset();
    verifyOwnDevice.mockReset();
    removeJobForDevice.mockReset();

    requireUser.mockResolvedValue({ id: "user-a" });
    verifyOwnDevice.mockResolvedValue(true);
    removeJobForDevice.mockResolvedValue(undefined);

    kvGet = vi.fn().mockResolvedValue("pointer-job-id");
    kvDel = vi.fn().mockResolvedValue(undefined);
    getOptionalKvClient.mockReturnValue({ get: kvGet, del: kvDel });
  });

  it("missing deviceId: rejected before any auth or ownership check", async () => {
    const response = await POST(makeRequest({}) as unknown as Request);

    expect(response.status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
    expect(verifyOwnDevice).not.toHaveBeenCalled();
  });

  it("unauthenticated: rejected with 401 and no job is removed", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);

    expect(response.status).toBe(401);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
    expect(removeJobForDevice).not.toHaveBeenCalled();
    expect(kvDel).not.toHaveBeenCalled();
  });

  it("auth verification/infrastructure failure: fails closed with 500, no job is removed", async () => {
    class AuthVerificationError extends Error {}
    requireUser.mockRejectedValue(new AuthVerificationError("Auth service unavailable"));

    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);

    expect(response.status).toBe(500);
    expect(verifyOwnDevice).not.toHaveBeenCalled();
    expect(removeJobForDevice).not.toHaveBeenCalled();
  });

  it("foreign device: returns 403 and never touches KV job state", async () => {
    verifyOwnDevice.mockResolvedValue(false);

    const response = await POST(
      makeRequest({ deviceId: "someone-elses-device" }) as unknown as Request
    );

    expect(response.status).toBe(403);
    expect(removeJobForDevice).not.toHaveBeenCalled();
    expect(kvDel).not.toHaveBeenCalled();
  });

  it("own device: disables the daily start job and clears the pointer", async () => {
    const response = await POST(makeRequest({ deviceId: "device-a" }) as unknown as Request);
    const data = await response.json();

    expect(data).toEqual({
      ok: true,
      disabled: true,
      deviceId: "device-a",
      cancelledJobId: "pointer-job-id",
    });
    expect(removeJobForDevice).toHaveBeenCalledWith("device-a", "pointer-job-id");
    expect(kvDel).toHaveBeenCalledWith("push:dailyStart:jobId:device-a");
  });
});
