# Cadence

An online course platform where instructors publish video courses and learners buy them.

## Language

### Buying courses

**Purchase**:
A learner's one-off payment for a single course, which gives them access to it.
_Avoid_: Subscription, order

### Cancelling a purchase

**Cancellation**:
A learner's request to undo a Purchase, which an admin either approves or declines; a Purchase gets at most one, and a decline is final. Approval ends the learner's access to the course and issues a Refund at the same moment.
_Avoid_: Refund request, reversal, chargeback

**Refund**:
The money returned to the learner when a Cancellation is approved: always the amount they actually paid for the Purchase.
_Avoid_: Reversal, chargeback

**Cancellation Window**:
The 14 calendar days from the day of the Purchase (inclusive) during which a learner may ask for a Cancellation.
_Avoid_: Refund window, cancel window

**Eligible for cancellation**:
A Purchase is eligible when it is inside its Cancellation Window, has no Cancellation already open, the learner has completed fewer than half of the course's lessons and watched under two hours of it, and it is not a team seat that someone has already claimed.

**Watched time**:
The furthest point the learner has reached in each lesson's video, summed across the course's lessons.
_Avoid_: Playback time, viewing time
