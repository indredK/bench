import { expect, test, type Locator } from "@playwright/test"

test("real virtual scrolling keeps row order and exposes full positions to keyboard users", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/virtualized-result-list.html")

  const region = page.getByRole("region", { name: "Virtualized results" })
  await expect(region).toBeVisible()

  const initialRows = region.getByRole("listitem")
  await expect(initialRows.first()).toHaveAttribute("aria-posinset", "1")
  await expect(initialRows.first()).toHaveAttribute("aria-setsize", "300")
  expect(await initialRows.count()).toBeLessThan(300)
  await expectRowsMatchPositions(initialRows)

  await region.focus()
  await page.keyboard.press("End")
  await expect
    .poll(async () => Number(await initialRows.last().getAttribute("aria-posinset")))
    .toBe(300)
  const finalRows = region.getByRole("listitem")
  expect(await finalRows.count()).toBeLessThan(300)
  await expectRowsMatchPositions(finalRows)
  expect(await region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  await page.keyboard.press("Home")
  await expect
    .poll(async () =>
      Number(await region.getByRole("listitem").first().getAttribute("aria-posinset")),
    )
    .toBe(1)
  expect(await region.evaluate((element) => element.scrollTop)).toBe(0)
})

async function expectRowsMatchPositions(rows: Locator) {
  const count = await rows.count()
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const position = Number(await row.getAttribute("aria-posinset"))
    await expect(row).toHaveAttribute("aria-setsize", "300")
    await expect(row).toHaveText(`Result row ${position}`)
    if (index > 0) {
      const previousPosition = Number(await rows.nth(index - 1).getAttribute("aria-posinset"))
      expect(position).toBeGreaterThan(previousPosition)
    }
  }
}
