import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportRelayData } from "@/features/account-manager/api";

const { invokeTauriCommand } = vi.hoisted(() => ({
  invokeTauriCommand: vi.fn(),
}));

vi.mock("@/lib/tauri/invoke", () => ({
  invokeTauriCommand,
}));

describe("account-manager api", () => {
  beforeEach(() => {
    invokeTauriCommand.mockReset();
    invokeTauriCommand.mockResolvedValue({
      stationCount: 1,
      accountCount: 2,
      mode: "sanitized",
    });
  });

  it("exports sanitized relay data by default", async () => {
    await exportRelayData("/tmp/demo.json");

    expect(invokeTauriCommand).toHaveBeenCalledWith("export_relay_data", {
      path: "/tmp/demo.json",
      mode: "sanitized",
    });
  });

  it("allows opting into encrypted full export", async () => {
    await exportRelayData("/tmp/demo.json", "encryptedFull");

    expect(invokeTauriCommand).toHaveBeenCalledWith("export_relay_data", {
      path: "/tmp/demo.json",
      mode: "encryptedFull",
    });
  });
});
