import type { AiCreditSummary, ProjectRender, RenderChoices, RenderQuality } from "@/api/types";
import { t, type MessageKey } from "@/i18n";

/**
 * How an AI image is photographed (C23) — the backend's CreateRenderRequest choices, in the
 * website's order and with its words (render-studio.tsx, lib/render-labels.ts). Quality
 * comes first because it is the only choice that changes the price.
 */
export type ChoiceKey = keyof RenderChoices;

export interface ChoiceRow<K extends ChoiceKey = ChoiceKey> {
  key: K;
  values: readonly RenderChoices[K][];
}

export const CHOICE_ROWS: readonly ChoiceRow[] = [
  { key: "quality", values: ["PREMIUM", "LUXURY"] },
  { key: "sourceImage", values: ["CLEANED", "ORIGINAL"] },
  { key: "timeOfDay", values: ["DAY", "NIGHT"] },
  { key: "borderMode", values: ["KEEP_ORIGINAL", "AI_SUGGESTED"] },
  { key: "lighting", values: ["NATURAL", "WARM", "COOL", "DRAMATIC"] },
  { key: "furnishing", values: ["KEEP", "STAGED", "EMPTY"] },
  { key: "style", values: ["MODERN", "MINIMAL", "TRADITIONAL", "HERITAGE", "LUXE"] },
];

/** The website's defaults: the cheapest quality, deliberately, and the room as it is. */
export const DEFAULT_CHOICES: RenderChoices = {
  quality: "PREMIUM",
  sourceImage: "CLEANED",
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
};

/** A row's heading. Outside, "Furniture" is what is around the building. */
export function rowLabel(key: ChoiceKey, outdoor = false): string {
  if (key === "furnishing" && outdoor) return t("aiImage.rows.furnishingOutdoor");
  return t(`aiImage.rows.${key}` as MessageKey);
}

/** A choice's name, or the server's own word for one this version doesn't know. */
/** `tr`: tEn for what is printed (the PDF's font has Latin letters only). */
export function choiceLabel(value: string, tr: typeof t = t): string {
  return value in CHOICE_NAMES ? tr(`aiImage.choice.${value}` as MessageKey) : value;
}

/** What a choice does, in a line — worded for the outside of a building where that differs. */
export function choiceHint(value: string, outdoor = false): string | null {
  if (outdoor && value in OUTDOOR_HINTS) return t(`aiImage.hintOutdoor.${value}` as MessageKey);
  return value in CHOICE_NAMES ? t(`aiImage.hint.${value}` as MessageKey) : null;
}

const CHOICE_NAMES: Record<string, true> = Object.fromEntries(CHOICE_ROWS.flatMap((r) => r.values).map((v) => [v, true]));
const OUTDOOR_HINTS: Record<string, true> = { NATURAL: true, STAGED: true, EMPTY: true };

/** Choices carried on a route (Make another, Try again), checked value by value. */
export function choicesFrom(params: Partial<Record<ChoiceKey, string | string[]>>): RenderChoices {
  const out = { ...DEFAULT_CHOICES } as Record<ChoiceKey, string>;
  for (const row of CHOICE_ROWS) {
    const raw = params[row.key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && (row.values as readonly string[]).includes(value)) out[row.key] = value;
  }
  return out as unknown as RenderChoices;
}

/** The choices an earlier image was made with, as route params (for Make another / Try again). */
export function choicesOf(render: Pick<ProjectRender, ChoiceKey>): Record<ChoiceKey, string> {
  return {
    quality: render.quality,
    sourceImage: render.sourceImage,
    timeOfDay: render.timeOfDay,
    borderMode: render.borderMode,
    lighting: render.lighting,
    furnishing: render.furnishing,
    style: render.style,
  };
}

/**
 * What an image of this quality costs, in credits — read from the wallet, never assumed
 * (the website's rule): the tier's price, else the standard price, else one.
 */
export function costOf(wallet: Pick<AiCreditSummary, "renderTiers" | "renderCost"> | null | undefined, quality: RenderQuality): number {
  const tier = wallet?.renderTiers?.find((x) => x.quality === quality)?.credits;
  const cost = tier ?? wallet?.renderCost ?? 1;
  return Number.isFinite(cost) && cost >= 1 ? Math.round(cost) : 1;
}

/** "1 AI credit", "2 AI credits". */
export function creditWords(n: number): string {
  return n === 1 ? t("balance.oneCredit") : t("balance.credits", { n });
}

/**
 * An image in a line — "Modern · Day · Natural light", with "· Luxury" when it wasn't the
 * standard quality (the website's describeRender).
 */
export function describeRender(
  render: Partial<Pick<ProjectRender, "style" | "timeOfDay" | "lighting" | "quality">>,
  tr: typeof t = t,
): string {
  const parts: string[] = [];
  if (render.style) parts.push(choiceLabel(render.style, tr));
  if (render.timeOfDay) parts.push(choiceLabel(render.timeOfDay, tr));
  if (render.lighting) parts.push(tr("aiImage.light", { light: choiceLabel(render.lighting, tr) }));
  if (render.quality && render.quality !== "PREMIUM") parts.push(choiceLabel(render.quality, tr));
  return parts.join(" · ");
}
