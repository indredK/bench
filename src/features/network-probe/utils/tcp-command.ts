/** Keep the TCP command preview, attempt log, and backend result hint in sync. */
export function formatTcpConnectCommand(host: string, port: number, timeoutMs = 3_000): string {
  const hostLiteral = JSON.stringify(host.trim() || "…") ?? '"…"'
  const portValid = Number.isInteger(port) && port >= 1 && port <= 65_535
  const portLiteral = portValid ? String(port) : "…"
  return `tcpConnect(local, ${hostLiteral}, ${portLiteral}, ${timeoutMs})`
}
