import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Link, Router, useLocation } from "wouter"
import { useTauriHashLocation } from "@/lib/routing/tauri-hash-location"

function RouteStatus() {
  const [location] = useLocation()

  return (
    <>
      <output>{location}</output>
      <Link href="/network-probe">Network probe</Link>
    </>
  )
}

afterEach(() => cleanup())

describe("Tauri hash location", () => {
  it("updates the rendered route immediately after a Wouter link navigation", () => {
    window.history.replaceState(null, "", "/#/dev-toolbox")

    render(
      <Router hook={useTauriHashLocation}>
        <RouteStatus />
      </Router>,
    )

    expect(screen.getByRole("status")).toHaveTextContent("/dev-toolbox")

    fireEvent.click(screen.getByRole("link", { name: "Network probe" }))

    expect(screen.getByRole("status")).toHaveTextContent("/network-probe")
    expect(window.location.hash).toBe("#/network-probe")
  })

  it("tracks external browser history changes notified by popstate", () => {
    window.history.replaceState(null, "", "/#/dev-toolbox")

    render(
      <Router hook={useTauriHashLocation}>
        <RouteStatus />
      </Router>,
    )

    act(() => {
      window.history.pushState(null, "", "/#/account-manager")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })

    expect(screen.getByRole("status")).toHaveTextContent("/account-manager")
  })
})
