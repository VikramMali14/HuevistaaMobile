import { useEffect, useRef } from "react";

/**
 * Whether the screen is still there, for work that outlives a press — a long look for a
 * send whose answer was lost, or a number that arrives after the card has gone.
 */
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
