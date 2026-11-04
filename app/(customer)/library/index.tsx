import { BackButton } from "@/components/ui";
import { LibraryShelf } from "@/features/library/LibraryShelf";

/**
 * C20 · Ready-made rooms. Spec: docs/04-screens-customer.md — C20.
 *
 * Rooms the HueVistaa team photographed and marked, to paint free. Indoor / Outdoor
 * only when the shelf has both.
 */
export default function LibraryScreen() {
  return <LibraryShelf top={<BackButton fallback="/home" />} />;
}

