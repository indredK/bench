/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { createAppManagerBasicActions } from "@/features/app-manager/model/store-basic-actions";
import { createInitialAppManagerState } from "@/features/app-manager/model/store-state";
import type { AppManagerState } from "@/features/app-manager/model/store-types";

function createAppManagerTestStore() {
  return createStore<AppManagerState>()((set) => ({
    ...createInitialAppManagerState(),
    ...createAppManagerBasicActions(set),
  }));
}

describe("createAppManagerBasicActions", () => {
  it("keeps installed and marketplace filters isolated across tab switches", () => {
    const store = createAppManagerTestStore();

    store.getState().setSearchQuery("installed query");
    store.getState().setCategoryFilter("development");
    store.getState().setSeriesFilter("openai");

    store.getState().setActiveTab("marketplace");
    expect(store.getState().searchQuery).toBe("");
    expect(store.getState().categoryFilter).toBeNull();
    expect(store.getState().seriesFilter).toBeNull();

    store.getState().setSearchQuery("market query");
    store.getState().setCategoryFilter("utility");
    store.getState().setSeriesFilter("apple");

    store.getState().setActiveTab("installed");
    expect(store.getState().searchQuery).toBe("installed query");
    expect(store.getState().categoryFilter).toBe("development");
    expect(store.getState().seriesFilter).toBe("openai");

    store.getState().setActiveTab("marketplace");
    expect(store.getState().searchQuery).toBe("market query");
    expect(store.getState().categoryFilter).toBe("utility");
    expect(store.getState().seriesFilter).toBe("apple");
  });

  it("restores the updates search query without leaking category or series filters", () => {
    const store = createAppManagerTestStore();

    store.getState().setSearchQuery("installed query");
    store.getState().setCategoryFilter("browser");
    store.getState().setSeriesFilter("google");

    store.getState().setActiveTab("softwareUpdate");
    store.getState().setSearchQuery("update query");

    expect(store.getState().searchQuery).toBe("update query");
    expect(store.getState().categoryFilter).toBeNull();
    expect(store.getState().seriesFilter).toBeNull();

    store.getState().setActiveTab("installed");
    expect(store.getState().searchQuery).toBe("installed query");
    expect(store.getState().categoryFilter).toBe("browser");
    expect(store.getState().seriesFilter).toBe("google");

    store.getState().setActiveTab("softwareUpdate");
    expect(store.getState().searchQuery).toBe("update query");
    expect(store.getState().categoryFilter).toBeNull();
    expect(store.getState().seriesFilter).toBeNull();
  });
});
