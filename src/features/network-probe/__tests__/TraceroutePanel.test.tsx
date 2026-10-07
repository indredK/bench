import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
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

function renderPanel(onRun = vi.fn()) {
  render(
    <TraceroutePanel
      loading={false}
      canCancel={false}
      cancelRequested={false}
      result={null}
      streamingHops={[]}
      toolEnabled
      onRun={onRun}
      onCancel={vi.fn()}
    />,
  )
  return onRun
}

afterEach(() => cleanup())

describe("TraceroutePanel", () => {
  it.each(["0", "33", "1.5", "-1"])("blocks an invalid maximum TTL: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.traceroute.maxTtl")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.traceroute.maxTtlInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.traceroute.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each(["0", "11", "1.5", "-1"])("blocks invalid rounds: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.traceroute.rounds")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.traceroute.roundsInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.traceroute.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each([
    ["1", "1"],
    ["32", "10"],
  ])("accepts valid integer boundaries (TTL %s, rounds %s)", (ttl, rounds) => {
    const onRun = renderPanel()
    fireEvent.change(screen.getByLabelText("networkProbe.traceroute.maxTtl"), {
      target: { value: ttl },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.traceroute.rounds"), {
      target: { value: rounds },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.traceroute.run" }))

    expect(onRun).toHaveBeenCalledWith("1.1.1.1", Number(ttl), Number(rounds))
  })
})
