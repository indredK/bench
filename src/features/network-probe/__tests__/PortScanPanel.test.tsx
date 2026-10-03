import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "@/i18n/config"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"

function renderPortScanPanel(onRun: () => void) {
  render(
    <I18nextProvider i18n={i18n}>
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={null}
        streaming={[]}
        toolEnabled
        onRun={() => onRun()}
        onCancel={() => undefined}
      />
    </I18nextProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage("zh")
})

afterEach(() => {
  cleanup()
})

describe("PortScanPanel target scope confirmation", () => {
  it.each(["10.999.1.1", "192.168.1.999", "172.16.256.1", "127.0.0.999"])(
    "requires confirmation for out-of-range IPv4 target %s",
    (target) => {
      const onRun = vi.fn()
      renderPortScanPanel(onRun)

      fireEvent.change(screen.getByLabelText("目标"), { target: { value: target } })
      fireEvent.click(screen.getByRole("button", { name: "扫描端口" }))

      expect(screen.getByText("确认端口扫描范围")).toBeTruthy()
      expect(onRun).not.toHaveBeenCalled()
    },
  )
})
