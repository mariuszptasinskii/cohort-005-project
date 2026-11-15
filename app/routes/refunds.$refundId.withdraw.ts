import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/refunds.$refundId.withdraw";
import { getCurrentUserId } from "~/lib/session";
import { parseParams } from "~/lib/validation";
import { withdrawRefundRequest } from "~/lib/refunds.server";

const withdrawParamsSchema = z.object({
  refundId: z.coerce.number().int(),
});

/** The learner takes back their own Open Refund Request. */
export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const { refundId } = parseParams(params, withdrawParamsSchema);
  const result = withdrawRefundRequest(refundId, currentUserId);

  if (!result.ok) {
    return data({ withdrawn: false, error: result.error }, { status: 409 });
  }

  return { withdrawn: true, error: null };
}
