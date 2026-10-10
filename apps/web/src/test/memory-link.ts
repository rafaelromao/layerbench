import type { LinkPort } from '../layout-session/session.js';

/**
 * The link as a test holds it: the layout reference, every write the session made to it, and a way
 * to change it the way Back or a followed link does, without the session writing it.
 */
export class MemoryLink implements LinkPort {
  readonly writes: { ref: string; how: 'edit' | 'open' }[] = [];
  private readonly listeners = new Set<(ref: string) => void>();

  constructor(private ref: string) {}

  current(): string {
    return this.ref;
  }

  write(ref: string, how: 'edit' | 'open'): void {
    this.writes.push({ ref, how });
    this.change(ref);
  }

  /** Back, or a link followed: the reference changes and the session did not write it. */
  visit(ref: string): void {
    this.change(ref);
  }

  subscribe(listener: (ref: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private change(ref: string) {
    this.ref = ref;
    for (const listener of this.listeners) listener(ref);
  }
}
