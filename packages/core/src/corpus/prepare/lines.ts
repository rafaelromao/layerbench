/**
 * What a line of a source text must not hold to join a code or a Markdown corpus. A line that does
 * is left out whole, never rewritten: the corpus is what people typed, and a digit changed to hide
 * a number is a digit nobody typed. `pnpm test` runs the same judgement over the texts that
 * ship, so a pattern added here is held against what is already committed.
 */

export type TextKind = 'code' | 'markdown';

export const MAX_LINE = { code: 160, markdown: 500 } as const;
/** A word this long is a hash, a token, a key or a URL, and none of those is typed from memory. */
export const MAX_WORD = 64;
/** Exact repeats of lines longer than this are left out: vendored files, pasted blocks. */
export const MIN_UNIQUE = 20;

/** Each way a line is turned away, by the reason it is counted under. */
export const REJECTS: Record<string, RegExp> = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
  phone: /(?<![\w.])\+?\(?\d{1,4}\)?(?:[\s.-]\(?\d{2,5}\)?){2,}(?![\w])|\d{10,}/,
  address: /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){5,7}\b/i,
  hex: /[0-9a-fA-F]{24,}/,
  secret:
    /AKIA[0-9A-Z]{16}|\bgh[pousr]_\w{20,}|github_pat_|\bsk-[A-Za-z0-9]{16,}|\bxox[baprs]-|-----BEGIN|\beyJ[\w-]{10,}\.|AIza[\w-]{20,}|:\/\/[^\s/:@]+:[^\s/@]+@|password|passwd|secret|api[_-]?key|private[_-]?key|credential|bearer/i,
  authorship:
    /copyright|\bauthors?\b|licen[sc]e|maintainers?\b|contributors?\b|\bet al\b|©|\(c\)\s*\d{4}|SPDX|\b(?:written|created|maintained|thanks|credits?)\s+(?:by|to)\b/i,
};

