const message = process.env.COMMIT_MESSAGE ?? '';
const header = message.split(/\r?\n/, 1)[0] ?? '';
const parsed = /^(?<type>[a-z]+)(?:\([^()\r\n]+\))?(?<breaking>!)?:\s+\S/.exec(header);
const releasePull = /^chore\(main\): release \d+\.\d+\.\d+$/.test(header);
const releaseTypes = new Set(['feat', 'fix', 'perf', 'revert']);

process.stdout.write(
  String(releasePull || parsed?.groups?.breaking === '!' || releaseTypes.has(parsed?.groups?.type)),
);
