import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value until it settles.
 *
 * Used for search boxes: without it, every keystroke fires a database query,
 * which is wasteful on any connection and painful on a slow one.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
