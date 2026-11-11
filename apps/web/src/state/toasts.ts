import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast['kind'], text: string, sticky?: boolean) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/**
 * Transient messages: what was saved, what failed. They never block the interface. A sticky one
 * stays until it is closed, and is shown once however often it is pushed: it tells what happened to
 * the reader's layouts while they were not looking, and six seconds are too few to be sure they saw.
 */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, text, sticky = false) => {
    if (sticky && get().toasts.some((t) => t.kind === kind && t.text === text)) return;
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    if (!sticky) {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (text: string, opts: { sticky?: boolean } = {}) =>
    useToasts.getState().push('info', text, opts.sticky),
  error: (text: string) => useToasts.getState().push('error', text),
};
