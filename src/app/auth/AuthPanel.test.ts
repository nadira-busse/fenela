import { describe, expect, it } from "vitest";
import { OTP_CODE_MAX_LENGTH } from "./AuthPanel";

describe("OTP_CODE_MAX_LENGTH", () => {
  // The code input's maxLength must fit the Supabase email OTP length
  // (8 digits locally and in production). A smaller limit silently truncates
  // every code typed or pasted in full, which makes sign-in impossible. It is
  // a lower-bound check rather than an exact value because the constant is an
  // upper bound on input, not the configured OTP length itself.
  it("fits an 8-digit Supabase email OTP without truncation", () => {
    expect(OTP_CODE_MAX_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
