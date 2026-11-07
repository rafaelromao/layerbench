import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import {
  detectLicenses,
  foreignLicense,
  isAllowedLicense,
  isGenerated,
  MIN_UNIQUE,
  placeOf,
  readTar,
  rejectReason,
  SKIPPED_PATH,
  type TextKind,
  tidy,
} from '@layerbench/core/prepare';
import { tarballPath } from './code-sources.js';

/** What a repository is read as: the files it gives, and how a file becomes lines. */
export interface Reading {
  kind: TextKind;
  extensions: string[];
  /** The lines of one file, before they are judged. */
  lines: (text: string, path: string) => string[];
  /** A path to leave out besides those every text leaves out. */
  skip?: RegExp;
  /** Read the files that tests keep as fixtures, where a language's samples are. */
  keepFixtures?: boolean;
}

export interface ArchiveRepo {
  id: string;
  repo: string;
  commit: string;
  license: string;
  licenseFile: string;
  include?: string[];
  exclude?: string;
}

export interface Candidate {
  text: string;
  place: number;
}

export interface RepoRead<R extends ArchiveRepo = ArchiveRepo> {
  repo: R;
  files: number;
  /** Files left out for saying, in their first lines, that they are under another licence. */
  foreign: number;
  /** Lines judged, and why those that were left out were. */
  seen: number;
  rejected: Map<string, number>;
  lines: Candidate[];
  taken: string[];
  /** Why the repository's licence file is not the licence its entry says, if it is not. */
  licenseError?: string;
}

/** A path that a test's own fixtures sit in, which a text of fixtures asks to keep. */
const FIXTURES = /(^|\/)(testdata|fixtures?|snapshots)\//i;

/**
 * Reads one repository's archive: its files' lines, judged, the long ones kept once across the
 * `best` map shared by the repositories of a text, and its licence file checked.
 */
export async function readArchive<R extends ArchiveRepo>(
  repo: R,
  reading: Reading,
  best: Map<string, Candidate & { repo: string }>,
): Promise<RepoRead<R>> {
  const file = tarballPath(repo);
  if (!existsSync(file)) throw new Error(`${repo.id}: not fetched (pnpm corpora:fetch ${repo.id})`);
  const read: RepoRead<R> = {
    repo,
    files: 0,
    foreign: 0,
    seen: 0,
    rejected: new Map(),
    lines: [],
    taken: [],
  };
  const exclude = repo.exclude ? new RegExp(repo.exclude) : null;
  let licence: string | undefined;

  for await (const entry of readTar(createReadStream(file).pipe(createGunzip()))) {
    // GitHub puts everything under `<repo>-<commit>/`.
    const path = entry.path.slice(entry.path.indexOf('/') + 1);
    if (path === repo.licenseFile) licence = entry.data.toString('utf8');
    const dot = path.lastIndexOf('.');
    if (dot < 0 || !reading.extensions.includes(path.slice(dot))) continue;
    const skipped = reading.keepFixtures
      ? SKIPPED_PATH.test(path.replace(FIXTURES, '/'))
      : SKIPPED_PATH.test(path);
    if (skipped || reading.skip?.test(path) || exclude?.test(path)) continue;
    if (repo.include && !repo.include.some((prefix) => path.startsWith(prefix))) continue;
    const text = entry.data.toString('utf8');
    if (isGenerated(text)) continue;
    if (foreignLicense(text)) {
      read.foreign++;
      continue;
    }
    read.files++;
    let n = 0;
    for (const raw of reading.lines(text, path)) {
      const line = tidy(raw);
      if (line.length === 0) continue;
      read.seen++;
      const why = rejectReason(line, reading.kind);
      if (why) {
        read.rejected.set(why, (read.rejected.get(why) ?? 0) + 1);
        continue;
      }
      const candidate = { text: line, place: placeOf(`${repo.id}\0${path}\0${n++}`) };
      if (line.length <= MIN_UNIQUE) {
        read.lines.push(candidate);
      } else {
        // The same long line in two places is kept once, where it sorts first.
        const held = best.get(line);
        if (!held || candidate.place < held.place) best.set(line, { ...candidate, repo: repo.id });
      }
    }
  }

  if (!isAllowedLicense(repo.license))
    read.licenseError = `${repo.id}: ${repo.license} is not allowed`;
  else if (licence === undefined) read.licenseError = `${repo.id}: no ${repo.licenseFile} in it`;
  else if (!detectLicenses(licence).includes(repo.license)) {
    read.licenseError = `${repo.id}: ${repo.licenseFile} is not ${repo.license}`;
  }
  return read;
}

/** Hands the long lines the repositories share back to the one each is kept for. */
export function settle(
  reads: RepoRead<ArchiveRepo>[],
  best: Map<string, Candidate & { repo: string }>,
): void {
  const byId = new Map(reads.map((r) => [r.repo.id, r]));
  for (const { text, place, repo } of best.values()) byId.get(repo)?.lines.push({ text, place });
}
