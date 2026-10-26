import type { ComponentProps } from 'react';

/**
 * A list of cards, as the Layers, Features, Special Behaviors and Typing paths tabs show what they
 * list: as many columns as the width holds, one on a phone.
 */
export function CardGrid({
  label,
  className = '',
  ...rest
}: ComponentProps<'ul'> & { label: string }) {
  return <ul aria-label={label} className={`lb-cards ${className}`} {...rest} />;
}

/** One item of a list of cards. */
export function Card({
  current = false,
  className = '',
  ...rest
}: ComponentProps<'li'> & {
  /** The card is the one picked, or the one on the board. */
  current?: boolean;
}) {
  return <li className={`lb-card ${current ? 'lb-card-current' : ''} ${className}`} {...rest} />;
}
