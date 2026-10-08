import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { communityApi, type MyQuestions, type OwnQuestion, type PublicQuestion } from "@/api/endpoints/community";
import { keys } from "@/api/query-keys";
import { useSession } from "@/auth/session";
import { BackButton, Banner, Button, Card, ErrorState, Pill, Screen, Skeleton, Text, TextField, useToast } from "@/components/ui";
import { flatten, NAME_MAX, QUESTION_MAX, questionProblems } from "@/features/community/questions";
import { cleanBody } from "@/features/community/review";
import { t, type MessageKey } from "@/i18n";
import { formatServerMonth } from "@/lib/dates";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

const PAGE_SIZE = 20;

/**
 * S8 · Questions and answers. Spec: docs/06-screens-shared.md — S8. Web reference:
 * HueVistaFrontEnd app/community/questions/ and components/community/ask-question.tsx.
 *
 * Answered questions from everyone, newest answer first, read a page at a time; ask your
 * own (checked as the server checks it, and kept as typed until it's sent); and your own
 * questions with where each stands — the answer shown only once it's published. A send
 * whose answer never came is looked for among your questions before anything is said.
 */
export default function Questions() {
  const { space } = useTheme();
  const { profile } = useSession();
  const answered = useInfiniteQuery({
    queryKey: keys.questions,
    queryFn: ({ pageParam }) => communityApi.questions(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const mine = useQuery({ queryKey: keys.myQuestions, queryFn: communityApi.myQuestions, retry: 1 });
  const pull = usePullToRefresh(() => Promise.all([answered.refetch(), mine.refetch()]));
  const items = flatten(answered.data?.pages);
  const total = answered.data?.pages[0]?.total ?? 0;
  const back = profile?.role === "PAINTER" ? "/painter/profile" : "/account";

  const header = (
    <View style={{ gap: space.lg, paddingTop: space.md, paddingBottom: space.md }}>
      <BackButton fallback={back} />
      <View style={{ gap: space.xs }}>
        <Text variant="title1" accessibilityRole="header">
          {t("questions.title")}
        </Text>
        <Text variant="lead">{t("questions.lead")}</Text>
      </View>
      <Ask suggestedName={mine.data?.suggestedName ?? ""} />
      {mine.data?.questions.length ? <Mine questions={mine.data.questions} /> : null}
      {answered.data ? (
        <Text variant="label" tone="mute">
          {total === 1 ? t("questions.answeredOne") : t("questions.answeredN", { n: total })}
        </Text>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (answered.isPending) {
    empty = (
      <View style={{ gap: space.sm }} testID="questions-loading">
        <Skeleton height={120} radius={16} />
        <Skeleton height={120} radius={16} />
      </View>
    );
  } else if (answered.isError && !answered.data) {
    empty = <ErrorState message={messageFor(answered.error, t("questions.loadFailed"))} onRetry={() => void answered.refetch()} />;
  } else if (!items.length) {
    empty = (
      <Text variant="body" tone="soft" testID="questions-none">
        {t("questions.none")}
      </Text>
    );
  }

  return (
    <Screen padded={false}>
      <FlashList
        data={items}
        renderItem={({ item }) => <AnsweredQuestion q={item} />}
        keyExtractor={(q) => q.id}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          answered.isFetchingNextPage ? (
            <View style={{ paddingTop: space.sm }}>
              <Skeleton height={100} radius={16} />
            </View>
          ) : answered.isFetchNextPageError ? (
            <View style={{ paddingTop: space.sm }}>
              <Button variant="ghost" label={t("common.retry")} onPress={() => void answered.fetchNextPage()} />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (answered.hasNextPage && !answered.isFetchingNextPage && !answered.isFetchNextPageError) void answered.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}
        onRefresh={pull.onRefresh}
        refreshing={pull.refreshing}
      />
    </Screen>
  );
}

function AnsweredQuestion({ q }: { q: PublicQuestion }) {
  const { space } = useTheme();
  const when = formatServerMonth(q.askedAt);
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <View style={{ gap: space.xxs }} accessible accessibilityLabel={`${t("questions.q")}: ${q.question}`}>
          <Text variant="label" tone="accent">
            {t("questions.q")}
          </Text>
          <Text variant="bodyStrong">{q.question}</Text>
          <Text variant="caption" tone="mute">
            {when ? t("questions.asked", { name: q.displayName, when }) : q.displayName}
          </Text>
        </View>
        <View style={{ gap: space.xxs }} accessible accessibilityLabel={`${t("questions.a")}: ${q.answer}`}>
          <Text variant="label" tone="mute">
            {t("questions.a")}
          </Text>
          <Text variant="body" selectable>
            {q.answer}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** The account's own questions, newest first, each with where it stands. */
function Mine({ questions }: { questions: OwnQuestion[] }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.sm }} testID="questions-mine">
      <Text variant="title3" accessibilityRole="header">
        {t("questions.mine")}
      </Text>
      {questions.map((q) => {
        const status = q.status === "PUBLISHED" || q.status === "REJECTED" ? q.status : "PENDING";
        return (
          <Card key={q.id}>
            <View style={{ gap: space.xs }}>
              <Text variant="body">{q.question}</Text>
              <View style={styles.row}>
                <Pill label={t(`questions.status.${status}` as MessageKey)} tone={status === "PUBLISHED" ? "success" : status === "REJECTED" ? "plain" : "warning"} />
              </View>
              {status === "PUBLISHED" && q.answer ? (
                <Text variant="small" tone="soft" selectable>
                  {q.answer}
                </Text>
              ) : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

/** Asking: a button until it's wanted, then the question and the name to show. */
function Ask({ suggestedName }: { suggestedName: string }) {
  const { space } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const sending = useSubmit();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ body: string | null; name: string | null }>({ body: null, name: null });
  const [error, setError] = useState<string | null>(null);
  const shownName = name ?? suggestedName;

  const send = () =>
    void sending.run(async () => {
      setError(null);
      const found = questionProblems(body, shownName);
      setProblems(found);
      if (found.body || found.name) return;
      const text = body.trim();
      try {
        const asked = await communityApi.ask(text, shownName.trim());
        add(asked);
        done();
      } catch (err) {
        if (isApiError(err) && err.fieldErrors) {
          setProblems({ body: err.fieldErrors.body ?? null, name: err.fieldErrors.displayName ?? null });
          return;
        }
        if (isApiError(err) && err.kind === "http" && err.status < 500) return setError(messageFor(err, t("questions.failed")));
        // No answer: it may have been asked. Look among the account's questions first.
        try {
          const now = await queryClient.fetchQuery({ queryKey: keys.myQuestions, queryFn: communityApi.myQuestions, staleTime: 0 });
          if (now.questions.some((q) => q.status === "PENDING" && q.question === cleanBody(text))) return done();
        } catch {
          // Said below.
        }
        setError(t("questions.failed"));
      }
    });

  const add = (q: OwnQuestion) =>
    queryClient.setQueryData<MyQuestions>(keys.myQuestions, (was) => ({ suggestedName: was?.suggestedName ?? suggestedName, questions: [q, ...(was?.questions ?? []).filter((x) => x.id !== q.id)] }));

  const done = () => {
    setBody("");
    setOpen(false);
    toast.show(t("questions.sent"), "success");
  };

  if (!open) {
    return <Button variant="secondary" icon="message-circle" label={t("questions.askOpen")} onPress={() => setOpen(true)} testID="questions-open" />;
  }
  return (
    <Card>
      <View style={{ gap: space.sm }} testID="questions-form">
        <Text variant="title3" accessibilityRole="header">
          {t("questions.ask")}
        </Text>
        <TextField
          label={t("questions.question")}
          placeholder={t("questions.questionPlaceholder")}
          value={body}
          onChangeText={(v) => {
            setBody(v);
            setProblems((p) => ({ ...p, body: null }));
          }}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={QUESTION_MAX}
          hint={t("questions.questionHint", { n: body.length })}
          error={problems.body}
          editable={!sending.busy}
          testID="questions-body"
        />
        <TextField
          label={t("questions.name")}
          placeholder={t("questions.namePlaceholder")}
          value={shownName}
          onChangeText={(v) => {
            setName(v);
            setProblems((p) => ({ ...p, name: null }));
          }}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoCapitalize="words"
          error={problems.name}
          editable={!sending.busy}
          testID="questions-name"
        />
        {error ? <Banner tone="danger" message={error} testID="questions-error" /> : null}
        <Button icon="send" label={t("questions.send")} onPress={send} loading={sending.busy} testID="questions-send" />
        <Button variant="ghost" label={t("questions.cancel")} onPress={() => setOpen(false)} disabled={sending.busy} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
});
