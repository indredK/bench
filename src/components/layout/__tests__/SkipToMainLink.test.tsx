import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n/config"
import { MAIN_CONTENT_ID, SkipToMainLink } from "@/components/layout/SkipToMainLink"

beforeAll(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("SkipToMainLink", () => {
  it("focuses the main landmark without changing the Tauri hash route", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <>
          <SkipToMainLink />
          <main id={MAIN_CONTENT_ID} tabIndex={-1}>
            Main content
          </main>
        </>
      </I18nextProvider>,
    )

    const link = screen.getByRole("link", { name: "Skip to main content" })
    const main = screen.getByRole("main")
    const currentHash = window.location.hash

    fireEvent.click(link)

    expect(main).toHaveFocus()
    expect(window.location.hash).toBe(currentHash)
  })

  it("updates the link label when the application language changes", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SkipToMainLink />
      </I18nextProvider>,
    )

    expect(screen.getByRole("link", { name: "Skip to main content" })).toBeInTheDocument()

    await i18n.changeLanguage("zh")

    expect(await screen.findByRole("link", { name: "跳转到主内容" })).toBeInTheDocument()
  })
})
