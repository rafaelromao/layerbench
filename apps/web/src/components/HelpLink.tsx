import { type HelpTopic, helpHref } from '../guide/help.js';

/**
 * A "?" beside a control, leading to the part of the guide about it. It opens in a new tab: the
 * editor keeps unsaved changes in the page, and leaving it for the guide would lose them.
 */
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
