import { t, type MessageKey } from "@/i18n";

/**
 * What can be painted (website project-details-gate.tsx SURFACE_TYPES). The English
 * label is what the backend stores as `roomType`; the screen shows the translation.
 */
export const ROOM_TYPES = [
  { value: "Living room", key: "living" },
  { value: "Bedroom", key: "bedroom" },
  { value: "Kitchen", key: "kitchen" },
  { value: "Bathroom", key: "bathroom" },
  { value: "Office", key: "office" },
  { value: "Hallway", key: "hallway" },
  { value: "Exterior", key: "exterior" },
  { value: "Other", key: "other" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The name a room takes when none is typed: what it is, or the day the photo went in. */
export function defaultRoomName(roomType: string | null, now: Date = new Date()): string {
  if (roomType) return t(`details.types.${ROOM_TYPES.find((r) => r.value === roomType)?.key ?? "other"}` as MessageKey);
  return t("details.defaultName", { date: `${now.getDate()} ${MONTHS[now.getMonth()]}` });
}
