import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  ProcessTreeView,
  type ProcessTreeViewProps,
} from "@/features/port-manager/components/ProcessTreeView"
import type { ProcessChildrenPage, ProcessNode } from "@/lib/tauri/types"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { pid?: number; count?: number }) => {
      if (key === "portManager.pid") return `PID ${options?.pid}`
      if (key === "portManager.loadMoreProcessChildren") return `Load ${options?.count} more`
      return key
    },
  }),
}))

function node(
  pid: number,
  ppid: number,
  name: string,
  identity: string | null,
  hasChildren = false,
): ProcessNode {
  return {
    pid,
    ppid,
    name,
    command: name,
    identity,
    has_children: hasChildren,
    children: [],
  }
}

describe("ProcessTreeView", () => {
  it("loads children on expansion and preserves scan-time owner identities", async () => {
    const user = userEvent.setup()
    const root = node(10, 1, "service", "root-token", true)
    const treeChildren = [node(20, 10, "worker-a", "scan-a"), node(21, 10, "worker-b", "scan-b")]
    const rootWithPath = { ...root, children: [treeChildren[0]] }
    const loadChildren = vi.fn<
      (...args: Parameters<ProcessTreeViewProps["loadChildren"]>) => Promise<ProcessChildrenPage>
    >(async () => ({ parent_pid: 10, children: treeChildren, next_after_pid: null }))

    render(
      <ProcessTreeView
        node={rootWithPath}
        depth={0}
        targetPids={[20, 21]}
        loadChildren={loadChildren}
      />,
    )

    await user.click(screen.getByRole("button"))

    await waitFor(() => expect(loadChildren).toHaveBeenCalledWith(rootWithPath, null))
    expect(await screen.findAllByText("portManager.portOwner")).toHaveLength(2)
    expect(screen.getByText("worker-a").parentElement).toHaveClass("bg-primary")
    expect(screen.getByText("worker-b").parentElement).toHaveClass("bg-primary")
  })

  it("pages large child lists without replacing previously loaded rows", async () => {
    const user = userEvent.setup()
    const root = node(10, 1, "service", "root-token", true)
    const firstChild = node(20, 10, "worker-a", null)
    const secondChild = node(21, 10, "worker-b", null)
    const loadChildren = vi
      .fn<
        (...args: Parameters<ProcessTreeViewProps["loadChildren"]>) => Promise<ProcessChildrenPage>
      >()
      .mockResolvedValueOnce({ parent_pid: 10, children: [firstChild], next_after_pid: 20 })
      .mockResolvedValueOnce({ parent_pid: 10, children: [secondChild], next_after_pid: null })

    render(<ProcessTreeView node={root} depth={0} targetPids={[]} loadChildren={loadChildren} />)

    await user.click(screen.getByRole("button"))
    expect(await screen.findByText("worker-a")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Load 100 more" }))

    expect(await screen.findByText("worker-b")).toBeInTheDocument()
    expect(screen.getByText("worker-a")).toBeInTheDocument()
    expect(loadChildren).toHaveBeenNthCalledWith(2, root, 20)
  })

  it("keeps the first page when a loaded branch is collapsed and reopened", async () => {
    const user = userEvent.setup()
    const root = node(10, 1, "service", "root-token", true)
    const firstChild = node(20, 10, "worker-a", null)
    const loadChildren = vi.fn<
      (...args: Parameters<ProcessTreeViewProps["loadChildren"]>) => Promise<ProcessChildrenPage>
    >(async () => ({ parent_pid: 10, children: [firstChild], next_after_pid: 20 }))

    render(<ProcessTreeView node={root} depth={0} targetPids={[]} loadChildren={loadChildren} />)

    const rootTrigger = screen.getByText("service").closest("button")
    expect(rootTrigger).not.toBeNull()
    await user.click(rootTrigger!)
    expect(await screen.findByText("worker-a")).toBeInTheDocument()

    await user.click(rootTrigger!)
    await user.click(rootTrigger!)

    expect(screen.getByText("worker-a")).toBeInTheDocument()
    expect(loadChildren).toHaveBeenCalledTimes(1)
  })

  it("truncates a lazy-loaded process cycle at the repeated ancestor", async () => {
    const user = userEvent.setup()
    const root = node(10, 1, "service", "root-token", true)
    const child = node(20, 10, "worker", "child-token", true)
    const cycle = node(10, 20, "service", "root-token", true)
    const loadChildren = vi
      .fn<
        (...args: Parameters<ProcessTreeViewProps["loadChildren"]>) => Promise<ProcessChildrenPage>
      >()
      .mockResolvedValueOnce({ parent_pid: 10, children: [child], next_after_pid: null })
      .mockResolvedValueOnce({ parent_pid: 20, children: [cycle], next_after_pid: null })

    render(<ProcessTreeView node={root} depth={0} targetPids={[]} loadChildren={loadChildren} />)

    await user.click(screen.getByRole("button"))
    const childTrigger = screen.getByText("worker").closest("button")
    expect(childTrigger).not.toBeNull()
    await user.click(childTrigger!)

    expect(await screen.findByText("portManager.processTreeCycleTruncated")).toBeInTheDocument()
    expect(loadChildren).toHaveBeenCalledTimes(2)
    expect(loadChildren).toHaveBeenNthCalledWith(2, child, null)
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })
})
