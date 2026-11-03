import { Redirect, useLocalSearchParams } from "expo-router";

import { NearbySearch } from "@/features/nearby/NearbySearch";

/**
 * C32 · Find a painter — the Painters tab. Painters near you, nearest first, one tap to
 * call (src/features/nearby/NearbySearch.tsx). Paint shops are a screen of their own
 * (C36, /shops).
 *
 * Shops used to be the second half of this screen, opened by /nearby?tab=shops. A link
 * that still says so — an old notification, a bookmark — lands on the shops screen.
 */
export default function Nearby() {
  const params = useLocalSearchParams<{ tab?: string }>();
  if (params.tab === "shops") return <Redirect href="/shops" />;
  return <NearbySearch kind="painters" />;
}
