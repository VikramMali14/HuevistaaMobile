import type { PaintShade } from "@/lib/shade-types";

/** The route to a shade's own page (C19): its company's slug and the code it is looked up by. */
export function shadeHref(shade: Pick<PaintShade, "brand" | "brandSlug" | "code" | "hvCode">): string {
  const slug = shade.brandSlug || shade.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `/shade/${encodeURIComponent(slug)}/${encodeURIComponent(shade.hvCode || shade.code)}`;
}
