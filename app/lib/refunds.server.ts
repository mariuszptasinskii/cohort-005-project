import { data } from "react-router";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  users,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
} from "~/db/schema";
import {
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  checkRefundEligibility,
  logEmail,
  type RefundEligibility,
} from "~/lib/refunds";

// ─── Purchases and progress ───

/**
 * The purchase a Refund Request from this learner is about. Picks the latest
 * one — a known gap when someone owns both a personal and a team purchase.
 */
export function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt))
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

export type CourseConsumption = {
  watchedSeconds: number;
  completedLessons: number;
  totalLessons: number;
};

/** How much of the course the learner has used, across every purchase. */
export function getCourseConsumption(
  userId: number,
  courseId: number
): CourseConsumption {
  const lessonIds = getLessonIdsForCourse(courseId);
  if (lessonIds.length === 0) {
    return { watchedSeconds: 0, completedLessons: 0, totalLessons: 0 };
  }

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  const completed = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return {
    watchedSeconds: Math.round(
      furthestPerLesson.reduce((total, row) => total + row.furthest, 0)
    ),
    completedLessons: completed?.count ?? 0,
    totalLessons: lessonIds.length,
  };
}

function hasRequestWithStatus(purchaseId: number, status: RefundStatus) {
  return !!db
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(eq(refunds.purchaseId, purchaseId), eq(refunds.status, status)))
    .get();
}

function hasClaimedSeat(purchaseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();
}

function isTeamPurchase(purchaseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .get();
}

// ─── Eligibility ───

export function getRefundEligibility(
  purchase: typeof purchases.$inferSelect,
  consumption: CourseConsumption
): RefundEligibility {
  return checkRefundEligibility({
    purchasedAt: purchase.createdAt,
    now: new Date(),
    hasOpenRequest: hasRequestWithStatus(purchase.id, RefundStatus.Open),
    hasApprovedRequest: hasRequestWithStatus(purchase.id, RefundStatus.Approved),
    hasClaimedSeat: hasClaimedSeat(purchase.id),
    ...consumption,
  });
}

/**
 * What the learner is offered on the course page, or null if their purchase
 * cannot be refunded.
 */
export function getRefundOffer(userId: number, courseId: number) {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return null;

  const eligibility = getRefundEligibility(
    purchase,
    getCourseConsumption(userId, courseId)
  );
  if (!eligibility.eligible) return null;

  return {
    amount: purchase.amountPaid,
    lastDayInWindow: eligibility.lastDayInWindow,
  };
}

// ─── The freeze while a Refund Request is open (docs/adr/0001) ───

/**
 * Is the learner's own access to this course paused by an Open Refund Request
 * on a personal purchase? A team licence under review freezes its seats, not
 * the buyer.
 */
export function isAccessFrozenByRefundRequest(
  userId: number,
  courseId: number
): boolean {
  const openPersonalRequest = db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.courseId, courseId),
        eq(refunds.status, RefundStatus.Open),
        sql`not exists (select 1 from ${coupons} where ${coupons.purchaseId} = ${purchases.id})`
      )
    )
    .get();

  return !!openPersonalRequest;
}

/** Is this team licence waiting on a Refund Request decision? */
export function isLicenceUnderReview(purchaseId: number): boolean {
  return hasRequestWithStatus(purchaseId, RefundStatus.Open);
}

/** Team-licence purchases that currently have an Open Refund Request. */
export function getPurchaseIdsUnderReview(purchaseIds: number[]): Set<number> {
  if (purchaseIds.length === 0) return new Set();
  const rows = db
    .select({ purchaseId: refunds.purchaseId })
    .from(refunds)
    .where(
      and(
        inArray(refunds.purchaseId, purchaseIds),
        eq(refunds.status, RefundStatus.Open)
      )
    )
    .all();
  return new Set(rows.map((row) => row.purchaseId));
}

/**
 * Someone else got to the Open Refund Request first — another admin decided
 * it, or the learner withdrew it. The caller tells the person and refreshes.
 */
export type RefundRequestChange =
  | { ok: true }
  | { ok: false; error: string };

// ─── Raising and withdrawing ───

export function createRefundRequest(
  purchaseId: number,
  reason: string,
  consumption: CourseConsumption
) {
  return db
    .insert(refunds)
    .values({
      purchaseId,
      status: RefundStatus.Open,
      reason,
      watchedSecondsAtRequest: consumption.watchedSeconds,
      completedLessonsAtRequest: consumption.completedLessons,
      totalLessonsAtRequest: consumption.totalLessons,
    })
    .returning()
    .get();
}

/**
 * The learner takes back their own Open Refund Request. Access returns at
 * once, because the freeze only applies while a request is open.
 */
