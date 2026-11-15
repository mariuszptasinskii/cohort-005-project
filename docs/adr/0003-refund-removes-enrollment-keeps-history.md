# An approved refund removes the enrollment and keeps learning history

Approving a Refund Request on a personal purchase deletes the learner's enrollment, which is what grants access. Lesson progress, quiz attempts and video watch events stay. They're linked to the learner and the lesson rather than to the enrollment, so they reconnect on their own if the learner buys the course again. Keeping watch history also stops the learner from getting a refund, buying again and watching the course in pieces, because watched time counts across purchases. Course ratings count only from learners who are currently enrolled, so a refunded learner's rating drops out of the average without being deleted.

## Consequences

The enrollment's own `enrolledAt` and `completedAt` are lost, and refunded learners drop out of the enrollment-based instructor analytics.

## Considered Options

- **Delete learning history too.** Rejected: a refund wipes the record of what was watched, so the watch limit stops working.
- **Soft-delete the enrollment with a `revokedAt` flag.** Rejected: about a dozen queries read enrollments, and every one would need the filter. Missing one would leak access.
- **Delete the refunded learner's rating.** Rejected: loses the rating for good if the learner buys the course again.
