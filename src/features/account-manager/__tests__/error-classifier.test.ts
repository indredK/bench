import { classifyAccountManagerError } from "@/features/account-manager/error-classifier";

describe("classifyAccountManagerError", () => {
  it("classifies invalid input", () => {
    expect(
      classifyAccountManagerError(
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
      classifyAccountManagerError(
        { code: "STORE_FAIL", message: "disk full" },
        "fallback"
      )
    ).toEqual({
      kind: "storeFailure",
      message: "disk full",
    });
  });

  it("falls back to unknown", () => {
    expect(classifyAccountManagerError(new Error("boom"), "fallback")).toEqual({
      kind: "unknown",
      message: "boom",
    });
  });
});
