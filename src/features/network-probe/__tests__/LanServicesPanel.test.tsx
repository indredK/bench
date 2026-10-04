import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"
import { LanServicesPanel } from "../components/LanServicesPanel"

const translations: Record<string, string> = {
  "networkProbe.lanSvc.hint": "发现局域网服务",
  "networkProbe.lanSvc.run": "浏览服务",
  "networkProbe.lanSvc.running": "浏览中",
  "networkProbe.lanSvc.readOnlyHint": "只读发现，不会修改设备配置。",
  "networkProbe.lanSvc.partialFailure": "部分发现协议失败，结果可能不完整。",
  "networkProbe.lanSvc.allFailed": "所有发现协议均失败，无法判断局域网内是否存在服务。",
  "networkProbe.lanSvc.protocolFailure": "{{protocol}} 探测失败",
  "networkProbe.lanSvc.technicalDetails": "技术详情",
  "networkProbe.lanSvc.txt": "TXT：{{value}}",
  "networkProbe.lanSvc.addresses": "地址：{{value}}",
  "networkProbe.lanSvc.usn": "USN：{{value}}",
  "networkProbe.lanSvc.location": "LOCATION（仅展示，不会访问）：{{value}}",
  "networkProbe.lanSvc.mdns": "mDNS",
  "networkProbe.lanSvc.ssdp": "SSDP",
  "networkProbe.lanSvc.otherProtocol": "其他协议",
  "networkProbe.lanSvc.truncated": "发现列表或服务详情受到限制，结果可能不完整。",
  "networkProbe.lanSvc.meta": "{{count}} 个服务 · {{ms}} ms",
  "networkProbe.lanSvc.empty": "没有发现服务。",
  "networkProbe.lanSvc.results": "局域网服务结果",
  "networkProbe.cmd.lanSvc": "browseLanServices(local)",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { [name: string]: unknown }) => {
      const template = translations[key] ?? key
      return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options?.[name] ?? ""))
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function result(overrides: Partial<LanServicesResult> = {}): LanServicesResult {
  return {
    items: [
      {
        protocol: "mdns",
        name: "Office Printer",
        serviceType: "_ipp._tcp.local.",
        host: "printer.local.",
        port: 631,
        txtProperties: ["note=office"],
        addresses: ["192.168.1.20"],
        usn: undefined,
        location: undefined,
      },
    ],
    failures: [
      {
        protocol: "ssdp",
        code: "SSDP_SEND",
        message: "No route to host (os error 65)",
      },
    ],
    truncated: false,
    elapsedMs: 5.4,
    commandHint: "browseLanServices(local)",
    ...overrides,
  }
}

describe("LanServicesPanel", () => {
  it("counts only discovered services and localizes partial protocol errors", () => {
    render(<LanServicesPanel loading={false} result={result()} toolEnabled onRun={vi.fn()} />)

    expect(screen.getByText("1 个服务 · 5 ms")).toBeInTheDocument()
    expect(screen.getByText("部分发现协议失败，结果可能不完整。")).toBeInTheDocument()
    expect(screen.getByText("SSDP 探测失败")).toBeInTheDocument()
    expect(
      screen.getByText(
        /\[mdns\] Office Printer · _ipp\._tcp\.local\. · printer\.local\.:631 — TXT：note=office · 地址：192\.168\.1\.20/,
      ),
    ).toBeInTheDocument()
  })

  it("keeps total protocol failures separate from the empty-network state", () => {
    render(
      <LanServicesPanel
        loading={false}
        result={result({
          items: [],
          failures: [
            ...result().failures,
            { protocol: "mdns", code: "MDNS_RUNTIME", message: "No route to host" },
          ],
        })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("0 个服务 · 5 ms")).toBeInTheDocument()
    expect(screen.queryByText("没有发现服务。")).not.toBeInTheDocument()
    expect(
      screen.getByText("所有发现协议均失败，无法判断局域网内是否存在服务。"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\[ssdp\]/i)).not.toBeInTheDocument()
  })

  it("announces when bounded service details may be incomplete", () => {
    render(
      <LanServicesPanel
        loading={false}
        result={result({ truncated: true })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("发现列表或服务详情受到限制，结果可能不完整。")).toBeInTheDocument()
  })
})
