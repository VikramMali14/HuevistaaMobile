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
 * After a start whose answer never came: the chat it made, if it made one — one with that
 * subject that wasn't on the list before the ask (`known`: its ids then). Without a list
 * from before, the newest with that subject moved in the last 10 minutes (the phone's
 * clock can be a few minutes out).
 */
export function startedChat(
  list: readonly ConversationSummary[] | undefined,
  message: string,
  known: ReadonlySet<string> | null,
  askedAt: number,
): ConversationSummary | null {
  const subject = subjectFrom(message);
  if (known) return list?.find((c) => !known.has(c.id) && c.subject === subject) ?? null;
  const since = askedAt - 10 * 60_000;
  return list?.find((c) => c.subject === subject && serverMoment(c.updatedAt) >= since) ?? null;
}

/**
 * How long after it was sent a message can still turn up. The server keeps the message
 * and the assistant's reply in one transaction (up to 120 s for the reply), so neither
 * can be seen until the reply is in. The app waits 130 s for the answer itself.
 */
export const LANDS_WITHIN_MS = 140_000;

/** What looking for a send found: it, or not — `sure` is false when the last look failed. */
export type Looked<T> = { found: T } | { found: null; sure: boolean };

/**
 * After a send whose answer never came: looks for it every few seconds until it shows or
 * can no longer land. One look straight after a dropped connection would see the chat as
 * it was before the send — which is still being answered — and wrongly say it never
 * arrived, inviting a second paid answer. Stops early, unsure, once `alive` says no.
 */
export async function lookFor<T>(
  find: () => Promise<T | null>,
  askedAt: number,
  {
    alive = () => true,
    every = POLL_MS,
    now = Date.now,
    wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
  }: { alive?: () => boolean; every?: number; now?: () => number; wait?: (ms: number) => Promise<void> } = {},
): Promise<Looked<T>> {
  for (;;) {
    let sure = true;
    try {
      const hit = await find();
      if (hit) return { found: hit };
    } catch {
      sure = false;
    }
    if (!alive()) return { found: null, sure: false };
    if (now() >= askedAt + LANDS_WITHIN_MS) return { found: null, sure };
    await wait(every);
  }
}

/** Who wrote a message, as the chat names them. */
export function senderName(sender: string): string {
  if (sender === "USER") return t("help.you");
  return sender === "AGENT" ? t("help.team") : t("help.assistant");
}

/** The newest chat still going — offered first in S6, so one problem stays in one chat. */
export function ongoing(list: readonly ConversationSummary[] | undefined): ConversationSummary | null {
  return list?.find((c) => c.status !== "RESOLVED") ?? null;
}
