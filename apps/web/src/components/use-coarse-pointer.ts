import { useEffect, useState } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

/**
 * Whether this is a finger rather than a mouse.
 *
 * The editor needs to know because the two differ in what they can do at all, not only in how
 * comfortable they are: a finger cannot hover, cannot type on a key without a text field to raise
 * the on-screen keyboard, and cannot aim at a 25px target the way a cursor can.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(QUERY);
    const update = () => setCoarse(query.matches);
    update();
    // A tablet with a keyboard attached and detached changes the answer mid-session.
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return coarse;
}
