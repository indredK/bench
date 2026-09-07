import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    args[token.slice(2)] = argv[i + 1]
    i += 1
  }
  return args
}

/**
 * 写入单目标 updater manifest (A3-5: 抽为可测函数, CLI 入口仅在直接执行时运行)。
 * 缺少必填参数时抛出 Usage 错误, 因此所有属性在类型上均为可选。
 *
 * @param {object} params
 * @param {string} [params.outputDir]
 * @param {string} [params.platform]
 * @param {string} [params.file]
 * @param {string} [params.signature]
 * @param {string} [params.target]
 * @returns {{ platform: string, file: string, signature: string }}
 */
export function writeUpdaterManifest({ outputDir, platform, file, signature, target }) {
  if (!outputDir || !platform || !file || !signature) {
    throw new Error("Usage: writeUpdaterManifest({ outputDir, platform, file, signature, target })")
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const manifest = {
    platform,
    file: path.basename(file),
    signature: path.basename(signature),
  }

  const outputPath = path.join(outputDir, `updater-manifest-${target || platform}.json`)
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  writeUpdaterManifest({
    outputDir: args["output-dir"],
    platform: args.platform,
    file: args.file,
    signature: args.signature,
    target: args.target || args.platform,
  })
  console.log("generated manifest")
}
