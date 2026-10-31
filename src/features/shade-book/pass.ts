import { shadeBookApi } from "@/api/endpoints/shade-book";
import { keys } from "@/api/query-keys";
import type { ShadeBookPass } from "@/api/types";
import { passRail, type PassOutcome as RailOutcome } from "@/features/payments/day-pass";
import type { PayCallback, Prefill } from "@/features/payments/pay-link";
import { t } from "@/i18n";

export type { PassNotice } from "@/features/payments/day-pass";

/**
 * Buying 24 hours of the Shade Book outside Google Play — on iOS, and on an Android build
 * that pays on the website — on the rail every pass is bought on (day-pass.ts): the order from
 * the server, Razorpay Checkout on the website's /pay/mobile page, then the server's
 * verification. The book is read again once a payment may have opened it.
 *
 * The Android store build sells the pass through Google Play instead (play-checkout.ts),
 * the same way as the room and credit packs.
 */
export type PassOutcome = RailOutcome<ShadeBookPass>;

export const shadeBookPass = passRail<ShadeBookPass>({
  page: "huevista://shade-book",
  storageKey: "hv.shadeBookOrder",
  order: () => shadeBookApi.passOrder(),
  verify: (proof) => shadeBookApi.passVerify(proof),
  queryKey: keys.shadeBook,
  words: {
    opened: (time) => t("shadeBook.opened", { time }),
    openedPlain: () => t("shadeBook.openedPlain"),
    checking: () => t("shadeBook.checking"),
    refused: (message) => t("shadeBook.refused", { message }),
    cancelled: () => t("shadeBook.cancelled"),
    failed: () => t("shadeBook.failed"),
    unfinished: () => t("shadeBook.unfinished"),
    playPending: () => t("shadeBook.playPending"),
  },
});

/** The pass order whose checkout this phone opened last, unless it is long gone. */
export const keptPassOrder = (now?: number) => shadeBookPass.kept(now);

/** The pass's checkout is over (or the account signed out). */
export const forgetPassOrder = () => shadeBookPass.forget();

/** Pay for the pass on the website. Throws only before anything is opened. */
export const buyPassOnWebsite = (prefill?: Prefill) => shadeBookPass.buyOnWebsite(prefill);

/** Act on what the payment page handed back for the pass's order. */
export const settlePassAnswer = (answer: PayCallback | null, orderId: string) => shadeBookPass.settleAnswer(answer, orderId);

/**
 * D3 on a cold start: whether the answer it opened with is the pass's — see
 * {@link shadeBookPass}'s `isAnswer`. `otherStartedAt` is when the latest other checkout this
 * phone kept was opened.
 */
export const isPassAnswer = (answer: PayCallback, otherStartedAt: number | null) =>
  shadeBookPass.isAnswer(answer, otherStartedAt);

/** What a website checkout's outcome says on the screen. */
export const noticeFor = (outcome: PassOutcome) => shadeBookPass.noticeFor(outcome);
