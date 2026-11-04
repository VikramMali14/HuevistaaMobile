import { useRouter } from "expo-router";

import { Segmented } from "@/components/ui";
import { useLibrary } from "@/features/library/use-library";
import { t } from "@/i18n";

type Place = "rooms" | "images" | "ready";

const ROUTES = { rooms: "/studio", images: "/vista-images", ready: "/ready-rooms" } as const;

/**
 * The top of the Paint tab: your own rooms, the Vista images made of them, or one of our
 * ready-made rooms to paint free. The same switch heads all three screens, so each is one
 * press from the others — the way the Colours tab's switch does for its three. Ready rooms
 * only while there are some on the shelf.
 */
export function PaintSwitch({ value }: { value: Place }) {
  const router = useRouter();
  const library = useLibrary();
  return (
    <Segmented
      accessibilityLabel={t("paintTab.switchLabel")}
      options={[
        { value: "rooms" as const, label: t("paintTab.rooms") },
        { value: "images" as const, label: t("paintTab.images") },
        ...(library.live || value === "ready" ? [{ value: "ready" as const, label: t("paintTab.ready") }] : []),
      ]}
      value={value}
      onChange={(next) => {
        if (next !== value) router.navigate(ROUTES[next]);
      }}
    />
  );
}