/** Where people are named in Markdown: a profile link, a mention, a mail link. */
const PROFILE =
  /mailto:|linkedin\.com|\b(?:twitter|x)\.com\/\w|(?:github|huggingface)\.(?:com|co)\/[\w-]+(?![\w/-])|substack\.com|medium\.com|dev\.to\/|\.github\.io|patreon\.com|youtube\.com\/@|discord\.(?:gg|com)|docker (?:pull|run)\b[^\n]*\s[\w-]+\/[\w-]+|(?<![\w`.@/])@[A-Za-z][\w-]{2,}/i;

/** Where people are named in prose: a byline, `Elon Musk's`, a double-barrelled surname. */
const NAMED =
  /\bBy [A-Z][a-z]+ [A-Z][a-z]+\b|\b[A-Z][a-z]+ [A-Z][a-z]+'s\b|\b[A-Z][a-z]{2,}-[A-Z][a-z]+\b/;

/**
 * A link names whoever owns the site, and a personal one names a person. Only links to the hosts
 * below stay, to a project, a standard, a paper or a service everyone uses, and to the hosts made
 * up for examples; a line with another is left out.
 */
const OPEN_HOST = new RegExp(
  `(?:^|\\.)(?:${[
    'github\\.com',
    'githubusercontent\\.com',
    'arxiv\\.org',
    'aclanthology\\.org',
    'nature\\.com',
    'huggingface\\.co',
    'hf\\.co',
    'aider\\.chat',
    'promptingguide\\.ai',
    'dair\\.ai',
    'openai\\.com',
    'anthropic\\.com',
    'mistral\\.ai',
    'langfuse\\.com',
    'openrouter\\.ai',
    'cline\\.bot',
    'langchain\\.com',
    'llamaindex\\.ai',
    'crewai\\.io',
    'wandb\\.ai',
    'google\\.com',
    'microsoft\\.com',
    'docker\\.com',
    'python\\.org',
    'pypi\\.org',
    'pypa\\.io',
    'mozilla\\.org',
    'w3\\.org',
    'apache\\.org',
    'json-schema\\.org',
    'golang\\.org',
    'pkg\\.go\\.dev',
    'rust-lang\\.org',
    'nim-lang\\.org',
    'kotlinlang\\.org',
    'swift\\.org',
    'nuget\\.org',
    'npmjs\\.com',
    'nodejs\\.org',
    'readthedocs\\.io',
    'example\\.(?:com|org|net)',
    'localhost',
    '[a-z]+\\.(?:test|example|invalid|localhost)',
  ].join('|')})$`,
  'i',
);
const URL_HOST = /https?:\/\/(?:[^\s/@:]+(?::[^\s/@]*)?@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
/** An owner in a link or in a Go import, which has no scheme. */
const OWNED_PATH = /\b(github\.com|huggingface\.co)\/([\w.-]+)/g;

/** On GitHub and Hugging Face the first part of a path is an owner, and a person owns many. */
const OPEN_OWNER: Record<string, RegExp> = {
  'github.com': new RegExp(
    `^(?:${[
      'Aider-AI|cline|reduxjs|huggingface|openai|microsoft|github|caddyserver|python-poetry',
      'psf|pallets|nim-lang|lodash|google|axios|dair-ai|OpenHands|VoltAgent|anthropics',
      'modelcontextprotocol|agentsmd|langchain-ai|stretchr|apple|nodejs|vuejs|vitejs|tokio-rs',
      'rust-lang|square|Kotlin|dotnet|serilog|App-vNext|expressjs|prettier|TanStack|tmux|nginx',
      'libuv|libevent|fmtlib|abseil|CLIUtils|laravel|composer|guzzle|Alamofire|vapor|pytest-dev',
      'Textualize|encode|python-attrs|pypa|pydantic|fastapi|django|godotengine|owner|your-org',
      'demo|about|users|org|example',
    ].join('|')})$`,
    'i',
  ),
  'huggingface.co':
    /^(?:blog|learn|docs|models|collections|papers|meta-llama|deepseek-ai|moonshotai|Salesforce|openai|google|microsoft|mistralai|Qwen|huggingface|agents-course)$/i,
};

/** A capitalised pair of words inside a string: the shape of a name in a test, `"Jane Doe"`. */
const NAME_IN_STRING = /(["'`])[^"'`]*\b[A-Z][a-z]+ [A-Z][a-z]+\b[^"'`]*\1/;

const NON_PRINTABLE = /[^\x20-\x7e]/;
/** A letter that is not ASCII: a text in another language, or in a language with accents. */
const FOREIGN_LETTER = /(?=\P{ASCII})\p{L}/u;

/** Why a line is left out, or null if it stays. */
export function rejectReason(line: string, kind: TextKind): string | null {
  if (line.length === 0) return 'empty';
  if (kind === 'code' ? NON_PRINTABLE.test(line) : FOREIGN_LETTER.test(line)) return 'non-ascii';
  if (line.length > MAX_LINE[kind]) return 'long';
  if (line.split(' ').some((word) => word.length > MAX_WORD)) return 'word';
  for (const [reason, pattern] of Object.entries(REJECTS)) {
    if (pattern.test(line)) return reason;
  }
  for (const [, host] of line.matchAll(URL_HOST)) if (!OPEN_HOST.test(host)) return 'host';
  for (const [, host, owner] of line.matchAll(OWNED_PATH)) {
    if (!OPEN_OWNER[host].test(owner)) return 'host';
  }
  if (kind === 'markdown') {
    if (PROFILE.test(line)) return 'profile';
    return NAMED.test(line) ? 'name' : null;
  }
  if (NAME_IN_STRING.test(line)) return 'name';
  const digits = line.replace(/\D/g, '').length;
  return line.length >= 20 && digits / line.length > 0.3 ? 'digits' : null;
}

/** A line with each run of white space one space and none at either end. */
export function tidy(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/** The text of a file that is not typed by hand: generated, minified, binary. */
export function isGenerated(text: string): boolean {
  if (text.includes('\0')) return true;
  const head = text.split('\n', 12).join('\n');
  return /do not edit|do not modify|auto-?generated|code generated|@generated|generated by/i.test(
    head,
  );
}

/** Paths whose files are copies, data or builds, never typed for the project they are found in. */
export const SKIPPED_PATH =
  /(^|\/)(node_modules|vendor|vendors|third[_-]?party|deps|external|dist|build|out|target|testdata|fixtures?|__snapshots__|snapshots|generated|gen|locales?|i18n|po)\/|\.min\.|\.d\.ts$|\.pb\.go$|_generated\.|\.generated\.|\.g\.cs$|\.designer\.cs$/i;

/** The lines of one file that stay: tidied, judged, and without those it already gave. */
export function keptLines(lines: Iterable<string>, kind: TextKind): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = tidy(raw);
    if (rejectReason(line, kind) === null) out.push(line);
  }
  return out;
}
