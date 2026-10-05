import { Banner, Button } from "@/components/ui";
import { t } from "@/i18n";
import { openWebPage, webPages } from "@/lib/open-web";

/** An admin account signed in: the app does not handle admin sign-in (A2, A4, A5, A9). */
export function AdminBanner() {
  return (
    <Banner tone="info" title={t("auth.email.adminTitle")} message={t("auth.email.adminBody")}>
      <Button variant="ghost" block={false} label={t("auth.email.openWebsite")} onPress={() => openWebPage(webPages.admin)} />
    </Banner>
  );
}
