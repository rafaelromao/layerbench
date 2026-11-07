/**
 * What a line of a source text must not hold to join a code or a Markdown corpus. A line that does
 * is left out whole, never rewritten: the corpus is what people typed, and a digit changed to hide
 * a number is a digit nobody typed. `pnpm test` runs the same judgement over the raw texts that
 * ship, and the patterns of `REJECTS` over the samples built from them, so a pattern added here is
 * held against what is already committed.
 *
 * No list of patterns proves that a name is not in a text. That is why comments go whole, why the
 * sources are the projects' own code and docs, and why this list is strict: it would rather leave
 * out a line than keep one that names a person. `names.ts` adds what a pattern cannot know, which
 * words a text never writes in lower case.
 */

export type TextKind = 'code' | 'markdown';

export const MAX_LINE = { code: 160, markdown: 500 } as const;
/** A word this long is a hash, a token, a key or a URL, and none of those is typed from memory. */
export const MAX_WORD = 40;
/** Exact repeats of lines longer than this are left out: vendored files, pasted blocks. */
export const MIN_UNIQUE = 20;

/** Each way a line is turned away, by the reason it is counted under. */
export const REJECTS: Record<string, RegExp> = {
  email:
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}|\b[\w.-]+\s*(?:\[at\]|\(at\)|\{at\})\s*[\w-]+\.[a-z]{2,}|\b\w+\s+at\s+\w+\s+dot\s+\w+/i,
  phone: /\+\d[\d\s().-]{7,}\d|\b\d{3}-\d{4}\b|\d{10,}/,
  address:
    /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6}::[0-9a-f]{0,4}(?::[0-9a-f]{1,4}){0,6}\b/i,
  hex: /[0-9a-fA-F]{24,}/,
  token: /(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{24,}/,
  secret:
    /AKIA[0-9A-Z]{16}|\bASIA[0-9A-Z]{16}\b|\bgh[pousr]_\w{20,}|github_pat_|\bsk-[A-Za-z0-9]{16,}|\bsk_(?:live|test)_|\bxox[baprs]-|-----BEGIN|\beyJ[\w-]{10,}\.|AIza[\w-]{20,}|\bya29\.|:\/\/[^\s/:@]+:[^\s/@]+@|password|passwd|secret|api[_-]?key|private[_-]?key|credential|bearer|authorization|\bbasic\s+[A-Za-z0-9+/=]{12,}/i,
  authorship:
    /copyright|\bauthors?\b|licen[sc]e|maintainers?\b|contributors?\b|\bet al\b|©|\(c\)\s*\d{4}|SPDX|\bthanks\b|\b(?:written|created|maintained|thanks|credits?)\s+(?:by|to)\b|\b(?:contributed|developed|authored|written|created|maintained|designed|inspired|tweaked|forked)\s+(?:\w+\s+){0,3}by\b/i,
};

/** Numbers made of groups: a date or a version has up to eight digits, a telephone number more. */
const GROUPED_NUMBER = /(?<![\w.])\+?\(?\d{1,4}\)?(?:[\s.-]\(?\d{2,5}\)?){2,}(?![\w])/g;
const MIN_PHONE_DIGITS = 9;

