import i18n, { i18nInitPromise } from "../config"

describe("document language", () => {
  let originalLanguage = "en"

  beforeEach(async () => {
    await i18nInitPromise
    originalLanguage = i18n.resolvedLanguage || i18n.language || "en"
  })

  afterEach(async () => {
    await i18n.changeLanguage(originalLanguage)
  })

  it("tracks the active locale for assistive technology", async () => {
    await i18n.changeLanguage("zh")
    expect(document.documentElement.lang).toBe("zh")

    await i18n.changeLanguage("en")
    expect(document.documentElement.lang).toBe("en")
  })
})
