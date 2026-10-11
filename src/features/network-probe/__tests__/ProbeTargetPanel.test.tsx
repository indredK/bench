import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import type { GlobalpingHttpResult, ProbeTargetResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
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

afterEach(() => cleanup())

const localResult: ProbeTargetResult = {
  input: "https://example.com/health?token=private",
  kind: "url",
  http: { ok: true, status: 200, ttfbMs: 120 },
  tls: { present: true, handshakeOk: true },
  commandHint: "probeTarget(local, 'https://example.com/health?…')",
}

const remoteResult: GlobalpingHttpResult = {
  target: "https://example.com/health?…",
  location: "world",
  measurementStatus: "finished",
  statusCode: 200,
  commandHint: "globalpingHttp('world', 'https://example.com/health?…')",
}

describe("ProbeTargetPanel", () => {
  it("labels the original local target, localizes the kind and avoids duplicating the command", () => {
    render(<ProbeTargetPanel loading={false} result={localResult} onRun={() => undefined} />)

    expect(
      screen.getByText("networkProbe.probe.resultFor https://example.com/health?…"),
    ).toBeTruthy()
    expect(screen.getByText("networkProbe.probe.kindValues.url")).toBeTruthy()
    expect(screen.queryByText("url")).toBeNull()
    expect(screen.queryByText(localResult.commandHint)).toBeNull()

    fireEvent.change(screen.getByLabelText("networkProbe.probe.input"), {
      target: { value: "https://iana.org" },
    })
    expect(
      screen.getByText("networkProbe.probe.resultFor https://example.com/health?…"),
    ).toBeTruthy()
    expect(screen.queryByText("https://iana.org")).toBeNull()
  })

  it("sanitizes the remote target and does not duplicate its logged command", () => {
    const resultWithSecrets: GlobalpingHttpResult = {
      ...remoteResult,
      target: "https://user:secret@example.com/health?token=private#fragment",
    }

    render(
      <ProbeTargetPanel
        loading={false}
        result={null}
        remoteResult={resultWithSecrets}
        remoteMode
        onRun={() => undefined}
      />,
    )

    expect(
      screen.getByText("networkProbe.probe.resultFor https://example.com/health?…#…"),
    ).toBeTruthy()
    expect(screen.queryByText(resultWithSecrets.target)).toBeNull()
    expect(screen.queryByText(resultWithSecrets.commandHint)).toBeNull()
  })

  it("maps an unexpected backend kind to a localized fallback", () => {
    render(
      <ProbeTargetPanel
        loading={false}
        result={{ ...localResult, kind: "future_kind" }}
        onRun={() => undefined}
      />,
    )

    expect(screen.getByText("networkProbe.probe.kindValues.unknown")).toBeTruthy()
    expect(screen.queryByText("future_kind")).toBeNull()
  })
})