export function withdrawRefundRequest(
  refundId: number,
  userId: number
): RefundRequestChange {
  const ownRequest = db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(and(eq(refunds.id, refundId), eq(purchases.userId, userId)))
    .get();

  if (!ownRequest) {
    throw data("Refund request not found.", { status: 404 });
  }

  const result = db
    .update(refunds)
    .set({ status: RefundStatus.Withdrawn, resolvedAt: new Date().toISOString() })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open)))
    .run();

  if (result.changes === 0) {
    return { ok: false, error: "This refund request has already been decided." };
  }

  return { ok: true };
}

// ─── Deciding (Admins only) ───

export type RefundDecision =
  | { decision: "approve" }
  | { decision: "decline"; declineReason: string };

/**
 * Approve or decline an Open Refund Request. Decisions are final
 * (docs/adr/0002) and the refund rules are not re-checked (docs/adr/0001).
 */
export function decideRefundRequest(
  refundId: number,
  adminUserId: number,
  decision: RefundDecision
): RefundRequestChange {
  const request = db
    .select({
      refundId: refunds.id,
      purchaseId: purchases.id,
      learnerId: purchases.userId,
      courseId: purchases.courseId,
      amountPaid: purchases.amountPaid,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundId))
    .get();

  if (!request) {
    throw data("Refund request not found.", { status: 404 });
  }

  if (request.learnerId === adminUserId) {
    throw data("Another admin must decide your own refund request.", {
      status: 403,
    });
  }

  const resolvedAt = new Date().toISOString();

  const decided = db.transaction((tx) => {
    const result = tx
      .update(refunds)
      .set(
        decision.decision === "approve"
          ? {
              status: RefundStatus.Approved,
              amountRefunded: request.amountPaid,
              resolvedAt,
              resolvedByUserId: adminUserId,
            }
          : {
              status: RefundStatus.Declined,
              declineReason: decision.declineReason,
              resolvedAt,
              resolvedByUserId: adminUserId,
            }
      )
      .where(
        and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open))
      )
      .run();

    if (result.changes === 0) return false;

    if (decision.decision !== "approve") return true;

    if (isTeamPurchase(request.purchaseId)) {
      // docs/adr/0004 — the licence's seats stop working, but stay on record.
      tx.update(coupons)
        .set({ revokedAt: resolvedAt })
        .where(
          and(
            eq(coupons.purchaseId, request.purchaseId),
            isNull(coupons.revokedAt)
          )
        )
        .run();
    } else {
      // docs/adr/0003 — access goes, learning history stays.
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, request.learnerId),
            eq(enrollments.courseId, request.courseId)
          )
        )
        .run();
    }

    return true;
  });

  if (!decided) {
    return {
      ok: false,
      error: "This refund request was already decided or withdrawn.",
    };
  }

  const emailInput = {
    learnerName: request.learnerName,
    learnerEmail: request.learnerEmail,
    courseTitle: request.courseTitle,
    amount: request.amountPaid,
  };

  logEmail(
    decision.decision === "approve"
      ? buildRefundApprovedEmail(emailInput)
      : buildRefundDeclinedEmail({
          ...emailInput,
          declineReason: decision.declineReason,
        })
  );

  return { ok: true };
}

// ─── Listings ───

export function listOpenRefundRequests() {
  const rows = db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      watchedSecondsAtRequest: refunds.watchedSecondsAtRequest,
      completedLessonsAtRequest: refunds.completedLessonsAtRequest,
      totalLessonsAtRequest: refunds.totalLessonsAtRequest,
      purchaseId: purchases.id,
      purchasedAt: purchases.createdAt,
      amountPaid: purchases.amountPaid,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(asc(refunds.requestedAt))
    .all();

  const seatCounts = new Map<number, number>();
  const purchaseIds = rows.map((row) => row.purchaseId);
  if (purchaseIds.length > 0) {
    const counts = db
      .select({
        purchaseId: coupons.purchaseId,
        seats: sql<number>`count(*)`,
      })
      .from(coupons)
      .where(inArray(coupons.purchaseId, purchaseIds))
      .groupBy(coupons.purchaseId)
      .all();
    for (const row of counts) seatCounts.set(row.purchaseId, row.seats);
  }

  return rows.map((row) => ({
    ...row,
    teamSeats: seatCounts.get(row.purchaseId) ?? null,
  }));
}

export function listRefundRequestsForLearner(userId: number) {
  return db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      declineReason: refunds.declineReason,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      amountPaid: purchases.amountPaid,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(purchases.userId, userId))
    .orderBy(desc(refunds.requestedAt))
    .all();
}
