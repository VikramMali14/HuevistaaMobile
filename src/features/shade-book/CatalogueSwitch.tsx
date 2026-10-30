import { useRouter } from "expo-router";

import { Segmented } from "@/components/ui";
import { t } from "@/i18n";

/**
 * The top of the Catalogue tab: the shades themselves, or the Shade Book — combinations of
 * them painted on real houses. The same switch heads both screens, so either is one press
 * from the other.
 */
export function CatalogueSwitch({ value }: { value: "shades" | "book" }) {
  const router = useRouter();
  return (
    <Segmented
      accessibilityLabel={t("shadeBook.switchLabel")}
      options={[
        { value: "shades", label: t("shadeBook.switchShades") },
        { value: "book", label: t("shadeBook.title") },
      ]}
      value={value}
      onChange={(next) => {
        if (next !== value) router.navigate(next === "book" ? "/shade-book" : "/catalogue");
      }}
    />
  );
}
