const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f || (m.f = ["./dist-js-MqSEhu_N.js", "./index-C7vEid7w.js", "./index-BydKdkA-.css"]),
) => i.map((i) => d[i])
import { n as e, t } from "./index-C7vEid7w.js"
async function n(n) {
  if (!e()) return null
  let { open: r } = await t(
    async () => {
      let { open: e } = await import(`./dist-js-MqSEhu_N.js`)
      return { open: e }
    },
    __vite__mapDeps([0, 1, 2]),
    import.meta.url,
  )
  return r(n)
}
async function r(n) {
  if (!e()) return null
  let { save: r } = await t(
    async () => {
      let { save: e } = await import(`./dist-js-MqSEhu_N.js`)
      return { save: e }
    },
    __vite__mapDeps([0, 1, 2]),
    import.meta.url,
  )
  return r(n)
}
export { n as openPlatformDialog, r as savePlatformDialog }
