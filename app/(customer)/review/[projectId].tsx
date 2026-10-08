import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { communityApi } from "@/api/endpoints/community";
import { keys } from "@/api/query-keys";
import { BackButton, ErrorState, Screen, Skeleton, Text } from "@/components/ui";
import { BoardReviewScreen } from "@/features/community/BoardReviewScreen";
import { t } from "@/i18n";
import { useTheme } from "@/theme";

/**
 * C26 · Review the job. Spec: docs/04-screens-customer.md — C26. Web reference:
 * HueVistaFrontEnd app/(app)/my-projects/[id]/review/page.tsx, which finds the room's
 * board code and opens the board's own page (D1) — here the same review, in place, so
 * Back returns to the room.
 *
 * A room with no board code (none made, or a library room) gets the server's sentence; a
 * room that isn't this account's any more gets ours (the server's names its id).
 */
export default function ReviewJob() {
  const { space } = useTheme();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const back = { pathname: "/board/[projectId]", params: { projectId } } as const;
  const code = useQuery({
    queryKey: keys.reviewBoardFor(projectId),
    queryFn: () => communityApi.boardForProject(projectId),
    enabled: Boolean(projectId),
  });

  if (code.data?.token) return <BoardReviewScreen token={code.data.token} backFallback={back} />;

  const gone = isApiError(code.error) && code.error.status === 404 && /^Project not found/i.test(code.error.message);
  return (
    <Screen scroll contentStyle={{ gap: space.lg }}>
      <BackButton fallback={back} />
      {code.isPending && projectId ? (
        <View style={{ gap: space.sm }} testID="review-loading">
          <Text variant="small" tone="mute">
            {t("review.reading")}
          </Text>
          <Skeleton height={28} width="70%" />
          <Skeleton height={160} radius={16} />
        </View>
      ) : (
        <View style={{ gap: space.xs }} testID="review-unavailable">
          <Text variant="label" tone="accent">
            {t("review.eyebrow")}
          </Text>
          <ErrorState
            message={gone ? t("review.roomGone") : messageFor(code.error, t("review.readFailed"))}
            onRetry={isApiError(code.error) && code.error.kind === "http" && code.error.status < 500 ? undefined : () => void code.refetch()}
          />
        </View>
      )}
    </Screen>
  );
}
