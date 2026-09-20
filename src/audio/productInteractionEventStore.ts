import type { ProductInteractionEvent } from './productInteractionVocabulary';

type ProductInteractionEventListener = (events: readonly ProductInteractionEvent[]) => void;
const listeners = new Set<ProductInteractionEventListener>();

export function publishProductInteractionEvents(events: readonly ProductInteractionEvent[] | undefined): void {
  if (!events || events.length === 0) return;
  for (const listener of listeners) listener(events);
}

export function subscribeProductInteractionEvents(listener: ProductInteractionEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
