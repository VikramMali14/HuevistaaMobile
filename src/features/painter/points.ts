import type { PainterWallet, PointsActivity, Redemption, RewardItem } from "@/api/endpoints/rewards";
import { t, type MessageKey } from "@/i18n";
import { calendarDaysUntil, daysUntil, serverMoment } from "@/lib/dates";

/**
 * The painter's points as the painter website words them (HueVistaaPainter
 * src/lib/labels.ts, the home and wallet screens) — through t(), and without the website's
 * "1 points expire" and "in 1 days".
 */

const grouped = (n: number) => Math.round(n).toLocaleString("en-IN");

/** "1 point", "1,250 points". */
export function points(n: number): string {
  return Math.abs(n) === 1 ? t("painter.onePoint") : t("painter.pointsN", { n: grouped(n) });
}

/** A ledger amount: "+25", "−150" (a true minus sign). */
export function signedPoints(n: number): string {
  return n >= 0 ? t("painter.points.earned", { n: grouped(n) }) : t("painter.points.spent", { n: grouped(Math.abs(n)) });
}

/** "1,250" — a bare figure, for a balance drawn large. */
export function figure(n: number): string {
  return grouped(n);
}

/** The next batch to lapse, when it is close enough to warn about. */
export interface ExpiryWarning {
  points: number;
  /** By the date in India: 0 is today, 1 tomorrow. */
  days: number;
}

export function expiryWarning(wallet: Pick<PainterWallet, "nextExpiringPoints" | "nextExpiryAt" | "expiryWarningDays"> | null | undefined, now: number = Date.now()): ExpiryWarning | null {
  if (!wallet?.nextExpiringPoints || wallet.nextExpiringPoints <= 0) return null;
  // Whether to warn is counted as the website counts it; the words go by the date.
  const left = daysUntil(wallet.nextExpiryAt, now);
  const days = calendarDaysUntil(wallet.nextExpiryAt, now);
  if (left === null || days === null || left > wallet.expiryWarningDays) return null;
  return { points: wallet.nextExpiringPoints, days };
}

/** "120 points expire in 3 days. Spending always takes from the batch closest to expiring first." */
export function expirySentence(warning: ExpiryWarning): string {
  const when = warning.days === 0 ? t("painter.home.today") : warning.days === 1 ? t("painter.home.tomorrow") : t("painter.home.inDays", { n: warning.days });
  const first = warning.points === 1 ? t("painter.home.expiresOne", { points: points(1), when }) : t("painter.home.expiresMany", { points: points(warning.points), when });
  return `${first} ${t("painter.home.oldestFirst")}`;
}

/** A batch's pill by its date: "Today", "Tomorrow", "12 days" — or null for a date that won't read. */
export function batchPill(expiresAt: string, now: number = Date.now()): string | null {
  const days = calendarDaysUntil(expiresAt, now);
  if (days === null) return null;
  if (days === 0) return t("painter.points.batchToday");
  if (days === 1) return t("painter.points.batchTomorrow");
  return t("painter.points.batchDays", { n: days });
}

/**
 * P1's reward card: the cheapest thing the balance already buys, else the one closest to
 * it (fewest points to go). In stock only; nothing when the catalogue is empty.
 */
export function nextReward(items: readonly RewardItem[] | undefined): RewardItem | null {
  const live = (items ?? []).filter((i) => i.inStock);
  const ready = live.filter((i) => i.affordable).sort((a, b) => a.pointsCost - b.pointsCost);
  if (ready[0]) return ready[0];
  return [...live].sort((a, b) => a.pointsShort - b.pointsShort || a.pointsCost - b.pointsCost)[0] ?? null;
}

/** The categories present, in the website's order, then any the app doesn't know yet. */
const CATEGORY_ORDER = ["TOOLS", "SITE_KIT", "SAFETY", "GEAR", "VOUCHER", "TRAINING"];
export function categoriesOf(items: readonly RewardItem[]): string[] {
  const present = new Set(items.map((i) => i.category));
  const known = CATEGORY_ORDER.filter((c) => present.has(c));
  return [...known, ...[...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort()];
}

/** A category's name, or the server's own word for one this version doesn't know. */
export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  return CATEGORY_ORDER.includes(category) ? t(`painter.categories.${category}` as MessageKey) : category;
}

/** A Feather icon for a category — the catalogue carries no pictures. */
export function categoryIcon(category: string | null | undefined): "tool" | "package" | "shield" | "shopping-bag" | "credit-card" | "book-open" | "gift" {
  switch (category) {
    case "TOOLS":
      return "tool";
    case "SITE_KIT":
      return "package";
    case "SAFETY":
      return "shield";
    case "GEAR":
      return "shopping-bag";
    case "VOUCHER":
      return "credit-card";
    case "TRAINING":
      return "book-open";
    default:
      return "gift";
  }
}

/**
 * A catalogue card's status line, by the website's precedence: out of stock, points to go,
 * not a painter account (only once the wallet has said so), a few left, ready.
 */
export function rewardStatus(item: RewardItem, canRedeem: boolean | undefined): { text: string; tone: "danger" | "mute" | "warm" | "accent" } {
  if (!item.inStock) return { text: t("painter.rewards.outOfStock"), tone: "danger" };
  if (item.pointsShort > 0) return { text: t("painter.rewards.toGo", { points: points(item.pointsShort) }), tone: "mute" };
  if (canRedeem === false) return { text: t("painter.rewards.notThisAccount"), tone: "mute" };
  if (item.stock != null && item.stock <= 5) return { text: t("painter.rewards.fewLeft", { n: item.stock }), tone: "warm" };
  return { text: t("painter.rewards.ready"), tone: "accent" };
}

/** A redemption's status in words ("On its way", "Delivered", "Refunded"). */
export function redemptionStatus(status: Redemption["status"]): string {
  return status === "PENDING" || status === "FULFILLED" || status === "REJECTED" ? t(`painter.status.${status}` as MessageKey) : status;
}

/**
 * A claim whose answer never came back: did it land? Claiming has no request key, so a
 * second ask after a lost answer is refused with the very words used when another painter
 * won it. The wallet tells them apart: a board-scan credit of exactly these points, made
 * since the ask (allowing for the phone's clock).
 */
export function claimLanded(wallet: Pick<PainterWallet, "recentActivity"> | null | undefined, pointsWorth: number, askedAt: number): PointsActivity | null {
  const slack = 2 * 60_000;
  return (
    wallet?.recentActivity.find((row) => {
      if (row.type !== "PROJECT_QR_EARNED" || row.points !== pointsWorth) return false;
      const at = serverMoment(row.createdAt);
      return Number.isFinite(at) && at >= askedAt - slack;
    }) ?? null
  );
}
