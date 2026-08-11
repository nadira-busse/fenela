import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, upsertMock, fromMock } = vi.hoisted(
  () => ({
    createSupabaseAdminClient: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    upsertMock: vi.fn(),
    fromMock: vi.fn(),
  })
);

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));
// Not used by touchOwnActivity, but mocked and asserted-against-never-called
// to prove the write never goes through the browser/session-scoped client.
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { touchOwnActivity } = await import("./touchOwnActivity");

describe("touchOwnActivity", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    createSupabaseServerClient.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();

    upsertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert: upsertMock });
    createSupabaseAdminClient.mockReturnValue({ from: fromMock });
  });

  it("upserts the given user's own activity row via the privileged admin client", async () => {
    await touchOwnActivity("user-a");

    expect(fromMock).toHaveBeenCalledWith("user_activity");
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const [payload, options] = upsertMock.mock.calls[0];
    expect(payload.user_id).toBe("user-a");
    expect(options).toEqual({ onConflict: "user_id" });
  });

  it("writes last_active_at as a fresh ISO timestamp", async () => {
    await touchOwnActivity("user-a");

    const [payload] = upsertMock.mock.calls[0];
    expect(typeof payload.last_active_at).toBe("string");
    expect(Number.isNaN(new Date(payload.last_active_at).getTime())).toBe(false);
  });

  it("creates the row on a user's first-ever authenticated request (no prior row required)", async () => {
    // The upsert call itself is identical whether or not a row already
    // exists — that is the point of using ON CONFLICT rather than a plain
    // UPDATE, and is what fixes the original defect where a user with no
    // user_preferences row was silently never touched.
    await touchOwnActivity("user-brand-new");

    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: "user-brand-new", last_active_at: expect.any(String) },
      { onConflict: "user_id" }
    );
  });

  it("uses the privileged admin client, never the browser/session-scoped server client", async () => {
    await touchOwnActivity("user-a");

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("only ever touches the given userId — the caller (src/app/page.tsx) must supply the server-derived session id, never client input", async () => {
    await touchOwnActivity("user-a");

    const [payload] = upsertMock.mock.calls[0];
    expect(payload.user_id).toBe("user-a");
  });

  it("swallows a database failure rather than throwing — never blocks the authenticated root load", async () => {
    upsertMock.mockResolvedValue({ error: { message: "connection reset" } });

    await expect(touchOwnActivity("user-a")).resolves.toBeUndefined();
  });

  it("logs the full Postgres/PostgREST error (message, details, hint, code) — not just .message — so a permission/schema problem is actually diagnosable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    upsertMock.mockResolvedValue({
      error: {
        message: "permission denied for table user_activity",
        details: "",
        hint: "Grant the required privileges to the current role with: GRANT INSERT, UPDATE ON public.user_activity TO service_role;",
        code: "42501",
      },
    });

    await touchOwnActivity("user-a");

    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to touch own activity timestamp:",
      expect.objectContaining({
        message: "permission denied for table user_activity",
        hint: expect.stringContaining("GRANT"),
        code: "42501",
      })
    );

    warnSpy.mockRestore();
  });

  it("catches a thrown/rejected exception (not just a returned {error}) rather than letting it propagate and break the root page render", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");
    });

    await expect(touchOwnActivity("user-a")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to touch own activity timestamp (unexpected exception):",
      "Missing required environment variable: SUPABASE_SECRET_KEY"
    );

    warnSpy.mockRestore();
  });

  it("catches a rejected upsert promise the same way as a resolved {error}", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    upsertMock.mockRejectedValue(new Error("network error"));

    await expect(touchOwnActivity("user-a")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to touch own activity timestamp (unexpected exception):",
      "network error"
    );

    warnSpy.mockRestore();
  });
});
