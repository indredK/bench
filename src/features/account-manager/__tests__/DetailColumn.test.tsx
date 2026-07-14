import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DetailColumn } from "@/features/account-manager/components/DetailColumn"
import { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/account-manager"
import type { RelayStation, StationAccount } from "@/lib/tauri/types/account-manager"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const station: RelayStation = {
  id: "station-1",
  remark: "Example",
  website: "https://example.com",
  createdAt: "2026-07-14 08:00",
  loginDetection: DEFAULT_LOGIN_DETECTION,
  authProfile: null,
}

const account: StationAccount = {
  id: "account-1",
  stationId: station.id,
  username: "alice",
  notes: "",
  phone: null,
  tgAccount: null,
  linkedAccount: null,
  inviteLink: null,
  loginMethods: [],
  status: "ready",
  lastLoginAt: null,
  lastRefreshedAt: null,
  createdAt: "2026-07-14 08:00",
  hasPassword: true,
}

function renderDetail(onRevealPassword = vi.fn(async () => "secret-value")) {
  render(
    <DetailColumn
      station={station}
      account={account}
      onOpenWebsite={vi.fn()}
      onRedetectProfile={vi.fn()}
      onRevealPassword={onRevealPassword}
      onCopyPassword={vi.fn(async () => {})}
      onProbeStrategyChange={vi.fn()}
    />,
  )
  return onRevealPassword
}

describe("DetailColumn password lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("clears plaintext immediately when the password is hidden", async () => {
    renderDetail()

    fireEvent.click(screen.getByRole("button", { name: "accountManager.detail.revealPassword" }))
    expect(await screen.findByText("secret-value")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "accountManager.detail.hidePassword" }))
    expect(screen.queryByText("secret-value")).not.toBeInTheDocument()
  })

  it("clears plaintext after the 30 second reveal TTL", async () => {
    vi.useFakeTimers()
    renderDetail()

    fireEvent.click(screen.getByRole("button", { name: "accountManager.detail.revealPassword" }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText("secret-value")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.queryByText("secret-value")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "accountManager.detail.revealPassword" }),
    ).toBeInTheDocument()
  })
})
