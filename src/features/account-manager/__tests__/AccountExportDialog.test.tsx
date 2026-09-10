/**
 * AccountExportDialog behavior / 账号快照导出弹窗行为:
 * 生成中加载态(两个出口禁用) → 生成完成后启用复制/导出并转发点击 →
 * 保存进行中时两个出口禁用。复制与写文件的编排在 useAccountExport。
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountExportDialog } from "@/features/account-manager/components/account-export-dialog"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "zh-CN" },
  }),
}))

function renderDialog(props: {
  loading?: boolean
  saving?: boolean
  ready?: boolean
  onCopy?: () => void
  onSave?: () => void
}) {
  const onCopy = props.onCopy ?? vi.fn()
  const onSave = props.onSave ?? vi.fn()
  render(
    <AccountExportDialog
      open
      onOpenChange={vi.fn()}
      accountName="alice"
      stationName="Trae 云端 IDE"
      loading={props.loading ?? false}
      saving={props.saving ?? false}
      ready={props.ready ?? false}
      onCopy={onCopy}
      onSave={onSave}
    />,
  )
  return { onCopy, onSave }
}

describe("AccountExportDialog", () => {
  it("shows loading state and disables both exits while generating", () => {
    renderDialog({ loading: true })

    expect(screen.getByText("accountManager.exportSnapshot.loading")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.copyButton" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.saveButton" }),
    ).toBeDisabled()
  })

  it("shows scope list and security warning, enables exits when ready", () => {
    const { onCopy, onSave } = renderDialog({ ready: true })

    expect(screen.getByText("accountManager.exportSnapshot.includesTitle")).toBeInTheDocument()
    expect(screen.getByText("accountManager.exportSnapshot.includes.password")).toBeInTheDocument()
    expect(screen.getByText("accountManager.exportSnapshot.warning")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.copyButton" }),
    )
    expect(onCopy).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.saveButton" }),
    )
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("disables both exits while saving", () => {
    renderDialog({ ready: true, saving: true })

    expect(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.copyButton" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "accountManager.exportSnapshot.saveButton" }),
    ).toBeDisabled()
  })
})
