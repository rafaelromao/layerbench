import { useCallback, useSyncExternalStore } from 'react';

/** The width below which the app lays itself out for a phone, as the stylesheet does. */
export const WIDE = '(min-width: 640px)';

/** Whether a media query matches, kept up to date as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
