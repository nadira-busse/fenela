import { describe, expect, it } from "vitest";

import PrivacyPage from "./page";

// Structural checks only (no DOM/rendering dependency, consistent with the
// rest of this repo's node-environment test setup): PrivacyPage is a plain
// Server Component with no auth/data dependency, so calling it directly and
// inspecting the returned element tree is enough to prove it renders
// without authentication and preserves the deployment-operator placeholders.
function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }

  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }

  if (node && typeof node === "object" && "props" in node) {
    collectText((node as { props?: { children?: unknown } }).props?.children, out);
  }

  return out;
}

describe("PrivacyPage", () => {
  it("renders without throwing and without any authentication dependency", () => {
    const element = PrivacyPage();

    expect(element).toBeDefined();
  });

  it("preserves the deployment-operator controller/contact placeholders verbatim", () => {
    const text = collectText(PrivacyPage()).join(" ");

    expect(text).toContain("[CONTROLLER NAME]");
    expect(text).toContain("[PRIVACY CONTACT EMAIL]");
    expect(text).not.toMatch(/nadira/i);
  });

  it("includes the canonical notice's title and last-updated date", () => {
    const text = collectText(PrivacyPage()).join(" ");

    expect(text).toContain("Privacy Notice");
    expect(text).toContain("Last updated: 12 August 2026");
  });
});
