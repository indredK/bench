import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScanOpinionPanel } from "@/features/network-probe/components/ScanOpinionPanel"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

const { setLanguage, translate } = vi.hoisted(() => {
  let language: "zh" | "en" = "zh"
  const messages = {
    zh: {
      "networkProbe.opinion.hint": "基于最近一次体检的可操作建议。",
      "networkProbe.opinion.severity.warn": "警告",
      "networkProbe.opinion.severity.unknown": "未知状态",
      "networkProbe.opinion.unknownTitle": "无法识别的建议",
      "networkProbe.opinion.unknownBody": "当前版本无法显示此建议。",
      "networkProbe.advisor.captiveUnconfirmed.title": "门户检测响应异常",
      "networkProbe.advisor.captiveUnconfirmed.body":
        "当前响应与预期不同，暂不能确认是否需要登录。可检查是否有网络认证页，并在登录后重试。",
    },
    en: {
      "networkProbe.opinion.hint": "Actionable advice from the latest health scan.",
      "networkProbe.opinion.severity.warn": "Warning",
      "networkProbe.opinion.severity.unknown": "Unknown status",
      "networkProbe.opinion.unknownTitle": "Unrecognized recommendation",
      "networkProbe.opinion.unknownBody": "This recommendation is not supported by this version.",
      "networkProbe.advisor.captiveUnconfirmed.title": "Unexpected captive portal response",
      "networkProbe.advisor.captiveUnconfirmed.body":
        "The connectivity check returned an unusual response, so a portal cannot be confirmed. Check for a sign-in page and retry after signing in.",
    },
  }

  return {
    setLanguage: (value: "zh" | "en") => {
      language = value
    },
    translate: (key: string) => messages[language][key as keyof (typeof messages)["zh"]] ?? key,
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  setLanguage("zh")
})

const result: HealthScanResult = {
  items: [],
  opinions: [
    {
      id: "captive-unconfirmed",
      severity: "warn",
      relatedKeys: ["reach.captive"],
      titleKey: "networkProbe.advisor.captiveUnconfirmed.title",
      bodyKey: "networkProbe.advisor.captiveUnconfirmed.body",
    },
  ],
  elapsedMs: 1,
  sessionId: "health-1",
  cancelled: false,
  commandHint: "startHealthScan(local)",
}

describe("ScanOpinionPanel captive portal warning", () => {
  it.each([
    [
      "zh",
      "门户检测响应异常",
      "警告",
      "当前响应与预期不同，暂不能确认是否需要登录。可检查是否有网络认证页，并在登录后重试。",
    ],
    [
      "en",
      "Unexpected captive portal response",
      "Warning",
      "The connectivity check returned an unusual response, so a portal cannot be confirmed. Check for a sign-in page and retry after signing in.",
    ],
  ] as const)(
    "renders the inconclusive recommendation in %s",
    (language, title, severity, body) => {
      setLanguage(language)
      render(<ScanOpinionPanel result={result} onGoTree={vi.fn()} />)

      expect(screen.getByText(title)).toBeTruthy()
      expect(screen.getByText(severity)).toBeTruthy()
      expect(screen.getByText(body)).toBeTruthy()
      expect(screen.getByText("reach.captive")).toBeTruthy()
    },
  )

  it("uses localized fallbacks for prototype-key opinion values", () => {
    setLanguage("en")
    render(
      <ScanOpinionPanel
        result={{
          ...result,
          opinions: [
            {
              ...result.opinions[0],
              severity: "constructor",
              titleKey: "constructor",
              bodyKey: "toString",
            },
          ],
        }}
        onGoTree={vi.fn()}
      />,
    )

    expect(screen.getByText("Unknown status")).toBeTruthy()
    expect(screen.getByText("Unrecognized recommendation")).toBeTruthy()
    expect(screen.getByText("This recommendation is not supported by this version.")).toBeTruthy()
  })
})
