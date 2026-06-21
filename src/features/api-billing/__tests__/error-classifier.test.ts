import { classifyApiBillingError } from "../error-classifier";

describe("classifyApiBillingError", () => {
  it("classifies invalid input", () => {
    expect(
      classifyApiBillingError(
        { code: "INVALID_INPUT", message: "bad payload" },
        "fallback"
      )
    ).toEqual({
      kind: "invalidInput",
      message: "bad payload",
    });
  });

  it("classifies store failure", () => {
    expect(
      classifyApiBillingError(
        { code: "STORE_FAIL", message: "disk full" },
        "fallback"
      )
    ).toEqual({
      kind: "storeFailure",
      message: "disk full",
    });
  });

  it("falls back to unknown", () => {
    expect(classifyApiBillingError(new Error("boom"), "fallback")).toEqual({
      kind: "unknown",
      message: "boom",
    });
  });
});
