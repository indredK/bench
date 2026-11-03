import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { UpdateStatusChip } from "../UpdateStatusChip"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

const base = {
  open: false,
  updateInfo: null,
  downloadedBytes: 0,
  totalBytes: null,
  openDialog: vi.fn(),
}

describe("UpdateStatusChip", () => {
  it("对话框打开或空闲时不渲染", () => {
    const { container, rerender } = render(<UpdateStatusChip {...base} open status="available" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<UpdateStatusChip {...base} status="idle" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<UpdateStatusChip {...base} status="upToDate" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("后台下载时显示真实百分比与进度条，点击回到对话框", () => {
    const openDialog = vi.fn()
    render(
      <UpdateStatusChip
        {...base}
        status="downloading"
        downloadedBytes={30}
        totalBytes={120}
        openDialog={openDialog}
      />,
    )
    expect(screen.getByText(/downloadingPercent.*25/)).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25")
    fireEvent.click(screen.getByRole("button", { name: /downloadingPercent/ }))
    expect(openDialog).toHaveBeenCalled()
  })

  it("大小未知时不伪造进度条", () => {
    render(<UpdateStatusChip {...base} status="downloading" downloadedBytes={30} />)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("发现新版本的提示可按版本忽略", () => {
    render(
      <UpdateStatusChip
        {...base}
        status="available"
        updateInfo={{
          available: true,
          currentVersion: "1.0.0",
          version: "1.1.0",
          date: null,
          body: null,
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "updater.chip.dismiss" }))
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
