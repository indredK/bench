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

afterEach(() => cleanup())

function renderResult(overrides: Partial<TcpConnectResult> = {}) {
  const result: TcpConnectResult = {
    host: "127.0.0.1",
    port: 1,
    status: "refused",
    message: "Connection refused (os error 61)",
    commandHint: "tcpConnect(local, '127.0.0.1', 1, 3000)",
    ...overrides,
  }

  return render(<TcpConnectPanel loading={false} result={result} onRun={vi.fn()} />)
}

describe("TcpConnectPanel terminal feedback", () => {
  it.each([
    ["ok", "networkProbe.tcp.statusValue.ok"],
    ["refused", "networkProbe.tcp.statusValue.refused"],
    ["unreachable", "networkProbe.tcp.statusValue.unreachable"],
    ["dns_failed", "networkProbe.tcp.statusValue.dnsFailed"],
    ["timeout", "networkProbe.tcp.statusValue.timeout"],
    ["error", "networkProbe.tcp.statusValue.error"],
  ])("localizes the %s status", (status, key) => {
    renderResult({ status })

    expect(screen.getByText(key)).toBeInTheDocument()
    expect(screen.queryByText(status)).not.toBeInTheDocument()
  })

  it("keeps OS error details collapsed until the user asks to see them", () => {
    renderResult()

    const message = screen.getByText("Connection refused (os error 61)")
    const details = message.closest("details")

    expect(details).not.toHaveAttribute("open")
    expect(screen.getByText("networkProbe.tcp.systemDetail")).toBeInTheDocument()

    fireEvent.click(screen.getByText("networkProbe.tcp.systemDetail"))

    expect(details).toHaveAttribute("open")
  })

  it("uses a localized fallback for unknown backend statuses", () => {
    renderResult({ status: "future_status" })

    expect(screen.getByText("networkProbe.tcp.statusValue.unknown")).toBeInTheDocument()
    expect(screen.queryByText("future_status")).not.toBeInTheDocument()
  })
})
