/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand";

interface HardwareCompareState {
  selectedIds: string[];
  filters: Record<string, string>;

  toggleModel: (id: string) => void;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  clearSelectedModels: () => void;
}

export const useHardwareCompareStore = create<HardwareCompareState>((set) => ({
  selectedIds: [],
  filters: {},

  toggleModel: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id],
    })),

  setFilter: (key, value) =>
    set((state) => {
      if (state.filters[key] === value) {
        const next = { ...state.filters };
        delete next[key];
        return { filters: next };
      }
      return { filters: { ...state.filters, [key]: value } };
    }),

  clearFilters: () => set({ filters: {} }),

  clearSelectedModels: () => set({ selectedIds: [] }),
}));
