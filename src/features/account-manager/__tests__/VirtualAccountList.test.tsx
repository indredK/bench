import { render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { VirtualAccountList } from "@/features/account-manager/components/VirtualAccountList"
import type { StationAccount } from "@/lib/tauri/types/account-manager"

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")

afterEach(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight")
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
  }
})

function account(index: number): StationAccount {
  return {
    id: `account-${index}`,
    stationId: "station-1",
    username: `user-${index}`,
    notes: "",
    phone: null,
    tgAccount: null,
    linkedAccount: null,
    inviteLink: null,
    loginMethods: [],
    status: "ready",
    lastLoginAt: null,
    lastRefreshedAt: null,
    createdAt: "2026-01-01 00:00",
    hasPassword: false,
  }
}

describe("VirtualAccountList", () => {
  it("keeps a 500-account data set bounded to the viewport DOM", async () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 600,
    })
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 480,
    })
    const accounts = Array.from({ length: 500 }, (_, index) => account(index))
    const { container } = render(
      <div style={{ height: 600 }}>
        <VirtualAccountList
          accounts={accounts}
          renderAccount={(item) => <button type="button">{item.username}</button>}
        />
      </div>,
    )

    const list = container.querySelector("[data-virtual-account-list]")
    expect(list).toHaveAttribute("data-total-count", "500")
    await waitFor(() => {
      const renderedRows = container.querySelectorAll("[data-account-id]")
      expect(renderedRows.length).toBeGreaterThan(0)
      expect(renderedRows.length).toBeLessThan(50)
    })
  })
})
