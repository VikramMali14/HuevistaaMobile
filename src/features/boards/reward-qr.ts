import { create } from "qrcode/lib/core/qrcode";

import { projectsApi } from "@/api/endpoints/projects";
import type { PdfRewardQr } from "@/lib/pdf-export";

/**
 * The reward QR that closes a colour board — ported from the website's lib/reward-qr.ts,
 * so a board made on the phone carries the same code as one made there (a room mints one,
 * for life).
 *
 * Everything here fails soft: null prints the board without its reward page. The board is
 * what the customer is standing at a counter waiting for; the reward page is what the shop
 * gets free, and the code is the same one tomorrow if this fetch didn't get through.
 */
export async function buildRewardQr(projectId: string): Promise<PdfRewardQr | null> {
  try {
    const code = await projectsApi.rewardCode(projectId);
    // No code is an answer, not a failure: a ready-made room has nobody to pay.
    if (!code?.scanUrl) return null;
    // Q: a quarter of the symbol can be lost and it still reads — this sheet gets folded.
    const qr = create(code.scanUrl, { errorCorrectionLevel: "Q" });
    return {
      modules: qr.modules,
      url: code.scanUrl,
      expiresOn: formatExpiry(code.expiresAt),
      paysPoints: code.paysPoints !== false,
    };
  } catch {
    return null;
  }
}

/** The claim deadline as it reads on paper: "4 October 2026". */
export function formatExpiry(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
