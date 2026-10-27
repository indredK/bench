import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandCardEditor } from "@/features/command-center/components/CommandCardEditor"
import type { CommandCard } from "@/lib/tauri/types/command-center"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span>shell</span>,
}))

afterEach(() => cleanup())

const draft: CommandCard = {
  id: "card-1",
  title: "Restart API",
  description: "Restart local development service",
  kind: "shell",
  command: "pnpm dev:restart",
  icon: null,
  createdAt: 1,
  updatedAt: 1,
  group: "",
  tags: [],
}

describe("CommandCardEditor classification fields", () => {
  it("keeps Unicode group limits and submits normalized group and tags", async () => {
    const onSubmit = vi.fn(async () => undefined)

    render(<CommandCardEditor open draft={draft} onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    const groupInput = screen.getByRole("textbox", { name: "commandCenter.editor.fieldGroup" })
    fireEvent.change(groupInput, { target: { value: `  ${"界".repeat(100)}  ` } })
    expect(Array.from((groupInput as HTMLInputElement).value)).toHaveLength(80)

    fireEvent.change(groupInput, { target: { value: "  Networking  " } })
    fireEvent.change(screen.getByRole("textbox", { name: "commandCenter.editor.fieldTags" }), {
      target: { value: " API，api; local " },
    })
    fireEvent.click(screen.getByRole("button", { name: "common.save" }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith({
      ...draft,
      group: "Networking",
      tags: ["API", "local"],
    })
  })

  it("previews recognized parameter names and rejects malformed placeholders", () => {
    render(<CommandCardEditor open draft={draft} onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    const commandInput = screen.getByRole("textbox", { name: "commandCenter.editor.command.shell" })
    fireEvent.change(commandInput, { target: { value: "printf '%s' {{path}} {{path}}" } })
    expect(screen.getByRole("status")).toHaveTextContent("commandCenter.editor.parametersFound")
    expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled()

    fireEvent.change(commandInput, { target: { value: "printf '%s' {{bad-name}}" } })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "commandCenter.parameters.errors.invalidSyntax",
    )
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled()
  })
})
