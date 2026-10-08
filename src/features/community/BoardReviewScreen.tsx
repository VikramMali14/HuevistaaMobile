import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { isApiError, messageFor } from "@/api/errors";
import { communityApi, type BoardReviewState } from "@/api/endpoints/community";
import { keys } from "@/api/query-keys";
import { BackButton, Banner, Button, Card, ErrorState, Screen, Skeleton, Text, TextField, useToast } from "@/components/ui";
import { t } from "@/i18n";
import { openWebPage } from "@/lib/open-web";
import { useSubmit } from "@/lib/use-submit";
import { useTheme } from "@/theme";

import { BODY_MAX, cleanBody, cleanName, NAME_MAX, ready, reviewProblems, statusLine, type ReviewProblems } from "./review";
import { StarInput, Stars } from "./Stars";

/**
 * Reviewing the job a colour board was made for — the customer's side of a board's QR
 * (D1), and C26 from the room. Web reference: HueVistaFrontEnd app/r/[token]/board-review-panel.tsx.
 *
 * What the board allows is the server's to say: the owner may write one review, and change
 * it while nothing stops them; anyone else gets the reason. The review is checked here as
 * the server checks it before it goes (every attempt counts against a small allowance per
 * network). An answer that doesn't come, or a "this board has already been reviewed", is
 * looked into: if the review is there now, it was this one.
 */
export function BoardReviewScreen({ token, backFallback }: { token: string; backFallback: Href }) {
  const { space } = useTheme();
  const board = useQuery({ queryKey: keys.boardReview(token), queryFn: () => communityApi.boardReview(token) });
  const [editing, setEditing] = useState(false);

  const s = board.data;
  if (!s) {
    return (
      <Screen scroll contentStyle={{ gap: space.lg }}>
        <BackButton fallback={backFallback} />
        {board.isPending ? (
          <View style={{ gap: space.sm }} testID="review-loading">
            <Text variant="small" tone="mute">
              {t("review.reading")}
            </Text>
            <Skeleton height={28} width="70%" />
            <Skeleton height={160} radius={16} />
          </View>
        ) : (
          <ErrorState message={messageFor(board.error, t("review.readFailed"))} onRetry={() => void board.refetch()} />
        )}
      </Screen>
    );
  }

  if ((s.review && !editing) || (!s.canReview && !s.canEdit)) {
    return <Settled state={s} backFallback={backFallback} onEdit={() => setEditing(true)} />;
  }
  return <ReviewForm key={editing ? "edit" : "new"} token={token} state={s} editing={editing} backFallback={backFallback} onDone={() => setEditing(false)} />;
}

/** Written (thank you, and where it stands), or not this caller's to write (the reason). */
function Settled({ state: s, backFallback, onEdit }: { state: BoardReviewState; backFallback: Href; onEdit: () => void }) {
  const { space } = useTheme();
  const r = s.review;
  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg }}
      footer={
        r ? (
          <View style={{ gap: space.xs }}>
            {s.canEdit ? <Button variant="secondary" label={t("review.change")} onPress={onEdit} testID="review-change" /> : null}
            <Button variant="ghost" label={t("review.seeAll")} onPress={() => void openWebPage("/community")} />
          </View>
        ) : null
      }
    >
      <BackButton fallback={backFallback} />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {t("review.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {r ? t("review.thanks") : t("review.notYours")}
        </Text>
        <Text variant="lead" testID="review-status">
          {r ? statusLine(r.status) : (s.reason ?? t("review.readFailed"))}
        </Text>
      </View>
      {r ? (
        <Card>
          <View style={{ gap: space.sm }} testID="review-quote">
            <Stars rating={r.rating} />
            <Text variant="body" selectable>
              {r.body}
            </Text>
            <Text variant="small" tone="mute">
              {t("review.by", { name: r.displayName })}
            </Text>
          </View>
        </Card>
      ) : null}
      <Notes />
    </Screen>
  );
}

function Notes() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      <Text variant="small" tone="soft">
        {t("review.shopAndPainter")}
      </Text>
      <View style={{ gap: space.xxs }}>
        <Text variant="bodyStrong">{t("review.whoPainted")}</Text>
        <Text variant="small" tone="soft">
          {t("review.whoPaintedBody")}
        </Text>
      </View>
    </View>
  );
}

const NONE: ReviewProblems = { rating: null, body: null, name: null };

