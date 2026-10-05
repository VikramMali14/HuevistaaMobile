import type { AiCreditSummary, CustomerEntitlement, ProjectPurchaseOptions } from "@/api/types";

/** docs/04 "The three next-step states". */
export type NextStep = "ready" | "exhausted" | "missing";

export interface Balance {
  /** Shop rooms left + rooms bought. */
  rooms: number;
  /** AI credits, or null when this account cannot hold them (never show "0"). */
  credits: number | null;
  /** At least one of the three answered — otherwise show nothing, never "0 rooms". */
  loaded: boolean;
  /** Null while the entitlement is unknown (loading or failed): no card beats a wrong one. */
  nextStep: NextStep | null;
  entitlement: CustomerEntitlement | null;
  options: ProjectPurchaseOptions | null;
}

type Answer<T> = { ok: true; value: T } | { ok: false };

/**
 * The balance, worked out exactly as the website does (hooks/use-account-balance.ts and
 * components/app/customer-next-step.tsx):
 *
 *   rooms   = max(0, entitlement.projectsRemaining) + max(0, options.availableCredits)
 *   credits = wallet.eligible ? wallet.balance : hidden
 */
export function balanceFrom(
  entitlement: Answer<CustomerEntitlement | null> | null,
  options: Answer<ProjectPurchaseOptions> | null,
  wallet: Answer<AiCreditSummary> | null,
): Balance {
  const ent = entitlement?.ok ? entitlement.value : null;
  const opts = options?.ok ? options.value : null;
  const shopRooms = ent ? Math.max(0, ent.projectsRemaining) : 0;
  const bought = opts ? Math.max(0, opts.availableCredits) : 0;
  const rooms = shopRooms + bought;
  const credits = wallet?.ok && wallet.value.eligible ? Math.max(0, wallet.value.balance) : null;
  const loaded = Boolean(entitlement?.ok || options?.ok || wallet?.ok);

  let nextStep: NextStep | null = null;
  if (entitlement?.ok) nextStep = rooms > 0 ? "ready" : ent ? "exhausted" : "missing";

  return { rooms, credits, loaded, nextStep, entitlement: ent, options: opts };
}
