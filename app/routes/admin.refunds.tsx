import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { UserRole, users } from "~/db/schema";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Skeleton } from "~/components/ui/skeleton";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { formatDuration, formatPrice } from "~/lib/utils";
import {
  decideRefundRequest,
  listOpenRefundRequests,
} from "~/lib/refunds.server";

const decisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
    declineReason: z
      .string()
      .trim()
      .min(10, "Tell the learner why, in at least 10 characters.")
      .max(1000, "Please keep the Decline Reason under 1000 characters."),
  }),
]);

function requireAdmin(userId: number | null) {
  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const user = db.select().from(users).where(eq(users.id, userId)).get();

  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can decide refund requests.", { status: 403 });
  }

  return user;
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Decide open refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = requireAdmin(await getCurrentUserId(request));

  return {
    currentUserId: admin.id,
    refundRequests: listOpenRefundRequests(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = requireAdmin(await getCurrentUserId(request));

  const formData = await request.formData();
  const parsed = parseFormData(formData, decisionSchema);

  if (!parsed.success) {
    return data(
      { ok: false, error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const result = decideRefundRequest(
    parsed.data.refundId,
    admin.id,
    parsed.data.intent === "approve"
      ? { decision: "approve" }
      : { decision: "decline", declineReason: parsed.data.declineReason }
  );

  if (!result.ok) {
    return data({ ok: false, error: result.error }, { status: 409 });
  }

  return {
    ok: true,
    error: null,
    decided: parsed.data.intent === "approve" ? "Approved" : "Declined",
  };
}

type OpenRefundRequest = Awaited<
  ReturnType<typeof loader>
>["refundRequests"][number];

function progressAtRequest(refundRequest: OpenRefundRequest) {
  const {
    watchedSecondsAtRequest: watched,
    completedLessonsAtRequest: completed,
    totalLessonsAtRequest: total,
  } = refundRequest;

  if (watched === null || completed === null || total === null) {
    return "not recorded";
  }

  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return `${formatDuration(Math.round(watched / 60), true, false, false)} watched · ${completed}/${total} lessons (${percent}%)`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

type Step = "idle" | "approve" | "decline";

function RefundRequestRow({
  refundRequest,
  isOwnRequest,
}: {
  refundRequest: OpenRefundRequest;
  isOwnRequest: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const [step, setStep] = useState<Step>("idle");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(
        `${"decided" in fetcher.data ? fetcher.data.decided : "Decided"}: ${refundRequest.learnerName} — ${refundRequest.courseTitle}`
      );
    } else if (fetcher.data.error) {
      toast.error(fetcher.data.error);
      setStep("idle");
    }
  }, [fetcher.state, fetcher.data, refundRequest]);

  const purchaseType =
    refundRequest.teamSeats === null
      ? "Personal"
      : `Team licence · ${refundRequest.teamSeats} ${refundRequest.teamSeats === 1 ? "seat" : "seats"}`;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {refundRequest.learnerName}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {refundRequest.learnerEmail}
              </span>
            </p>
            <Link
              to={`/courses/${refundRequest.courseSlug}`}
              className="text-sm hover:underline"
            >
              {refundRequest.courseTitle}
            </Link>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">
              {formatPrice(refundRequest.amountPaid)}
            </p>
            <p className="text-xs text-muted-foreground">{purchaseType}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Bought</dt>
            <dd>{formatDate(refundRequest.purchasedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Requested</dt>
            <dd>{formatDate(refundRequest.requestedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Progress when requested
            </dt>
            <dd>{progressAtRequest(refundRequest)}</dd>
          </div>
        </dl>

        <blockquote className="border-l-2 pl-3 text-sm">
          {refundRequest.reason}
        </blockquote>

        {isOwnRequest ? (
          <p className="text-sm text-muted-foreground">
            This is your own refund request. Another admin must decide it.
          </p>
        ) : step === "idle" ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setStep("approve")}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStep("decline")}
            >
              Decline
            </Button>
          </div>
        ) : step === "approve" ? (
          <fetcher.Form
            method="post"
            className="space-y-2 rounded-md border border-dashed p-3"
          >
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="refundId" value={refundRequest.id} />
            <p className="text-sm">
              Approve a refund of{" "}
              <strong>{formatPrice(refundRequest.amountPaid)}</strong> to{" "}
              <strong>{refundRequest.learnerName}</strong>?{" "}
              {refundRequest.teamSeats === null
                ? "They lose access to the course."
                : "The licence's seats stop working."}{" "}
              This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Approving..." : "Yes, approve"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStep("idle")}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <fetcher.Form
            method="post"
            className="space-y-2 rounded-md border border-dashed p-3"
          >
            <input type="hidden" name="intent" value="decline" />
            <input type="hidden" name="refundId" value={refundRequest.id} />
            <Label htmlFor={`decline-reason-${refundRequest.id}`}>
              Decline Reason — the learner will see this
            </Label>
            <Textarea
              id={`decline-reason-${refundRequest.id}`}
              name="declineReason"
              rows={3}
              required
              minLength={10}
              placeholder="Why are we turning this down?"
            />
            <p className="text-xs text-muted-foreground">
              Declining can&apos;t be undone. The learner gets their access
              back and may raise a new request.
            </p>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Declining..." : "Decline request"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStep("idle")}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        )}
      </CardContent>
    </Card>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="mb-8 h-5 w-80" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { refundRequests, currentUserId } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Open requests, oldest first. Decisions are final.
        </p>
      </div>

      {refundRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No refund requests are waiting.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {refundRequests.map((refundRequest) => (
            <RefundRequestRow
              key={refundRequest.id}
              refundRequest={refundRequest}
              isOwnRequest={refundRequest.learnerId === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
