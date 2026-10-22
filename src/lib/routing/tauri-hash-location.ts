import { useSyncExternalStore } from "react"
import type { BaseLocationHook } from "wouter"

const subscribers = new Set<() => void>()

function notifyLocationChange() {
  subscribers.forEach((subscriber) => subscriber())
}

function subscribeToLocationChange(subscriber: () => void) {
  subscribers.add(subscriber)
  if (subscribers.size === 1) {
    window.addEventListener("hashchange", notifyLocationChange)
    window.addEventListener("popstate", notifyLocationChange)
  }

  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) {
      window.removeEventListener("hashchange", notifyLocationChange)
      window.removeEventListener("popstate", notifyLocationChange)
    }
  }
}

function getCurrentLocation() {
  return `/${window.location.hash.replace(/^#?\/?/, "")}`
}

type NavigationOptions = {
  state?: unknown
  replace?: boolean
}

function navigate(to: string, options: NavigationOptions = {}) {
  const oldURL = window.location.href
  const [hash, search] = to.replace(/^#?\/?/, "").split("?")
  const url = new URL(oldURL)
  url.hash = `/${hash}`
  if (search !== undefined) url.search = search
  const newURL = url.href

  window.history[options.replace ? "replaceState" : "pushState"](options.state ?? null, "", newURL)

  // WKWebView updates the address bar for pushState, but its synthetic
  // hashchange event does not consistently notify React's external store.
  notifyLocationChange()
  const event =
    typeof HashChangeEvent !== "undefined"
      ? new HashChangeEvent("hashchange", { oldURL, newURL })
      : new Event("hashchange")
  window.dispatchEvent(event)
}

export const useTauriHashLocation: BaseLocationHook = (router?: { ssrPath?: string }) => [
  useSyncExternalStore(subscribeToLocationChange, getCurrentLocation, () => router?.ssrPath ?? "/"),
  navigate,
]

useTauriHashLocation.hrefs = (href) => `#${href}`
