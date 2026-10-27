import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import type {
  GlobalpingMeasurementResult,
  MultiNodeDnsResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "networkProbe.nodes.httpResponse") {
        return `HTTP ${options?.code} ${options?.name}`
      }
      if (key === "networkProbe.nodes.meta") {
        const count = Number(options?.count ?? 0)
        const resultNoun = count === 1 ? "node result" : "node results"
        return `${options?.domain} · ${count} ${resultNoun} · ${options?.ms} ms`
      }
      if (key === "networkProbe.nodes.rateLimitRemaining") {
        return `${options?.count} rate limit points remaining`
      }
      if (key === "networkProbe.nodes.rateLimitLimit") {
        return `window limit ${options?.count} points`
      }
      if (key === "networkProbe.nodes.rateLimitConsumed") {
        return `${options?.count} rate limit points consumed`
      }
      if (key === "networkProbe.nodes.creditsRemaining") {
        return `${options?.count} credits remaining`
      }
      if (key === "networkProbe.nodes.creditsConsumed") {
        return `${options?.count} credits consumed`
      }
      if (key === "networkProbe.nodes.requestCost") {
        return `request cost: ${options?.count}`
      }
      if (key === "networkProbe.nodes.rateLimitWait") {
        return `resets in about ${options?.count} seconds`
      }
      return key
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

const localNode: ProbeNode = {
  id: "local",
  kind: "local",
  label: "This Mac",
  reachable: true,
}

function createProps(nodes: ProbeNode[] = [localNode]) {
  return {
    loading: false,
    loadingNodes: false,
    canCancel: false,
    cancelling: false,
    result: null as MultiNodeDnsResult | null,
    globalpingResult: null as GlobalpingMeasurementResult | null,
    nodes,
    globalpingTokenConfigured: null as boolean | null,
    loadingGlobalpingToken: false,
    toolEnabled: true,
    onCompare: vi.fn(),
    onMeasureGlobalping: vi.fn(),
    onCancel: vi.fn(),
    onRefreshNodes: vi.fn(),
    onRefreshGlobalpingTokenStatus: vi.fn(async () => true),
    onSaveGlobalpingToken: vi.fn(async () => true),
    onClearGlobalpingToken: vi.fn(async () => true),
    onAddAgent: vi.fn(),
    onRemoveAgent: vi.fn(),
  }
}

afterEach(() => cleanup())

