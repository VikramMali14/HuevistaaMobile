import { colourFinderApi } from "@/api/endpoints/colour-finder";
import { keys } from "@/api/query-keys";
import type { ColourFinderPass } from "@/api/types";
import { passRail } from "@/features/payments/day-pass";
import { t } from "@/i18n";

/**
 * Buying 24 hours of the Colour finder outside Google Play, on the rail every pass is bought on
 * (day-pass.ts) — its own routes, its own kept order, and the finder read again once a payment
 * may have opened it. The Android store build sells it through Google Play instead.
 */
export const colourFinderPass = passRail<ColourFinderPass>({
  page: "huevista://colour-finder",
  storageKey: "hv.colourFinderOrder",
  order: () => colourFinderApi.passOrder(),
  verify: (proof) => colourFinderApi.passVerify(proof),
  queryKey: keys.colourFinder,
  words: {
    opened: (time) => t("colourFinder.opened", { time }),
    openedPlain: () => t("colourFinder.openedPlain"),
    checking: () => t("colourFinder.checking"),
    refused: (message) => t("colourFinder.refused", { message }),
    cancelled: () => t("colourFinder.cancelled"),
    failed: () => t("colourFinder.failed"),
    unfinished: () => t("colourFinder.unfinished"),
    playPending: () => t("colourFinder.playPending"),
  },
});
