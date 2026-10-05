import { Banner, Button } from "@/components/ui";
import { t } from "@/i18n";

import type { CanvasState } from "./engine/RoomCanvas";

/**
 * What a studio canvas couldn't fetch, with Try again: the room's photo, or the shape of
 * some of its walls (those can't be painted or tapped until they come). Nothing when all
 * is well — and nothing for a phone with no WebGL, which each screen words for itself.
 */
export function CanvasTrouble({ state, onRetry }: { state: CanvasState; onRetry: () => void }) {
  let message: string | null = null;
  if (state.kind === "failed") message = t("paint.loadFailed");
  else if (state.kind === "ready" && state.missing > 0)
    message = state.missing === 1 ? t("paint.wallMissing") : t("paint.wallsMissing", { n: state.missing });
  if (!message) return null;
  return (
    <Banner tone="warning" message={message} testID="canvas-trouble">
      <Button variant="ghost" block={false} label={t("common.retry")} onPress={onRetry} />
    </Banner>
  );
}
