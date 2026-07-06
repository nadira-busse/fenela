import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/ai/anchors", () => {
  it("returns deterministic output when mode is I_DECIDE", async () => {
    const request = new Request("http://localhost/api/ai/anchors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "I_DECIDE",
        intake: {
          goal: "Finish my portfolio",
          struggle: "I keep overthinking",
          goalWhy: "I want to apply for jobs",
        },
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.source).toBe("deterministic");
    expect(body.anchors).toEqual([]);

    expect(body.personalAnchorInterpretation).toBeDefined();
    expect(body.personalAnchorInterpretation.directionLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.whyLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.frictionLine.length).toBeGreaterThan(0);
    expect(body.personalAnchorInterpretation.returnLine.length).toBeGreaterThan(0);
  });
  it("rejects invalid intake input", async () => {
    const request = new Request("http://localhost/api/ai/anchors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "I_DECIDE",
        intake: {
          goal: "",
          struggle: "",
          goalWhy: "",
        },
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.code).toBe("BAD_REQUEST");
  });
});
