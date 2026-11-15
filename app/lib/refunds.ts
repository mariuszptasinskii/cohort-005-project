import { formatPrice } from "~/lib/utils";

// ─── Refund eligibility ───
// The single definition of when a learner may raise a Refund Request. It is
// judged when the request is raised and never again (docs/adr/0001).

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

// The fourteen-day window is counted in whole days, not hours — someone who
// buys at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

export type RefundEligibilityFacts = {
  purchasedAt: string;
  now: Date;
  hasOpenRequest: boolean;
  hasApprovedRequest: boolean;
  hasClaimedSeat: boolean;
  watchedSeconds: number;
  completedLessons: number;
  totalLessons: number;
};

export type RefundEligibility =
  | { eligible: true; lastDayInWindow: string }
  | { eligible: false; status: 403 | 409; message: string };

export function checkRefundEligibility(
  facts: RefundEligibilityFacts
): RefundEligibility {
  if (facts.hasApprovedRequest) {
    return {
      eligible: false,
      status: 409,
      message: "This purchase has already been refunded.",
    };
  }

  if (facts.hasOpenRequest) {
    return {
      eligible: false,
      status: 409,
      message: "You already have an open refund request on this purchase.",
    };
  }

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team — the buyer cannot hand it back on their own.
  if (facts.hasClaimedSeat) {
    return {
      eligible: false,
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    };
  }

  const today = calendarDay(facts.now);
  const lastDayInWindow = lastDayOfRefundWindow(facts.purchasedAt);
  const purchasedDay = calendarDay(new Date(facts.purchasedAt));

  if (today < purchasedDay || today > lastDayInWindow) {
    return {
      eligible: false,
      status: 403,
      message: `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
    };
  }

  if (
    facts.totalLessons > 0 &&
    facts.completedLessons / facts.totalLessons >= REFUND_COMPLETION_LIMIT
  ) {
    return {
      eligible: false,
      status: 403,
      message: "You have completed too much of this course to request a refund.",
    };
  }

  if (facts.watchedSeconds >= REFUND_WATCH_LIMIT_SECONDS) {
    return {
      eligible: false,
      status: 403,
      message: "You have watched too much of this course to request a refund.",
    };
  }

  return { eligible: true, lastDayInWindow };
}

// ─── Emails ───
// There is no mail transport wired up yet, so built messages go to the
// server log.

export type Email = { to: string; subject: string; body: string };

type EmailInput = {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
};

const SIGN_OFF = "— The Cadence team";

export function buildRefundRequestEmail(input: EmailInput): Email {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `The refund is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every refund request by hand. While we do, your access to the course is paused. If you change your mind, you can withdraw the request from your settings page and pick up where you left off.",
      "",
      "We will email you again when it is decided.",
      "",
      SIGN_OFF,
    ].join("\n"),
  };
}

export function buildRefundApprovedEmail(input: EmailInput): Email {
  return {
    to: input.learnerEmail,
    subject: `Refund approved — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have approved your refund request for "${input.courseTitle}".`,
      `We will send ${formatPrice(input.amount)}, the full amount you paid, back to you.`,
      "",
      "You no longer have access to the course. If you buy it again later, your progress will still be there.",
      "",
      SIGN_OFF,
    ].join("\n"),
  };
}

export function buildRefundDeclinedEmail(
  input: EmailInput & { declineReason: string }
): Email {
  return {
    to: input.learnerEmail,
    subject: `Refund request declined — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have declined your refund request for "${input.courseTitle}".`,
      "",
      "Our reason:",
      input.declineReason,
      "",
      "Your access to the course is back. You may raise a new refund request if something changes.",
      "",
      SIGN_OFF,
    ].join("\n"),
  };
}

export function logEmail(email: Email) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}
