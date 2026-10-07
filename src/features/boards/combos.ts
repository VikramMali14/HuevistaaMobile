import type { ProjectCombo, ProjectRender } from "@/api/types";
import { t } from "@/i18n";
import type { PdfShade } from "@/lib/pdf-export";

/**
 * A room's board options as the server keeps them (GET /api/projects/{id}/combos): how
 * C25 and the AI-image screens group, name and print them, so one option is called the
 * same thing everywhere.
 */

/**
 * The room's boards, each with its options in the order they were printed. An option is
 * numbered by its place on its page (as the website does), not its place in this list: a
 * room reopened in the past recorded its second board under the first one's number.
 */
export function byBoard(combos: readonly ProjectCombo[]): [number, ProjectCombo[]][] {
  const boards = new Map<number, ProjectCombo[]>();
  for (const c of [...combos].sort((a, b) => a.boardIndex - b.boardIndex || a.pageIndex - b.pageIndex)) {
    boards.set(c.boardIndex, [...(boards.get(c.boardIndex) ?? []), c]);
  }
  return [...boards];
}

/** "Option 2", or the title it was printed with. */
export function optionName(combo: Pick<ProjectCombo, "title" | "pageIndex">): string {
  return combo.title?.trim() || t("boardDetail.option", { n: combo.pageIndex + 1 });
}

/** The code to read out at a counter: the shop's display code (the server sends no other). */
export function comboCode(shade: ProjectCombo["shades"][number]): string | null {
  return shade.hvCode || shade.shadeCode || null;
}

/** An option's walls and codes in a line, for a screen reader. */
export function comboWords(combo: Pick<ProjectCombo, "shades">): string {
  return combo.shades.map((s) => [s.regionLabel?.trim() || t("aiImage.wall"), s.shadeName, comboCode(s)].filter(Boolean).join(" ")).join(", ");
}

/** An option's shades as a PDF prints them (the AI image's page). */
export function comboPdfShades(combo: Pick<ProjectCombo, "shades">, namesShown: boolean): PdfShade[] {
  return combo.shades.map((s) => {
    const code = comboCode(s) ?? undefined;
    return {
      label: s.regionLabel?.trim() || t("aiImage.wall"),
      regionId: s.regionId ?? undefined,
      name: s.shadeName?.trim() || (namesShown && !code ? t("board.customColour") : ""),
      code,
      hex: s.hex,
    };
  });
}

/** Each option's newest finished AI image (an option's own `rendered` counts failed asks too). */
export function finishedImages(renders: readonly ProjectRender[] | undefined): Map<string, ProjectRender> {
  const out = new Map<string, ProjectRender>();
  // Newest first from the server: the first READY one of each option is its newest.
  for (const r of renders ?? []) {
    if (r.status === "READY" && r.comboId && !out.has(r.comboId)) out.set(r.comboId, r);
  }
  return out;
}

/** An image of the room still being made, if there is one (the newest). */
export function imageInProgress(renders: readonly ProjectRender[] | undefined): ProjectRender | null {
  return renders?.find((r) => r.status === "QUEUED" || r.status === "RUNNING") ?? null;
}
