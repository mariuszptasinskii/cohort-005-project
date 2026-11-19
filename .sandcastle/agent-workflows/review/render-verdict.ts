import type { Review } from "./review-schema";

type Comment = Review["comments"][number];

export type VerdictInput = {
  review: Review;
  // The comments that land on a line of the diff, posted inline.
  inline: Comment[];
  // The comments outside the diff. GitHub takes no inline comment there, so
  // the verdict is the one place they appear.
  dropped: Comment[];
  // Absolute paths of the screenshots. The workflow uploads each one and
  // swaps its path for the URL.
  screenshots: string[];
};

// The verdict comment. A finding left inline is only counted here, so the PR
// carries each finding once. The `## Standards:` heading is what the workflow
// looks for before it marks the PR ready.
export const renderVerdict = ({
  review,
  inline,
  dropped,
  screenshots,
}: VerdictInput): string =>
  [
    ...axisSection(
      "Standards",
      review.standards,
      countFor("standards", inline)
    ),
    ...axisSection("Spec", review.spec, countFor("spec", inline)),
    ...droppedSection(dropped),
    ...screenshots.map(
      (file) => `![${file.replace(/^.*\//, "").replace(/\.png$/, "")}](${file})`
    ),
    ...wantedRulesSection(review.wantedRules),
  ]
    .join("\n")
    .trimEnd();

const countFor = (axis: Comment["axis"], inline: Comment[]): number =>
  inline.filter((comment) => comment.axis === axis).length;

const axisSection = (
  title: string,
  { verdict, reason, fixed }: Review["standards"],
  left: number
): string[] => [
  `## ${title}: ${verdict}`,
  "",
  reason,
  "",
  ...fixed.map(({ commit, summary }) => `- Fixed in ${commit}: ${summary}`),
  ...(left > 0
    ? [`- Left ${left} as inline comment${left === 1 ? "" : "s"}.`]
    : []),
  "",
];

const droppedSection = (dropped: Comment[]): string[] =>
  dropped.length === 0
    ? []
    : [
        "## Left outside the diff",
        "",
        ...dropped.map(
          ({ path, line, body }) => `- \`${path}:${line}\`: ${body}`
        ),
        "",
      ];

// For the retro, not for the PR's reader, so it starts folded.
const wantedRulesSection = (rules: string[]): string[] =>
  rules.length === 0
    ? []
    : [
        "",
        "<details><summary>Rules this review wanted and could not find</summary>",
        "",
        ...rules.map((rule) => `- ${rule}`),
        "",
        "</details>",
      ];
