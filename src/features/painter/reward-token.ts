/**
 * Ported from the painter website, unchanged in behaviour: HueVistaaPainter/src/lib/reward-token.ts
 * (P3 Scan, P7 Board came as a PDF, P8 Type the code all go through it).
 *
 * Pulling the reward token out of whatever a QR actually decoded to.
 *
 * <p>The QR on a colour board encodes a URL — `https://huevistaa.com/r/<token>` — and
 * not a bare token, so that a plain phone camera opens something useful with no app
 * installed. That means everything reaching this app from a scan is a URL, and the token
 * has to be recovered from it.
 *
 * <p>It also means a painter will, sooner or later, scan a QR that is not ours at all: a
 * product label, a UPI code, a poster. Those have to be REJECTED here rather than sent to
 * the backend as a token, or the screen shows "that code isn't one of ours" after a
 * network round trip when it could have said so instantly.
 */

/**
 * The token itself: 20 random bytes, URL-safe base64, unpadded — 27 characters.
 *
 * <p>The length is pinned rather than left open because it is the cheap half of telling
 * our QR from somebody else's. A bound rather than an exact 27 so that a future change to
 * the token's size does not silently stop every scanner in the field from recognising a
 * board.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * What a scan produced, turned into a token — or null when it is not one of ours.
 *
 * <p>Accepts the three shapes a board's code can genuinely arrive in:
 *
 * <ul>
 *   <li>the full scan URL, `https://…/r/<token>`, which is what the QR encodes;</li>
 *   <li>a bare path, `/r/<token>`, which is what a hand-typed deep link tends to be;</li>
 *   <li>the bare token, which is what somebody reads off a printed sheet when the QR
 *       itself will not scan — a creased board under shop lighting is a real thing.</li>
 * </ul>
 */
export function rewardTokenFrom(scanned: string): string | null {
  const text = scanned.trim();
  if (!text) return null;

  // A URL, of any host. The host is deliberately NOT checked: a deployment may serve the
  // board's QR from a preview domain or a white-label subdomain, and refusing those would
  // make a valid board unscannable. The token is verified by the backend against its own
  // table regardless — this function's job is to find a candidate, not to authorise one.
  const match = text.match(/\/r\/([A-Za-z0-9_-]+)/);
  if (match?.[1] && TOKEN_RE.test(match[1])) return match[1];

  // Anything else that still looks like a URL is somebody else's QR.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith("/")) return null;

  return TOKEN_RE.test(text) ? text : null;
}
