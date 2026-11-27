export type FlipSaveChoice = "both" | "chat";

type Waiter = (value: FlipSaveChoice | null) => void;

let waiter: Waiter | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function flipSaveOpen() {
  return waiter != null;
}

export function subscribeFlipSave(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestFlipSave(): Promise<FlipSaveChoice | null> {
  if (waiter) waiter(null);
  return new Promise((resolve) => {
    waiter = resolve;
    emit();
  });
}

export function finishFlipSave(value: FlipSaveChoice | null) {
  const resolve = waiter;
  waiter = null;
  emit();
  resolve?.(value);
}
