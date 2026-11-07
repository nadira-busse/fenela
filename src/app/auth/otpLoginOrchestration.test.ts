import { describe, expect, it, vi } from "vitest";
import { requestOtp, verifyOtpCode } from "./otpLoginOrchestration";

describe("requestOtp", () => {
  it("returns sent when the provider call succeeds", async () => {
    const sendOtp = vi.fn().mockResolvedValue({ error: null });

    const result = await requestOtp("user@example.com", { sendOtp });

    expect(result).toEqual({ status: "sent" });
    expect(sendOtp).toHaveBeenCalledWith("user@example.com");
  });

  it("classifies over_email_send_rate_limit as rate_limited", async () => {
    const sendOtp = vi.fn().mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });

    const result = await requestOtp("user@example.com", { sendOtp });

    expect(result).toEqual({ status: "rate_limited" });
  });

  it("classifies over_request_rate_limit as rate_limited", async () => {
    const sendOtp = vi.fn().mockResolvedValue({ error: { code: "over_request_rate_limit" } });

    const result = await requestOtp("user@example.com", { sendOtp });

    expect(result).toEqual({ status: "rate_limited" });
  });

  it("classifies a bare 429 status as rate_limited when no code is present", async () => {
    const sendOtp = vi.fn().mockResolvedValue({ error: { status: 429 } });

    const result = await requestOtp("user@example.com", { sendOtp });

    expect(result).toEqual({ status: "rate_limited" });
  });

  it("classifies any other error as a generic send failure", async () => {
    const sendOtp = vi.fn().mockResolvedValue({ error: { code: "unexpected_failure" } });

    const result = await requestOtp("user@example.com", { sendOtp });

    expect(result).toEqual({ status: "error" });
  });
});

describe("verifyOtpCode", () => {
  it("returns verified when the provider call succeeds", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });

    const result = await verifyOtpCode("user@example.com", "123456", { verifyOtp });

    expect(result).toEqual({ status: "verified" });
    expect(verifyOtp).toHaveBeenCalledWith("user@example.com", "123456");
  });

  it("classifies otp_expired as invalid_or_expired (covers invalid, reused and expired codes)", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { code: "otp_expired" } });

    const result = await verifyOtpCode("user@example.com", "000000", { verifyOtp });

    expect(result).toEqual({ status: "invalid_or_expired" });
  });

  it("classifies over_request_rate_limit as rate_limited", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { code: "over_request_rate_limit" } });

    const result = await verifyOtpCode("user@example.com", "123456", { verifyOtp });

    expect(result).toEqual({ status: "rate_limited" });
  });

  it("classifies any other error as a generic verification failure", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { code: "unexpected_failure" } });

    const result = await verifyOtpCode("user@example.com", "123456", { verifyOtp });

    expect(result).toEqual({ status: "error" });
  });
});
