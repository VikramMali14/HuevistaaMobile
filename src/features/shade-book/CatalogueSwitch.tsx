import { useRouter } from "expo-router";

import { Segmented } from "@/components/ui";
import { t } from "@/i18n";

type Place = "shades" | "book" | "finder";

const ROUTES = { shades: "/catalogue", book: "/shade-book", finder: "/colour-finder" } as const;

/**
 * The top of the Catalogue tab: the shades themselves, the Shade Book — combinations of them
 * painted on real houses — or the Colour finder, which finds them in a photo. The same switch
 * heads all three screens, so each is one press from the others.
 */
export function CatalogueSwitch({ value }: { value: Place }) {
  const router = useRouter();
  return (
    <Segmented
      accessibilityLabel={t("shadeBook.switchLabel")}
      options={[
        { value: "shades", label: t("shadeBook.switchShades") },
        { value: "book", label: t("shadeBook.title") },
        { value: "finder", label: t("colourFinder.title") },
      ]}
      value={value}
      onChange={(next) => {
        if (next !== value) router.navigate(ROUTES[next]);
      }}
    />
  );
}
