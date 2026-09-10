/**
 * LoginRulesDialog behavior / 更新登录逻辑弹窗行为:
 * 检查中加载态 → 有更新时对应按钮可点（无更新的范围禁用）→ 已最新全禁用 →
 * 检查失败提示。按钮点击仅触发 onUpdate(scope)，更新逻辑在 useLoginRules。
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LoginRulesDialog } from "@/features/account-manager/components/login-rules-dialog"
import type { LoginRulesOverview } from "@/lib/tauri/types/account-manager"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "zh-CN" },
  }),
}))

const genericRule: LoginRulesOverview["generic"] = {
  id: "generic",
  version: "1.0.0",
  title: "通用登录判定（兜底）",
  description: "",
  source: "bundled",
  hasLoginCheck: false,
  loginCheckUrl: null,
  loginCheckMethod: null,
  loggedInTexts: ["退出登录", "Sign out"],
  loggedOutTexts: ["立即登录", "Sign in"],
}

const siteRule: LoginRulesOverview["site"] = {
  id: "trae.cn",
  version: "1.0.0",
  title: "Trae 云端 IDE",
  description: "",
  source: "remote",
  hasLoginCheck: true,
  loginCheckUrl: "https://api.trae.cn/cloudide/api/v3/trae/CheckLogin",
  loginCheckMethod: "POST",
  loggedInTexts: [],
  loggedOutTexts: [],
}

function baseOverview(): LoginRulesOverview {
  return {
    generic: genericRule,
    site: null,
    remote: null,
    remoteError: null,
    lastFetchedAt: null,
  }
}

function renderDialog(props: {
  overview: LoginRulesOverview | null
  checking?: boolean
  updatingScope?: "all" | "generic" | "site" | null
  onUpdate?: (scope: "all" | "generic" | "site") => void
}) {
  const onUpdate = props.onUpdate ?? vi.fn()
  render(
    <LoginRulesDialog
      open
      onOpenChange={vi.fn()}
      website="https://trae.cn"
      overview={props.overview}
      checking={props.checking ?? false}
      updatingScope={props.updatingScope ?? null}
      onUpdate={onUpdate}
    />,
  )
  return onUpdate
}

describe("LoginRulesDialog", () => {
  it("shows loading state while checking and disables every update button", () => {
    renderDialog({ overview: null, checking: true })

    expect(screen.getByText("accountManager.loginRules.checking")).toBeInTheDocument()
    for (const key of ["all", "generic", "site"]) {
      expect(
        screen.getByRole("button", {
          name: `accountManager.loginRules.update${key[0].toUpperCase()}${key.slice(1)}`,
        }),
      ).toBeDisabled()
    }
  })

  it("enables only updatable scopes and forwards the clicked scope", () => {
    const overview = baseOverview()
    overview.site = siteRule
    overview.remote = {
      checkedAt: "2026-09-10T04:00:00Z",
      indexUpdatedAt: "2026-09-10T03:59:46Z",
      generic: { id: "generic", version: "1.1.0", updatable: true },
      site: { id: "trae.cn", version: "1.0.0", updatable: false },
      genericUpdatable: true,
      siteUpdatable: false,
    }
    const onUpdate = renderDialog({ overview })

    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateAll" }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateGeneric" }),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateSite" }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "accountManager.loginRules.updateGeneric" }))
    expect(onUpdate).toHaveBeenCalledWith("generic")
  })

  it("disables all update buttons when everything is up to date", () => {
    const overview = baseOverview()
    overview.remote = {
      checkedAt: "2026-09-10T04:00:00Z",
      indexUpdatedAt: "2026-09-10T03:59:46Z",
      generic: { id: "generic", version: "1.0.0", updatable: false },
      site: null,
      genericUpdatable: false,
      siteUpdatable: false,
    }
    renderDialog({ overview })

    expect(screen.getByText("accountManager.loginRules.upToDate")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateAll" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateGeneric" }),
    ).toBeDisabled()
  })

  it("shows failure hint and keeps buttons disabled when the remote check failed", () => {
    const overview = baseOverview()
    overview.remoteError = "fetch failed"
    renderDialog({ overview })

    expect(screen.getByText("accountManager.loginRules.checkFailed")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "accountManager.loginRules.updateAll" }),
    ).toBeDisabled()
  })
})
