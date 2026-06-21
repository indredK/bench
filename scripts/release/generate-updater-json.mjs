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
const assetsDir = args["assets-dir"];
const tag = args.tag;
const repo = args.repo;
const releaseMetadataFile = args["release-metadata"];

if (!assetsDir || !tag || !repo || !releaseMetadataFile) {
  throw new Error(
    "Usage: node scripts/release/generate-updater-json.mjs --assets-dir <dir> --tag <tag> --repo <owner/repo> --release-metadata <file>"
  );
}

const releaseMetadata = JSON.parse(fs.readFileSync(releaseMetadataFile, "utf8"));
const manifestFiles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.startsWith("updater-manifest-") && name.endsWith(".json"));

if (manifestFiles.length === 0) {
  throw new Error(`No updater manifest files were found in ${assetsDir}`);
}

const platforms = {};
const usedFiles = new Map();

for (const manifestFile of manifestFiles) {
  const manifestPath = path.join(assetsDir, manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const assetPath = path.join(assetsDir, manifest.file);
  const signaturePath = path.join(assetsDir, manifest.signature);

  if (!fs.existsSync(assetPath)) {
    throw new Error(`Updater asset not found: ${assetPath}`);
  }
  if (!fs.existsSync(signaturePath)) {
    throw new Error(`Updater signature not found: ${signaturePath}`);
  }
  if (platforms[manifest.platform]) {
    throw new Error(`Duplicate updater platform in ${manifestFile}: ${manifest.platform}`);
  }
  if (usedFiles.has(manifest.file)) {
    throw new Error(
      `Updater asset ${manifest.file} is referenced by both ${usedFiles.get(manifest.file)} and ${manifest.platform}`
    );
  }
  usedFiles.set(manifest.file, manifest.platform);

  platforms[manifest.platform] = {
    signature: fs.readFileSync(signaturePath, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(manifest.file)}`,
  };
}

const latest = {
  version: tag.replace(/^v/, ""),
  notes: releaseMetadata.body || "",
  pub_date: releaseMetadata.publishedAt || new Date().toISOString(),
  platforms,
};

const outputPath = path.join(assetsDir, "latest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`generated ${outputPath}`);
