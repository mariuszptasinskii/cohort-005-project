import { describe, it, expect } from "vitest";
import {
  REFUND_WATCH_LIMIT_SECONDS,
  buildRefundDeclinedEmail,
  buildRefundRequestEmail,
  checkRefundEligibility,
  type RefundEligibilityFacts,
} from "./refunds";

function facts(overrides: Partial<RefundEligibilityFacts> = {}) {
  return {
    purchasedAt: new Date(2026, 10, 1, 23, 0).toISOString(),
    now: new Date(2026, 10, 5, 12, 0),
    hasOpenRequest: false,
    hasApprovedRequest: false,
    hasClaimedSeat: false,
    watchedSeconds: 0,
    completedLessons: 0,
    totalLessons: 10,
    ...overrides,
  };
}

describe("checkRefundEligibility", () => {
  it("accepts a fresh purchase and says when the window ends", () => {
    expect(checkRefundEligibility(facts())).toEqual({
      eligible: true,
      lastDayInWindow: "2026-11-15",
    });
  });

  it("keeps the whole fourteenth day open, however late the purchase was", () => {
    const result = checkRefundEligibility(
      facts({ now: new Date(2026, 10, 15, 23, 59) })
    );
    expect(result.eligible).toBe(true);
  });

  it("closes on the fifteenth day", () => {
    const result = checkRefundEligibility(
      facts({ now: new Date(2026, 10, 16, 0, 1) })
    );
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("refuses a purchase that has already been refunded", () => {
    const result = checkRefundEligibility(facts({ hasApprovedRequest: true }));
    expect(result).toEqual({
      eligible: false,
      status: 409,
      message: "This purchase has already been refunded.",
    });
  });

  it("refuses a second open request", () => {
    const result = checkRefundEligibility(facts({ hasOpenRequest: true }));
    expect(result).toMatchObject({ eligible: false, status: 409 });
  });

  it("refuses a team licence with a claimed seat", () => {
    const result = checkRefundEligibility(facts({ hasClaimedSeat: true }));
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("refuses at half the lessons completed, but not just below", () => {
    expect(
      checkRefundEligibility(facts({ completedLessons: 5 })).eligible
    ).toBe(false);
    expect(
      checkRefundEligibility(facts({ completedLessons: 4 })).eligible
    ).toBe(true);
  });

  it("ignores completion for a course with no lessons", () => {
    const result = checkRefundEligibility(
      facts({ completedLessons: 0, totalLessons: 0 })
    );
    expect(result.eligible).toBe(true);
  });

  it("refuses at two hours watched, but not just below", () => {
    expect(
      checkRefundEligibility(
        facts({ watchedSeconds: REFUND_WATCH_LIMIT_SECONDS })
      ).eligible
    ).toBe(false);
    expect(
      checkRefundEligibility(
        facts({ watchedSeconds: REFUND_WATCH_LIMIT_SECONDS - 1 })
      ).eligible
    ).toBe(true);
  });
});

describe("refund emails", () => {
  const input = {
    learnerName: "Liam",
    learnerEmail: "liam@example.com",
    courseTitle: "Introduction to TypeScript",
    amount: 7900,
  };

  it("warns the learner that access pauses while the request is open", () => {
    const email = buildRefundRequestEmail(input);
    expect(email.body).toContain("your access to the course is paused");
    expect(email.body).toContain("withdraw");
  });

  it("gives the learner the team's Decline Reason", () => {
    const email = buildRefundDeclinedEmail({
      ...input,
      declineReason: "You finished the course before asking.",
    });
    expect(email.to).toBe("liam@example.com");
    expect(email.body).toContain("You finished the course before asking.");
  });
});
