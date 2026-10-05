import { useRouter } from "expo-router";

import { EmptyState, Screen } from "@/components/ui";
import { t } from "@/i18n";

/** X6 · A link that opens nothing in the app. Spec: docs/06-screens-shared.md — X6. */
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        icon="compass"
        title={t("notFound.title")}
        body={t("notFound.body")}
        actionLabel={t("common.goHome")}
        onAction={() => router.replace("/")}
      />
    </Screen>
  );
}
