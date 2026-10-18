/** Immutable undo/redo history for the photo editor. */
export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export const MAX_HISTORY = 50;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

/** Record a new state. Identical consecutive states are ignored. */
export function push<T>(h: History<T>, next: T, equals: (a: T, b: T) => boolean = Object.is): History<T> {
  if (equals(h.present, next)) return h;
  const past = [...h.past, h.present];
  return { past: past.slice(-MAX_HISTORY), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next!, future: rest };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
