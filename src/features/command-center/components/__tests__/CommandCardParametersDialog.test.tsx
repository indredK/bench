import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandCardParametersDialog } from "@/features/command-center/components/CommandCardParametersDialog"
import { MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH } from "@/features/command-center/services/command-center.parameters"
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

afterEach(() => cleanup())

const card: CommandCard = {
  id: "card-1",
  title: "Open project",
  description: "",
  kind: "shell",
  command: "printf '%s' {{path}} {{path}}",
  icon: null,
  createdAt: 1,
  updatedAt: 1,
}

describe("CommandCardParametersDialog", () => {
  it("requires an explicit value and previews every replacement before running", () => {
    const onSubmit = vi.fn()
    render(<CommandCardParametersDialog card={card} onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    const runButton = screen.getByRole("button", { name: "commandCenter.parameters.run" })
    expect(runButton).toBeDisabled()
    expect(screen.getByText(card.command)).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "commandCenter.parameters.field" }), {
      target: { value: "my project" },
    })

    expect(screen.getByText("printf '%s' my project my project")).toBeInTheDocument()
    expect(runButton).toBeEnabled()
    fireEvent.click(runButton)
    expect(onSubmit).toHaveBeenCalledWith("printf '%s' my project my project")
  })

  it("does not allow an overlong parameter", () => {
    render(<CommandCardParametersDialog card={card} onOpenChange={vi.fn()} onSubmit={vi.fn()} />)

    fireEvent.change(screen.getByRole("textbox", { name: "commandCenter.parameters.field" }), {
      target: { value: "x".repeat(MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH + 1) },
    })
    expect(screen.getByRole("button", { name: "commandCenter.parameters.run" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "commandCenter.parameters.errors.invalidValue",
    )
  })

  it("canceling the parameter prompt never runs the card", () => {
    const onOpenChange = vi.fn()
    const onSubmit = vi.fn()
    render(
      <CommandCardParametersDialog card={card} onOpenChange={onOpenChange} onSubmit={onSubmit} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
