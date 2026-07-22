// src/presets/fileIO.ts
// Phase 2 — File export/import for all preset levels.
// Works without PresetStore — just download/upload .json files.

import type { PresetFile, PresetEntry, PresetLevel } from './types';
import { extractParams } from './codec';
import { generatePresetId } from './presetUtils';
import { decodeCurrentPresetEntry, UnsupportedPresetVersionError } from './currentPresetSchema';
import type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

const APP_VERSION = '1.0.0';

function levelToPresetLevel(level: ParamLevel): PresetLevel {
  switch (level) {
    case 1: return 'engine';
    case 2: return 'kit';
    case 3: return 'source';
    case 4: return 'state';
    default: return 'state';
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────

/** Download a PresetEntry as a .json file */
export async function exportPresetToFile(entry: PresetEntry): Promise<void> {
  const normalized = decodeCurrentPresetEntry(entry);
  const envelope: PresetFile = {
    kesshoPreset: true,
    formatVersion: 1,
    id: normalized.id,
    type: normalized.type,
    scope: normalized.scope,
    engine: normalized.engine,
    source: normalized.source,
    name: normalized.name,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    entry: normalized,
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });

  const safeName = entry.name.replace(/[^a-z0-9]/gi, '_');

  // Try File System Access API, fall back to <a download>
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `${safeName}.json`,
        startIn: 'downloads',
        types: [{ description: 'Kessho Preset', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // User cancelled
      // Fall through to download fallback
    }
  }

  // Fallback: create a temporary download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import ─────────────────────────────────────────────────────────────────

/** Upload a JSON file and return only the current canonical PresetEntry. */
export function importPresetFromFile(): Promise<PresetEntry | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.kesshoPreset !== true) {
          throw new UnsupportedPresetVersionError('Preset file is not a current Kessho preset envelope');
        }
        if (parsed.formatVersion !== 1) {
          throw new UnsupportedPresetVersionError(`Unsupported preset file format version: ${String(parsed.formatVersion)}`);
        }
        if (!parsed.entry) throw new UnsupportedPresetVersionError('Current preset file is missing its entry');
        resolve(decodeCurrentPresetEntry(parsed.entry));
      } catch (error) {
        reject(error instanceof UnsupportedPresetVersionError
          ? error
          : new UnsupportedPresetVersionError(`Unable to read current preset file: ${error instanceof Error ? error.message : String(error)}`));
      }
    };
    // Handle cancel (no change event fires)
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// ─── Quick Export ────────────────────────────────────────────────────────────

/**
 * Slice current state at a given level+scope and download as a file.
 * Convenience wrapper that creates a temporary PresetEntry and exports it.
 */
export async function quickExport(
  state: SliderState,
  level: ParamLevel,
  scope: string,
  presetName: string,
): Promise<void> {
  const params = extractParams(state, level, scope);
  const now = Date.now();
  const entry: PresetEntry = {
    id: generatePresetId(),
    type: levelToPresetLevel(level),
    scope,
    engine: level === 1 ? scope : undefined,
    source: level >= 2 ? scope : undefined,
    name: presetName,
    author: 'user',
    versions: [{
      v: 1,
      note: '',
      timestamp: now,
      data: params,
    }],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await exportPresetToFile(entry);
}