describe("MultiNodePanel agent endpoints", () => {
  it("lets the user stop waiting for a Globalping comparison", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} loading canCancel />)

    expect(screen.getByText("networkProbe.nodes.stopWaitingHint")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }))

    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(screen.getByPlaceholderText("networkProbe.nodes.targetPlaceholder.dns")).toBeDisabled()
  })

  it("uses singular metadata when there is exactly one node result", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["192.0.2.1"],
        },
      ],
      elapsedMs: 12,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("example.com · 1 node result · 12 ms")).toBeInTheDocument()
  })

  it("keeps results visible while node and credential settings are collapsed", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["192.0.2.1"],
        },
      ],
      elapsedMs: 12,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    const settings = screen.getByText("networkProbe.nodes.settingsTitle")
    expect(settings).toBeVisible()
    expect(settings.tagName).toBe("SUMMARY")
    expect(settings.parentElement).toHaveProperty("open", false)
    expect(screen.getByText("192.0.2.1")).toBeVisible()
    expect(screen.getByPlaceholderText("networkProbe.nodes.token.placeholder")).not.toBeVisible()
  })

  it("labels streamed rows as partial while the comparison is still running", () => {
    const props = createProps()
    props.loading = true
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["192.0.2.1"],
        },
      ],
      elapsedMs: 12,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.partialResults")).toHaveAttribute("role", "status")
    expect(screen.getByText("example.com · 1 node result · 12 ms")).toBeInTheDocument()
  })

  it("counts node result rows instead of DNS records in the summary", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "local",
          nodeLabel: "This Mac",
          ok: true,
          answers: ["192.0.2.1", "2001:db8::1"],
        },
        {
          nodeId: "globalping",
          nodeLabel: "Globalping",
          ok: false,
          answers: [],
          failureKind: "request",
        },
      ],
      elapsedMs: 25,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("example.com · 2 node results · 25 ms")).toBeInTheDocument()
    expect(screen.getByText(/192\.0\.2\.1/)).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.failures.request")).toBeInTheDocument()
    expect(screen.queryByText(/3 answers/)).not.toBeInTheDocument()
  })

  it("shows rate-limit details returned by Globalping", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "globalping",
          nodeLabel: "Globalping",
          ok: false,
          answers: [],
          failureKind: "quota",
          rateLimit: {
            limit: 250,
            consumed: 3,
            remaining: 0,
            waitSeconds: 3600,
            creditsConsumed: 2,
            creditsRemaining: 18,
            requestCost: 1,
          },
        },
      ],
      elapsedMs: 25,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    const rateLimitStatus = screen
      .getAllByRole("status")
      .find((status) => status.textContent?.includes("networkProbe.nodes.rateLimitTitle"))
    expect(rateLimitStatus).toBeDefined()
    expect(rateLimitStatus?.textContent).toContain(
      "0 rate limit points remaining · window limit 250 points · 3 rate limit points consumed · 18 credits remaining · 2 credits consumed · request cost: 1 · resets in about 3600 seconds",
    )
  })

  it("keeps token checks user-triggered and clears the one-time input after saving", async () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    expect(props.onRefreshGlobalpingTokenStatus).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("networkProbe.nodes.token.title"))
    const input = screen.getByLabelText("networkProbe.nodes.token.placeholder")
    const token = "gp_secret-token-for-test"
    fireEvent.change(input, { target: { value: token } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.token.save" }))

    await waitFor(() => expect(props.onSaveGlobalpingToken).toHaveBeenCalledWith(token))
    expect(input).toHaveValue("")
    expect(screen.queryByText(token)).not.toBeInTheDocument()
    expect(props.onRefreshGlobalpingTokenStatus).not.toHaveBeenCalled()
  })

  it("accepts WSS and submits the self-hosted endpoint", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://agent.example.test/probe" },
    })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    const addButton = screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })
    expect(addButton).toBeEnabled()
    fireEvent.click(addButton)
    expect(props.onAddAgent).toHaveBeenCalledWith("Lab", "wss://agent.example.test/probe")
  })

  it("rejects plaintext endpoints before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "http://agent.example.test" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointError.scheme")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects URL credentials and query parameters before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: "wss://user:secret@agent.example.test?token=secret" },
    })

    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.nodes.endpointError.credentials",
    )
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects agent endpoints over the backend UTF-8 byte limit before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "Lab" },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.nodes.endpointPlaceholder"), {
      target: { value: `wss://agent.example.test/${"路".repeat(700)}` },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.endpointError.tooLong")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("rejects agent labels over 80 Unicode characters before submitting", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.change(screen.getByLabelText("networkProbe.nodes.labelPlaceholder"), {
      target: { value: "界".repeat(81) },
    })

    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.nodes.labelError.tooLong")
    expect(screen.getByRole("button", { name: "networkProbe.nodes.addAgent" })).toBeDisabled()
    expect(props.onAddAgent).not.toHaveBeenCalled()
  })

  it("shows the most recent health status for registered agents", () => {
    const props = createProps([
      localNode,
      {
        id: "agent-1",
        kind: "remote-agent",
        label: "Lab",
        endpoint: "wss://agent.example.test",
        reachable: true,
      },
      {
        id: "agent-2",
        kind: "remote-agent",
        label: "Offline",
        endpoint: "https://offline.example.test",
        reachable: false,
      },
    ])
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.agentReachable")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.agentUnreachable")).toBeInTheDocument()
  })

  it("localizes node kinds and keeps long endpoints within the node list", () => {
    const endpoint = `wss://agent.example.test/${"long-segment/".repeat(30)}`
    const props = createProps([
      localNode,
      {
        id: "globalping-us",
        kind: "remote-proxy",
        label: "US",
        endpoint: "globalping:US",
        reachable: true,
      },
      {
        id: "agent-1",
        kind: "remote-agent",
        label: "Lab",
        endpoint,
        reachable: true,
      },
      {
        id: "unknown-1",
        kind: "future-node-kind",
        label: "Unknown",
        reachable: false,
      },
    ])
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.labels.local")).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.remoteProxy/)).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.remoteAgent/)).toBeInTheDocument()
    expect(screen.getByText(/networkProbe\.nodes\.kind\.unknown/)).toBeInTheDocument()
    expect(screen.queryByText("remote-agent")).not.toBeInTheDocument()
    expect(screen.queryByText("globalping:US")).not.toBeInTheDocument()
    expect(screen.getByText(endpoint)).toHaveAttribute("title", endpoint)
    expect(screen.getByText(endpoint)).toHaveClass("truncate")
  })

  it("localizes successful and failed multi-node result states", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        { nodeId: "local", nodeLabel: "This Mac", ok: true, answers: ["192.0.2.1"] },
        {
          nodeId: "remote-1",
          nodeLabel: "London",
          ok: false,
          answers: [],
          failureKind: "noAnswers",
        },
      ],
      elapsedMs: 42,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.answerStatus.success")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.answerStatus.failed")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.failures.noAnswers")).toBeInTheDocument()
    expect(screen.getAllByText("networkProbe.nodes.labels.local")).toHaveLength(2)
    expect(screen.queryByText("This Mac")).not.toBeInTheDocument()
    expect(screen.queryByText("OK")).not.toBeInTheDocument()
    expect(screen.queryByText("FAIL")).not.toBeInTheDocument()
  })

  it.each([
    ["request", "networkProbe.nodes.failures.localRequest", "networkProbe.nodes.failures.request"],
    ["timeout", "networkProbe.nodes.failures.localTimeout", "networkProbe.nodes.failures.timeout"],
  ] as const)(
    "uses local DNS copy for local %s failures",
    (failureKind, localKey, globalpingKey) => {
      const props = createProps()
      props.result = {
        domain: "bench-qa-no-such-host.invalid",
        answers: [
          {
            nodeId: "local",
            nodeLabel: "This Mac",
            ok: false,
            answers: [],
            failureKind,
          },
        ],
        elapsedMs: 5,
        sessionId: "session-1",
        cancelled: false,
        commandHint: "",
      }
      render(<MultiNodePanel {...props} />)

      expect(screen.getByText(localKey)).toBeInTheDocument()
      expect(screen.queryByText(globalpingKey)).not.toBeInTheDocument()
    },
  )

  it("keeps Globalping request failures attributed to Globalping", () => {
    const props = createProps()
    props.result = {
      domain: "example.com",
      answers: [
        {
          nodeId: "globalping",
          nodeLabel: "Globalping",
          ok: false,
          answers: [],
          failureKind: "request",
        },
      ],
      elapsedMs: 8,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "",
    }
    render(<MultiNodePanel {...props} />)

    expect(screen.getByText("networkProbe.nodes.failures.request")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.nodes.failures.localRequest")).not.toBeInTheDocument()
  })

  it("runs remote Ping through the Multi-node panel", () => {
    const props = createProps()
    render(<MultiNodePanel {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.mode.ping" }))
    expect(screen.getByPlaceholderText("networkProbe.nodes.targetPlaceholder.ping")).toHaveValue(
      "iana.org",
    )
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.runMode.ping" }))

    expect(props.onMeasureGlobalping).toHaveBeenCalledWith("ping", "iana.org", undefined)
    expect(props.onCompare).not.toHaveBeenCalled()
  })

  it("runs HTTP measurements with the selected safe method and renders result metrics", () => {
    const props = createProps()
    props.globalpingResult = {
      target: "https://example.com/status",
      measurementType: "http",
      probes: [
        {
          nodeId: "gp-0",
          nodeLabel: "Globalping · Frankfurt/DE",
          status: "finished",
          resolvedAddress: "203.0.113.9",
          httpStatusCode: 200,
          httpStatusName: "OK",
          httpTimings: {
            totalMs: 120,
            tcpMs: 32,
            firstByteMs: 40,
            downloadMs: 8,
          },
        },
      ],
      elapsedMs: 121,
      sessionId: "session-1",
      cancelled: false,
      commandHint: "globalping http",
    }
    render(<MultiNodePanel {...props} />)
    expect(screen.queryByText("HTTP 200 OK")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.mode.http" }))
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "HEAD" } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.nodes.runMode.http" }))

    expect(props.onMeasureGlobalping).toHaveBeenCalledWith(
      "http",
      "https://www.iana.org/domains",
      "HEAD",
    )
    expect(screen.getByText("HTTP 200 OK")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.nodes.remoteStatus.finished")).toBeInTheDocument()
  })
})
