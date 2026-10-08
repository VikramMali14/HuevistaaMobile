import { keys, redeemChanges, renderChanges } from "@/api/query-keys";
import { isRememberablePath } from "@/auth/pending-route";

/** What the server tells a phone about (HueVista PushKind). */
export type PushKind =
  | "WALLS_READY"
  | "WALLS_FAILED"
  | "AI_IMAGE_READY"
  | "AI_IMAGE_FAILED"
  | "VOUCHER_DELIVERED"
  | "VOUCHER_REJECTED"
  | "SUPPORT_REPLY";

/** A notification's data as the server sends it: its kind, who it's for, and ids only. */
export interface PushPayload {
  type: PushKind;
  /** The account it was sent to — a tap meant for an account no longer signed in is dropped. */
  userId: string;
  projectId?: string;
  renderId?: string;
  redemptionId?: string;
  conversationId?: string;
}

const KINDS: readonly PushKind[] = [
  "WALLS_READY",
  "WALLS_FAILED",
  "AI_IMAGE_READY",
  "AI_IMAGE_FAILED",
  "VOUCHER_DELIVERED",
  "VOUCHER_REJECTED",
  "SUPPORT_REPLY",
];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const id = (value: unknown): string | undefined => (typeof value === "string" && ID.test(value) ? value : undefined);

/** A notification's data, if it's one of ours: a known kind, an account, and well-formed ids. */
export function readPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const type = KINDS.find((k) => k === d.type);
  const userId = id(d.userId);
  if (!type || !userId) return null;
  return {
    type,
    userId,
    projectId: id(d.projectId),
    renderId: id(d.renderId),
    redemptionId: id(d.redemptionId),
    conversationId: id(d.conversationId),
  };
}

/**
 * The screen a tap opens, built here from the ids — never a path or a link the
 * notification carries. Null when an id it needs is missing.
 */
export function pathFor(p: PushPayload): string | null {
  let path: string | null = null;
  switch (p.type) {
    case "WALLS_READY":
    case "WALLS_FAILED":
      // CR opens a room at whatever step it is at.
      path = p.projectId ? `/room/${p.projectId}` : null;
      break;
    case "AI_IMAGE_READY":
    case "AI_IMAGE_FAILED":
      path = p.renderId ? `/ai-image/${p.renderId}${p.projectId ? `?projectId=${p.projectId}` : ""}` : null;
      break;
    case "VOUCHER_DELIVERED":
    case "VOUCHER_REJECTED":
      path = p.redemptionId ? `/painter/voucher/${p.redemptionId}` : null;
      break;
    case "SUPPORT_REPLY":
      path = p.conversationId ? `/help/${p.conversationId}` : null;
      break;
  }
  return path && isRememberablePath(path) ? path : null;
}

type Invalidation = { queryKey: readonly unknown[]; exact?: boolean };

/** What a notification makes stale, refreshed when it arrives with the app open. */
export function invalidationsFor(p: PushPayload): readonly Invalidation[] {
  switch (p.type) {
    case "WALLS_READY":
    case "WALLS_FAILED":
      return p.projectId ? [{ queryKey: keys.room(p.projectId), exact: true }, { queryKey: keys.projects, exact: true }] : [{ queryKey: keys.projects, exact: true }];
    case "AI_IMAGE_READY":
    case "AI_IMAGE_FAILED":
      if (!p.projectId) return [{ queryKey: keys.renders }, { queryKey: keys.aiCredits }];
      return [...renderChanges(p.projectId), ...(p.renderId ? [{ queryKey: keys.render(p.projectId, p.renderId), exact: true }] : [])];
    case "VOUCHER_DELIVERED":
    case "VOUCHER_REJECTED":
      // A declined voucher hands the points back: the balance and what it buys change too.
      return redeemChanges.map((queryKey) => ({ queryKey }));
    case "SUPPORT_REPLY":
      return [{ queryKey: keys.supportList, exact: true }, ...(p.conversationId ? [{ queryKey: keys.supportConversation(p.conversationId), exact: true }] : [])];
  }
}
