import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthProxyDialog } from "@/features/account-manager/components/auth-proxy-dialog"
import type { AuthProxyConfirmInput } from "@/features/account-manager/hooks/useAuthProxy"
import { accountManagerRepository } from "@/features/account-manager/services/account-manager.repository"
import type {
  AuthProxyMatch,
  AuthProxyRequest,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === "accountManager.authProxy.wizard.newAccount") return "Use a new account"
      if (key === "accountManager.authProxy.wizard.useExistingAccount") {
        return "Use existing account"
      }
      if (key === "accountManager.authProxy.wizard.next") return "Next"
      if (key === "accountManager.authProxy.wizard.startLogin") return "Start login"
      if (key === "accountManager.authProxy.wizard.newAccountHint") {
        return `A new account will be grouped under ${values?.host ?? "the target host"}.`
      }
      if (key === "accountManager.authProxy.wizard.noStation") {
        return "No saved sites yet. A site is created automatically for a new account."
      }
      return key
    },
  }),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => null,
}))

const request: AuthProxyRequest = {
  ticketId: "ticket-1",
  expiresAtTs: 2_000_000_000,
  hasReturnUrl: false,
  returnScheme: null,
}

const manualAccount: StationAccount = {
  id: "account-1",
  stationId: "station-1",
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
  createdAt: "2026-10-04",
  hasPassword: false,
  proxyEnabled: true,
}

const manualMatch: AuthProxyMatch = {
  stationId: "station-1",
  stationName: "Manually selected site",
  website: "https://other.example",
  accounts: [manualAccount],
  confidence: "manual",
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("AuthProxyDialog candidate and fresh-account flow", () => {
  it("preselects a unique automatic candidate ahead of manual choices", async () => {
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn(async () => true)}
        initialRequest={request}
        initialMatches={[
          {
            ...manualMatch,
            stationId: "automatic-station",
            stationName: "Automatically matched site",
            confidence: "exact",
            accounts: [{ ...manualAccount, stationId: "automatic-station" }],
          },
          { ...manualMatch, stationId: "manual-station", accounts: [] },
        ]}
        initialHost="target.example"
      />,
    )

    expect(await screen.findByRole("button", { name: /use existing account/i })).toBeEnabled()
  })

  it("lets a manual candidate account start with the station returned by the backend", async () => {
    const onConfirm = vi.fn(async (_input: AuthProxyConfirmInput) => true)
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        initialRequest={request}
        initialMatches={[manualMatch]}
        initialHost="target.example"
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: /use existing account/i }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Manually selected site")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Start login" }))

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        request,
        selectedAccountId: manualAccount.id,
        isNewAccount: false,
        targetHost: "target.example",
        newAccountName: "",
      }),
    )
  })

  it("allows an optional-name account when there are no stations and shows its target grouping", async () => {
    const onConfirm = vi.fn(async (_input: AuthProxyConfirmInput) => true)
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        initialRequest={request}
        initialMatches={[]}
        initialHost="new.example"
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: /^Use a new account/ }))
    expect(
      screen.getByText("No saved sites yet. A site is created automatically for a new account."),
    ).toBeInTheDocument()
    const nextButton = screen.getByRole("button", { name: "Next" })
    expect(nextButton).toBeEnabled()
    fireEvent.click(nextButton)
    expect(screen.getAllByText("new.example")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Start login" }))

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        request,
        selectedAccountId: "__new__",
        isNewAccount: true,
        targetHost: "new.example",
        newAccountName: "",
      }),
    )
  })

  it("can switch back to the existing account after choosing a new account", async () => {
    const onConfirm = vi.fn(async (_input: AuthProxyConfirmInput) => true)
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        initialRequest={request}
        initialMatches={[manualMatch]}
        initialHost="target.example"
      />,
    )

    const newAccountButton = await screen.findByRole("button", { name: /^Use a new account/ })
    const existingAccountButton = screen.getByRole("button", { name: /use existing account/i })
    fireEvent.click(newAccountButton)
    expect(newAccountButton).toHaveAttribute("aria-pressed", "true")
    expect(existingAccountButton).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(existingAccountButton)
    expect(existingAccountButton).toHaveAttribute("aria-pressed", "true")
    expect(newAccountButton).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Start login" }))

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        request,
        selectedAccountId: manualAccount.id,
        isNewAccount: false,
        targetHost: "target.example",
        newAccountName: "",
      }),
    )
  })

  it("routes a pasted ordinary URL to Quick Login with the original URL", async () => {
    vi.spyOn(accountManagerRepository, "handleBrowserOpen").mockResolvedValue({
      ticketId: "plain-ticket",
      expiresAtTs: 2_000_000_000,
      host: "plain.example",
      isAuthorize: false,
      hasReturnUrl: false,
      returnScheme: null,
      matches: [],
    })
    const onSwitchToQuickLogin = vi.fn()
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn(async () => true)}
        onSwitchToQuickLogin={onSwitchToQuickLogin}
      />,
    )

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "https://plain.example/login?next=%2Fhome" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(
      await screen.findByRole("button", {
        name: "accountManager.authProxy.wizard.switchToQuickLogin",
      }),
    )

    expect(onSwitchToQuickLogin).toHaveBeenCalledWith("https://plain.example/login?next=%2Fhome")
  })

  it("does not expose a pasted URL from a deep link to Quick Login", async () => {
    const onSwitchToQuickLogin = vi.fn()
    render(
      <AuthProxyDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn(async () => true)}
        initialRequest={request}
        initialMatches={[]}
        initialHost="plain.example"
        initialIsAuthorize={false}
        onSwitchToQuickLogin={onSwitchToQuickLogin}
      />,
    )

    expect(
      await screen.findByText("accountManager.authProxy.wizard.deepLinkQuickLoginHint"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountManager.authProxy.wizard.switchToQuickLogin",
      }),
    ).not.toBeInTheDocument()
    expect(onSwitchToQuickLogin).not.toHaveBeenCalled()
  })
})
