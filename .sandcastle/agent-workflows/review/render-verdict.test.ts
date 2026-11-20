import { describe, expect, it } from "vitest";
import { renderVerdict } from "./render-verdict";
import type { Review } from "./review-schema";

const review: Review = {
  standards: {
    verdict: "PASS",
    reason: "The split is clean.",
    fixed: [{ commit: "24409e5", summary: "A comment described history." }],
  },
  spec: {
    verdict: "CHANGES REQUESTED",
    reason: "The placement is open.",
    fixed: [],
  },
  comments: [],
  wantedRules: [],
};

const comment = (axis: "standards" | "spec", path: string) => ({
  axis,
  path,
  line: 3,
  body: `The finding in ${path}.`,
});

describe("renderVerdict", () => {
  it("counts the inline comments instead of repeating them", () => {
    const verdict = renderVerdict({
      review,
      inline: [
        comment("standards", "a.ts"),
        comment("standards", "b.ts"),
        comment("spec", "c.ts"),
      ],
      dropped: [],
      screenshots: [],
    });

    expect(verdict).toContain("## Standards: PASS");
    expect(verdict).toContain(
      "- Fixed in 24409e5: A comment described history."
    );
    expect(verdict).toContain("- Left 2 as inline comments.");
    expect(verdict).toContain("## Spec: CHANGES REQUESTED");
    expect(verdict).toContain("- Left 1 as inline comment.");
    expect(verdict).not.toContain("The finding in");
  });

  it("writes out in full the comments that missed the diff", () => {
    const verdict = renderVerdict({
      review,
      inline: [],
      dropped: [comment("standards", "route.tsx")],
      screenshots: [],
    });

    expect(verdict).toContain("- `route.tsx:3`: The finding in route.tsx.");
  });

  it("embeds the screenshots and folds the wanted rules away", () => {
    const verdict = renderVerdict({
      review: { ...review, wantedRules: ["Exemption lists only shrink."] },
      inline: [],
      dropped: [],
      screenshots: ["/tmp/evidence/after.png"],
    });

    expect(verdict).toContain("![after](/tmp/evidence/after.png)");
    expect(verdict).toMatch(
      /<details>[\s\S]*- Exemption lists only shrink\.[\s\S]*<\/details>$/
    );
  });
});
