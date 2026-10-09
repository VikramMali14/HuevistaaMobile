import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BackButton, Banner, Button, Card, ListGroup, ListRow, Screen, Text } from "@/components/ui";
import { boardKindOf, pickBoardFile, problemMessage, problemWith, readBoardFile, sharedBoardFile, type BoardFile } from "@/features/painter/board-file";
import { BoardReader } from "@/features/painter/board-reader/BoardReader";
import type { ReaderJob, ReaderOutcome, ReaderProgress } from "@/features/painter/board-reader/protocol";
import { takeSharedBoard } from "@/features/painter/shared-board";
import { t } from "@/i18n";
import { announce } from "@/lib/announce";
import { useTheme } from "@/theme";

/** A file being read, and whether another app opened us with it. */
type Picked = BoardFile & { shared?: boolean };

type Stage =
  | { kind: "idle" }
  | { kind: "opening"; file: Picked }
  | { kind: "reading"; file: Picked; job: ReaderJob; id: number; progress: ReaderProgress | null }
  | { kind: "none"; file: Picked }
  | { kind: "problem"; file: Picked | null; message: string; again: boolean };

/**
 * P7 · Board came as a PDF. Spec: docs/05-screens-painter.md — P7. Web reference:
 * HueVistaaPainter lib/board-file.ts.
 *
 * Boards are often forwarded on WhatsApp as a PDF, and a camera can't be pointed at a file
 * on the same phone. The painter picks it (or opens it with HueVistaa from another app),
 * and it's read here, on the phone: pages drawn in a hidden WebView, last page first, the
 * QR read off the pixels. The file never leaves the phone; only the token goes on, to P6.
 */
