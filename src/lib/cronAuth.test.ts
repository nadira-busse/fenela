import { describe, expect, it, afterEach } from "vitest";
import { isAuthorizedCronRequest } from "./cronAuth";

function requestWithAuth(header: string | null) {
  const headers = new Headers();
  if (header !== null) {
    headers.set("authorization", header);
  }
  return new Request("http://localhost/api/cron/anything", { headers });
}

describe("isAuthorizedCronRequest", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("authorizes a request whose Bearer token matches CRON_SECRET exactly", () => {
    process.env.CRON_SECRET = "the-secret";

    expect(isAuthorizedCronRequest(requestWithAuth("Bearer the-secret"))).toBe(true);
  });

  it("rejects a mismatched token", () => {
    process.env.CRON_SECRET = "the-secret";

    expect(isAuthorizedCronRequest(requestWithAuth("Bearer wrong"))).toBe(false);
  });

  it("rejects a missing authorization header", () => {
    process.env.CRON_SECRET = "the-secret";

    expect(isAuthorizedCronRequest(requestWithAuth(null))).toBe(false);
  });

  it("fails closed when CRON_SECRET itself is not configured, even with a token supplied", () => {
    delete process.env.CRON_SECRET;

    expect(isAuthorizedCronRequest(requestWithAuth("Bearer anything"))).toBe(false);
  });

  it("fails closed when CRON_SECRET is only whitespace", () => {
    process.env.CRON_SECRET = "   ";

    expect(isAuthorizedCronRequest(requestWithAuth("Bearer anything"))).toBe(false);
  });
});
