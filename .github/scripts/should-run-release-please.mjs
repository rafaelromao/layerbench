import { readFileSync } from 'node:fs';

const releaseTypes = new Set(['feat', 'fix', 'perf', 'revert']);

function isReleaseWorthy(message) {
  const header = message.split(/\r?\n/, 1)[0] ?? '';
  const parsed = /^(?<type>[a-z]+)(?:\([^()\r\n]+\))?(?<breaking>!)?:\s+\S/.exec(header);
  const releasePull = /^chore\(main\): release \d+\.\d+\.\d+$/.test(header);
  return releasePull || parsed?.groups?.breaking === '!' || releaseTypes.has(parsed?.groups?.type);
}

const messages = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);
process.stdout.write(String(messages.some(isReleaseWorthy)));
