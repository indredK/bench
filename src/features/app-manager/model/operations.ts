/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { BatchOperationResult, OperationResult } from "@/lib/tauri/types/app-manager";

export type OperationStatus = "idle" | "pending" | "running" | "success" | "error";

export interface AppOperationState {
  status: OperationStatus;
  message: string;
}

export interface BatchProgress {
  running: boolean;
  current: number;
  total: number;
}

export function isOperationRunning(
  operations: Record<string, AppOperationState>,
  appId: string
): boolean {
  return operations[appId]?.status === "running";
}

export function toOperationState(result: OperationResult): AppOperationState {
  return {
    status: result.success ? "success" : "error",
    message: result.message,
  };
}

export function createRunningOperationState(message: string): AppOperationState {
  return { status: "running", message };
}

export function createErrorOperationState(error: unknown): AppOperationState {
  return { status: "error", message: String(error) };
}

export function createBatchProgress(total: number): BatchProgress {
  return { running: true, current: 0, total };
}

export function createBatchSuccessPatch(result: BatchOperationResult) {
  return {
    batchProgress: null,
    batchResults: result,
    selectedAppIds: new Set<string>(),
    batchMode: false,
  };
}

export function createBatchErrorPatch(error: unknown) {
  return {
    batchProgress: null,
    batchResults: null,
    selectedAppIds: new Set<string>(),
    batchMode: false,
    error: String(error),
  };
}
