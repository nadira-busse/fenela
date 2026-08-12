import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

import AuthPage from "./page";

// Structural check only (no DOM/rendering dependency, consistent with the
// rest of this repo's node-environment test setup): finds any element in
// the returned tree whose props carry the given href, without needing to
// actually render client components like AuthPanel/SignOutButton.
function containsLinkTo(node: unknown, href: string): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => containsLinkTo(child, href));
  }

  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { href?: unknown; children?: unknown } }).props;

    if (props?.href === href) {
      return true;
    }

    return containsLinkTo(props?.children, href);
  }

  return false;
}

function makeSearchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

describe("AuthPage", () => {
  beforeEach(() => {
    requireUser.mockReset();
  });

  it("contains a link to /privacy when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(containsLinkTo(element, "/privacy")).toBe(true);
  });

  it("contains a link to /privacy when signed in (the app's only account/settings surface)", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(containsLinkTo(element, "/privacy")).toBe(true);
  });
});
