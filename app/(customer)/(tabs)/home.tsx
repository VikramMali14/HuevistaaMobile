import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import {
  Avatar,
  BalanceChip,
  Button,
  Card,
  RemoteImage,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from "@/components/ui";
import { givenName } from "@/features/account/display-name";
import { useBalance } from "@/features/account/use-balance";
import { NextStepCard } from "@/features/home/NextStepCard";
import { LibraryCard } from "@/features/library/LibraryCard";
import { useLibrary } from "@/features/library/use-library";
import { RoomCard } from "@/features/rooms/RoomCard";
import { byRecentActivity, isInProgress } from "@/features/rooms/room-status";
import { useProjects, useRenders } from "@/features/rooms/use-rooms";
import { t } from "@/i18n";
import { istHour } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useTheme } from "@/theme";

function greeting(name: string | null): string {
  const hour = istHour();
  const g = hour < 12 ? t("greeting.morning") : hour < 17 ? t("greeting.afternoon") : t("greeting.evening");
  const first = name?.trim().split(/\s+/)[0];
  return first ? t("greeting.named", { greeting: g, name: first }) : g;
}

/**
 * C1 · Home. Spec: docs/04-screens-customer.md — C1.
 *
 * What this person holds and the one thing to do next, then their rooms, their latest
 * AI image, help nearby and the ready-made rooms. A first visit with nothing yet is the
 * next step alone, filling the screen.
 */
export default function Home() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const { profile } = useSession();
  const balance = useBalance();
  const projects = useProjects();
  const renders = useRenders();
  const library = useLibrary();

  const inProgress = (projects.data ?? []).filter(isInProgress).sort(byRecentActivity);
  const latestImage = (renders.data ?? []).find((r) => r.status === "READY" && r.imageUrl);
  const firstVisit = projects.isSuccess && projects.data.length === 0;

  const pull = usePullToRefresh(() => Promise.all([balance.refetch(), projects.refetch(), renders.refetch(), library.refetch()]));

  return (
    <Screen scroll edges={["top"]} onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.xl }}>
      <View style={[styles.header, { marginTop: space.md }]}>
        <Text variant="title1" accessibilityRole="header" style={styles.greeting}>
          {greeting(givenName(profile))}
        </Text>
        <Pressable
          onPress={() => router.push("/account")}
          accessibilityRole="button"
          accessibilityLabel={t("home.account")}
          hitSlop={8}
        >
          <Avatar name={givenName(profile)} />
        </Pressable>
      </View>

      {balance.loading ? (
        <View style={styles.chips}>
          <Skeleton width={128} height={38} radius={999} />
          <Skeleton width={120} height={38} radius={999} />
        </View>
      ) : balance.loaded ? (
        <View style={styles.chips}>
          <BalanceChip
            icon="home"
            label={balance.rooms === 0 ? t("balance.noRooms") : balance.rooms === 1 ? t("balance.oneRoom") : t("balance.rooms", { n: balance.rooms })}
            onPress={() => router.push("/balance")}
            testID="balance-rooms"
          />
          {balance.credits !== null ? (
            <BalanceChip
              icon="zap"
              label={balance.credits === 1 ? t("balance.oneCredit") : t("balance.credits", { n: balance.credits })}
              onPress={() => router.push("/balance")}
              testID="balance-credits"
            />
          ) : null}
        </View>
      ) : null}

      {balance.loading ? (
        <Skeleton height={190} radius={16} />
      ) : (
        <NextStepCard balance={balance} libraryLive={library.live} hero={firstVisit} />
      )}

      {projects.isPending ? (
        <View style={{ gap: space.sm }}>
          <Skeleton width={180} height={22} />
          <View style={styles.chips}>
            <Skeleton width={220} height={210} radius={16} />
            <Skeleton width={120} height={210} radius={16} />
          </View>
        </View>
      ) : projects.isError && !projects.data ? (
        <View style={styles.failed}>
          <Text variant="small" tone="mute" style={{ flex: 1 }}>
            {t("home.roomsFailed")}
          </Text>
          <Button variant="ghost" block={false} label={t("common.retry")} onPress={() => void projects.refetch()} />
        </View>
      ) : inProgress.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("home.inProgress")} actionLabel={t("home.seeAll")} onAction={() => router.push("/studio")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter }}
            style={{ marginHorizontal: -space.gutter }}
          >
            {inProgress.slice(0, 10).map((room) => (
              <RoomCard key={room.id} room={room} width={220} onPress={() => router.push(`/room/${room.id}`)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {latestImage ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title={t("home.latestImage")} />
          <Card
            onPress={() => router.push({ pathname: "/ai-image/[renderId]", params: { renderId: latestImage.id, projectId: latestImage.projectId } })}
            accessibilityLabel={`${t("home.latestImage")}, ${latestImage.projectName}`}
            style={{ padding: 0, overflow: "hidden" }}
          >
            <RemoteImage url={latestImage.imageUrl} style={styles.image} />
            <View style={{ padding: space.sm }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {latestImage.projectName}
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      <Card onPress={() => router.push("/nearby")} accessibilityLabel={t("home.nearbyTitle")}>
        <View style={styles.nearby}>
          <Feather name="map-pin" size={22} color={colors.accentText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t("home.nearbyTitle")}</Text>
            <Text variant="small" tone="mute">
              {t("home.nearbyBody")}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.fgMute} />
        </View>
      </Card>

      {library.live ? (
        <View style={{ gap: space.sm, marginBottom: space.xl }}>
          <SectionHeader
            title={t("home.readyRooms")}
            lead={t("home.readyRoomsLead")}
            actionLabel={t("home.seeAll")}
            onAction={() => router.push("/library")}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.gutter }}
            style={{ marginHorizontal: -space.gutter }}
          >
            {library.rooms.slice(0, 8).map((room) => (
              <LibraryCard key={room.slug} room={room} width={220} onPress={() => router.push(`/library/${room.slug}`)} />
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={{ height: space.md }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting: { flex: 1 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  image: { width: "100%", aspectRatio: 16 / 10 },
  nearby: { flexDirection: "row", alignItems: "center", gap: 12 },
  failed: { flexDirection: "row", alignItems: "center", gap: 8 },
});
