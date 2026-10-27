import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QuickLoginDialog } from "@/features/account-manager/components/quick-login-dialog"

const EMPTY_ACCOUNTS = () => []

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe("QuickLoginDialog prefill", () => {
  it("prefills and matches the URL forwarded from Auth Proxy", async () => {
    const onMatchStations = vi.fn(async () => [])
    const forwardedUrl = "https://plain.example/login?next=%2Fhome"

    render(
      <QuickLoginDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onMatchStations={onMatchStations}
        getStationAccounts={EMPTY_ACCOUNTS}
        initialUrl={forwardedUrl}
      />,
    )

    expect(
      screen.getByPlaceholderText("accountManager.addStationDialog.websitePlaceholder"),
    ).toHaveValue(forwardedUrl)
    await waitFor(() => expect(onMatchStations).toHaveBeenCalledWith(forwardedUrl), {
      timeout: 1_000,
    })
  })
})
