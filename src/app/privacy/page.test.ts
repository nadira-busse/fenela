import { describe, expect, it } from "vitest";

import PrivacyPage from "./page";

// Structural checks only (no DOM/rendering dependency, consistent with the
// rest of this repo's node-environment test setup): PrivacyPage is a plain
// Server Component with no auth/data dependency, so calling it directly and
// inspecting the returned element tree is enough to prove it renders
// without authentication and contains the expected hosted-deployment privacy
// information.
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

  it("includes the hosted deployment controller and privacy contact", () => {
    const text = collectText(PrivacyPage()).join(" ");

    expect(text).toContain("Nadira Büsse");
    expect(text).toContain("privacy@nadirabusse.com");
    expect(text).not.toContain("[CONTROLLER NAME]");
    expect(text).not.toContain("[PRIVACY CONTACT EMAIL]");
  });

  it("includes the canonical notice's title and last-updated date", () => {
    const text = collectText(PrivacyPage()).join(" ");

    expect(text).toContain("Privacy Notice");
    expect(text).toContain("Last updated: 14 August 2026");
  });

  it("distinguishes the hosted deployment from self-hosted copies", () => {
    const text = collectText(PrivacyPage()).join(" ");

    expect(text).toContain("hosted Fenéla deployment operated by Nadira Büsse");
    expect(text).toContain(
      "Anyone who deploys their own copy is responsible for the privacy and data-protection obligations of that deployment"
    );
  });
});
