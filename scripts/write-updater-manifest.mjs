import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outputDir = args["output-dir"];
const platform = args.platform;
const file = args.file;
const signature = args.signature;
const target = args.target || platform;

if (!outputDir || !platform || !file || !signature) {
  throw new Error(
    "Usage: node scripts/write-updater-manifest.mjs --output-dir <dir> --platform <platform> --file <path> --signature <path> [--target <target>]"
  );
}

fs.mkdirSync(outputDir, { recursive: true });

const manifest = {
  platform,
  file: path.basename(file),
  signature: path.basename(signature),
};

const outputPath = path.join(outputDir, `updater-manifest-${target}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`generated ${outputPath}`);
