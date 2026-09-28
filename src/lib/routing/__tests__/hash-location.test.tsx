import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AnimatePresence, motion } from "motion/react"
import { Link, Route, Router, Switch, useLocation } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

function RouteView() {
  const [location] = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location} data-testid="route-panel" exit={{ opacity: 0 }}>
        <Switch location={location}>
          <Route path="/dev-toolbox">Developer tools page</Route>
          <Route path="/extension-center">Extensions page</Route>
        </Switch>
      </motion.div>
    </AnimatePresence>
  )
}

function RouterHarness() {
  return (
    <Router hook={useHashLocation}>
      <nav>
        <Link href="/dev-toolbox">开发工具箱</Link>
        <Link href="/extension-center">插件中心</Link>
      </nav>
      <RouteView />
    </Router>
  )
}

describe("hash route panel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `${window.location.pathname}#/dev-toolbox`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, "", window.location.pathname)
  })

  it("renders the new route after navigation", async () => {
    render(<RouterHarness />)

    expect(screen.getByText("Developer tools page")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "插件中心" }))

    await waitFor(() => expect(screen.getByText("Extensions page")).toBeInTheDocument())
    expect(window.location.hash).toBe("#/extension-center")
  })

  it("leaves auxiliary clicks to the browser", () => {
    render(<RouterHarness />)

    fireEvent(
      screen.getByRole("link", { name: "插件中心" }),
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    )

    expect(window.location.hash).toBe("#/dev-toolbox")
    expect(screen.getByText("Developer tools page")).toBeInTheDocument()
  })
})
