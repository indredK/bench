export interface ModelPricing {
  modelName: string
  inputPrice: number
  /** Cache write price (first time populating cache). null if not supported. */
  cachedWritePrice: number | null
  /** Cache read / hit price (reading cached tokens). null if not supported. */
  cachedReadPrice: number | null
  outputPrice: number
  currency: string
}

export interface PricingStandard {
  id: string
  name: string
  isBuiltIn: boolean
  models: ModelPricing[]
  createdAt: string
  updatedAt: string
}

export type TokenCalculatorErrorCode =
  "NOT_FOUND" | "INVALID_INPUT" | "DUPLICATE_NAME" | "BUILT_IN_IMMUTABLE" | "STORE_FAIL"

export interface TokenCalculatorError {
  code: TokenCalculatorErrorCode
  message: string
}
