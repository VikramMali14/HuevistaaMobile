import Feather from "@expo/vector-icons/Feather";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { projectsApi } from "@/api/endpoints/projects";
import { isApiError } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { ColourCombo, KeptColours, ShadeBook, ShadeBookPage } from "@/api/types";
import { BackButton, Banner, Button, Card, Chip, Disclaimer, ErrorState, Segmented, Skeleton, Text, useToast } from "@/components/ui";
import { namesShown, useCatalogue, useShadeScheme } from "@/features/catalogue/use-catalogue";
import { usePassPurchase } from "@/features/payments/use-pass-purchase";
import { passEnds } from "@/features/shade-book/book";
import { BuyButton, PassNoticeBanner } from "@/features/shade-book/components";
import { shadeBookPass } from "@/features/shade-book/pass";
import { useShadeBook } from "@/features/shade-book/use-shade-book";
import { applyColours, pushRecent, useRoomPaint, type WallColour } from "@/features/studio/paint-store";
import { comboColours, pageColours, scopeOf, type SuggestedColour } from "@/features/studio/suggested-swatches";
import { useRoom, wallsWithMasks } from "@/features/studio/use-room";
import { planWalls, wallLabel, wallsForTrio } from "@/features/studio/wall-plan";
import { plural, t, type MessageKey } from "@/i18n";
import { hairline, useTheme } from "@/theme";

type Tab = "ai" | "book";

const ROLES: MessageKey[] = ["suggest.main", "suggest.accent", "suggest.trim"];

/** A kept colour, with the name it was shown under when it was kept. */
type KeptColour = SuggestedColour & { name?: string | null };

/** Nothing kept: one empty place per role — main, accent, trim. */
const NONE_KEPT: readonly (KeptColour | null)[] = [null, null, null];

/** What a colour is known by, for telling two apart: its code, or its hex without one. */
const colourKey = (c: SuggestedColour | null | undefined) => (c ? (c.code ?? c.hex).toUpperCase() : "");

/** Shade Book combinations shown at a time; "Show more" adds the next ones. */
const STEP = 12;

/**
 * C13 · Colour combinations. Spec: docs/04-screens-customer.md — C13.
 *
 * Two tabs, as in the website's studio (shade-grid.tsx):
 *
 * - **Vista AI** — three named palettes for this room, each colour a real shade, with a sentence
 *   on why. Try this puts the main colour on the main wall, the accent on the accent wall and
 *   the trim on the trim, and saves. Suggest again asks for another set; a lock on a colour
 *   keeps it on its wall while the rest are suggested around it. Free and instant.
 * - **Vista Shadebook** — the Shade Book's combinations, offered on this room, and nothing the
 *   studio suggests itself. Every page with the pass, the free samples without it — and the pass
 *   is sold right here: the Shade Book's own, at its price, so one purchase opens the book in
 *   both places.
 *
 * The locks and the round are held here rather than in the tab, so a look at the Shade Book and
 * back keeps them.
 */
export default function Suggestions() {
  const insets = useSafeAreaInsets();
  const { colors, space } = useTheme();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("ai");
  const [round, setRound] = useState(0);
  // The colour kept in each role, or null. A lock is on a ROLE because that is how the
  // palettes come back, and each role has its own wall.
  const [kept, setKept] = useState<readonly (KeptColour | null)[]>(NONE_KEPT);

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <BackButton fallback="/studio" />
        <View style={{ gap: space.sm }}>
          <Text variant="title1" accessibilityRole="header">
            {t("suggest.title")}
          </Text>
          <Segmented
            compact
            accessibilityLabel={t("suggest.tabsLabel")}
            options={[
              { value: "ai", label: t("suggest.tabAi") },
              { value: "book", label: t("suggest.tabBook") },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === "ai" ? (
          <VistaAi projectId={projectId} round={round} setRound={setRound} kept={kept} setKept={setKept} />
        ) : (
          <VistaShadebook projectId={projectId} />
        )}

        <Disclaimer kind="shades" />
      </ScrollView>
    </View>
  );
}

