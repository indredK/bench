import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type { ModelPricing, PricingStandard } from "@/lib/tauri/types/token-calculator"

export type { ModelPricing, PricingStandard } from "@/lib/tauri/types/token-calculator"

export function listPricingStandards(): Promise<PricingStandard[]> {
  return invokeTauriCommand("list_pricing_standards")
}

export function createPricingStandard(
  name: string,
  models: ModelPricing[],
): Promise<PricingStandard> {
  return invokeTauriCommand("create_pricing_standard", { name, models })
}

export function updatePricingStandard(
  id: string,
  name?: string | null,
  models?: ModelPricing[] | null,
): Promise<PricingStandard> {
  return invokeTauriCommand("update_pricing_standard", {
    id,
    name: name ?? null,
    models: models ?? null,
  })
}

export function deletePricingStandard(id: string): Promise<void> {
  return invokeTauriCommand("delete_pricing_standard", { id })
}
