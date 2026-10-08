import Feather from "@expo/vector-icons/Feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { supportApi } from "@/api/endpoints/support";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, Card, ErrorState, ListGroup, ListRow, Screen, SectionHeader, Skeleton, Text, TextField } from "@/components/ui";
import { MESSAGE_MAX, ongoing, startedChat, statusLabel } from "@/features/support/support";
import { t, type MessageKey } from "@/i18n";
import { formatServerDateTime } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

/** HueVistaa's own numbers, as on the website's contact page. */
const CONTACT = { phone: "+91 63784 82381", phoneE164: "+916378482381", email: "support@huevistaa.com" } as const;

const CUSTOMER_FAQ = ["rooms", "boards", "payments", "photos"] as const;
const PAINTER_FAQ = ["points", "boards", "photos"] as const;

/**
 * S6 · Help and support. Spec: docs/06-screens-shared.md — S6. Web reference: the website's
 * support widget (components/support/support-widget.tsx) and contact page.
 *
 * Ask for help (the assistant answers in the reply, so the chat opens with its answer), a
 * chat still going offered first so one problem stays in one place, every past
 * conversation, a few common answers, and the team's number and email. Any signed-in
 * account. A start whose answer never came is looked for before anything is said: the
 * message isn't sent twice by itself (each one is a paid answer).
 */
export default function Help() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space, colors } = useTheme();
  const { profile } = useSession();
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const list = useQuery({ queryKey: keys.supportList, queryFn: supportApi.conversations });
  const pull = usePullToRefresh(() => list.refetch());
  const starting = useSubmit();
  const [message, setMessage] = useState(typeof draft === "string" ? draft : "");
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const painter = profile?.role === "PAINTER";
  const back: Href = painter ? "/painter/profile" : "/account";
  const going = ongoing(list.data);

  const start = () =>
    void starting.run(async () => {
      const text = message.trim();
      setError(null);
      if (!text) return setError(t("help.empty"));
      if (text.length > MESSAGE_MAX) return setError(t("help.tooLong"));
      const askedAt = Date.now();
      try {
        const chat = await supportApi.start(text);
        queryClient.setQueryData(keys.supportConversation(chat.id), chat);
        void queryClient.invalidateQueries({ queryKey: keys.supportList });
        setMessage("");
        router.push({ pathname: "/help/[conversationId]", params: { conversationId: chat.id } });
      } catch (err) {
        if (isApiError(err) && err.kind === "http" && err.status < 500) return setError(messageFor(err, t("help.sendFailed")));
        // No answer: it may have started anyway. Look before saying anything.
        try {
          const now = await queryClient.fetchQuery({ queryKey: keys.supportList, queryFn: supportApi.conversations, staleTime: 0 });
          const made = startedChat(now, text, askedAt);
          if (made) {
            setMessage("");
            router.push({ pathname: "/help/[conversationId]", params: { conversationId: made.id } });
            return;
          }
          setError(t("help.unanswered"));
        } catch {
          setError(t("help.unansweredUnknown"));
        }
      }
    });

  const faq = (painter ? PAINTER_FAQ : CUSTOMER_FAQ).map((k) => ({ key: k, q: t(`help.faq.${k}Q` as MessageKey), a: t(`help.faq.${k}A` as MessageKey) }));

  return (
    <Screen scroll onRefresh={pull.onRefresh} refreshing={pull.refreshing} contentStyle={{ gap: space.lg, paddingBottom: space.xl }}>
      <BackButton fallback={back} />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("help.title")}
        </Text>
        <Text variant="lead">{t("help.lead")}</Text>
      </View>

      {going ? (
        <Card lit onPress={() => router.push({ pathname: "/help/[conversationId]", params: { conversationId: going.id } })} accessibilityLabel={t("help.continueTitle")}>
          <View style={[styles.row, { gap: space.sm }]} testID="help-ongoing">
            <Feather name="message-circle" size={22} color={colors.accentText} />
            <View style={[styles.fill, { gap: 2 }]}>
              <Text variant="bodyStrong">{t("help.continueTitle")}</Text>
              <Text variant="small" tone="mute" numberOfLines={2}>
                {going.lastMessage || going.subject || ""}
              </Text>
            </View>
            <Text variant="small" tone="accent">
              {t("help.continueAction")}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: space.sm }}>
          <TextField
            label={t("help.askLabel")}
            placeholder={t("help.askPlaceholder")}
            value={message}
            onChangeText={(v) => {
              setMessage(v);
              setError(null);
            }}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={MESSAGE_MAX}
            editable={!starting.busy}
            testID="help-message"
          />
          {error ? <Banner tone="danger" message={error} testID="help-error" /> : null}
          <Button icon="send" label={t("help.ask")} onPress={start} loading={starting.busy} testID="help-ask" />
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <SectionHeader title={t("help.past")} />
        {list.isPending ? (
          <Skeleton height={64} radius={16} />
        ) : list.isError && !list.data ? (
          <ErrorState message={messageFor(list.error, t("help.loadFailed"))} onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <Text variant="small" tone="mute">
            {t("help.none")}
          </Text>
        ) : (
          <ListGroup>
            {list.data.map((c) => (
              <ListRow
                key={c.id}
                title={c.subject || t("help.title")}
                detail={`${formatServerDateTime(c.updatedAt)} · ${c.lastMessage}`.slice(0, 140)}
                value={statusLabel(c.status)}
                onPress={() => router.push({ pathname: "/help/[conversationId]", params: { conversationId: c.id } })}
                testID={`help-chat-${c.id}`}
              />
            ))}
          </ListGroup>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionHeader title={t("help.answers")} />
        <Card>
          <View style={{ gap: space.xs }}>
            {faq.map((f) => {
              const open = openFaq === f.key;
              return (
                <View key={f.key} style={{ gap: space.xs }}>
                  <Pressable
                    onPress={() => setOpenFaq(open ? null : f.key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={[styles.row, styles.faq, { gap: space.sm }]}
                    testID={`faq-${f.key}`}
                  >
                    <Text variant="bodyStrong" style={styles.fill}>
                      {f.q}
                    </Text>
                    <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.fgMute} />
                  </Pressable>
                  {open ? (
                    <Text variant="body" tone="soft">
                      {f.a}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionHeader title={t("help.contactTitle")} />
        <ListGroup>
          <ListRow icon="phone" title={t("help.call")} detail={`${CONTACT.phone} · ${t("help.callHours")}`} onPress={() => void Linking.openURL(`tel:${CONTACT.phoneE164}`).catch(() => {})} />
          <ListRow icon="mail" title={t("help.email")} detail={CONTACT.email} onPress={() => void Linking.openURL(`mailto:${CONTACT.email}`).catch(() => {})} />
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  fill: { flex: 1 },
  faq: { minHeight: 44 },
});
