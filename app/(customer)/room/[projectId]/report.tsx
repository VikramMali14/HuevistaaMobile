import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { projectsApi } from "@/api/endpoints/projects";
import { messageFor } from "@/api/errors";
import { keys } from "@/api/query-keys";
import type { MaskReportIssue } from "@/api/types";
import { FormScreen } from "@/components/FormScreen";
import { Banner, Button, Text, TextField, useToast } from "@/components/ui";
import { t, type MessageKey } from "@/i18n";
import { useSubmit } from "@/lib/use-submit";
import { hairline, useTheme } from "@/theme";

const ISSUES: { code: MaskReportIssue; label: MessageKey }[] = [
  { code: "MASK_NOT_GENERATED_PROPERLY", label: "report.mask" },
  { code: "IMAGE_NOT_CLEANED_PROPERLY", label: "report.clean" },
  { code: "OTHER", label: "report.other" },
];

/**
 * C18 · The walls are wrong. Spec: docs/04-screens-customer.md — C18.
 *
 * Tick what went wrong, add a note if there is more to say, Send. The team redraws the
 * walls by hand; C9 says so until they have. Reporting again updates the open report.
 */
export default function ReportWalls() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors, radius, space } = useTheme();
  const { projectId = "" } = useLocalSearchParams<{ projectId: string }>();
  const [issues, setIssues] = useState<MaskReportIssue[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit();

  const flip = (code: MaskReportIssue) => {
    setIssues((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
    setError(null);
  };

  const send = () => {
    setTried(true);
    if (issues.length === 0) return;
    void run(async () => {
      setError(null);
      try {
        const report = await projectsApi.report(projectId, { issues, note: note.trim() || undefined });
        queryClient.setQueryData(keys.roomReport(projectId), report);
        toast.show(t("report.sent"), "success");
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: "/room/[projectId]/walls", params: { projectId } } as never);
      } catch (err) {
        setError(messageFor(err));
      }
    });
  };

  return (
    <FormScreen
      title={t("report.title")}
      lead={t("report.lead")}
      backFallback="/studio"
      footer={<Button label={t("report.send")} onPress={send} loading={busy} />}
    >
      <View style={{ gap: space.xs }}>
        {ISSUES.map((issue) => {
          const on = issues.includes(issue.code);
          return (
            <Pressable
              key={issue.code}
              onPress={() => flip(issue.code)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[
                styles.check,
                { borderColor: on ? colors.fg : colors.ruleStrong, borderRadius: radius.md, padding: space.md, backgroundColor: colors.surface },
              ]}
              testID={`issue-${issue.code}`}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: on ? colors.fg : colors.ruleStrong, backgroundColor: on ? colors.fg : "transparent", borderRadius: radius.xs },
                ]}
              >
                {on ? <Feather name="check" size={16} color={colors.bg} /> : null}
              </View>
              <Text variant="body" style={{ flex: 1 }}>
                {t(issue.label)}
              </Text>
            </Pressable>
          );
        })}
        {tried && issues.length === 0 ? (
          <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
            {t("report.pickOne")}
          </Text>
        ) : null}
      </View>
      <TextField label={t("report.note")} value={note} onChangeText={setNote} multiline maxLength={1000} />
      {error ? <Banner tone="danger" message={error} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: hairline },
  box: { width: 24, height: 24, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
