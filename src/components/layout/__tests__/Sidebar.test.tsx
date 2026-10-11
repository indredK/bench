import type { ElementType, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Sidebar from "../Sidebar"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../QuickControls", () => ({ default: () => null }))
vi.mock("@/hooks/useScrambleText", () => ({
  useScrambleText: ({ target }: { target: string }) => ({ text: target, start: vi.fn() }),
}))
vi.mock("@/lib/motion-utils", () => ({
  useReducedMotionProps: () => ({ reduce: (props: Record<string, number>) => props }),
}))
vi.mock("@/components/common/ScrollableArea", () => ({
  ScrollableArea: ({
    as: Tag = "div",
    children,
    className,
  }: {
    as?: ElementType
    children?: ReactNode
    className?: string
  }) => <Tag className={className}>{children}</Tag>,
}))

describe("Sidebar", () => {
  it("marks only the route supplied by the app shell as current", () => {
    render(
      <Sidebar
        activePath="/command-center"
        items={[
          { path: "/dev-toolbox", name: "开发工具箱", icon: <span /> },
          { path: "/command-center", name: "命令中心", icon: <span /> },
        ]}
        configItems={[{ path: "/system-settings", name: "系统设置", icon: <span /> }]}
      />,
    )

    expect(screen.getByRole("link", { name: "开发工具箱" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "命令中心" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "命令中心" })).toHaveClass("bg-primary/10")
    expect(screen.getByRole("link", { name: "系统设置" })).not.toHaveAttribute("aria-current")
  })
})
