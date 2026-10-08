import type { ConversationSummary, SupportStatus } from "@/api/endpoints/support";
import { t } from "@/i18n";
import { serverMoment } from "@/lib/dates";

/** The server's own limit on one message. */
export const MESSAGE_MAX = 4000;

/** How often an open chat is read again while it's on screen. */
export const POLL_MS = 5_000;

/** S6's label for where a conversation stands. */
export function statusLabel(status: SupportStatus | string): string {
  if (status === "NEEDS_HUMAN") return t("help.status.NEEDS_HUMAN");
  if (status === "RESOLVED") return t("help.status.RESOLVED");
  return t("help.status.OPEN");
}

export function statusTone(status: SupportStatus | string): "plain" | "accent" | "warning" | "success" {
  if (status === "NEEDS_HUMAN") return "warning";
  if (status === "RESOLVED") return "plain";
  return "accent";
}

/**
 * The subject the server makes from a first message (SupportService): spaces folded, kept
 * whole up to 60 characters, else the first 57 and "…". Used to find a chat whose start
 * went unanswered.
 */
export function subjectFrom(message: string): string {
  const text = message.trim().replace(/[ \t\n\x0B\f\r]+/g, " ");
  if (!text) return "Support request";
  return text.length <= 60 ? text : `${text.slice(0, 57)}…`;
}

/**
 * After a start whose answer never came: the chat it made, if it made one — the newest
 * with that subject, moved since just before the ask.
 */
export function startedChat(list: readonly ConversationSummary[] | undefined, message: string, askedAt: number): ConversationSummary | null {
  const subject = subjectFrom(message);
  const since = askedAt - 2 * 60_000;
  return list?.find((c) => c.subject === subject && serverMoment(c.updatedAt) >= since) ?? null;
}

/** The newest chat still going — offered first in S6, so one problem stays in one chat. */
export function ongoing(list: readonly ConversationSummary[] | undefined): ConversationSummary | null {
  return list?.find((c) => c.status !== "RESOLVED") ?? null;
}
