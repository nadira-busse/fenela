import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { getSupabasePublicEnv } = vi.hoisted(() => ({ getSupabasePublicEnv: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ getSupabasePublicEnv }));

const { createSupabaseAdminClient } = await import("./adminClient");

describe("createSupabaseAdminClient", () => {
  const ORIGINAL_ENV = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    createClient.mockReset();
    getSupabasePublicEnv.mockReset();
    getSupabasePublicEnv.mockReturnValue({
      url: "https://project.supabase.co",
      publishableKey: "pub-key",
    });
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.SUPABASE_SECRET_KEY;
    } else {
      process.env.SUPABASE_SECRET_KEY = ORIGINAL_ENV;
    }
  });

  it("throws when SUPABASE_SECRET_KEY is not configured, rather than falling back to a public key", () => {
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => createSupabaseAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates a client with the secret key and session persistence/refresh disabled", () => {
    process.env.SUPABASE_SECRET_KEY = "secret-key-value";

    createSupabaseAdminClient();

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "secret-key-value",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      })
    );
  });
});
