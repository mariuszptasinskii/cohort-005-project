# Refund Request decisions are final

Once the team approves or declines a Refund Request, the decision can't be undone. A confirmation step before deciding guards against misclicks. A mistaken decline is fixed by the learner raising a new Refund Request, which the glossary already allows. A learner who changes their mind withdraws the request before it is decided. Keeping each decision as a single transition, Open to Approved or Declined, means who decided and when is never overwritten.

## Considered Options

- **Reopen a declined request.** Rejected: clashes with the rule of one open request per purchase, and sends conflicting emails to the learner.
- **Revert an approval while its Refund is still pending.** Rejected for now: depends on Refunds, which don't exist yet, and would need a separate decision history to stay auditable.
- **Undo toast with a delayed decision.** Rejected: needs either client-side delays or a scheduled job, to catch a mistake the confirmation step already catches.
