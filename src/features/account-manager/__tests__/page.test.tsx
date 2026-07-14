import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountManagerLoadingSkeleton } from "@/features/account-manager/page"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("AccountManager loading state", () => {
  it("preserves the three-column geometry while initial data loads", () => {
    const { container } = render(<AccountManagerLoadingSkeleton />)

    expect(screen.getByLabelText("common.loading")).toHaveAttribute("aria-busy", "true")
    expect(container.querySelectorAll("[data-skeleton-column]")).toHaveLength(3)
  })
})
