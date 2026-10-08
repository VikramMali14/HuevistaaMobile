import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { supportApi, type Conversation } from "@/api/endpoints/support";
import { keys } from "@/api/query-keys";
import { BackButton, Banner, Button, EmptyState, ErrorState, Screen, Skeleton, Text, TextField } from "@/components/ui";
import { AskForNotifications } from "@/features/notifications/AskForNotifications";
import { Bubble } from "@/features/support/Bubble";
import { pushReady, subscribePushReady } from "@/features/notifications/notifications";
import { setQuietConversation } from "@/features/notifications/use-push";
import { lookFor, MESSAGE_MAX, POLL_MS, PUSH_POLL_MS, senderName, startedChat } from "@/features/support/support";
import { t } from "@/i18n";
import { useAlive } from "@/lib/use-alive";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

const gone = (err: unknown) => isApiError(err) && err.kind === "http" && err.status === 404;

/**
 * S7 · Support conversation. Spec: docs/06-screens-shared.md — S7. Web reference: the
 * website's support widget (components/support/support-widget.tsx).
 *
 * The chat in the server's order (a question and its answer can share a time, so it is
 * never sorted again here), read again every 5 s while it's open and on screen — and not
 * while a message is going, so a late read can't wipe out the answer. A message waits up
 * to two minutes for the assistant, which answers inside the reply. One that gets no
 * answer is looked for in the chat until it shows or can't land any more, before
 * anything is said; it is never sent twice by itself. A new reply from the assistant or
 * the team is read out by a screen reader. A closed chat isn't reopened: writing below it
 * starts a new one, as the server's own note says.
 */
