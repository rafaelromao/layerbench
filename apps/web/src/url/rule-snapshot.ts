import { type RuleSet, safeParseRuleSet } from '@layerbench/core/rules';

const VERSION = 'v1.';
export const MAX_RULE_SNAPSHOT_BYTES = 2_000_000;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url data');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Validate and encode a custom rule set for the target fragment, without writing it to storage. */
export function encodeRuleSnapshot(ruleSet: RuleSet): string {
  const parsed = safeParseRuleSet(ruleSet);
  if (!parsed.ok) throw new Error(`Cannot share invalid custom rules: ${parsed.error}`);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed.ruleSet));
  if (bytes.length > MAX_RULE_SNAPSHOT_BYTES)
    throw new Error(
      'The custom rule-set snapshot is too large to share. Choose a smaller rule set.',
    );
  return VERSION + encodeBase64Url(bytes);
}

/** Decode and validate a versioned custom rule-set snapshot. */
export function decodeRuleSnapshot(
  snapshot: string,
): { ok: true; ruleSet: RuleSet } | { ok: false; error: string } {
  if (!snapshot.startsWith(VERSION))
    return { ok: false, error: 'The custom rule-set snapshot version is unsupported.' };
  try {
    const encoded = snapshot.slice(VERSION.length);
    const bytes = decodeBase64Url(encoded);
    if (encodeBase64Url(bytes) !== encoded) throw new Error('noncanonical base64url data');
    if (bytes.length > MAX_RULE_SNAPSHOT_BYTES)
      return {
        ok: false,
        error:
          'The custom rule-set snapshot is too large to share. Choose a smaller rule set and retry.',
      };
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const parsed = safeParseRuleSet(value);
    if (!parsed.ok)
      return { ok: false, error: `Invalid custom rule-set snapshot: ${parsed.error}` };
    return { ok: true, ruleSet: parsed.ruleSet };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid custom rule-set snapshot: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
