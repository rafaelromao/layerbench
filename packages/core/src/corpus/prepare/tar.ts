/**
 * The files of a tar archive, read as it streams in and never written to disk: what a downloaded
 * repository holds is data to read, not something to unpack and run.
 */

export interface TarFile {
  path: string;
  data: Buffer;
}

const BLOCK = 512;

function text(header: Buffer, from: number, length: number): string {
  const field = header.subarray(from, from + length);
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? length : end).toString('utf8');
}

/** The `path` of a pax extended header, whose records are `<length> <key>=<value>\n`. */
function paxPath(body: string): string | undefined {
  return /^\d+ path=(.*)$/m.exec(body)?.[1];
}

/**
 * The regular files of the archive no larger than `maxFile` bytes, in order. A larger one is
 * skipped as it streams past.
 */
export async function* readTar(
  chunks: AsyncIterable<Uint8Array>,
  maxFile = 400_000,
): AsyncGenerator<TarFile> {
  const iterator = chunks[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  const fill = async (bytes: number): Promise<boolean> => {
    while (buffer.length < bytes) {
      const next = await iterator.next();
      if (next.done) return false;
      buffer = Buffer.concat([buffer, next.value]);
    }
    return true;
  };
  const skip = async (bytes: number): Promise<void> => {
    let left = bytes;
    while (left > 0 && (buffer.length > 0 || (await fill(1)))) {
      const step = Math.min(left, buffer.length);
      buffer = buffer.subarray(step);
      left -= step;
    }
  };

  let pending: string | undefined;
  while (await fill(BLOCK)) {
    const header = buffer.subarray(0, BLOCK);
    if (header.every((byte) => byte === 0)) return;
    buffer = buffer.subarray(BLOCK);
    const name = text(header, 0, 100);
    const size = Number.parseInt(text(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    const prefix = text(header, 345, 155);
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x' || type === 'L') {
      await fill(padded);
      const body = buffer.subarray(0, size).toString('utf8');
      buffer = buffer.subarray(padded);
      pending = type === 'L' ? body.replace(/\0+$/, '') : paxPath(body);
    } else if ((type === '0' || type === '\0') && size <= maxFile) {
      await fill(padded);
      const data = Buffer.from(buffer.subarray(0, size));
      buffer = buffer.subarray(padded);
      yield { path: pending ?? (prefix ? `${prefix}/${name}` : name), data };
      pending = undefined;
    } else {
      await skip(padded);
      if (type !== 'g') pending = undefined;
    }
  }
}
