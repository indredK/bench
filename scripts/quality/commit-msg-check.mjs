import { readFileSync } from "node:fs";

const messagePath = process.argv[2];

if (!messagePath) {
  console.error("Usage: node scripts/quality/commit-msg-check.mjs <commit-message-file>");
  process.exit(1);
}

const rawMessage = readFileSync(messagePath, "utf8").replace(/\r\n/g, "\n").trim();

if (!rawMessage) {
  console.error("Commit message cannot be empty.");
  process.exit(1);
}

const lines = rawMessage.split("\n");
const header = lines[0];

if (/^(Merge |Revert |fixup! |squash! )/.test(header)) {
  process.exit(0);
}

const match = /^(?<type>[a-z]+)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?: (?<subject>.+)$/.exec(header);
if (!match?.groups) {
  console.error(
    [
      "Commit message must follow conventional commits, for example:",
      "  feat: add commit hooks",
      "  fix(ui): handle staged file checks",
      "  chore!: adjust pre-commit gate",
    ].join("\n")
  );
  process.exit(1);
}

const allowedTypes = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
]);

if (!allowedTypes.has(match.groups.type)) {
  console.error(`Unsupported commit type: ${match.groups.type}`);
  console.error(`Allowed types: ${Array.from(allowedTypes).join(", ")}`);
  process.exit(1);
}

if (lines.length > 1 && lines[1] !== "") {
  console.error("Commit message body must be separated from the header by a blank line.");
  process.exit(1);
}

const bodyLines = lines.slice(2);
const tooLongLine = bodyLines.find((line) => line.length > 500);

if (tooLongLine) {
  console.error("Commit body lines must be 500 characters or fewer.");
  process.exit(1);
}
