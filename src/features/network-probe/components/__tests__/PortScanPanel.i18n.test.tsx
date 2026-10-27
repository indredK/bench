import { cleanup, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import i18n, { i18nInitPromise } from "@/i18n/config"

const originalLanguage = i18n.language

const result = {
  target: "127.0.0.1",
  mode: "nmap-syn-or-connect",
  openPorts: [48766],
  samples: [
    { port: 48766, state: "open" },
    { port: 48767, state: "closed" },
    { port: 48768, state: "filtered" },
    { port: 48769, state: "error" },
    { port: 48770, state: "unexpected" },
  ],
  cancelled: false,
  sessionId: "port-scan-i18n",
  commandHint: "scanPorts(127.0.0.1, 48766-48770)",
}

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={result}
        streaming={[]}
        toolEnabled
        toolStatus="supported"
        onRun={() => undefined}
        onCancel={() => undefined}
      />
    </I18nextProvider>,
  )
}

beforeAll(async () => {
  await i18nInitPromise
})

afterEach(() => {
  cleanup()
})

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage || "en")
})

describe("PortScanPanel localized state labels", () => {
  it("renders scan states in Chinese and English", async () => {
    await i18n.changeLanguage("zh")
    const { rerender } = renderPanel()
    expect(
      screen.getByText("对自有或已授权主机执行 TCP 端口扫描。最多 256 端口；可取消。"),
    ).toBeInTheDocument()
    for (const label of ["开放", "关闭", "已过滤", "错误", "未知状态"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    await i18n.changeLanguage("en")
    rerender(
      <I18nextProvider i18n={i18n}>
        <PortScanPanel
          loading={false}
          canCancel={false}
          result={result}
          streaming={[]}
          toolEnabled
          toolStatus="supported"
          onRun={() => undefined}
          onCancel={() => undefined}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        "Scan TCP ports on a host you own or are authorized to test. Max 256 ports; cancel stops mid-run.",
      ),
    ).toBeInTheDocument()
    for (const label of ["Open", "Closed", "Filtered", "Error", "Unknown"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
