// src/presets/catalog.ts
// Helpers for grouping presets into family + variant catalog views.

import type {
  PresetFamilySummary,
  PresetLibrary,
  PresetSummary,
  PresetVariantSummary,
} from './types';

const LIBRARY_ORDER: Record<PresetLibrary, number> = {
  stock: 0,
  user: 1,
  cloud: 2,
};

function compareVariants(left: PresetVariantSummary, right: PresetVariantSummary): number {
  const leftRank = left.variantRank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.variantRank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (left.library !== right.library) return LIBRARY_ORDER[left.library] - LIBRARY_ORDER[right.library];
  if (left.variantName !== right.variantName) return left.variantName.localeCompare(right.variantName);
  return right.updatedAt - left.updatedAt;
}

export function getPresetDisplayLabel(summary: Pick<PresetSummary, 'name' | 'familyName' | 'variantName'>): string {
  if (summary.variantName && summary.variantName !== summary.familyName) {
    return `${summary.familyName} · ${summary.variantName}`;
  }
  return summary.name;
}

export function buildPresetFamilies(presets: PresetSummary[]): PresetFamilySummary[] {
  const familyMap = new Map<string, PresetFamilySummary>();

  for (const preset of presets) {
    const family = familyMap.get(preset.familyId);
    if (family) {
      family.variants.push(preset);
      if (!family.libraries.includes(preset.library)) {
        family.libraries.push(preset.library);
      }
      family.variantCount = family.variants.length;
      family.updatedAt = Math.max(family.updatedAt, preset.updatedAt);
      continue;
    }

    familyMap.set(preset.familyId, {
      familyId: preset.familyId,
      familyName: preset.familyName,
      type: preset.type,
      scope: preset.scope,
      engine: preset.engine,
      source: preset.source,
      libraries: [preset.library],
      variantCount: 1,
      updatedAt: preset.updatedAt,
      variants: [preset],
    });
  }

  const families = [...familyMap.values()];
  for (const family of families) {
    family.variants.sort(compareVariants);
  }

  families.sort((left, right) => {
    if (left.familyName !== right.familyName) return left.familyName.localeCompare(right.familyName);
    return right.updatedAt - left.updatedAt;
  });

  return families;
}