/** Vista AI: the palettes asked of the server for this room, with locks and Suggest again. */
function VistaAi({
  projectId,
  round,
  setRound,
  kept,
  setKept,
}: {
  projectId: string;
  round: number;
  setRound: Dispatch<SetStateAction<number>>;
  kept: readonly (KeptColour | null)[];
  setKept: Dispatch<SetStateAction<readonly (KeptColour | null)[]>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const room = useRoom(projectId);
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const keeping = kept.some(Boolean);
  const keptBody = (): KeptColours => {
    const one = (c: SuggestedColour | null | undefined) => (c ? { hex: c.hex, code: c.code } : null);
    return { primary: one(kept[0]), accent: one(kept[1]), trim: one(kept[2]) };
  };
  const suggestions = useQuery({
    queryKey: keys.suggestions(projectId, round, keeping ? kept.map(colourKey).join("|") : undefined),
    queryFn: () =>
      keeping ? projectsApi.suggestions(projectId, round, keptBody()) : projectsApi.suggestions(projectId, round),
    enabled: Boolean(projectId),
    staleTime: Infinity,
    // The palettes on screen stay while the next set comes: a lock pressed on one of
    // them must not blank the screen under the finger that pressed it.
    placeholderData: keepPreviousData,
  });

  const walls = room.data ? planWalls(wallsWithMasks(room.data)) : [];
  // The walls each role's colour goes on — worked out once, from the wall selected in the
  // studio, so the label on a swatch, the wall its lock keeps it on and the wall Try this
  // paints are always the same wall (website shade-grid.tsx, `slotsForRoles`).
  const selected = useRoomPaint(projectId).selected;
  const targets = wallsForTrio(walls, selected ? Number(selected) : null);
  // From two walls up: with one, keeping its colour leaves nothing to suggest.
  const canKeep = targets.filter(Boolean).length >= 2;
  const keptWalls = targets.filter((wall, slot) => wall && kept[slot]);
  const allKept = keeping && targets.every((wall, slot) => !wall || kept[slot]);

  // A kept colour goes in its role whatever came back: a server that knows about locks
  // already put it there, and one that does not still shows the colour that was kept.
  const trioOf = (combo: ColourCombo) =>
    comboColours(combo, catalogue.data?.shades, scheme).map((colour, slot) => kept[slot] ?? colour);

  const toggleKeep = (slot: number, colour: KeptColour) => {
    setKept((prev) => prev.map((k, i) => (i !== slot ? k : colourKey(k) === colourKey(colour) ? null : colour)));
    // The first set around a new lock is the best answer for it.
    setRound(0);
  };
  const unlockAll = () => {
    setKept(NONE_KEPT);
    setRound(0);
  };

  const apply = (combo: ColourCombo) => {
    const changes: Record<string, WallColour> = {};
    trioOf(combo).forEach((colour, i) => {
      const wall = targets[i];
      if (!wall) return;
      changes[String(wall.id)] = { hex: colour.hex, code: colour.code, lrv: colour.lrv };
      if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug: colour.brandSlug });
    });
    if (Object.keys(changes).length === 0) return;
    applyColours(projectId, changes);
    toast.show(t("suggest.applied"), "success");
    if (router.canGoBack()) router.back();
  };

  const closed = suggestions.isError && isApiError(suggestions.error) && suggestions.error.status === 402;
  // The last set, still on screen while the next one comes (or while the phone is offline
  // and it cannot). Shown faded and not offered for Try this: it was not built around
  // what is kept now, so painting the room with it would be painting the wrong answer.
  const stale = suggestions.isPlaceholderData;
  const combos = (suggestions.data?.combinations ?? []).filter((c) => c.primaryHex || c.primaryShade);

  return (
    <>
      <Text variant="lead">{t("suggest.aiLead")}</Text>

      {canKeep && !closed ? (
        keeping ? (
          <View
            testID="suggest-keeping"
            style={[styles.keeping, { gap: space.xxs, padding: space.sm, borderRadius: radius.md, borderColor: colors.accent, backgroundColor: colors.surface }]}
          >
            <View style={[styles.keepingHead, { gap: space.xs }]}>
              <Feather name="lock" size={14} color={colors.accentText} />
              <Text variant="bodyStrong" tone="accent" style={styles.fill}>
                {plural(keptWalls.length, "suggest.keepingOne", "suggest.keepingN")}
              </Text>
              <Button variant="ghost" block={false} label={t("suggest.unlockAll")} onPress={unlockAll} />
            </View>
            <Text variant="small" tone="soft">
              {allKept
                ? t("suggest.keepingAll")
                : t("suggest.keepingHint", { walls: keptWalls.map((w) => wallLabel(w!)).join(", ") })}
            </Text>
          </View>
        ) : (
          <Text variant="small" tone="mute">
            {t("suggest.keepTip")}
          </Text>
        )
      ) : null}

      {suggestions.isPending ? (
        <View style={{ gap: space.md }} testID="suggest-loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={150} radius={radius.md} />
          ))}
        </View>
      ) : closed ? (
        <Banner tone="info" message={t("suggest.closed")} />
      ) : suggestions.isError ? (
        <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
      ) : (
        combos.map((combo, i) => {
          const trio = trioOf(combo);
          return (
            <Card key={`${i}-${combo.name}`} style={stale ? styles.stale : undefined}>
              <Text variant="title3">{combo.name}</Text>
              {combo.rationale ? (
                <Text variant="body" tone="soft">
                  {combo.rationale}
                </Text>
              ) : null}
              <View style={[styles.row, { gap: space.xs }]}>
                {trio.map((c, slot) => {
                  const matched = [combo.primaryShade, combo.accentShade, combo.trimShade][slot];
                  const keptHere = kept[slot];
                  // A kept colour is named as it was when it was kept, not after the shade
                  // this palette had in its place.
                  const name = keptHere ? keptHere.name : namesShown(scheme) ? matched?.name?.trim() : null;
                  const wall = targets[slot];
                  const isKept = Boolean(keptHere);
                  const where = wall ? wallLabel(wall) : t(ROLES[slot]!);
                  const colour = name || c.code || c.hex;
                  return (
                    <View key={slot} style={[styles.slot, { gap: 4, opacity: wall ? 1 : 0.45 }]}>
                      <View>
                        <View
                          style={[
                            styles.chip,
                            {
                              backgroundColor: c.hex,
                              borderColor: isKept ? colors.accent : colors.rule,
                              borderWidth: isKept ? 2 : hairline,
                              borderRadius: radius.sm,
                            },
                          ]}
                        />
                        {/* Only where the colour has a wall to stay on. */}
                        {canKeep && wall && c.hex ? (
                          <Pressable
                            testID={`keep-${i}-${slot}`}
                            accessibilityRole="button"
                            accessibilityLabel={t(isKept ? "suggest.unkeep" : "suggest.keep", { colour, wall: where })}
                            accessibilityState={{ selected: isKept }}
                            onPress={() => toggleKeep(slot, { ...c, name })}
                            hitSlop={10}
                            style={[
                              styles.lock,
                              {
                                backgroundColor: isKept ? colors.accent : `${colors.bg}e6`,
                                borderColor: isKept ? colors.accent : colors.rule,
                              },
                            ]}
                          >
                            <Feather name={isKept ? "lock" : "unlock"} size={14} color={isKept ? colors.accentOn : colors.fg} />
                          </Pressable>
                        ) : null}
                      </View>
                      <Text variant="caption" tone={isKept ? "accent" : "mute"} numberOfLines={1}>
                        {where}
                      </Text>
                      <Text variant="small" numberOfLines={1}>
                        {colour}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Button label={t("suggest.tryThis")} onPress={() => apply(combo)} disabled={stale} testID={`try-${i}`} />
            </Card>
          );
        })
      )}

      {!closed && !suggestions.isPending ? (
        <Button
          variant="secondary"
          label={t("suggest.again")}
          icon="refresh-cw"
          onPress={() => setRound((r) => r + 1)}
          loading={suggestions.isFetching || stale}
          // Every wall kept: there is nothing left for another set to change.
          disabled={allKept}
        />
      ) : null}
    </>
  );
}

/**
 * Vista Shadebook: the Shade Book's combinations on this room — interior or exterior, opening on
 * the room's own kind, and two colours or three. Try this puts a combination's colours on the
 * walls being painted in order — the main walls first, as the page lists its parts — and saves.
 */
function VistaShadebook({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const room = useRoom(projectId);
  const catalogue = useCatalogue();
  const scheme = useShadeScheme();
  const book = useShadeBook();
  const pass = usePassPurchase(book.data?.access, shadeBookPass);

  const roomScope = scopeOf(room.data?.imageType);
  // The room's own kind until the customer picks the other.
  const [picked, setScope] = useState<"INTERIOR" | "EXTERIOR" | null>(null);
  const scope = picked ?? roomScope;
  const [colours, setColours] = useState<0 | 2 | 3>(0);
  // How many are shown, for the filter it was counted under: a new filter starts again at STEP.
  const filterKey = `${scope}|${colours}`;
  const [more, setMore] = useState({ key: filterKey, n: STEP });
  const shown = more.key === filterKey ? more.n : STEP;

  const walls = room.data ? planWalls(wallsWithMasks(room.data)) : [];
  const closed = Boolean(room.data && (room.data.readOnly || room.data.closedAt));

  const pages = useMemo(
    () => (book.data?.combinations ?? []).filter((p) => p.scope === scope && (colours === 0 || p.colours === colours)),
    [book.data, scope, colours],
  );
  const hidden = book.data && !book.data.access.open ? Math.max(0, book.data.total - book.data.combinations.length) : 0;
  const buy = () => void pass.buy();

  const apply = (page: ShadeBookPage) => {
    const changes: Record<string, WallColour> = {};
    pageColours(page, catalogue.data?.shades, scheme).forEach((colour, i) => {
      const wall = walls[i];
      if (!wall) return;
      changes[String(wall.id)] = { hex: colour.hex, code: colour.code, lrv: colour.lrv };
      if (colour.code) pushRecent({ hex: colour.hex, code: colour.code, lrv: colour.lrv, brandSlug: colour.brandSlug });
    });
    if (Object.keys(changes).length === 0) return;
    applyColours(projectId, changes);
    toast.show(t("suggest.applied"), "success");
    if (router.canGoBack()) router.back();
  };

  let body;
  if (closed) {
    body = <Banner tone="info" message={t("suggest.closed")} />;
  } else if (book.isPending) {
    body = (
      <View style={{ gap: space.md }} testID="suggest-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={150} radius={radius.md} />
        ))}
      </View>
    );
  } else if (book.isError) {
    body = <ErrorState error={book.error} onRetry={() => void book.refetch()} />;
  } else if (pages.length === 0) {
    body = (
      <Text variant="body" tone="soft">
        {t("suggest.none")}
      </Text>
    );
  } else {
    body = pages.slice(0, shown).map((page, i) => {
      const set = pageColours(page, catalogue.data?.shades, scheme);
      return (
        <Card key={page.id} testID="shade-book-combo">
          <Text variant="title3">{page.title}</Text>
          <View style={[styles.row, { gap: space.xs }]}>
            {set.map((c, slot) => {
              const wall = walls[slot];
              const where = wall ? wallLabel(wall) : page.shades[slot]?.surfaceLabel ?? "";
              return (
                <View key={slot} style={[styles.slot, { gap: 4, opacity: wall ? 1 : 0.45 }]}>
                  <View style={[styles.chip, { backgroundColor: c.hex, borderColor: colors.rule, borderRadius: radius.sm }]} />
                  <Text variant="caption" tone="mute" numberOfLines={1}>
                    {where}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {c.code ?? c.hex}
                  </Text>
                </View>
              );
            })}
          </View>
          <Button label={t("suggest.tryThis")} onPress={() => apply(page)} disabled={walls.length === 0} testID={`try-${i}`} />
        </Card>
      );
    });
  }

  return (
    <>
      <Text variant="lead">{t("suggest.bookLead")}</Text>

      {!closed && book.data ? (
        <BookStanding book={book.data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={buy} />
      ) : null}
      <PassNoticeBanner notice={pass.notice} />

      {!closed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
          <Chip label={t("suggest.interior")} selected={scope === "INTERIOR"} onPress={() => setScope("INTERIOR")} />
          <Chip label={t("suggest.exterior")} selected={scope === "EXTERIOR"} onPress={() => setScope("EXTERIOR")} />
          {([0, 2, 3] as const).map((n) => (
            <Chip
              key={n}
              label={n === 0 ? t("suggest.anyColours") : t("suggest.nColours", { n })}
              selected={colours === n}
              onPress={() => setColours(n)}
            />
          ))}
        </ScrollView>
      ) : null}

      {body}

      {!closed && pages.length > shown ? (
        <Button variant="secondary" label={t("suggest.showMore")} onPress={() => setMore({ key: filterKey, n: shown + STEP })} />
      ) : null}

      {!closed && hidden > 0 && book.data ? (
        <View style={{ gap: space.xs }} testID="suggest-book-more">
          <Text variant="small" tone="mute">
            {plural(hidden, "suggest.moreOne", "suggest.moreN")}
          </Text>
          <BuyButton book={book.data} price={pass.price} sellable={pass.sellable} busy={pass.busy} onBuy={buy} />
          <Button variant="ghost" label={t("suggest.openBook")} onPress={() => router.push("/shade-book")} testID="open-shade-book" />
        </View>
      ) : null}
    </>
  );
}

