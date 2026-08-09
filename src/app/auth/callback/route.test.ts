import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { GET } = await import("./route");

function makeRequest(search: string) {
  return new Request(`http://localhost/auth/callback${search}`);
}

function mockExchange(error: unknown) {
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error }),
    },
  });
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("redirects to an error state without exchanging when the code is missing", async () => {
    const response = await GET(makeRequest(""));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth");
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "missing_code"
    );
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("exchanges the code and redirects to the default path on success", async () => {
    mockExchange(null);

    const response = await GET(makeRequest("?code=valid-code"));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("exchanges the code and redirects to a safe internal next path on success", async () => {
    mockExchange(null);

    const response = await GET(makeRequest("?code=valid-code&next=%2Fsettings"));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/settings");
  });

  it("redirects to an error state when the code exchange fails", async () => {
    mockExchange({ message: "invalid code" });

    const response = await GET(makeRequest("?code=bad-code"));

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("error")).toBe("exchange_failed");
  });

  it("cannot be used to create an open redirect via an unsafe next value", async () => {
    mockExchange(null);

    const response = await GET(makeRequest("?code=valid-code&next=https%3A%2F%2Fattacker.example"));

    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("http://localhost");
    expect(location.pathname).toBe("/");
  });
});
