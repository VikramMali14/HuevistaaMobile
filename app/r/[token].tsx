import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { View } from "react-native";

import { rememberRoute } from "@/auth/pending-route";
import { homeFor } from "@/auth/routing";
import { useSession } from "@/auth/session";
import { BackButton, Button, EmptyState, Screen, Text } from "@/components/ui";
import { BoardReviewScreen } from "@/features/community/BoardReviewScreen";
import { rewardTokenFrom } from "@/features/painter/reward-token";
import { t } from "@/i18n";
import { openWebPage } from "@/lib/open-web";
import { useTheme } from "@/theme";

/**
 * D1 · A board's QR. Spec: docs/06-screens-shared.md — D1. Web reference:
 * HueVistaFrontEnd app/r/[token]/page.tsx.
 *
 * One code on a colour board, three people: the customer reviews the job, the painter
 * claims their points (P6), the shop collects its half on the website. Outside the guards,
 * so it says for itself who is here: nothing while the session is still being read (never
 * a flash of "Sign in" for someone signed in), a way to try again when it can't be read,
 * and sign-in that comes straight back here. The code is never shown or logged.
 */
export default function BoardLink() {
  const router = useRouter();
  const { space, colors } = useTheme();
  const { state, retry } = useSession();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = rewardTokenFrom(typeof raw === "string" ? raw : "");
  const home = (state.status === "signedIn" ? homeFor(state.profile) : "/welcome") as Href;

  if (!token) {
    return (
      <Screen>
        <BackButton fallback={home} />
        <EmptyState icon="slash" title={t("boardLink.badLink")} actionLabel={t("boardLink.home")} onAction={() => router.replace(home)} />
      </Screen>
    );
  }

  if (state.status === "loading") return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (state.status === "signedIn") {
    const role = state.profile.role;
    if (role === "PAINTER") return <Redirect href={{ pathname: "/painter/claim/[token]", params: { token } }} />;
    if (role === "CUSTOMER") return <BoardReviewScreen token={token} backFallback={home} />;
    // A shop (and anyone else): the website is where a shop collects its half.
    return (
      <Screen footer={<Button label={t("boardLink.openWebsite")} icon="external-link" onPress={() => void openWebPage(`/r/${encodeURIComponent(token)}`)} testID="board-link-web" />}>
        <BackButton fallback={home} />
        <Message eyebrow={t("boardLink.eyebrow")} title={t("boardLink.shopTitle")} body={t("boardLink.shopBody")} />
      </Screen>
    );
  }

  const offline = state.status === "unreachable";
  return (
    <Screen
      footer={
        <Button
          label={offline ? t("common.retry") : t("boardLink.signIn")}
          onPress={() => {
            if (offline) return retry();
            // Asked for in so many words: remembered even after a sign-out by choice.
            rememberRoute(`/r/${encodeURIComponent(token)}`);
            router.replace("/welcome");
          }}
          testID="board-link-go"
        />
      }
    >
      <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
        <Message
          eyebrow={t("boardLink.eyebrow")}
          title={offline ? t("boardLink.offlineTitle") : t("boardLink.signInTitle")}
          body={offline ? t("boardLink.offlineBody") : t("boardLink.signInBody")}
        />
      </View>
    </Screen>
  );
}

function Message({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="accent">
        {eyebrow}
      </Text>
      <Text variant="title1" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="lead">{body}</Text>
    </View>
  );
}