export default function SupportChat() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space } = useTheme();
  const { conversationId: id = "" } = useLocalSearchParams<{ conversationId: string }>();
  const sendingNow = useRef(false);
  const scroller = useRef<ScrollView>(null);
  // Under another screen (a link opened from a chat app) it stays mounted: not read then.
  const focused = useIsFocused();
  const alive = useAlive();
  // With notifications on, a reply arrives by itself; reading again is only a fallback.
  const pushOn = useSyncExternalStore(subscribePushReady, pushReady, pushReady);
  // A reply to this chat, while it's on screen, appears in it — not as a banner over it.
  useEffect(() => {
    if (!focused || !id) return;
    setQuietConversation(id);
    return () => setQuietConversation(null);
  }, [focused, id]);
  const chat = useQuery({
    queryKey: keys.supportConversation(id),
    queryFn: () => supportApi.conversation(id),
    enabled: Boolean(id),
    retry: (failures, err) => !gone(err) && failures < 2,
    refetchInterval: (q) =>
      !focused || sendingNow.current || gone(q.state.error) || q.state.data?.status === "RESOLVED" ? false : pushOn ? PUSH_POLL_MS : POLL_MS,
  });
  const sending = useSubmit();
  const asking = useSubmit();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const c = chat.data;
  // A reply that arrives after the first read is announced, as a sighted person sees it appear.
  const lastSeen = useRef<string | null>(null);
  const last = c?.messages[c.messages.length - 1];
  useEffect(() => {
    if (!last) return;
    if (lastSeen.current && lastSeen.current !== last.id && (last.sender === "AI" || last.sender === "AGENT")) {
      AccessibilityInfo.announceForAccessibility(`${senderName(last.sender)}: ${last.body}`);
    }
    lastSeen.current = last.id;
  }, [last]);
  const resolved = c?.status === "RESOLVED";
  const waitingForTeam = c?.status === "NEEDS_HUMAN";

  const settle = (next: Conversation) => {
    queryClient.setQueryData(keys.supportConversation(next.id), next);
    void queryClient.invalidateQueries({ queryKey: keys.supportList, exact: true });
  };

  const send = () =>
    void sending.run(async () => {
      const text = draft.trim();
      setError(null);
      if (!text) return setError(t("help.empty"));
      if (text.length > MESSAGE_MAX) return setError(t("help.tooLong"));
      if (!c) return;
      const before = c.messages.filter((m) => m.sender === "USER").length;
      const askedAt = Date.now();
      const listed = queryClient.getQueryData<{ id: string }[]>(keys.supportList);
      const known = listed ? new Set(listed.map((x) => x.id)) : null;
      sendingNow.current = true;
      await queryClient.cancelQueries({ queryKey: keys.supportConversation(id), exact: true });
      setPending(text);
      setDraft("");
      try {
        if (resolved) {
          // A closed chat is followed by a new one, never reopened.
          const fresh = await supportApi.start(text);
          settle(fresh);
          router.replace({ pathname: "/help/[conversationId]", params: { conversationId: fresh.id } });
        } else {
          settle(await supportApi.send(id, text));
        }
      } catch (err) {
        if (isApiError(err) && err.kind === "http" && err.status < 500) {
          setDraft(text);
          setError(messageFor(err, t("help.sendFailed")));
        } else {
          await reconcile(text, before, askedAt, known);
        }
      } finally {
        sendingNow.current = false;
        setPending(null);
      }
    });

  /**
   * No answer: did it get there? Look in the chat (or, for a new one, the list) until it
   * shows or can't land any more — the message is invisible while it's being answered.
   */
  const reconcile = async (text: string, before: number, askedAt: number, known: ReadonlySet<string> | null) => {
    setChecking(true);
    const looked = resolved
      ? await lookFor(
          async () => startedChat(await queryClient.fetchQuery({ queryKey: keys.supportList, queryFn: supportApi.conversations, staleTime: 0 }), text, known, askedAt),
          askedAt,
          { alive: () => alive.current },
        )
      : await lookFor(
          async () => {
            const now = await supportApi.conversation(id);
            const mine = now.messages.filter((m) => m.sender === "USER");
            if (mine.length > before && mine[mine.length - 1]?.body.trim() === text) return now;
            return null;
          },
          askedAt,
          { alive: () => alive.current },
        );
    setChecking(false);
    if (looked.found) {
      if (resolved) return router.replace({ pathname: "/help/[conversationId]", params: { conversationId: looked.found.id } });
      return settle(looked.found as Conversation);
    }
    setDraft(text);
    setError(looked.sure ? t("help.unanswered") : t("help.unansweredUnknown"));
  };

  const toPerson = () =>
    void asking.run(async () => {
      setError(null);
      try {
        settle(await supportApi.requestHuman(id));
      } catch (err) {
        setError(messageFor(err, t("help.sendFailed")));
      }
    });

  if (!c) {
    return (
      <Screen scroll contentStyle={{ gap: space.lg }}>
        <BackButton fallback="/help" />
        {chat.isPending && id ? (
          <View style={{ gap: space.sm }} testID="chat-loading">
            <Skeleton height={28} width="60%" />
            <Skeleton height={64} radius={16} />
            <Skeleton height={64} radius={16} />
          </View>
        ) : gone(chat.error) || !id ? (
          <EmptyState icon="message-circle" title={t("help.notFound")} actionLabel={t("help.allConversations")} onAction={() => router.replace("/help")} />
        ) : (
          <ErrorState error={chat.error} onRetry={() => void chat.refetch()} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          {checking ? (
            <Text variant="small" tone="mute" accessibilityLiveRegion="polite" testID="chat-checking">
              {t("help.checking")}
            </Text>
          ) : null}
          {error ? <Banner tone="danger" message={error} testID="chat-error" /> : null}
          <View style={[styles.row, { gap: space.xs }]}>
            <View style={styles.fill}>
              <TextField
                label={t("help.message")}
                placeholder={t("help.placeholder")}
                value={draft}
                onChangeText={(v) => {
                  setDraft(v);
                  setError(null);
                }}
                multiline
                maxLength={MESSAGE_MAX}
                editable={!sending.busy}
                hint={draft.length > MESSAGE_MAX - 400 ? t("help.counter", { n: draft.length }) : undefined}
                testID="chat-input"
              />
            </View>
            <View style={styles.sendWrap}>
              <Button block={false} icon="send" label={t("help.send")} onPress={send} loading={sending.busy} disabled={!draft.trim()} testID="chat-send" />
            </View>
          </View>
          {!resolved && !waitingForTeam ? (
            <Button variant="ghost" label={t("help.talkToPerson")} onPress={toPerson} loading={asking.busy} disabled={sending.busy} testID="chat-person" />
          ) : null}
        </View>
      }
    >
      <BackButton fallback="/help" />
      <View style={{ gap: space.xxs, marginBottom: space.sm }}>
        <Text variant="title2" accessibilityRole="header" numberOfLines={2}>
          {c.subject || t("help.title")}
        </Text>
        <Text variant="small" tone={waitingForTeam ? "accent" : "mute"} testID="chat-status">
          {resolved ? t("help.headerResolved") : waitingForTeam ? t("help.headerTeam") : t("help.headerAssistant")}
        </Text>
      </View>
      <ScrollView
        ref={scroller}
        style={styles.fill}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        testID="chat-messages"
      >
        {c.messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {pending ? (
          <>
            <Bubble message={{ sender: "USER", body: pending }} pending />
            {waitingForTeam ? null : <Bubble message={{ sender: "AI", body: t("help.typing") }} pending />}
          </>
        ) : null}
      </ScrollView>
      <AskForNotifications reason="support" when={waitingForTeam} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end" },
  fill: { flex: 1 },
  sendWrap: { paddingBottom: 0 },
});
