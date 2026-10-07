import { View } from "react-native";

import { t } from "@/i18n";
import { useTheme } from "@/theme";

import { Banner } from "./Banner";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  /** What happens, in plain words. */
  body?: string;
  /** Exactly what goes, one line each — for anything that cannot be undone. */
  consequences?: string[];
  confirmLabel: string;
  /** `destructive` for something that cannot be undone. */
  destructive?: boolean;
  loading?: boolean;
  /** Said inside the sheet when confirming failed. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** On the sheet; its confirm button gets `${testID}-confirm`. */
  testID?: string;
}

/** "Are you sure?" — the title, what happens, and two buttons. */
export function ConfirmSheet({
  visible,
  title,
  body,
  consequences,
  confirmLabel,
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onCancel,
  testID,
}: ConfirmSheetProps) {
  const { space } = useTheme();
  return (
    <Sheet visible={visible} onClose={loading ? () => {} : onCancel} title={title} testID={testID}>
      {body ? <Text variant="body" tone="soft">{body}</Text> : null}
      {consequences?.length ? (
        <View style={{ gap: space.xs }}>
          {consequences.map((line) => (
            <Text key={line} variant="body">
              {`\u2022  ${line}`}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <View style={{ gap: space.xs, marginTop: space.xs }}>
        <Button
          label={confirmLabel}
          variant={destructive ? "danger" : "primary"}
          onPress={onConfirm}
          loading={loading}
          testID={testID ? `${testID}-confirm` : undefined}
        />
        <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} disabled={loading} />
      </View>
    </Sheet>
  );
}
