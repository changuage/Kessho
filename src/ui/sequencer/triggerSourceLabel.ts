export function triggerSourceDisplayLabel(
  sourceLabel: string | null | undefined,
  sourceOrigin: string | null | undefined,
): string {
  const raw = sourceLabel?.trim() || sourceOrigin?.trim() || 'Euclid';
  if (raw === 'Base' || raw === 'base' || raw === 'Manual' || raw === 'manual') return 'Step';
  if (raw === 'Euclidean' || raw === 'euclidean') return 'Euclid';
  return raw.replace('Euclidean', 'Euclid');
}

export function shouldShowTriggerSourceBadge(
  sourceOrigin: string | null | undefined,
  sourceDirty: boolean | null | undefined,
): boolean {
  const origin = sourceOrigin ?? 'euclidean';
  return Boolean(sourceDirty) || (origin !== 'euclidean' && origin !== 'manual');
}