export default function UploadBoard() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // Each reading has its own number, so a reading stopped or replaced can't speak late.
  const reading = useRef(0);

  const start = async (file: Picked) => {
    const id = ++reading.current;
    const problem = problemWith(file);
    if (problem) {
      setStage({ kind: "problem", file, message: problemMessage(problem), again: false });
      return;
    }
    setStage({ kind: "opening", file });
    const read = await readBoardFile(file);
    if (id !== reading.current) return;
    if ("problem" in read) {
      const message = problemMessage(read.problem);
      setStage({ kind: "problem", file, message, again: read.problem === "failed" });
      announce(message);
      return;
    }
    const kind = boardKindOf(file) ?? "pdf";
    setStage({ kind: "reading", file, id, progress: null, job: { base64: read.base64, kind, mime: file.mime } });
    announce(t("painter.upload.reading"));
  };

  const choose = async () => {
    let file: BoardFile | null;
    try {
      file = await pickBoardFile();
    } catch {
      setStage({ kind: "problem", file: null, message: t("painter.upload.failed"), again: false });
      return;
    }
    if (file) void start(file);
  };

  const stop = () => {
    reading.current += 1;
    setStage({ kind: "idle" });
  };

  // A file opened with HueVistaa from another app, handed over by app/+native-intent.tsx.
  useEffect(() => {
    // Taken here, once (a second run of this effect finds nothing), and read just after.
    const uri = shared ? takeSharedBoard() : null;
    if (uri) void Promise.resolve().then(() => start({ ...sharedBoardFile(uri), shared: true }));
  }, [shared]);

  const onProgress = (id: number) => (progress: ReaderProgress) => {
    if (id !== reading.current) return;
    setStage((s) => (s.kind === "reading" && s.id === id ? { ...s, progress } : s));
  };

  const onDone = (id: number, file: Picked) => (outcome: ReaderOutcome) => {
    if (id !== reading.current) return;
    reading.current += 1;
    if (outcome.kind === "found") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // In its place: back from the board goes to where the file was asked for from.
      router.replace({ pathname: "/painter/claim/[token]", params: { token: outcome.token } });
      setStage({ kind: "idle" });
    } else if (outcome.kind === "none") {
      setStage({ kind: "none", file });
      announce(t("painter.upload.none", { name: file.name }));
    } else {
      const message = problemMessage(outcome.code);
      setStage({ kind: "problem", file, message, again: outcome.code === "failed" || outcome.code === "memory" || outcome.code === "canvas" });
      announce(message);
    }
  };

  const busy = stage.kind === "opening" || stage.kind === "reading";
  const file = stage.kind === "idle" ? null : stage.file;

  let footer: React.ReactNode;
  if (busy) {
    footer = <Button variant="secondary" label={t("painter.upload.cancel")} onPress={stop} testID="upload-stop" />;
  } else if (stage.kind === "none" || stage.kind === "problem") {
    footer = (
      <View style={{ gap: space.xs }}>
        {stage.kind === "problem" && stage.again && stage.file ? (
          <Button label={t("painter.upload.tryAgain")} onPress={() => stage.file && void start(stage.file)} testID="upload-again" />
        ) : null}
        <Button
          variant={stage.kind === "problem" && stage.again ? "secondary" : "primary"}
          icon="file-text"
          label={t("painter.upload.tryAnother")}
          onPress={() => void choose()}
          testID="upload-another"
        />
      </View>
    );
  } else {
    footer = <Button icon="file-text" label={t("painter.upload.choose")} onPress={() => void choose()} testID="upload-choose" />;
  }

  return (
    <Screen scroll contentStyle={{ gap: space.lg }} footer={footer}>
      <BackButton fallback="/painter/scan" />
      <View style={{ gap: space.xs }}>
        <Text variant="label" tone="accent">
          {file?.shared ? t("painter.upload.shared") : t("painter.upload.eyebrow")}
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {t("painter.upload.title")}
        </Text>
        <Text variant="painterBody" tone="soft">
          {t("painter.upload.lead")}
        </Text>
      </View>

      {busy && file ? (
        <Card lit>
          <View style={[styles.row, { gap: space.sm }]} testID="upload-reading" accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accentText} />
            <View style={[styles.fill, { gap: 2 }]}>
              <Text variant="painterStrong" numberOfLines={1}>
                {file.name}
              </Text>
              <Text variant="small" tone="soft">
                {stage.kind === "reading" && stage.progress
                  ? `${t("painter.upload.reading")} ${t("painter.upload.page", { page: stage.progress.page, pages: stage.progress.pages })}`
                  : stage.kind === "reading"
                    ? t("painter.upload.reading")
                    : t("painter.upload.opening")}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
      {busy ? (
        <Text variant="small" tone="mute">
          {t("painter.upload.fromTheBack")}
        </Text>
      ) : null}

      {stage.kind === "idle" ? (
        <View style={[styles.row, { gap: space.sm }]}>
          <Feather name="file-text" size={22} color={colors.accentText} />
          <Text variant="small" tone="soft" style={styles.fill}>
            {t("painter.upload.chooseHint")}
          </Text>
        </View>
      ) : null}

      {stage.kind === "none" ? (
        <View style={{ gap: space.xs }} testID="upload-none">
          <Banner tone="warning" message={t("painter.upload.none", { name: stage.file.name })} />
          <Text variant="small" tone="mute">
            {t("painter.upload.noneHint")}
          </Text>
        </View>
      ) : null}
      {stage.kind === "problem" ? <Banner tone="danger" message={stage.message} testID="upload-problem" /> : null}

      {!busy ? (
        <ListGroup>
          <ListRow icon="camera" title={t("painter.upload.useCamera")} onPress={() => router.dismissTo("/painter/scan")} />
          <ListRow icon="type" title={t("painter.upload.typeCode")} onPress={() => router.replace("/painter/type-code")} testID="upload-type" />
        </ListGroup>
      ) : null}

      {stage.kind === "reading" ? <BoardReader key={stage.id} job={stage.job} onProgress={onProgress(stage.id)} onDone={onDone(stage.id, stage.file)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  fill: { flex: 1 },
});