/**
 * Where this account stands with the Shade Book, on the Vista Shadebook tab: the pass and when it
 * ends, or what is free and the one pass that opens the rest. The pass is the Shade Book's own
 * (shade-book/components.tsx, Standing), bought at its price — so a purchase here opens the book
 * there too, and one made there opens this tab: both read the same `keys.shadeBook`.
 */
function BookStanding({
  book,
  price,
  sellable,
  busy,
  onBuy,
}: {
  book: ShadeBook;
  price: string | null;
  sellable: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const { access } = book;
  if (access.reason === "ADMIN") return <Banner tone="info" message={t("shadeBook.adminOpen")} />;
  if (access.open) {
    const ends = passEnds(access.expiresAt);
    return (
      <Banner
        tone="success"
        title={ends ? t("shadeBook.openUntil", { time: ends }) : t("shadeBook.openedPlain")}
        message={t("suggest.bookOpen")}
        testID="suggest-book-open"
      />
    );
  }
  if (book.total === 0) return null;
  return (
    <Banner
      tone="info"
      title={t("shadeBook.countFree", { shown: book.combinations.length, total: book.total })}
      message={t("suggest.bookShut", { hours: access.hours })}
      testID="suggest-book-shut"
    >
      <BuyButton book={book} price={price} sellable={sellable} busy={busy} onBuy={onBuy} />
    </Banner>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  slot: { flex: 1 },
  chip: { height: 56, borderWidth: hairline },
  // A 28 dp disc in the swatch's corner; the hit slop makes it a 48 dp target.
  lock: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  keeping: { borderWidth: hairline },
  stale: { opacity: 0.5 },
  keepingHead: { flexDirection: "row", alignItems: "center" },
});
