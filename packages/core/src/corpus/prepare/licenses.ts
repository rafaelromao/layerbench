/**
 * The open licences a source text may be taken from, recognised by their wording, so that a
 * repository whose licence file is not what its entry says stops the build instead of joining it.
 */

export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Unlicense',
  'CC0-1.0',
] as const;

export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

/** Whether a licence expression such as `MIT` or `Apache-2.0` is one of the allowed ones. */
export function isAllowedLicense(spdx: string): spdx is AllowedLicense {
  return (ALLOWED_LICENSES as readonly string[]).includes(spdx);
}

/** The allowed licences a licence file's text is one of; empty if it is none of them. */
export function detectLicenses(licence: string): AllowedLicense[] {
  const found: AllowedLicense[] = [];
  // A licence file wraps its lines wherever its author did, and may be quoted in Markdown.
  const text = licence.replace(/^[ \t]*>/gm, '').replace(/\s+/g, ' ');
  const has = (pattern: RegExp) => pattern.test(text);
  if (has(/Permission is hereby granted, free of charge, to any person obtaining a copy/i)) {
    found.push('MIT');
  }
  if (has(/Apache License,?\s+Version 2\.0/i)) found.push('Apache-2.0');
  if (has(/Redistribution and use in source and binary forms/i)) {
    const endorsement = has(
      /Neither the name|may not be used to endorse|used to endorse or promote/i,
    );
    found.push(endorsement ? 'BSD-3-Clause' : 'BSD-2-Clause');
  }
  if (
    has(/Permission to use, copy, modify, and(?:\/or)? distribute this software for any purpose/i)
  ) {
    found.push('ISC');
  }
  if (has(/This is free and unencumbered software released into the public domain/i)) {
    found.push('Unlicense');
  }
  if (has(/CC0 1\.0 Universal|Creative Commons Zero/i)) found.push('CC0-1.0');
  return found;
}
