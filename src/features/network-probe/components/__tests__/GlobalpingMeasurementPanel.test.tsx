import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { GlobalpingMeasurementPanel } from "@/features/network-probe/components/GlobalpingMeasurementPanel"
import type { GlobalpingMeasurementResult } from "@/lib/tauri/types/network-probe"

const { toastSuccess, translate } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  translate: vi.fn(
    (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("sonner", () => ({ toast: { success: toastSuccess } }))

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof GlobalpingMeasurementPanel>> = {},
) {
  const props: React.ComponentProps<typeof GlobalpingMeasurementPanel> = {
    result: null,
    loading: false,
    tokenConfigured: null,
    loadingToken: false,
    savingToken: false,
    onRun: vi.fn().mockResolvedValue(undefined),
    onRefreshTokenStatus: vi.fn().mockResolvedValue(false),
    onSaveToken: vi.fn().mockResolvedValue(true),
    onRemoveToken: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(<GlobalpingMeasurementPanel {...props} />)
  return props
}

beforeEach(() => vi.clearAllMocks())

describe("GlobalpingMeasurementPanel", () => {
  it("runs a remote ping without adding the target to command-side arguments", () => {
    const props = renderPanel()
    const target = screen.getByRole("textbox", { name: "networkProbe.nodes.globalpingTarget" })
    fireEvent.change(target, { target: { value: "example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.globalpingRun" }))

    expect(props.onRun).toHaveBeenCalledWith("ping", "example.com", undefined)
  })

  it("reads token status only after the user opens the token settings", async () => {
    const props = renderPanel()

    expect(props.onRefreshTokenStatus).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSettings" }),
    )

    await waitFor(() => expect(props.onRefreshTokenStatus).toHaveBeenCalledOnce())
    expect(screen.getByLabelText("networkProbe.nodes.globalpingTokenPlaceholder")).toHaveAttribute(
      "type",
      "password",
    )
  })

  it("does not duplicate secure-storage reads inside StrictMode state updates", () => {
    const onRefreshTokenStatus = vi.fn().mockResolvedValue(false)
    render(
      <StrictMode>
        <GlobalpingMeasurementPanel
          result={null}
          loading={false}
          tokenConfigured={null}
          loadingToken={false}
          savingToken={false}
          onRun={vi.fn().mockResolvedValue(undefined)}
          onRefreshTokenStatus={onRefreshTokenStatus}
          onSaveToken={vi.fn().mockResolvedValue(true)}
          onRemoveToken={vi.fn().mockResolvedValue(true)}
        />
      </StrictMode>,
    )
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSettings" }),
    )

    expect(onRefreshTokenStatus).toHaveBeenCalledOnce()
  })

  it("clears an unsaved token when the settings panel is closed", () => {
    renderPanel()
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSettings" }),
    )
    const tokenInput = screen.getByLabelText("networkProbe.nodes.globalpingTokenPlaceholder")
    fireEvent.change(tokenInput, { target: { value: "unsaved-token" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenClose" }))
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSettings" }),
    )

    expect(screen.getByLabelText("networkProbe.nodes.globalpingTokenPlaceholder")).toHaveValue("")
  })

  it("saves the token through the secure-storage callback and clears the field", async () => {
    const props = renderPanel({ onSaveToken: vi.fn().mockResolvedValue(true) })
    fireEvent.click(
      screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSettings" }),
    )
    const tokenInput = screen.getByLabelText("networkProbe.nodes.globalpingTokenPlaceholder")
    fireEvent.change(tokenInput, { target: { value: "secret-token" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.globalpingTokenSave" }))

    await waitFor(() => expect(props.onSaveToken).toHaveBeenCalledWith("secret-token"))
    await waitFor(() => expect(tokenInput).toHaveValue(""))
    expect(toastSuccess).toHaveBeenCalledWith("networkProbe.nodes.globalpingTokenSaved")
  })

  it("renders safe measurement metrics and localized provider failures", () => {
    const result: GlobalpingMeasurementResult = {
      kind: "http",
      target: "https://example.com/",
      method: "HEAD",
      status: "partial",
      failureCode: "timed_out",
      probesCount: 1,
      results: [
        {
          nodeId: "gp-0",
          nodeLabel: "Globalping · London/GB",
          status: "finished",
          ok: true,
          resolvedAddress: "192.0.2.10",
          http: {
            statusCode: 200,
            totalMs: 42,
            dnsMs: 3,
            tcpMs: 5,
            tlsMs: 12,
            firstByteMs: 21,
            downloadMs: 1,
            tlsAvailable: true,
          },
        },
      ],
      elapsedMs: 900,
      commandHint: "globalping http https://example.com/ --method HEAD",
    }
    renderPanel({ result })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.nodes.globalpingFailures.timed_out",
    )
    expect(screen.getByText("Globalping · London/GB")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.globalpingHttpStats")).toBeInTheDocument()
    expect(translate).toHaveBeenCalledWith("networkProbe.nodes.globalpingHttpStats", {
      code: 200,
      total: "42.00",
      dns: "3.00",
      tcp: "5.00",
      tls: "12.00",
      firstByte: "21.00",
      download: "1.00",
    })
    expect(screen.queryByText(/rawBody|rawHeaders/)).not.toBeInTheDocument()
  })

  it("explains rejected requests separately from provider outages", () => {
    const result: GlobalpingMeasurementResult = {
      kind: "http",
      target: "https://example.com/",
      method: "HEAD",
      status: "failed",
      failureCode: "invalid_request",
      probesCount: 0,
      results: [],
      elapsedMs: 900,
      commandHint: "globalping http example.com --method HEAD",
    }
    renderPanel({ result })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.nodes.globalpingFailures.invalid_request",
    )
  })

  it("shows quota only when Globalping provides quota headers", () => {
    const result: GlobalpingMeasurementResult = {
      kind: "ping",
      target: "example.com",
      status: "finished",
      quota: {
        rateLimitLimit: 250,
        rateLimitConsumed: 3,
        rateLimitRemaining: 247,
        rateLimitResetSeconds: 3600,
        creditsRemaining: 0,
      },
      probesCount: 3,
      results: [],
      elapsedMs: 3000,
      commandHint: "globalping ping example.com from world, US, Europe",
    }
    renderPanel({ result })

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("networkProbe.nodes.globalpingQuotaRemaining") === true,
      ),
    ).toHaveTextContent("networkProbe.nodes.globalpingQuotaRemaining")
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("networkProbe.nodes.globalpingCreditsRemaining") === true,
      ),
    ).toHaveTextContent("networkProbe.nodes.globalpingCreditsRemaining")
  })

  it("does not show a leading separator when only one quota field is available", () => {
    const result: GlobalpingMeasurementResult = {
      kind: "ping",
      target: "example.com",
      status: "finished",
      quota: { creditsRemaining: 12 },
      probesCount: 3,
      results: [],
      elapsedMs: 3000,
      commandHint: "globalping ping example.com from world, US, Europe",
    }
    renderPanel({ result })

    const quota = screen.getByText("networkProbe.nodes.globalpingCreditsRemaining")
    expect(quota.textContent).toBe("networkProbe.nodes.globalpingCreditsRemaining")
    expect(quota.textContent).not.toMatch(/^\s*·/)
  })
})
