import { describe, expect, it } from "vitest";
import { classifyUpdaterError } from "../error-classifier";

describe("classifyUpdaterError", () => {
  it("classifies invalid remote release metadata as release info unavailable", () => {
    const result = classifyUpdaterError(
      "failed to check for updates: Could not fetch a valid release JSON from the remote",
      "check",
      "check failed",
    );

    expect(result.kind).toBe("releaseInfoUnavailable");
    expect(result.retryAction).toBe("check");
  });

  it("classifies install-time no-update errors as state changed", () => {
    const result = classifyUpdaterError(
      "failed to re-check updates before install: No update is currently available",
      "install",
      "install failed",
    );

    expect(result.kind).toBe("updateStateChanged");
    expect(result.retryAction).toBe("check");
  });

  it("classifies network issues during check separately from service-side metadata issues", () => {
    const result = classifyUpdaterError(
      "failed to check for updates: dns error: failed to lookup address information",
      "check",
      "check failed",
    );

    expect(result.kind).toBe("networkUnavailable");
    expect(result.retryAction).toBe("check");
  });

  it("classifies updater package signature failures separately from download failures", () => {
    const result = classifyUpdaterError(
      "failed to download and install update: The signature verification failed",
      "install",
      "install failed",
    );

    expect(result.kind).toBe("signatureVerificationFailed");
    expect(result.retryAction).toBe("check");
  });
});
