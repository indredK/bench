import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"

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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}))

afterEach(() => cleanup())

const speedSource = {
  id: "local",
  name: "Local",
  baseUrl: "https://speed.example.test",
  dlPath: "/download",
  ulPath: "/upload",
  pingPath: "/ping",
}

function renderTestPanel(
  panel: "ping" | "dns" | "tcp" | "custom" | "traceroute" | "mtu" | "egress" | "speed",
  { loading = false, hasError = false }: { loading?: boolean; hasError?: boolean } = {},
) {
  if (panel === "ping") {
    return render(
      <PingPanel
        loading={loading}
        result={null}
        streamingSamples={[]}
        hasError={hasError}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
  }
  if (panel === "dns") {
    return render(
      <DnsLookupPanel loading={loading} result={null} hasError={hasError} onRun={vi.fn()} />,
    )
  }
  if (panel === "tcp") {
    return render(
      <TcpConnectPanel loading={loading} result={null} hasError={hasError} onRun={vi.fn()} />,
    )
  }
  if (panel === "custom") {
    return render(
      <ProbeTargetPanel loading={loading} result={null} hasError={hasError} onRun={vi.fn()} />,
    )
  }
  if (panel === "traceroute") {
    return render(
      <TraceroutePanel
        loading={loading}
        canCancel={false}
        cancelling={false}
        result={null}
        hasError={hasError}
        streamingHops={[]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
  }
  if (panel === "mtu") {
    return render(
      <MtuPanel
        loading={loading}
        result={null}
        hasError={hasError}
        onRun={vi.fn()}
        dualFrom="test"
      />,
    )
  }
  if (panel === "egress") {
    return render(
      <EgressPanel
        loading={loading}
        result={null}
        hasError={hasError}
        onRun={vi.fn()}
        dualFrom="test"
      />,
    )
  }
  return render(
    <SpeedPanel
      loading={loading}
      canCancel={false}
      cancelling={false}
      sources={[speedSource]}
      result={null}
      hasError={hasError}
      sample={null}
      cooldownUntil={null}
      toolEnabled
      onLoadSources={vi.fn()}
      onRun={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe("network-probe result empty states", () => {
  it.each(["ping", "dns", "tcp", "custom", "speed"] as const)(
    "%s explains where results will appear before the first run",
    (panel) => {
      renderTestPanel(panel)

      expect(screen.getByText("networkProbe.resultEmpty")).toBeInTheDocument()
    },
  )

  it("does not tell users to run Ping when the capability is disabled", () => {
    render(
      <PingPanel
        loading={false}
        result={null}
        streamingSamples={[]}
        toolEnabled={false}
        toolStatus="unsupported"
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText("networkProbe.resultEmpty")).not.toBeInTheDocument()
  })

  it("shows live ping samples, locks inputs, and exposes cancellation while running", () => {
    const onCancel = vi.fn()
    render(
      <PingPanel
        loading
        result={null}
        streamingSamples={[{ seq: 0, ok: true, rttMs: 3.4 }]}
        toolEnabled
        canCancel
        cancelling={false}
        onRun={vi.fn()}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.ping.progress")
    expect(screen.getByText("networkProbe.ping.sampleOk")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.resultEmpty")).not.toBeInTheDocument()
    expect(screen.getByLabelText("networkProbe.ping.target")).toBeDisabled()
    expect(screen.getByLabelText("networkProbe.ping.count")).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ping.cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("does not show the speed result prompt without a usable source", () => {
    render(
      <SpeedPanel
        loading={false}
        canCancel={false}
        cancelling={false}
        sources={[]}
        result={null}
        sample={null}
        cooldownUntil={null}
        toolEnabled
        onLoadSources={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText("networkProbe.resultEmpty")).not.toBeInTheDocument()
  })

  it.each(["ping", "dns", "tcp", "custom", "speed"] as const)(
    "%s hides its initial prompt while loading or after a failure",
    (panel) => {
      renderTestPanel(panel, { loading: true })
      expect(screen.queryByText("networkProbe.resultEmpty")).not.toBeInTheDocument()

      cleanup()
      renderTestPanel(panel, { hasError: true })
      expect(screen.queryByText("networkProbe.resultEmpty")).not.toBeInTheDocument()
    },
  )

  it.each([
    ["traceroute", "networkProbe.traceroute.empty"],
    ["mtu", "networkProbe.mtu.empty"],
    ["egress", "networkProbe.egress.empty"],
  ] as const)("%s does not show its empty state during loading or failure", (panel, emptyKey) => {
    renderTestPanel(panel)
    expect(screen.getByText(emptyKey)).toBeInTheDocument()

    cleanup()
    renderTestPanel(panel, { loading: true })
    expect(screen.queryByText(emptyKey)).not.toBeInTheDocument()

    cleanup()
    renderTestPanel(panel, { hasError: true })
    expect(screen.queryByText(emptyKey)).not.toBeInTheDocument()
  })
})
