import type { WorkAreaState, WorkAreas } from "@/api/endpoints/nearby";
import { getLanguage, t } from "@/i18n";

/**
 * Where a painter can go for a job, as the codes the server keeps (WorkAreas): a division of a
 * state ("RJ-AJMER"), a whole state ("GJ"), or anywhere in India ("IN"). The names come from the
 * catalogue the server serves (nearbyApi.workAreas) in English and Hindi, so the app keeps no
 * list of places — a state given divisions there is drawn with them here, in a build already
 * installed. Ported from the painter website's lib/work-areas.ts.
 *
 * What is chosen is kept the way the server keeps it (`normalise`, the mirror of
 * WorkAreas#normalise): each code once, in the catalogue's order, a whole state rather than all
 * of its divisions, and anywhere in India on its own.
 */

/** Each code once, in the catalogue's order; a whole state for all its divisions; anywhere alone. */
export function normalise(codes: readonly string[], catalogue: WorkAreas): string[] {
  const chosen = new Set(codes);
  if (chosen.has(catalogue.anywhere)) return [catalogue.anywhere];
  const order: string[] = [];
  for (const state of catalogue.states) {
    const divisions = state.divisions.map((d) => d.code);
    if (divisions.length > 0 && divisions.every((d) => chosen.has(d))) chosen.add(state.code);
    if (chosen.has(state.code)) order.push(state.code);
    else order.push(...divisions.filter((d) => chosen.has(d)));
  }
  // A code this catalogue doesn't know (a place added since it was loaded) is kept, not lost.
  const known = new Set(catalogue.states.flatMap((s) => [s.code, ...s.divisions.map((d) => d.code)]));
  return [...order, ...[...chosen].filter((c) => !known.has(c))];
}

/** Whether a division is chosen — itself, or with the whole of its state. */
export function hasDivision(codes: readonly string[], state: WorkAreaState, division: string): boolean {
  return codes.includes(state.code) || codes.includes(division);
}

/** One division on or off. Off when the whole state was on leaves the state's other divisions. */
export function toggleDivision(codes: readonly string[], state: WorkAreaState, division: string, catalogue: WorkAreas): string[] {
  if (codes.includes(state.code)) {
    const rest = state.divisions.map((d) => d.code).filter((d) => d !== division);
    return normalise([...codes.filter((c) => c !== state.code), ...rest], catalogue);
  }
  return normalise(codes.includes(division) ? codes.filter((c) => c !== division) : [...codes, division], catalogue);
}

/** A whole state on or off — every one of its divisions with it. */
export function toggleState(codes: readonly string[], state: WorkAreaState, catalogue: WorkAreas): string[] {
  const divisions = new Set(state.divisions.map((d) => d.code));
  if (codes.includes(state.code)) return normalise(codes.filter((c) => c !== state.code), catalogue);
  return normalise([...codes.filter((c) => !divisions.has(c)), state.code], catalogue);
}

/** Whether two choices are the same choice, whatever order they were made in. */
export function sameAreas(a: readonly string[], b: readonly string[], catalogue: WorkAreas): boolean {
  const x = normalise(a, catalogue);
  const y = normalise(b, catalogue);
  return x.length === y.length && x.every((c, i) => c === y[i]);
}

/** A place's name in the language the app is in. */
export function placeName(place: { name: string; nameHi: string }): string {
  return getLanguage() === "hi" ? place.nameHi : place.name;
}

/**
 * Where a painter works, as their card says it: "Works in Ajmer, Jaipur (Rajasthan) · Gujarat",
 * or "Works anywhere in India". Null when they haven't said, or before the names have loaded; a
 * code the catalogue doesn't know is left out rather than shown as a code.
 */
export function workAreasText(codes: readonly string[] | null | undefined, catalogue: WorkAreas | null | undefined): string | null {
  if (!codes?.length || !catalogue) return null;
  if (codes.includes(catalogue.anywhere)) return t("nearby.worksAnywhere");
  const parts: string[] = [];
  for (const state of catalogue.states) {
    if (codes.includes(state.code)) {
      parts.push(placeName(state));
      continue;
    }
    const divisions = state.divisions.filter((d) => codes.includes(d.code)).map(placeName);
    if (divisions.length > 0) parts.push(`${divisions.join(", ")} (${placeName(state)})`);
  }
  return parts.length > 0 ? t("nearby.worksIn", { places: parts.join(" · ") }) : null;
}
