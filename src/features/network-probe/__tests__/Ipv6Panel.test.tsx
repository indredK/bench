import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Ipv6Panel } from "@/features/network-probe/components/Ipv6Panel"
import type { Ipv6StackResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === "networkProbe.ipv6.ndpStatus.unknown" ? (options?.defaultValue ?? key) : key,
  }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ hint, children }: { hint: string; children: ReactNode }) => (
    <div data-command-hint={hint}>{children}</div>
  ),
}))

const result: Ipv6StackResult = {
  status: "partial",
  linkLocal: ["fe80::1"],
  uniqueLocal: [],
  global: ["2001:db8::1"],
  aaaaOk: true,
  aaaaAddrs: ["2606:4700:4700::1111"],
  icmpv6Ok: false,
  httpV6Ok: false,
  dualStack: {
    ipv4Ok: true,
    ipv6Ok: false,
    ipv4RttMs: 12,
    detail: "IPv4 OK, IPv6 ICMP failed — possible v6 path/filter issue",
  },
  ndpStatus: "skip",
  ndpDetail: "NDP neighbor dump is macOS-only for MVP",
  tracerouteNote: "ICMPv6 traceroute deferred (no ICMPv6 reachability)",
  message: "Partial IPv6: some checks passed; see details",
  elapsedMs: 21,
  commandHint: "checkIpv6Stack(local)",
}

afterEach(() => cleanup())

describe("Ipv6Panel", () => {
  it("localizes dual-stack and NDP status while collapsing native diagnostics", () => {
    render(<Ipv6Panel loading={false} result={result} onRun={vi.fn()} />)

    expect(screen.getByText("networkProbe.ipv6.statusValue.partial")).toBeTruthy()
    expect(screen.getByText("networkProbe.ipv6.dualValue.ipv4Only", { exact: false })).toBeTruthy()
    expect(screen.getByText("networkProbe.ipv6.ndpStatus.skip", { exact: false })).toBeTruthy()
    expect(screen.queryByText("skip")).toBeNull()
    expect(screen.queryByText("networkProbe.cmd.ipv6")).toBeNull()
    expect(
      screen.getByRole("button", { name: "networkProbe.ipv6.run" }).parentElement,
    ).toHaveAttribute("data-command-hint", "networkProbe.cmd.ipv6")

    const details = screen.getByText("networkProbe.ipv6.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    const rawDetails = [
      result.message,
      result.dualStack.detail,
      result.ndpDetail,
      result.tracerouteNote,
      result.commandHint,
    ].filter((detail): detail is string => typeof detail === "string")
    for (const rawDetail of rawDetails) {
      const matches = screen.getAllByText(rawDetail, { exact: false })
      expect(matches).toHaveLength(1)
      expect(matches[0].closest("details")).toBe(details)
    }
  })

  it("falls back safely for unknown NDP statuses", () => {
    render(
      <Ipv6Panel
        loading={false}
        result={{ ...result, ndpStatus: "future-status" }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("future-status", { exact: false })).toBeTruthy()
  })
})
