import { useCallback, useState } from "react";

/**
 * Pull to refresh that spins only for a pull. Tying the spinner to the queries'
 * own `isRefetching` spun it whenever they reloaded on their own (coming back to the
 * app, a code added elsewhere), over a screen nobody had touched.
 */
export function usePullToRefresh(refresh: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve()
      .then(refresh)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}
