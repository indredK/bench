// photo-triage 插件骨架入口（ESM）。
//
// P2 范围：验证「独立 bundle + 宿主能力面调用 + ACL 网关」三件事全通。
// 完整 UI 迁移（21 个组件文件 + i18n）为 P2b，见本目录 README。

const internals = window.__TAURI_INTERNALS__
const invoke = internals && typeof internals.invoke === "function" ? internals.invoke : null

function addRow(table, command, ok, detail) {
  const tr = document.createElement("tr")

  const name = document.createElement("td")
  name.textContent = command

  const status = document.createElement("td")
  status.className = "status " + (ok ? "pass" : "fail")
  status.textContent = ok ? "PASS" : "FAIL"

  const info = document.createElement("td")
  info.textContent = detail

  tr.append(name, status, info)
  table.append(tr)
}

function showPayload(target, value) {
  const pre = document.createElement("pre")
  pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  const host = document.getElementById(target)
  host.append(pre)
}

async function probe(command, args, expectDenied) {
  try {
    const result = await invoke(command, args)
    return {
      ok: !expectDenied,
      detail: expectDenied ? "unexpectedly allowed" : JSON.stringify(result).slice(0, 220),
    }
  } catch (error) {
    const message = String((error && (error.message || error)) || error)
    if (expectDenied) {
      return {
        ok: message.includes("not allowed"),
        detail: "denied by gateway: " + message.slice(0, 160),
      }
    }
    return { ok: false, detail: message.slice(0, 220) }
  }
}

async function main() {
  const table = document.querySelector("#probe tbody")
  if (!invoke) {
    addRow(table, "__TAURI_INTERNALS__", false, "IPC bridge missing — cannot talk to host")
    return
  }

  // 1. 真实能力面：photo_triage 15 条命令已在 ACL 注册表（D-024）
  const capabilities = await probe("photo_triage_capabilities", {})
  addRow(table, "photo_triage_capabilities", capabilities.ok, capabilities.detail)

  const scanStatus = await probe("photo_triage_scan_status", {})
  addRow(table, "photo_triage_scan_status", scanStatus.ok, scanStatus.detail)

  // 2. 网关自检：调用注册表外的命令必须被拒绝（deny-by-default）
  const denied = await probe("shutdown_now", {}, true)
  addRow(table, "shutdown_now (expect DENIED)", denied.ok, denied.detail)
}

main().then(() => {
  // 把能力面返回值完整展示出来，便于人工核对
  invoke("photo_triage_capabilities", {})
    .then((value) => showPayload("status", value))
    .catch(() => {})
})
