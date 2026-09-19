// bench-companion 站点作用域（siteScope）契约。
//
// 「向用户申请哪些 host 权限」与「向 chrome.cookies 查哪些域」必须出自同一个函数：
// 两边各算一套时，未授权的那批 cookie 会被 chrome.cookies 静默过滤掉（不报错、
// 返回少几条），表现就是「只有部分站点好使」。原先的实现靠写死 `api.trae.cn`
// 兜住了 trae 一家，其它站点落在兄弟子域上的 host-only 会话 cookie 一律漏采。
//
// 这些用例钉住泛域的边界：同一可注册域内必须全覆盖（api/accounts/auth 等），
// 公共后缀（co.uk / com.cn）形态一律不得泛出去变成 `*.co.uk` 这种越界授权。
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const BACKGROUND = join(
  rootDir,
  "src-tauri/resources/browser-extension/bench-companion/background.js",
)

/**
 * background.js 是 MV3 服务 worker 的普通脚本（非模块），直接求值以拿到顶层
 * 函数声明。顶层只有 `chrome.*.addListener` 与 `connectNative()` 有副作用，
 * 用一个「任何属性都可继续取、任何调用都返回已 settle 的 Promise」的替身挡掉，
 * 顺带保证整个脚本在没有浏览器环境时依然可求值（语法/引用错误会在这里暴露）。
 */
function loadBackground() {
  const stub = new Proxy(
    function stubFn() {
      return Promise.resolve(stub)
    },
    {
      get: (_target, prop) => (prop === "then" ? undefined : stub),
      set: () => true,
    },
  )
  const sandbox = { chrome: stub, URL, console }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(BACKGROUND, "utf8"), sandbox, { filename: "background.js" })
  return sandbox
}

const background = loadBackground()

describe("bench-companion siteScope", () => {
  it("loads the service worker script and exposes the scope helper", () => {
    expect(typeof background.siteScope).toBe("function")
    expect(typeof background.collectCookies).toBe("function")
  })

  it("widens to every subdomain of the site so sibling host-only cookies are read", () => {
    const scope = background.siteScope("https://www.trae.cn/cloudide")
    expect(scope.domains).toEqual(expect.arrayContaining(["www.trae.cn", "trae.cn"]))
    // 会话 cookie 常写在 api.trae.cn 上且是 host-only：不泛域就永远查不到它。
    expect(scope.patterns).toContain("https://*.trae.cn/*")
  })

  it("widens from the apex form too (the case the api.trae.cn hardcode covered)", () => {
    const scope = background.siteScope("https://trae.cn/")
    expect(scope.patterns).toContain("https://*.trae.cn/*")
  })

  it("never asks for a grant broader than one registrable domain", () => {
    const scope = background.siteScope("https://app.github.com/login")
    expect(scope.patterns.every((pattern) => pattern.endsWith("github.com/*"))).toBe(true)
    expect(scope.patterns.some((pattern) => pattern.includes("*.github.com"))).toBe(true)
  })

  it.each([
    // host 恰好等于两段公共后缀时，可注册域近似算法会把它当成站点，必须挡住。
    ["https://co.uk/", "https://*.co.uk/*"],
    ["https://com.cn/", "https://*.com.cn/*"],
    // 三段形态下 co.uk / com.cn 的后缀无法与 www.x.com 区分，退化为精确授权。
    ["https://example.co.uk/", "https://*.co.uk/*"],
    ["https://example.com.cn/", "https://*.com.cn/*"],
  ])("does not widen beyond the site for %s", (url, forbidden) => {
    const scope = background.siteScope(url)
    expect(scope.patterns).not.toContain(forbidden)
  })

  it("widens correctly once the site is written as a subdomain of a multi-part suffix", () => {
    // www.x.co.uk：可注册域能确定为 x.co.uk，此时泛域是安全且必要的。
    const scope = background.siteScope("https://www.example.co.uk/")
    expect(scope.domains).toEqual(expect.arrayContaining(["www.example.co.uk", "example.co.uk"]))
    expect(scope.patterns).toContain("https://*.example.co.uk/*")
    expect(scope.patterns).not.toContain("https://*.co.uk/*")
  })

  it("keeps non-http(s) and hostless urls out of the scope", () => {
    expect(background.siteScope("file:///etc/passwd")).toEqual({ domains: [], patterns: [] })
    expect(background.siteScope("chrome-extension://abc/")).toEqual({ domains: [], patterns: [] })
    expect(background.siteScope("not a url")).toEqual({ domains: [], patterns: [] })
    expect(background.siteScope("http://localhost:7242/").patterns).toEqual([
      "http://localhost/*",
    ])
  })
})
