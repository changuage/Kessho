import type { ProductControlRevision } from './ProductControlState';

export function nextProductControlRevision(revision: ProductControlRevision): ProductControlRevision {
  return revision + 1;
}
