import { type HelpTopic, helpHref } from '../guide/help.js';

/*
 * Every link to the guide opens it in a new tab: the editor keeps unsaved changes in the page, and
 * leaving it for the guide would lose them.
 */

/** A "?" beside a control, leading to the part of the guide about it. */
export function HelpLink({ help, className = '' }: { help: HelpTopic; className?: string }) {
  return (
    <a
      href={helpHref(help)}
      target="_blank"
      rel="noopener"
      className={`lb-help ${className}`}
      aria-label={`Help on ${help.topic} (opens in a new tab)`}
      title={`Help on ${help.topic}`}
    >
      ?
    </a>
  );
}

/**
 * A word that is itself the link to the part of the guide about it, such as a card's category. Its
 * name is read first, then where it leads.
 */
export function HelpWord({
  help,
  word,
  className = '',
}: {
  help: HelpTopic;
  word: string;
  className?: string;
}) {
  return (
    <a
      href={helpHref(help)}
      target="_blank"
      rel="noopener"
      className={className}
      aria-label={`${word}, help on ${help.topic} (opens in a new tab)`}
      title={`Help on ${help.topic}`}
    >
      {word}
    </a>
  );
}
