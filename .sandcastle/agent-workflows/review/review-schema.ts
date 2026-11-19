import { z } from "zod/v4";

// Everything the review reports. review.ts renders the verdict comment from
// it and posts each comment inline, so each finding is written once: a fixed
// one in its axis's `fixed`, a left one in `comments`.

const axis = (name: string) =>
  z
    .strictObject({
      verdict: z.enum(["PASS", "CHANGES REQUESTED"]),
      reason: z
        .string()
        .min(1)
        .describe(`One sentence: why the ${name} axis passes or fails.`),
      fixed: z
        .array(
          z.strictObject({
            commit: z
              .string()
              .regex(/^[0-9a-f]{7,40}$/)
              .describe("The fix's commit SHA."),
            summary: z
              .string()
              .min(1)
              .describe(
                "One sentence: what was wrong and the rule or spec line it broke."
              ),
          })
        )
        .describe(`The ${name} findings you fixed, worst first.`),
    })
    .describe(`The ${name} axis.`);

export const reviewSchema = z
  .strictObject({
    standards: axis("Standards"),
    spec: axis("Spec"),
    comments: z
      .array(
        z.strictObject({
          axis: z.enum(["standards", "spec"]),
          path: z
            .string()
            .min(1)
            .describe("The file, relative to the repository root."),
          line: z
            .number()
            .int()
            .positive()
            .describe(
              "A line in the file as it is now, inside a hunk of the diff against the base. A comment outside the hunks goes into the verdict instead."
            ),
          body: z
            .string()
            .min(1)
            .describe(
              "The finding, in Markdown: the rule or spec line it breaks, and what to do instead."
            ),
        })
      )
      .describe(
        "One entry per finding you left unfixed, worst first. Empty is fine."
      ),
    wantedRules: z
      .array(z.string().min(1))
      .describe(
        "Each thing you wanted to fail the change for that no standard covers, one sentence each. The retro reads this list. Empty is fine."
      ),
  })
  .describe("The review's verdict and findings.");

export type Review = z.infer<typeof reviewSchema>;
