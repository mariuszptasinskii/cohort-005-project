import { and, eq } from "drizzle-orm";
import { courseRatings, enrollments } from "~/db/schema";

/**
 * Join condition for counting a course rating: only learners who currently
 * have the course count. A refunded learner's rating drops out of the average
 * without being deleted, and comes back if they buy again (docs/adr/0003).
 *
 * Use as `.innerJoin(enrollments, ratingFromEnrolledLearner)`.
 */
export const ratingFromEnrolledLearner = and(
  eq(enrollments.userId, courseRatings.userId),
  eq(enrollments.courseId, courseRatings.courseId)
);
