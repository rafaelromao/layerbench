import { readFileSync } from 'node:fs';

const LABEL_PREFIX = 'release-note: ';
const HIDDEN_LABEL = `${LABEL_PREFIX}hidden`;
const labelsByType = {
  feat: `${LABEL_PREFIX}feature`,
  fix: `${LABEL_PREFIX}fix`,
  perf: `${LABEL_PREFIX}performance`,
  revert: `${LABEL_PREFIX}revert`,
};

function releaseLabel({ title = '' }) {
  const parsed = /^(?<type>[a-z]+)(?:\([^()\r\n]+\))?(?<breaking>!)?:\s+\S/.exec(title);
  if (parsed?.groups?.breaking === '!') {
    return `${LABEL_PREFIX}breaking`;
  }
  const type = parsed?.groups?.type;
  return Object.hasOwn(labelsByType, type) ? labelsByType[type] : HIDDEN_LABEL;
}

function readSince(args) {
  const index = args.indexOf('--since');
  const since = index >= 0 ? Date.parse(args[index + 1] ?? '') : Number.NaN;
  if (!Number.isFinite(since)) throw new Error('Pass a valid timestamp with --since.');
  return since;
}

const since = readSince(process.argv.slice(2));
const pullRequests = JSON.parse(readFileSync(0, 'utf8'));
if (!Array.isArray(pullRequests)) throw new Error('Pull request input must be a JSON array.');

const uniquePullRequests = new Map(
  pullRequests.map((pullRequest) => [pullRequest.number, pullRequest]),
);
const updates = [];

for (const pullRequest of uniquePullRequests.values()) {
  const mergedAt = Date.parse(pullRequest.mergedAt ?? '');
  if (!Number.isFinite(mergedAt))
    throw new Error(`Pull request #${pullRequest.number} has no merge time.`);
  if (mergedAt < since) continue;

  const label = releaseLabel(pullRequest);
  const currentLabels = (pullRequest.labels ?? []).map((item) =>
    typeof item === 'string' ? item : item.name,
  );
  const removeLabels = currentLabels.filter(
    (current) => current?.startsWith(LABEL_PREFIX) && current !== label,
  );
  if (!currentLabels.includes(label) || removeLabels.length > 0) {
    updates.push({ number: pullRequest.number, label, removeLabels });
  }
}

process.stdout.write(`${JSON.stringify(updates)}\n`);
