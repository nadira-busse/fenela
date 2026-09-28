import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { POST } = await import("./route");

function makeRequest(body?: unknown) {
  return new Request("http://localhost/auth/signout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockSignOut() {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  createSupabaseServerClient.mockResolvedValue({ auth: { signOut } });
  return signOut;
}

describe("POST /auth/signout", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("defaults to local scope with no request body — ordinary sign-out never invalidates another device's session", async () => {
    const signOut = mockSignOut();

    const response = await POST(makeRequest());

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth");
  });

  it("defaults to local scope for an unrecognized/tampered scope value", async () => {
    const signOut = mockSignOut();

    await POST(makeRequest({ scope: "not-a-real-scope" }));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("honors an explicit global scope — the account-deletion caller's only supported use of this route's scope override", async () => {
    const signOut = mockSignOut();

    await POST(makeRequest({ scope: "global" }));

    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("honors an explicit others scope", async () => {
    const signOut = mockSignOut();

    await POST(makeRequest({ scope: "others" }));

    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });
});
