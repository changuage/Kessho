export const DEGRADE_DRIFT_SCOPE = 'degradeDrift';
export const DEGRADE_EROSION_SCOPE = 'degradeErosion';

const LEGACY_TO_CANONICAL_SCOPE: Record<string, string> = {
  dynamicsDrift: DEGRADE_DRIFT_SCOPE,
  dynamicsErosion: DEGRADE_EROSION_SCOPE,
};

const CANONICAL_TO_LEGACY_SCOPES = Object.entries(LEGACY_TO_CANONICAL_SCOPE)
  .reduce<Record<string, string[]>>((acc, [legacy, canonical]) => {
    const aliases = acc[canonical] ?? [];
    aliases.push(legacy);
    acc[canonical] = aliases;
    return acc;
  }, {});

export function canonicalizePresetScope(scope: string | null | undefined): string | undefined {
  if (!scope) return undefined;
  return LEGACY_TO_CANONICAL_SCOPE[scope] ?? scope;
}

export function getPresetScopeReadCandidates(scope: string | null | undefined): string[] {
  const canonical = canonicalizePresetScope(scope);
  if (!canonical) return [];
  return [canonical, ...(CANONICAL_TO_LEGACY_SCOPES[canonical] ?? [])];
}

export function arePresetScopesCompatible(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return canonicalizePresetScope(left) === canonicalizePresetScope(right);
}
