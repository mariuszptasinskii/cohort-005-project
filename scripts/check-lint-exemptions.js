// Fails when .oxlintrc.json exempts a file from a rule that HEAD did not
// exempt it from. The exemption lists only shrink: a file that breaks a rule
// gets fixed, not listed. Splitting a listed file does not pass its entry on
// to the new files.
// Usage: node scripts/check-lint-exemptions.js

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONFIG = ".oxlintrc.json";

// .oxlintrc.json is JSONC. Strips // and /* */ comments outside strings,
// since a string such as "**/*.test.ts" holds a "/*" of its own.
const parseJsonc = (text) => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end - 1;
    } else if (text.startsWith("//", i)) {
      i = text.indexOf("\n", i) - 1;
      if (i < 0) break;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i);
      if (end < 0) break;
      i = end + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out);
};

const endOfString = (text, start) => {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return i + 1;
  }
  return text.length;
};

// One "<rule> <file glob>" entry per rule an override turns off.
const exemptions = (config) =>
  new Set(
    (config.overrides ?? []).flatMap(({ files = [], rules = {} }) =>
      Object.entries(rules)
        .filter(([, setting]) => setting === "off")
        .flatMap(([rule]) => files.map((file) => `${rule} ${file}`))
    )
  );

const before = exemptions(
  parseJsonc(
    execFileSync("git", ["show", `HEAD:${CONFIG}`], { encoding: "utf8" })
  )
);
const added = [...exemptions(parseJsonc(readFileSync(CONFIG, "utf8")))].filter(
  (entry) => !before.has(entry)
);

if (added.length > 0) {
  console.error(`${CONFIG} exempts files that HEAD did not:\n`);
  for (const entry of added) console.error(`  ${entry}`);
  console.error(`
Make each file pass the rule instead. When you split a file that is on an
exemption list, the new files start without the exemption: break up the code
they inherit until it passes.`);
  process.exit(1);
}
