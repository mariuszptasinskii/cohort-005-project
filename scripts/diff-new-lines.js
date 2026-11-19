// Prints the lines a change wrote, leaving out the lines it moved: an added
// line whose text (ignoring indentation) the same diff also removes counts as
// moved. Lines that are only brackets and punctuation are left out too.
// Usage: node scripts/diff-new-lines.js <fixed-point>

import { execFileSync } from "node:child_process";

const fixedPoint = process.argv[2];
if (!fixedPoint) {
  console.error("Usage: node scripts/diff-new-lines.js <fixed-point>");
  process.exit(1);
}

const diff = execFileSync(
  "git",
  ["diff", "--no-color", "--unified=0", `${fixedPoint}...HEAD`],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
).split("\n");

const trivial = (text) => !/[\p{L}\p{N}]/u.test(text);

// How many times each removed line's text was removed, so a line removed
// once and added twice counts as moved once and new once.
const removed = new Map();
for (const line of diff) {
  if (!line.startsWith("-") || line.startsWith("---")) continue;
  const text = line.slice(1).trim();
  removed.set(text, (removed.get(text) ?? 0) + 1);
}

let file;
let next = 0;
let moved = 0;
let printedFile;
for (const line of diff) {
  if (line.startsWith("+++ ")) {
    file = line.replace(/^\+\+\+ (b\/)?/, "");
    continue;
  }
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) {
    next = Number(hunk[1]);
    continue;
  }
  if (!line.startsWith("+")) continue;
  const lineNumber = next++;
  const text = line.slice(1).trim();
  if (trivial(text)) continue;
  const count = removed.get(text) ?? 0;
  if (count > 0) {
    removed.set(text, count - 1);
    moved++;
    continue;
  }
  if (printedFile !== file) {
    console.log(`\n${file}`);
    printedFile = file;
  }
  console.log(`${String(lineNumber).padStart(5)}: ${line.slice(1)}`);
}

console.log(`\n${moved} added lines left out as moved.`);