function ReviewForm({
  token,
  state: s,
  editing,
  backFallback,
  onDone,
}: {
  token: string;
  state: BoardReviewState;
  editing: boolean;
  backFallback: Href;
  onDone: () => void;
}) {
  const { space } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const sending = useSubmit();
  const from = editing ? s.review : null;
  const [rating, setRating] = useState(from?.rating ?? 0);
  const [body, setBody] = useState(from?.body ?? "");
  const [name, setName] = useState(from?.displayName ?? s.suggestedName ?? "");
  const [shown, setShown] = useState<ReviewProblems>(NONE);
  const [error, setError] = useState<string | null>(null);

  const send = () =>
    void sending.run(async () => {
      setError(null);
      const problems = reviewProblems(rating, body, name);
      setShown(problems);
      if (!ready(problems)) return;
      try {
        const written = await communityApi.submitReview(token, { rating, body: body.trim(), displayName: name.trim() });
        queryClient.setQueryData(keys.boardReview(token), written);
        toast.show(t("review.sent"), "success");
        onDone();
      } catch (err) {
        if (isApiError(err) && err.fieldErrors) {
          setShown({ rating: err.fieldErrors.rating ?? null, body: err.fieldErrors.body ?? null, name: err.fieldErrors.displayName ?? null });
        }
        // No answer, or "already reviewed": it may be this review that got there. Look.
        const unsure = !isApiError(err) || err.kind !== "http" || err.status >= 500 || err.status === 409;
        if (unsure) {
          const now = await board(queryClient, token);
          if (now?.review && (!editing || sameAs(now, rating, body, name))) {
            onDone();
            return;
          }
        }
        setError(isApiError(err) && err.fieldErrors ? null : messageFor(err, t("review.failed")));
      }
    });

  const published = from?.status === "PUBLISHED";
  return (
    <Screen
      scroll
      contentStyle={{ gap: space.lg, paddingBottom: space.xl }}
      footer={
        <View style={{ gap: space.xs }}>
          {error ? <Banner tone="danger" message={error} testID="review-error" /> : null}
          <Button label={editing ? t("review.save") : t("review.send")} onPress={send} loading={sending.busy} testID="review-send" />
          {editing ? <Button variant="ghost" label={t("review.keep")} onPress={onDone} disabled={sending.busy} /> : null}
        </View>
      }
    >
      <BackButton fallback={backFallback} />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {t("review.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {editing ? t("review.editTitle") : t("review.title")}
        </Text>
        <Text variant="lead">
          {editing
            ? published
              ? t("review.editLeadPublished")
              : t("review.editLead")
            : [s.shopName?.trim() ? t("review.withShop", { shop: s.shopName.trim() }) : null, t("review.lead")].filter(Boolean).join(" ")}
        </Text>
        {editing ? null : (
          <Text variant="small" tone="mute">
            {t("review.notYet")}
          </Text>
        )}
      </View>

      <StarInput
        value={rating}
        onChange={(n) => {
          setRating(n);
          setShown((p) => ({ ...p, rating: null }));
        }}
        error={shown.rating}
        disabled={sending.busy}
      />
      <TextField
        label={t("review.body")}
        placeholder={t("review.bodyPlaceholder")}
        value={body}
        onChangeText={(v) => {
          setBody(v);
          setShown((p) => ({ ...p, body: null }));
        }}
        multiline
        maxLength={BODY_MAX}
        numberOfLines={5}
        textAlignVertical="top"
        hint={t("review.bodyHint", { n: body.length })}
        error={shown.body}
        editable={!sending.busy}
        testID="review-body"
      />
      <TextField
        label={t("review.name")}
        placeholder={t("review.namePlaceholder")}
        value={name}
        onChangeText={(v) => {
          setName(v);
          setShown((p) => ({ ...p, name: null }));
        }}
        maxLength={NAME_MAX}
        autoComplete="off"
        autoCapitalize="words"
        hint={t("review.nameHint")}
        error={shown.name}
        editable={!sending.busy}
        testID="review-name"
      />
      <Notes />
    </Screen>
  );
}

/** The board's state read again, into the cache; null when it couldn't be read. */
async function board(queryClient: ReturnType<typeof useQueryClient>, token: string): Promise<BoardReviewState | null> {
  try {
    return await queryClient.fetchQuery({ queryKey: keys.boardReview(token), queryFn: () => communityApi.boardReview(token), staleTime: 0 });
  } catch {
    return null;
  }
}

/** Whether the review the server holds is the one just sent (an edit whose answer was lost). */
function sameAs(s: BoardReviewState, rating: number, body: string, name: string): boolean {
  const r = s.review;
  return Boolean(r && r.rating === rating && r.body === cleanBody(body) && r.displayName === cleanName(name));
}
