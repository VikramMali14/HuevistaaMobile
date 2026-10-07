import { isPresentable } from "@/features/studio/failure-message";
import { t } from "@/i18n";

/**
 * What a customer is told when an AI image FAILED. The server's own sentence when it is
 * fit to show — every one it writes says the credits are back, and a FAILED image has
 * handed them back by contract. Otherwise a plain sentence of ours, which says so only when
 * the wallet shows them coming back (docs/04 C24: "say so only if the server confirms a
 * refund"). Never C8's fallbacks: trying again here is a new image, and a new charge.
 */
export function renderFailure(reason: string | null | undefined, refunded: boolean): string {
  if (reason && isPresentable(reason)) return reason.trim();
  return refunded ? t("aiImage.failedFallbackRefunded") : t("aiImage.failedFallback");
}
