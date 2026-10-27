import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"

const i18nState = vi.hoisted(() => {
  const messages: Record<string, string> = {
    "networkProbe.ports.hint": "Authorized host scan",
    "networkProbe.ports.capabilityHint": "Basic TCP connect; Nmap may use SYN.",
    "networkProbe.ports.target": "Target",
    "networkProbe.ports.range": "Ports",
    "networkProbe.ports.invalidPortSpec":
      "Enter 1–256 unique ports from 1 to 65535, using commas or ranges.",
    "networkProbe.ports.fingerprintOption": "Identify services and OS",
    "networkProbe.ports.fingerprintHint": "Nmap sends extra probes.",
    "networkProbe.ports.run": "Scan ports",
    "networkProbe.ports.running": "Scanning",
    "networkProbe.ports.cancel": "Cancel",
    "networkProbe.ports.openList": "Open: {{ports}}",
    "networkProbe.ports.states.open": "Open",
    "networkProbe.ports.states.closed": "Closed",
    "networkProbe.ports.states.filtered": "Undetermined (filtered)",
    "networkProbe.ports.states.unfiltered": "Reachable (state unconfirmed)",
    "networkProbe.ports.states.open|filtered": "Open or filtered",
    "networkProbe.ports.states.closed|filtered": "Closed or filtered",
    "networkProbe.ports.states.error": "Probe error",
    "networkProbe.ports.states.unknown": "Unknown state",
    "networkProbe.ports.scanModes.nmap-syn": "Nmap SYN scan",
    "networkProbe.ports.fingerprintStatus.complete": "Fingerprint data found; verify manually.",
    "networkProbe.ports.osGuess": "OS estimate: {{name}} ({{accuracy}}%)",
    "networkProbe.ports.serviceMethods.nmap-version": "Nmap service probe",
    "networkProbe.ports.risks.data-service": "data service",
    "networkProbe.ports.riskNote": "Risk labels are advisory.",
    "networkProbe.ports.confirmTitle": "Confirm port scan scope",
    "networkProbe.ports.confirmDesc":
      "{{target}} · ports {{ports}} (~{{count}}) · fingerprint {{fingerprint}}",
    "networkProbe.ports.confirmConsequenceBasic": "Authorized assets only.",
    "networkProbe.ports.confirmConsequenceFingerprint":
      "Service and OS probes add traffic; Nmap's port scan is capped.",
    "networkProbe.ports.fingerprintOn": "on",
    "networkProbe.ports.fingerprintOff": "off",
    "networkProbe.ports.confirmRun": "Scan anyway",
    "networkProbe.cmd.scanPorts": "scanPorts basic",
    "networkProbe.cmd.scanPortsFingerprint": "scanPorts fingerprint",
  }
  return {
    t(key: string, values?: Record<string, string | number>) {
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
        messages[key] ?? key,
      )
    },
  }
})

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: i18nState.t }) }))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children, hint }: { children: ReactNode; hint: string }) => (
    <div data-command-hint={hint}>{children}</div>
  ),
}))
vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({
    open,
    title,
    description,
    consequence,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean
    title: string
    description: string
    consequence: string
    confirmLabel: string
    onConfirm: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <p>{consequence}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"

const baseProps = {
  loading: false,
  canCancel: false,
  result: null,
  streaming: [],
  toolEnabled: true,
  onRun: vi.fn(),
  onCancel: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PortScanPanel fingerprint UX", () => {
  it("keeps active service probing opt-in and runs the basic scan without extra confirmation", () => {
    render(<PortScanPanel {...baseProps} />)

    expect(screen.getByRole("checkbox", { name: "Identify services and OS" })).not.toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Scan ports" }))

    expect(baseProps.onRun).toHaveBeenCalledWith("127.0.0.1", "22,80,443,8080", false)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("requires scope confirmation before running an Nmap fingerprint scan", () => {
    render(<PortScanPanel {...baseProps} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Identify services and OS" }))
    fireEvent.click(screen.getByRole("button", { name: "Scan ports" }))

    expect(screen.getByRole("dialog", { name: "Confirm port scan scope" })).toBeInTheDocument()
    expect(
      screen.getByText("127.0.0.1 · ports 22,80,443,8080 (~4) · fingerprint on"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Service and OS probes add traffic/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Scan anyway" }))
    expect(baseProps.onRun).toHaveBeenCalledWith("127.0.0.1", "22,80,443,8080", true)
  })

  it("shows the unique port count used by the backend", () => {
    render(<PortScanPanel {...baseProps} />)
    fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "80,80,81-82,82" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Identify services and OS" }))
    fireEvent.click(screen.getByRole("button", { name: "Scan ports" }))

    expect(
      screen.getByText("127.0.0.1 · ports 80,80,81-82,82 (~3) · fingerprint on"),
    ).toBeInTheDocument()
  })

  it("requires confirmation for an out-of-range IPv4-looking target", () => {
    render(<PortScanPanel {...baseProps} />)
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "10.999.1.1" } })
    fireEvent.click(screen.getByRole("button", { name: "Scan ports" }))

    expect(screen.getByRole("dialog", { name: "Confirm port scan scope" })).toBeInTheDocument()
    expect(baseProps.onRun).not.toHaveBeenCalled()
  })

  it("blocks malformed and oversized port specifications before invoking the backend", () => {
    render(<PortScanPanel {...baseProps} />)
    fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "80-bad" } })
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Scan ports" })).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Ports"), { target: { value: "1-257" } })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter 1–256 unique ports from 1 to 65535, using commas or ranges.",
    )
    expect(screen.getByRole("button", { name: "Scan ports" })).toBeDisabled()
    expect(baseProps.onRun).not.toHaveBeenCalled()
  })

  it("shows the OS estimate, identification source, and advisory risk note", () => {
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "nmap-syn",
      openPorts: [6379],
      samples: [
        {
          port: 6379,
          state: "open",
          serviceHint: "redis",
          serviceMethod: "nmap-version",
          serviceProduct: "Redis",
          serviceVersion: "7.2",
          riskTags: ["data-service"],
        },
      ],
      fingerprintStatus: "complete",
      osFingerprint: { name: "Example OS", accuracy: 91 },
      cancelled: false,
      sessionId: "session-1",
      commandHint: "scanPorts",
    }
    render(<PortScanPanel {...baseProps} result={result} />)

    expect(screen.getByText("Fingerprint data found; verify manually.")).toBeInTheDocument()
    expect(screen.getByText("OS estimate: Example OS (91%)")).toBeInTheDocument()
    expect(screen.getByText(/Nmap service probe/)).toBeInTheDocument()
    expect(screen.getByText("data service")).toBeInTheDocument()
    expect(screen.getByText("Risk labels are advisory.")).toBeInTheDocument()
  })

  it("localizes backend port states and safely falls back for unknown values", () => {
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "tcp-connect",
      openPorts: [],
      samples: [
        { port: 22, state: "closed" },
        { port: 80, state: "open" },
        { port: 443, state: "filtered" },
        { port: 8080, state: "backend-added-state" },
      ],
      fingerprintStatus: "not-requested",
      cancelled: false,
      sessionId: "session-2",
      commandHint: "scanPorts",
    }

    render(<PortScanPanel {...baseProps} result={result} />)

    expect(screen.getByText("22: Closed")).toBeInTheDocument()
    expect(screen.getByText("80: Open")).toBeInTheDocument()
    expect(screen.getByText("443: Undetermined (filtered)")).toBeInTheDocument()
    expect(screen.getByText("8080: Unknown state")).toBeInTheDocument()
    expect(screen.queryByText("22: closed")).not.toBeInTheDocument()
  })
})
