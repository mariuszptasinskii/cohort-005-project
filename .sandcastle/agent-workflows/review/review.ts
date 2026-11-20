import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { claudeAgent, required, writeJson } from "../shared/common";
import { extractionPrompt } from "../shared/extraction-prompt";
import { runWithExtraction } from "../shared/run-with-extraction";
import { diffLines } from "./diff-lines";
import { renderVerdict } from "./render-verdict";
import { type Review, reviewSchema } from "./review-schema";

const BASE_REF = required("BASE_REF");

// The agent fixes and commits, then hands back its verdict and the findings
// it left. This script writes the verdict comment and the inline comments;
// the workflow pushes the commits, posts both, and marks the PR ready.
const result = await runWithExtraction({
  name: "review",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    PR_NUMBER: required("PR_NUMBER"),
    BRANCH: required("BRANCH"),
    BASE_REF,
  },
  output: sandcastle.Output.object({ tag: "review", schema: reviewSchema }),
  extractionPrompt: extractionPrompt("review", reviewSchema),
});

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// The diff after the agent's commits: the comments land on that.
const hunks = diffLines(git("diff", `origin/${BASE_REF}...HEAD`));
const review: Review = result.output;
const inline = review.comments.filter(({ path: file, line }) =>
  hunks.get(file)?.has(line)
);
const dropped = review.comments.filter((comment) => !inline.includes(comment));

const EVIDENCE = "/tmp/evidence";
const screenshots = fs.existsSync(EVIDENCE)
  ? fs
      .readdirSync(EVIDENCE)
      .filter((file) => file.endsWith(".png"))
      .sort()
      .map((file) => path.join(EVIDENCE, file))
  : [];

fs.writeFileSync(
  "/tmp/review-verdict.md",
  `${renderVerdict({ review, inline, dropped, screenshots })}\n`
);

// The request body for POST /repos/{owner}/{repo}/pulls/{n}/reviews.
writeJson("review-comments.json", {
  commit_id: git("rev-parse", "HEAD").trim(),
  event: "COMMENT",
  body: "Findings the review left, one per line.",
  comments: inline.map(({ path: file, line, body }) => ({
    path: file,
    line,
    body,
    side: "RIGHT",
  })),
});