/** Where people are named in Markdown: a profile link, a mention, a mail link. */
const PROFILE =
  /mailto:|linkedin\.com|\b(?:twitter|x)\.com\/\w|substack\.com|medium\.com|dev\.to\/|\.github\.io|patreon\.com|youtube\.com\/@|discord\.(?:gg|com)|docker (?:pull|run)\b[^\n]*\s[\w-]+\/[\w-]+|(?<![\w`.@/])@[A-Za-z][\w-]{2,}/i;

/** Where people are named in prose: a byline, `Elon Musk's`, a double-barrelled surname. */
const NAMED =
  /\bBy [A-Z][a-z]+ [A-Z][a-z]+\b|\b[A-Z][a-z]+ [A-Z][a-z]+'s\b|\b[A-Z][a-z]{2,}-[A-Z][a-z]+\b/;

/**
 * A link names whoever owns the site, and a personal one names a person. Only links to the hosts
 * below stay, to a project, a standard, a paper or a service everyone uses, and to the hosts made
 * up for examples; a line with another is left out. A host and every subdomain of it is open, but
 * for those of `CLOSED_HOST`, which are where people keep what is theirs.
 */
const OPEN_HOST = new RegExp(
  `(?:^|\\.)(?:${[
    'github\\.com',
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
    'microsoft\\.com',
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
    'example\\.(?:com|org|net)',
    'localhost',
    '[a-z]+\\.(?:test|example|invalid|localhost)',
  ].join('|')})$|^(?:www\\.)?google\\.com$|^(?:developers\\.google\\.com|docs\\.docker\\.com)$`,
  'i',
);
const CLOSED_HOST =
  /(?:^|\.)(?:api\.github\.com|gist\.github\.com|(?:avatars|raw|user-images|camo)\.githubusercontent\.com|githubusercontent\.com|scholar\.google\.com|hub\.docker\.com)$/i;
const URL_HOST = /https?:\/\/(?:[^\s/@:]+(?::[^\s/@]*)?@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
/** A page of a person on a site that has many: `/~name` on npm, `/u/<id>`, `user=` in a query. */
const PERSONAL_PATH = /\/~[\w.-]+|\/u\/\d+|[?&]user=/;
/** An owner in a link or in a Go import, which has no scheme. */
const OWNED_PATH = /\b(github\.com|huggingface\.co|hf\.co)\/([\w.-]+)/g;

/** On GitHub and Hugging Face the first part of a path is an owner, and a person owns many. */
const OPEN_ORG = new RegExp(
  `^(?:${[
    'Aider-AI|cline|reduxjs|huggingface|openai|microsoft|github|caddyserver|python-poetry',
    'psf|pallets|nim-lang|lodash|google|axios|dair-ai|OpenHands|VoltAgent|anthropics',
    'modelcontextprotocol|agentsmd|langchain-ai|stretchr|apple|nodejs|vuejs|vitejs|tokio-rs',
    'rust-lang|square|Kotlin|dotnet|serilog|App-vNext|expressjs|prettier|TanStack|tmux|nginx',
    'libuv|libevent|fmtlib|abseil|CLIUtils|laravel|composer|guzzle|Alamofire|vapor|pytest-dev',
    'Textualize|encode|python-attrs|pypa|pydantic|fastapi|django|godotengine|owner|your-org',
    'demo|about|org|example',
  ].join('|')})$`,
  'i',
);
const OPEN_OWNER: Record<string, RegExp> = {
  'github.com': OPEN_ORG,
  'huggingface.co':
    /^(?:learn|docs|models|collections|papers|meta-llama|deepseek-ai|moonshotai|Salesforce|openai|google|microsoft|mistralai|Qwen|huggingface|agents-course)$/i,
  'hf.co': /^(?:docs|learn|models|papers|meta-llama|deepseek-ai|Qwen|huggingface)$/i,
};

/** A capitalised pair of words inside a string: the shape of a name in a test, `"Jane Doe"`. */
const NAME_IN_STRING =
  /"[^"]*\b(?:[A-Z][a-z]+ [A-Z][a-z]+|[A-Z]\. [A-Z][a-z]{2,})\b[^"]*"|'[^']*\b(?:[A-Z][a-z]+ [A-Z][a-z]+|[A-Z]\. [A-Z][a-z]{2,})\b[^']*'|`[^`]*\b[A-Z][a-z]+ [A-Z][a-z]+\b[^`]*`/;

const NON_PRINTABLE = /[^\x20-\x7e]/;
/** A letter that is not ASCII: a text in another language, or in a language with accents. */
const FOREIGN_LETTER = /(?=\P{ASCII})\p{L}/u;

/** A number made of groups with enough digits to be a telephone number, not a date or a version. */
function phoneLike(line: string): boolean {
  for (const [match] of line.matchAll(GROUPED_NUMBER)) {
    const digits = match.replace(/\D/g, '').length;
    if (digits >= MIN_PHONE_DIGITS || (match.startsWith('+') && digits >= 7)) return true;
  }
  return false;
}

/** Why a line is left out, or null if it stays. */
export function rejectReason(line: string, kind: TextKind): string | null {
  if (line.length === 0) return 'empty';
  if (kind === 'code' ? NON_PRINTABLE.test(line) : FOREIGN_LETTER.test(line)) return 'non-ascii';
  if (line.length > MAX_LINE[kind]) return 'long';
  if (line.split(' ').some((word) => word.length > MAX_WORD)) return 'word';
  for (const [reason, pattern] of Object.entries(REJECTS)) {
    if (pattern.test(line)) return reason;
  }
  if (phoneLike(line)) return 'phone';
  for (const [, host] of line.matchAll(URL_HOST)) {
    if (CLOSED_HOST.test(host) || !OPEN_HOST.test(host)) return 'host';
  }
  if (PERSONAL_PATH.test(line) && /https?:\/\//.test(line)) return 'host';
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

/**
 * A file that says in its first lines it is under a licence the corpora do not take: a project
 * under MIT can carry a file of someone else's, and the comments that say so are taken out before
 * any line is judged.
 */
export function foreignLicense(text: string): boolean {
  const head = text.split('\n', 60).join('\n');
  return /GNU (?:Lesser |Library |Affero )?General Public License|\bL?GPL(?:v?\d)?\b|Mozilla Public License|\bMPL\b|Eclipse Public License|Python Software Foundation|\bPSF\b|Boost Software License|zlib license|ShareAlike|\bCC[- ]BY[- ]SA/i.test(
    head,
  );
}

/** Paths whose files are copies, data or builds, never typed for the project they are found in. */
export const SKIPPED_PATH =
  /(^|\/)(node_modules|_?vendor(?:ed)?s?|third[_-]?party|3rdparty|deps|external|extern|bundled|dist|build|out|target|testdata|fixtures?|__snapshots__|snapshots|generated|gen|locales?|i18n|po)\/|\.min\.|\.d\.ts$|\.pb\.go$|_generated\.|\.generated\.|\.g\.cs$|\.designer\.cs$/i;
