/**
 * Keyboard / focus behavior test / 键盘与焦点行为测试 (A1-7):
 *   对话框打开后焦点落在首个可交互元素；Escape 关闭且焦点回到触发元素；
 *   Tab 在对话框内循环（首尾包裹）；窄屏 Sheet Escape 关闭。
 */
import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DetailColumn } from "@/features/account-manager/components/DetailColumn"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_LOGIN_DETECTION,
  type RelayStation,
  type StationAccount,
} from "@/lib/tauri/types/account-manager"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const noop = () => undefined

const station: RelayStation = {
  id: "station-1",
  remark: "Example",
  website: "https://example.com",
  createdAt: "2026-07-14 08:00",
  loginDetection: DEFAULT_LOGIN_DETECTION,
  authProfile: null,
}

const account: StationAccount = {
  id: "account-1",
  stationId: station.id,
  username: "alice",
  notes: "",
  phone: null,
  tgAccount: null,
  linkedAccount: null,
  inviteLink: null,
  loginMethods: [],
  status: "ready",
  lastLoginAt: null,
  lastRefreshedAt: null,
  createdAt: "2026-07-14 08:00",
  hasPassword: false,
}

afterEach(() => {
  cleanup()
})

describe("dialog keyboard & focus (A1-7)", () => {
  it("moves initial focus into the dialog, cycles Tab inside, and restores focus to the trigger on Escape", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next)
            setOpen(next)
          }}
        >
          <DialogTrigger asChild>
            <button type="button">open-form</button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>dialog-title</DialogTitle>
            <Input aria-label="first-field" defaultValue="" />
            <button type="button">secondary-action</button>
          </DialogContent>
        </Dialog>
      )
    }
    render(<Harness />)

    const trigger = screen.getByRole("button", { name: "open-form" })
    fireEvent.click(trigger)

    const dialog = screen.getByRole("dialog")
    const firstField = screen.getByLabelText("first-field")
    await waitFor(() => expect(document.activeElement).toBe(firstField))

    // Tab 循环：连续 Tab 后焦点仍留在对话框内部元素中
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button, input, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => !el.hasAttribute("disabled"))
    expect(focusables.length).toBeGreaterThan(1)
    for (let i = 0; i < focusables.length + 1; i++) {
      await user.tab()
      const active = document.activeElement
      expect(active).not.toBeNull()
      expect(dialog.contains(active)).toBe(true)
    }

    // Escape 关闭（radix 在 document 上监听）且焦点回到触发元素
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it("closes the narrow-screen DetailColumn Sheet on Escape", () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent className="p-0 xl:hidden">
          <SheetTitle className="sr-only">accountManager.detailTitle</SheetTitle>
          <DetailColumn
            className="flex h-full w-full rounded-none border-0"
            station={station}
            account={account}
            onOpenWebsite={noop}
            onRedetectProfile={noop}
            onRevealPassword={async () => ""}
            onCopyPassword={async () => undefined}
            onProbeStrategyChange={noop}
          />
        </SheetContent>
      </Sheet>,
    )

    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
