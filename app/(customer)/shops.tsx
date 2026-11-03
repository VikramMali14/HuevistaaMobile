import { NearbySearch } from "@/features/nearby/NearbySearch";

/**
 * C36 · Find a paint shop. Paint shops near you, nearest first, with directions and a call
 * (src/features/nearby/NearbySearch.tsx). Pushed over the tabs — from its tile on Home, from
 * Account, or a shade's "Find a shop near you" — so it has a way back. Painters are the
 * Painters tab (C32, /nearby).
 */
export default function Shops() {
  return <NearbySearch kind="shops" back />;
}
