export interface LocalizedError {
  key: string;
  values?: Record<string, unknown>;
  fallback?: string;
}

export function localizeError(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: LocalizedError | null | undefined
): string {
  if (!error) return "";
  return t(error.key, {
    ...(error.values ?? {}),
    defaultValue: error.fallback ?? error.key,
  });
}
