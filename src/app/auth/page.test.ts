import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});
vi.mock("@/server/auth/requireUser", () => ({ requireUser, UnauthenticatedError }));

const { getOwnUserPreference } = vi.hoisted(() => ({ getOwnUserPreference: vi.fn() }));
vi.mock("@/server/preferences/getOwnUserPreference", () => ({ getOwnUserPreference }));

import AuthPage from "./page";
import { SignOutButton } from "./SignOutButton";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { AiAssistanceControl } from "./AiAssistanceControl";

function userPreferenceRow(overrides: { anchor_choice_mode: string }) {
  return {
    user_id: "user-a",
    display_name: "Nadira",
    anchor_choice_mode: overrides.anchor_choice_mode,
    resistance_pattern: "DELAY",
    main_challenge: "START",
    action_trigger: "SMALL",
    anti_help: [],
    time_zone: "Europe/Amsterdam",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

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

// Same structural approach as containsLinkTo: locates the element whose
// props carry the given href, returning it (instead of a boolean) so its
// own text content can be inspected.
function findLinkTo(node: unknown, href: string): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findLinkTo(child, href);
      if (found) return found;
    }
    return null;
  }

  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { href?: unknown; children?: unknown } }).props;

    if (props?.href === href) {
      return node;
    }

    return findLinkTo(props?.children, href);
  }

  return null;
}

// Finds the first element of the given JSX tag name (e.g. "h1") in the tree.
function findByType(node: unknown, type: string): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }

  if (node && typeof node === "object" && "type" in node) {
    if ((node as { type: unknown }).type === type) {
      return node;
    }

    const props = (node as { props?: { children?: unknown } }).props;
    return findByType(props?.children, type);
  }

  return null;
}

// Flattens the returned tree into document order (parent before children),
// used only to compare the relative order of two sibling-level elements.
function flatten(node: unknown, acc: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    node.forEach((child) => flatten(child, acc));
    return acc;
  }

  if (node && typeof node === "object" && "type" in node) {
    acc.push(node);
    flatten((node as { props?: { children?: unknown } }).props?.children, acc);
    return acc;
  }

  return acc;
}

function textContent(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  if (node && typeof node === "object" && "props" in node) {
    return textContent((node as { props?: { children?: unknown } }).props?.children);
  }

  return "";
}

function makeSearchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

describe("AuthPage", () => {
  beforeEach(() => {
    requireUser.mockReset();
    getOwnUserPreference.mockReset();
    getOwnUserPreference.mockResolvedValue(null);
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

  it("contains a link back to / when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(containsLinkTo(element, "/")).toBe(true);
  });

  it("does not contain a link back to / when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(containsLinkTo(element, "/")).toBe(false);
  });

  it("shows the Account heading when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(textContent(findByType(element, "h1"))).toBe("Account");
  });

  it("keeps the Sign in heading when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(textContent(findByType(element, "h1"))).toBe("Sign in to Fenéla");
  });

  it("labels the back link 'Back' when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });

    expect(textContent(findLinkTo(element, "/"))).toBe("← Back");
  });

  it("shows only the email as the signed-in identity, without a 'Signed in as' prefix", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    const identityNode = nodes.find(
      (node) =>
        (node as { type?: unknown }).type === "p" && textContent(node) === "user@example.com"
    );

    expect(identityNode).toBeDefined();
    expect(nodes.some((node) => textContent(node).includes("Signed in as"))).toBe(false);
  });

  it("renders Sign out and Delete account when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    expect(nodes.some((node) => (node as { type?: unknown }).type === SignOutButton)).toBe(true);
    expect(nodes.some((node) => (node as { type?: unknown }).type === DeleteAccountButton)).toBe(
      true
    );
  });

  it("orders Privacy before Delete account when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    const privacyIndex = nodes.findIndex(
      (node) => (node as { props?: { href?: unknown } }).props?.href === "/privacy"
    );
    const deleteIndex = nodes.findIndex(
      (node) => (node as { type?: unknown }).type === DeleteAccountButton
    );

    expect(privacyIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(privacyIndex).toBeLessThan(deleteIndex);
  });

  it("renders AI assistance as On when the persisted preference is SUGGEST_ANCHORS", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });
    getOwnUserPreference.mockResolvedValue(
      userPreferenceRow({ anchor_choice_mode: "FENELA_SUGGESTS" })
    );

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);
    const control = nodes.find(
      (node) => (node as { type?: unknown }).type === AiAssistanceControl
    ) as { props?: { initialMode?: unknown } } | undefined;

    expect(control?.props?.initialMode).toBe("SUGGEST_ANCHORS");
  });

  it("renders AI assistance as Off when the persisted preference is USER_DECIDES", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });
    getOwnUserPreference.mockResolvedValue(
      userPreferenceRow({ anchor_choice_mode: "USER_DECIDES" })
    );

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);
    const control = nodes.find(
      (node) => (node as { type?: unknown }).type === AiAssistanceControl
    ) as { props?: { initialMode?: unknown } } | undefined;

    expect(control?.props?.initialMode).toBe("I_DECIDE");
  });

  it("does not render AI assistance when signed in but screening has not been completed yet", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });
    getOwnUserPreference.mockResolvedValue(null);

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    expect(nodes.some((node) => (node as { type?: unknown }).type === AiAssistanceControl)).toBe(
      false
    );
  });

  it("does not render AI assistance (or query preferences) when signed out", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    expect(nodes.some((node) => (node as { type?: unknown }).type === AiAssistanceControl)).toBe(
      false
    );
    expect(getOwnUserPreference).not.toHaveBeenCalled();
  });

  it("renders AI suggestions before the email/Sign out block when signed in", async () => {
    requireUser.mockResolvedValue({ id: "user-a", email: "user@example.com" });
    getOwnUserPreference.mockResolvedValue(
      userPreferenceRow({ anchor_choice_mode: "FENELA_SUGGESTS" })
    );

    const element = await AuthPage({ searchParams: makeSearchParams() });
    const nodes = flatten(element);

    const aiIndex = nodes.findIndex(
      (node) => (node as { type?: unknown }).type === AiAssistanceControl
    );
    const identityIndex = nodes.findIndex(
      (node) =>
        (node as { type?: unknown }).type === "p" && textContent(node) === "user@example.com"
    );
    const signOutIndex = nodes.findIndex(
      (node) => (node as { type?: unknown }).type === SignOutButton
    );
    const privacyIndex = nodes.findIndex(
      (node) => (node as { props?: { href?: unknown } }).props?.href === "/privacy"
    );

    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(identityIndex).toBeGreaterThan(aiIndex);
    expect(signOutIndex).toBeGreaterThan(identityIndex);
    expect(privacyIndex).toBeGreaterThan(signOutIndex);
  });
});
