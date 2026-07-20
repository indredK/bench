/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import type { LocalizedError } from "@/lib/errors"
import type { CommandCard, RunResult } from "@/lib/tauri/types/command-center"

export type RunStatus = "idle" | "running" | "success" | "failed"

export interface RunOutcome {
  status: RunStatus
  result: RunResult | null
}

interface CommandCenterState {
  cards: CommandCard[]
  loading: boolean
  error: LocalizedError | null
  runStatus: Record<string, RunStatus>
  runOutcome: Record<string, RunOutcome>
  /** Currently expanded (zoomed-in) card id, or null when grid is collapsed. */
  expandedId: string | null

  setCards: (cards: CommandCard[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: LocalizedError | null) => void
  setRunStatus: (id: string, status: RunStatus) => void
  setRunOutcome: (id: string, outcome: RunOutcome) => void
  setExpandedId: (id: string | null) => void
  clearRunOutcome: (id: string) => void
}

export const useCommandCenterStore = create<CommandCenterState>((set) => ({
  cards: [],
  loading: false,
  error: null,
  runStatus: {},
  runOutcome: {},
  expandedId: null,

  setCards: (cards) => set({ cards }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setRunStatus: (id, status) =>
    set((state) => ({ runStatus: { ...state.runStatus, [id]: status } })),
  setRunOutcome: (id, outcome) =>
    set((state) => ({ runOutcome: { ...state.runOutcome, [id]: outcome } })),
  setExpandedId: (id) => set({ expandedId: id }),
  clearRunOutcome: (id) =>
    set((state) => {
      const nextOutcome = { ...state.runOutcome }
      delete nextOutcome[id]
      const nextStatus = { ...state.runStatus }
      delete nextStatus[id]
      return { runOutcome: nextOutcome, runStatus: nextStatus }
    }),
}))
