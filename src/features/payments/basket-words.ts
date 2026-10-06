import type { CartCatalogue } from "@/api/types";
import { t } from "@/i18n";
import type { PackedCart } from "@/lib/cart-pack";

/**
 * How C28's bill names things — ported from the website's credits-cart.tsx
 * (describeBasket, describeSurplus, describePacking), so the phone's receipt reads like
 * the website's.
 */
const rooms = (n: number) => (n === 1 ? t("checkout.oneRoom") : t("checkout.rooms", { n }));
const images = (n: number) => (n === 1 ? t("checkout.oneImage") : t("checkout.images", { n }));

/** "2 rooms and 1 AI image" — what a basket hands over, or a surplus. Empty for nothing. */
export function roomsAndImages(r: number, p: number): string {
  if (r > 0 && p > 0) return t("checkout.and", { a: rooms(r), b: images(p) });
  if (r > 0) return rooms(r);
  return p > 0 ? images(p) : "";
}

/**
 * "2 rooms and 1 AI credit" — what a confirmed payment added, in the units the balance is
 * kept in (C29 shows the balance beside it).
 */
export function roomsAndCredits(r: number, c: number): string {
  const credits = c === 1 ? t("checkout.oneCredit") : t("checkout.credits", { n: c });
  if (r > 0 && c > 0) return t("checkout.and", { a: rooms(r), b: credits });
  if (r > 0) return rooms(r);
  return c > 0 ? credits : "";
}

/** "Bundled as the 3 rooms + 3 AI images offer and 2 × room + AI image" — what took money off. */
export function packingLine(packed: Pick<PackedCart, "combos" | "bundles">, cart: CartCatalogue): string {
  const parts: string[] = [];
  const times = (n: number, what: string) => (n > 1 ? t("checkout.times", { n, what }) : what);
  if (packed.bundles > 0) {
    parts.push(times(packed.bundles, t("checkout.packBundle", { rooms: cart.bundleProjects ?? 0, images: cart.bundleCredits ?? 0 })));
  }
  if (packed.combos > 0) {
    const name =
      cart.comboProjects === 1 && cart.comboCredits === 1
        ? t("checkout.packComboOne")
        : t("checkout.packCombo", { rooms: cart.comboProjects, images: cart.comboCredits });
    parts.push(times(packed.combos, name));
  }
  if (parts.length === 0) return t("checkout.packageSaving");
  return t("checkout.bundledAs", { what: parts.length === 2 ? t("checkout.and", { a: parts[0]!, b: parts[1]! }) : parts[0]! });
}
