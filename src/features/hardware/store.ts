/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"

interface HardwareCompareState {
  selectedIdsByScope: Record<string, string[]>
  filtersByScope: Record<string, Record<string, string>>

  toggleModel: (scope: string, id: string) => void
  setFilter: (scope: string, key: string, value: string) => void
  clearFilters: (scope: string) => void
  clearSelectedModels: (scope: string) => void
}

export const useHardwareCompareStore = create<HardwareCompareState>((set) => ({
  selectedIdsByScope: {},
  filtersByScope: {},

  toggleModel: (scope, id) =>
    set((state) => ({
      selectedIdsByScope: {
        ...state.selectedIdsByScope,
        [scope]: (state.selectedIdsByScope[scope] ?? []).includes(id)
          ? (state.selectedIdsByScope[scope] ?? []).filter((x) => x !== id)
          : [...(state.selectedIdsByScope[scope] ?? []), id],
      },
    })),

  setFilter: (scope, key, value) =>
    set((state) => {
      const current = state.filtersByScope[scope] ?? {}
      if (current[key] === value) {
        const next = { ...current }
        delete next[key]
        return {
          filtersByScope: {
            ...state.filtersByScope,
            [scope]: next,
          },
        }
      }
      return {
        filtersByScope: {
          ...state.filtersByScope,
          [scope]: { ...current, [key]: value },
        },
      }
    }),

  clearFilters: (scope) =>
    set((state) => ({
      filtersByScope: {
        ...state.filtersByScope,
        [scope]: {},
      },
    })),

  clearSelectedModels: (scope) =>
    set((state) => ({
      selectedIdsByScope: {
        ...state.selectedIdsByScope,
        [scope]: [],
      },
    })),
}))
