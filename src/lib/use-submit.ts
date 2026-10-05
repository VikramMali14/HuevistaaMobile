import { useCallback, useRef, useState } from "react";

/**
 * One submission at a time. `busy` drives the spinner; the ref stops a second one that
 * arrives in the same frame — a double tap, or code boxes that submit themselves on the
 * sixth digit while the button is pressed — before `busy` has re-rendered anything.
 */
export function useSubmit() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
