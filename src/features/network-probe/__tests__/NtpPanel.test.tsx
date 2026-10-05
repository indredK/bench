import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NtpPanel } from "@/features/network-probe/components/NtpPanel"
import type { NtpProbeResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { reason?: string; severity?: string }) => {
      if (key === "networkProbe.ntp.sourceFailed") {
        return `${key} ${options?.reason ?? ""}`
      }
      if (key === "networkProbe.ntp.offset") {
        return `${key} ${options?.severity ?? ""}`
      }
      return key
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

const failedResult: NtpProbeResult = {
  server: "time.cloudflare.com:123, time.google.com:123, pool.ntp.org:123",
  ok: false,
  severity: "fail",
  detail: "All NTP sources failed. [NTP_TIMEOUT] timed out",
  sources: [
    {
      server: "time.cloudflare.com:123",
      ok: false,
      errorCode: "NTP_TIMEOUT",
    },
    {
      server: "time.google.com:123",
      ok: false,
      errorCode: "NTP_RESPONSE",
    },
  ],
  elapsedMs: 4_000,
  commandHint: "probeNtp(local)",
}

afterEach(() => cleanup())

describe("NtpPanel source feedback", () => {
  it("localizes per-source failures instead of exposing backend diagnostics", () => {
    render(<NtpPanel loading={false} result={failedResult} toolEnabled onRun={() => undefined} />)

    expect(screen.getByRole("status").textContent).toBe("networkProbe.ntp.fail")
    expect(
      screen.getByText("networkProbe.ntp.sourceFailed networkProbe.ntp.errors.timeout"),
    ).toBeTruthy()
    expect(
      screen.getByText("networkProbe.ntp.sourceFailed networkProbe.ntp.errors.response"),
    ).toBeTruthy()
    expect(screen.queryByText(failedResult.detail ?? "")).toBeNull()
  })

  it("localizes severity and keeps partial source failures visible with a valid offset", () => {
    render(
      <NtpPanel
        loading={false}
        result={{
          ...failedResult,
          ok: true,
          offsetSeconds: 0.12,
          rttSeconds: 0.08,
          severity: "ok",
          sources: [
            {
              server: "time.cloudflare.com:123",
              ok: true,
              offsetSeconds: 0.12,
              rttSeconds: 0.08,
            },
            failedResult.sources[0],
          ],
        }}
        toolEnabled
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.ntp.offset networkProbe.ntp.severity.ok")).toBeTruthy()
    expect(screen.getByText("networkProbe.ntp.sourceOffset")).toBeTruthy()
    expect(
      screen.getByText("networkProbe.ntp.sourceFailed networkProbe.ntp.errors.timeout"),
    ).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })
})
