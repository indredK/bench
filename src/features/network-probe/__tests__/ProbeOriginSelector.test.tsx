import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProbeOriginSelector } from "@/features/network-probe/components/ProbeOriginSelector"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role="tooltip">{children}</div>,
}))

const nodes: ProbeNode[] = [
  { id: "local", kind: "local", label: "This Mac", reachable: true },
  {
    id: "gp-world",
    kind: "remote-proxy",
    label: "Globalping · world",
    reachable: true,
    endpoint: "globalping:world",
    capabilities: ["dns", "ping", "http"],
  },
  {
    id: "agent-lab",
    kind: "remote-agent",
    label: "Lab",
    reachable: true,
    endpoint: "wss://agent.example.test",
  },
]

afterEach(() => cleanup())

describe("ProbeOriginSelector", () => {
  it("keeps Globalping disabled outside supported tools and keeps agents planned", () => {
    render(<ProbeOriginSelector nodes={nodes} activeNode={nodes[0]} />)

    expect(screen.getByRole("tooltip")).toHaveTextContent("networkProbe.nodeSelect.localOnlyHint")
    const trigger = screen.getByRole("combobox", { name: "networkProbe.nodeSelect.label" })
    fireEvent.click(trigger)

    const globalping = screen.getByRole("option", {
      name: /Globalping.*networkProbe.nodeSelect.remoteScope/,
    })
    const agent = screen.getByRole("option", { name: /Lab.*networkProbe.badge.planning/ })
    expect(globalping).toHaveAttribute("aria-disabled", "true")
    expect(agent).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("option", { name: "networkProbe.nodeSelect.local" }),
    ).not.toHaveAttribute("aria-disabled", "true")

    fireEvent.click(globalping)

    expect(trigger).toHaveTextContent("networkProbe.nodeSelect.local")
  })

  it("allows Globalping selection when the current tool supports remote execution", () => {
    const onChange = vi.fn()
    render(
      <ProbeOriginSelector nodes={nodes} activeNode={nodes[0]} remoteEnabled onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole("combobox", { name: "networkProbe.nodeSelect.label" }))
    const globalping = screen.getByRole("option", { name: "Globalping · world" })
    expect(globalping).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(globalping)

    expect(onChange).toHaveBeenCalledWith("gp-world")
  })
})
