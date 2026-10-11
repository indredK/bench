import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import type { TcpConnectResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

const refusedResult: TcpConnectResult = {
  host: "127.0.0.1",
  port: 1,
  status: "refused",
  message: "Connection refused (os error 61)",
  commandHint: 'tcpConnect(local, "127.0.0.1", 1, 3000)',
}
const successfulResult: TcpConnectResult = {
  host: "example.com",
  port: 443,
  status: "ok",
  rttMs: 20,
  commandHint: 'tcpConnect(local, "example.com", 443, 3000)',
}

function renderPanel(result: TcpConnectResult | null = null, onRun = vi.fn()) {
  return render(<TcpConnectPanel loading={false} result={result} onRun={onRun} />)
}

afterEach(() => cleanup())

describe("TcpConnectPanel", () => {
  it("maps the backend status to localized copy and keeps OS diagnostics collapsed", () => {
    renderPanel(refusedResult)

    expect(screen.getByText("networkProbe.tcp.statusValue.refused")).toBeTruthy()
    expect(screen.queryByText("refused")).toBeNull()
    const details = screen.getByText("networkProbe.tcp.technicalDetails").closest("details")
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(screen.getByText(refusedResult.message!)).toBeTruthy()
  })

  it("uses a localized fallback for prototype-key statuses", () => {
    renderPanel({ ...refusedResult, status: "constructor" } as unknown as TcpConnectResult)

    expect(screen.getByText("networkProbe.tcp.statusValue.unknown")).toBeTruthy()
    expect(screen.queryByText("constructor")).toBeNull()
  })

  it.each([refusedResult, successfulResult])(
    "does not duplicate the raw command for $status results",
    (result) => {
      renderPanel(result)

      expect(screen.queryByText(result.commandHint)).toBeNull()
    },
  )

  it.each(["0", "65536", "1.5", "abc"])("blocks an invalid port value: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.tcp.port")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.tcp.portInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.tcp.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each(["1", "65535"])("passes an integer port within the supported range: %s", (value) => {
    const onRun = vi.fn()
    renderPanel(null, onRun)
    const input = screen.getByLabelText("networkProbe.tcp.port")
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.tcp.run" }))

    expect(onRun).toHaveBeenCalledWith("1.1.1.1", Number(value))
  })
})
