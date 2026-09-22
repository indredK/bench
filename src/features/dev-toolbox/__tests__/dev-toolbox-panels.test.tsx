/**
 * Panel render tests / 面板渲染测试 (planned#11):
 *   验证从 page.tsx 拆出的 DevtoolsPanel / DiagnosticsPanel 渲染出各自的分节标题与
 *   控件——直接为「拆分文件」这次重构兜底：若哪个 SettingGroup 区块在搬迁中被漏掉，
 *   这里会失败。用真实 controller（默认停在 port-manager tab，不触发 IPC 加载）。
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n/config"
import { useDevToolboxController } from "@/features/dev-toolbox/hooks/useDevToolboxController"
import { DevtoolsPanel } from "@/features/dev-toolbox/components/devtools-panel"
import { DiagnosticsPanel } from "@/features/dev-toolbox/components/diagnostics-panel"

function DevtoolsHarness() {
  const controller = useDevToolboxController()
  return <DevtoolsPanel controller={controller} />
}

function DiagnosticsHarness() {
  const controller = useDevToolboxController()
  return <DiagnosticsPanel controller={controller} />
}

beforeAll(async () => {
  await i18n.changeLanguage("zh")
})

afterEach(() => {
  cleanup()
})

describe("dev-toolbox panels render after page.tsx split", () => {
  it("renders every devtools section title", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DevtoolsHarness />
      </I18nextProvider>,
    )
    for (const title of [
      "JSON 格式化",
      "Base64",
      "Hash 计算",
      "UUID 生成器",
      "时间戳转换",
      "正则测试",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    }
  })

  it("renders diagnostics controls including the port-check button", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DiagnosticsHarness />
      </I18nextProvider>,
    )
    expect(screen.getAllByText("检测端口").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ping").length).toBeGreaterThan(0)
  })
})
