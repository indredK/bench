/**
 * Feature / 功能层: stay within this feature; 只处理当前功能.
 */
export const DEFAULT_MAX_PORTS = 100;
export const MIN_PORT = 1;
export const MAX_PORT = 65535;

export type ParsePortsErrorKey =
  | "invalidRangeFormat"
  | "invalidPortNumber"
  | "invalidPortFormat"
  | "rangeStartGtEnd"
  | "portOutOfRange"
  | "tooManyPorts";

export interface ParsePortsResult {
  ports: number[];
  hasError: boolean;
  errorKey?: ParsePortsErrorKey;
}

export function hasInvalidPortInputCharacters(input: string) {
  return /[^0-9,\-]/.test(input);
}

export function parsePortsFromInput(
  input: string,
  maxPorts = DEFAULT_MAX_PORTS
): ParsePortsResult {
  const ports = new Set<number>();
  let hasError = false;
  let errorKey: ParsePortsErrorKey | undefined;
  const parts = input.split(",").map((part) => part.trim()).filter(Boolean);

  const setError = (nextErrorKey: ParsePortsErrorKey) => {
    hasError = true;
    errorKey = errorKey ?? nextErrorKey;
  };

  for (const part of parts) {
    if (part.includes("-")) {
      const rangeParts = part.split("-");

      if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
        setError("invalidRangeFormat");
        continue;
      }

      const [startStr, endStr] = rangeParts;

      if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
        setError("invalidPortNumber");
        continue;
      }

      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);

      if (start > end) {
        setError("rangeStartGtEnd");
        continue;
      }

      if (start < MIN_PORT || end > MAX_PORT) {
        setError("portOutOfRange");
        continue;
      }

      const rangeSize = end - start + 1;
      if (ports.size + rangeSize > maxPorts) {
        setError("tooManyPorts");
        continue;
      }

      for (let port = start; port <= end; port += 1) {
        ports.add(port);
      }

      continue;
    }

    if (!/^\d+$/.test(part)) {
      setError("invalidPortFormat");
      continue;
    }

    const port = Number.parseInt(part, 10);

    if (port < MIN_PORT || port > MAX_PORT) {
      setError("portOutOfRange");
      continue;
    }

    if (ports.size >= maxPorts) {
      setError("tooManyPorts");
      continue;
    }

    ports.add(port);
  }

  return {
    ports: [...ports].sort((left, right) => left - right),
    hasError,
    errorKey,
  };
}

