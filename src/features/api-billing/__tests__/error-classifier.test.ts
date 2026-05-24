import { classifyApiBillingError } from "../error-classifier";

describe("classifyApiBillingError", () => {
  it("classifies probe timeout", () => {
    expect(
      classifyApiBillingError(
        { code: "PROBE_TIMEOUT", message: "probe timed out after 8s" },
        "fallback"
      )
    ).toEqual({
      kind: "probeTimeout",
      message: "probe timed out after 8s",
    });
  });

  it("classifies probe network", () => {
    expect(
      classifyApiBillingError(
        { code: "PROBE_NETWORK", message: "network error" },
        "fallback"
      )
    ).toEqual({
      kind: "probeNetwork",
      message: "network error",
    });
  });

  it("falls back to unknown", () => {
    expect(classifyApiBillingError(new Error("boom"), "fallback")).toEqual({
      kind: "unknown",
      message: "boom",
    });
  });
});
