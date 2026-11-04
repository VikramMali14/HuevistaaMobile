import { LibraryShelf } from "@/features/library/LibraryShelf";
import { PaintSwitch } from "@/features/studio/PaintSwitch";

/**
 * The Paint tab's ready-made rooms: the same shelf as C20, under the tab's switch rather than
 * a way back, so a customer with no photo of their own finds it where they go to paint.
 */
export default function ReadyRoomsTab() {
  return <LibraryShelf inTab top={<PaintSwitch value="ready" />} />;
}
