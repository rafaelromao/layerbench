import { describe, expect, it } from 'vitest';
import { detectLicenses, isAllowedLicense } from './licenses.js';
import { allocate, lineCost, placeOf, takeLines } from './select.js';
import { readTar } from './tar.js';

describe('sharing a corpus out', () => {
  it('splits by weight, and gives what a short member lacks to the others', () => {
    const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const even = allocate(100, [
      { key: 'a', weight: 3, available: 1000 },
      { key: 'b', weight: 1, available: 1000 },
    ]);
    expect(even.get('a')).toBe(75);
    expect(even.get('b')).toBe(25);
    const short = allocate(100, [
      { key: 'a', weight: 3, available: 1000 },
      { key: 'b', weight: 1, available: 10 },
    ]);
    expect(short.get('b')).toBe(10);
    expect(short.get('a')).toBe(90);
    const starved = allocate(100, [{ key: 'a', weight: 1, available: 30 }]);
    expect(total(starved)).toBe(30);
    expect(allocate(5, [{ key: 'a', weight: 0, available: 9 }]).get('a')).toBe(0);
  });

  it('takes whole lines in a fixed order that does not depend on how they were listed', () => {
    const lines = ['int a;', 'int b;', 'int c;', 'int d;'].map((text) => ({
      text,
      place: placeOf(text),
    }));
    const budget = lineCost('int a;') * 2;
    const forward = takeLines(lines, budget);
    expect(forward).toHaveLength(2);
    expect(takeLines([...lines].reverse(), budget)).toEqual(forward);
    expect(placeOf('a')).toBe(placeOf('a'));
    expect(placeOf('a')).not.toBe(placeOf('b'));
  });

  it('fills a budget with shorter lines when a long one does not fit', () => {
    const lines = [
      { text: 'a long line that does not fit', place: 1 },
      { text: 'ok', place: 2 },
    ];
    expect(takeLines(lines, 5)).toEqual(['ok']);
  });
});

describe('licences', () => {
  it('recognises the allowed ones by their wording', () => {
    expect(
      detectLicenses(
        'Permission is hereby granted, free of charge, to any person obtaining a copy',
      ),
    ).toEqual(['MIT']);
    expect(detectLicenses('Apache License\n Version 2.0, January 2004')).toEqual(['Apache-2.0']);
    expect(
      detectLicenses('Licensed under the Apache License, Version 2.0 (the "License");'),
    ).toEqual(['Apache-2.0']);
    expect(
      detectLicenses(
        '> Permission is hereby granted, free of charge, to any person obtaining\n> a copy',
      ),
    ).toEqual(['MIT']);
    const bsd = 'Redistribution and use in source and binary forms, with or without';
    expect(detectLicenses(bsd)).toEqual(['BSD-2-Clause']);
    expect(detectLicenses(`${bsd} ... Neither the name of the copyright holder`)).toEqual([
      'BSD-3-Clause',
    ]);
    expect(
      detectLicenses(
        'Permission to use, copy, modify, and/or distribute this software for any purpose',
      ),
    ).toEqual(['ISC']);
    expect(
      detectLicenses('This is free and unencumbered software released into the public domain.'),
    ).toEqual(['Unlicense']);
    expect(detectLicenses('CC0 1.0 Universal')).toEqual(['CC0-1.0']);
    expect(detectLicenses('All rights reserved.')).toEqual([]);
    expect(isAllowedLicense('MIT')).toBe(true);
    expect(isAllowedLicense('GPL-3.0')).toBe(false);
  });
});

/** One tar entry: a 512-byte header (name, size in octal, type) and the data padded to 512. */
function entry(name: string, body: string, type = '0', prefix = ''): Buffer {
  const data = Buffer.from(body);
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write(type, 156);
  header.write(prefix, 345);
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

async function* chunked(buffer: Buffer, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buffer.length; i += size) yield buffer.subarray(i, i + size);
}

describe('reading a tar archive', () => {
  const archive = Buffer.concat([
    entry('pax_global_header', '52 comment=abc\n', 'g'),
    entry('repo-abc/', '', '5'),
    entry('repo-abc/a.c', 'int a;\n'),
    entry('x', '30 path=repo-abc/long/name.c\n', 'x'),
    entry('ignored', 'int b;\n'),
    entry('repo-abc/big.c', 'x'.repeat(2000)),
    entry('d.c', 'int d;\n', '0', 'repo-abc/pre'),
    entry('././@LongLink', `repo-abc/${'l'.repeat(120)}.c\0`, 'L'),
    entry('trunc', 'int e;\n'),
    Buffer.alloc(1024),
  ]);

  it('yields the regular files, their long names and their prefixes, in order', async () => {
    const files: [string, string][] = [];
    for await (const f of readTar(chunked(archive, 300), 1000))
      files.push([f.path, f.data.toString()]);
    expect(files).toEqual([
      ['repo-abc/a.c', 'int a;\n'],
      ['repo-abc/long/name.c', 'int b;\n'],
      ['repo-abc/pre/d.c', 'int d;\n'],
      [`repo-abc/${'l'.repeat(120)}.c`, 'int e;\n'],
    ]);
  });

  it('stops at the end of a truncated archive instead of failing', async () => {
    const files: string[] = [];
    for await (const f of readTar(chunked(archive.subarray(0, 2660), 64))) files.push(f.path);
    expect(files).toEqual(['repo-abc/a.c']);
  });
});
