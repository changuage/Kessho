// src/ui/drums/DrumPresetManager.tsx
// Compact preset manager for drum voice engine (L1).
// Dropdown selector + action row for selected preset + version history.
// Follows the L4 PresetFamilyTree UI pattern.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { usePresets } from '../../presets/usePresets';
import { PresetRatingStars } from '../../presets/PresetRatingStars';
import { getVersionData } from '../../presets/codec';
import { PRESET_DELETE_ENABLED, SHARED_PRESET_TEST_MODE } from '../../presets/sharedMode';
import {
  getFactoryPresetNames,
  upsertUserPreset,
} from '../../audio/drumPresets';
import type { PresetEntry } from '../../presets/types';
import { canRateDrumPreset, rateDrumPreset } from './drumPresetRating';
import { applyDrumPresetSlotChange } from './drumPresetApply';

const DRUM_ENGINE_SCOPES: Record<DrumVoiceType, string> = {
  sub: 'drumSub',
  kick: 'drumKick',
  click: 'drumClick',
  beepHi: 'drumBeepHi',
  beepLo: 'drumBeepLo',
  noise: 'drumNoise',
  membrane: 'drumMembrane',
};

const MORPH_KEYS: Record<DrumVoiceType, { a: keyof SliderState; b: keyof SliderState }> = {
  sub: { a: 'drumSubPresetA', b: 'drumSubPresetB' },
  kick: { a: 'drumKickPresetA', b: 'drumKickPresetB' },
  click: { a: 'drumClickPresetA', b: 'drumClickPresetB' },
  beepHi: { a: 'drumBeepHiPresetA', b: 'drumBeepHiPresetB' },
  beepLo: { a: 'drumBeepLoPresetA', b: 'drumBeepLoPresetB' },
  noise: { a: 'drumNoisePresetA', b: 'drumNoisePresetB' },
  membrane: { a: 'drumMembranePresetA', b: 'drumMembranePresetB' },
};

function createRuntimeDrumPreset(
  voice: DrumVoiceType,
  name: string,
  data: Record<string, unknown>,
  tags?: string[],
) {
  const params: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'string') {
      params[key] = value;
    }
  }
  return { name, voice, params, tags: tags ?? [] };
}

const humanize = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();

interface DrumPresetManagerProps {
  voice: DrumVoiceType;
  state: SliderState;
  color: string;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
}

/* ── Styles (matching L4 PresetFamilyTree) ── */
const s: Record<string, React.CSSProperties> = {
  root: {
    padding: '6px 0 4px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: 2,
  },
  header: {
    fontSize: '0.6rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: 4,
  },
  select: {
    flex: 1,
    minWidth: 0,
    fontSize: '0.75rem',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#ccc',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 4,
    padding: '3px 6px',
    cursor: 'pointer',
    colorScheme: 'dark' as const,
  },
  presetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 4px',
    borderRadius: 4,
    fontSize: '0.75rem',
    color: '#ccc',
  },
  presetName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
    fontSize: '0.8rem',
    color: '#a5c4d4',
  },
  versionBadge: {
    fontSize: '0.6rem',
    color: '#666',
    flexShrink: 0,
  },
  slotBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 8px',
    fontSize: '0.6rem',
    fontWeight: 700,
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    textAlign: 'center' as const,
  },
  slotA: {
    color: '#7eb8d0',
    borderColor: 'rgba(126,184,208,0.3)',
  },
  slotB: {
    color: '#d0a87e',
    borderColor: 'rgba(208,168,126,0.3)',
  },
  saveBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.6rem',
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    color: '#5f8f5f',
  },
  deleteBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.6rem',
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    color: '#8f5f5f',
  },
  expandBtn: {
    background: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: '0.6rem',
    lineHeight: 1.2,
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    flexShrink: 0,
    minWidth: 26,
    minHeight: 22,
    color: '#888',
  },
  versionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '1px 4px 1px 10px',
    fontSize: '0.6rem',
    color: '#777',
  },
  diffSummary: {
    fontSize: '0.55rem',
    color: '#666',
    padding: '0 4px 2px 18px',
    lineHeight: 1.3,
  },
  input: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(0,0,0,0.3)',
    color: 'white',
    fontSize: '0.72rem',
    boxSizing: 'border-box' as const,
    marginBottom: 6,
  },
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  dialog: {
    background: '#171615',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 14,
    minWidth: 240,
    maxWidth: 340,
    color: '#ccc',
    fontSize: '0.78rem',
  },
  dialogTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#a5c4d4',
    marginBottom: 8,
  },
  dialogBtnRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  dialogBtn: {
    padding: '5px 14px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.72rem',
  },
};

const DrumPresetManager: React.FC<DrumPresetManagerProps> = ({
  voice,
  state,
  color,
  onParamChange,
  onStateChange,
}) => {
  const engineScope = DRUM_ENGINE_SCOPES[voice];
  const { presets, save, load, remove, refresh, updateMetadata } = usePresets('engine', engineScope);

  const morphKeys = MORPH_KEYS[voice];
  const presetAName = String(state[morphKeys.a] || '');

  // Dropdown selection
  const [selectedPresetName, setSelectedPresetName] = useState<string>('');
  const selectedSummary = presets.find(p => p.name === selectedPresetName);

  // Grouped preset lists for dropdown
  const kesshoPresets = useMemo(() => presets.filter(p => p.creator === 'Kessho'), [presets]);
  const userCreatedPresets = useMemo(() => presets.filter(p => p.creator !== 'Kessho'), [presets]);
  const stockPresetNames = useMemo(() => {
    const names = new Set<string>([
      ...getFactoryPresetNames(voice),
      ...kesshoPresets.map(preset => preset.name),
    ]);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [kesshoPresets, voice]);

  // UI state
  const [saveDialog, setSaveDialog] = useState<{ originalName: string } | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [versionEntry, setVersionEntry] = useState<PresetEntry | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});

  // Auto-select preset A on voice change
  useEffect(() => {
    setSelectedPresetName(presetAName || '');
    setSaveDialog(null);
    setConfirm(null);
    setVersionEntry(null);
    setShowVersions(false);
  }, [voice]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Version diffs ── */
  const getVersionDiffs = useCallback((entry: PresetEntry, versionNum: number): {
    fromV1: string[];
    fromPrev: string[];
  } => {
    const sorted = [...entry.versions].sort((a, b) => a.v - b.v);
    const targetIdx = sorted.findIndex(v => v.v === versionNum);
    if (targetIdx < 0) return { fromV1: [], fromPrev: [] };

    const v1 = sorted[0];
    const prev = targetIdx > 0 ? sorted[targetIdx - 1] : null;
    const v1Data = v1?.data || {};
    const targetData = getVersionData(entry, versionNum) || {};
    const prevData = prev ? (getVersionData(entry, prev.v) || {}) : null;

    const fromV1: string[] = [];
    for (const key of Object.keys(targetData)) {
      if (key === '_isDelta') continue;
      if (!(key in v1Data) || v1Data[key] !== targetData[key]) {
        fromV1.push(humanize(key));
      }
    }

    const fromPrev: string[] = [];
    if (prevData) {
      for (const key of new Set([...Object.keys(targetData), ...Object.keys(prevData)])) {
        if (key === '_isDelta') continue;
        if (targetData[key] !== prevData[key]) {
          fromPrev.push(humanize(key));
        }
      }
    }
    return { fromV1, fromPrev };
  }, []);

  /* ── Toggle version expand ── */
  const toggleVersions = useCallback(async () => {
    if (showVersions) {
      setShowVersions(false);
      return;
    }
    if (!selectedPresetName) return;
    const entry = await load(selectedPresetName);
    if (entry) setVersionEntry(entry);
    setShowVersions(true);
  }, [showVersions, selectedPresetName, load]);

  /* ── Load preset into morph slot ── */
  const handleLoadToSlot = useCallback((slot: 'A' | 'B') => {
    if (!selectedPresetName) return;
    if (onStateChange) {
      onStateChange((previous) => applyDrumPresetSlotChange(previous, voice, slot, selectedPresetName));
      return;
    }
    onParamChange(morphKeys[slot === 'A' ? 'a' : 'b'], selectedPresetName as SliderState[keyof SliderState]);
  }, [selectedPresetName, morphKeys, onParamChange, onStateChange, voice]);

  /* ── Save (overwrite) ── */
  const handleSaveOverwrite = useCallback(async () => {
    if (!saveDialog) return;
    await save(saveDialog.originalName, state, 'Updated from voice editor');
    await refresh();
    const entry = await load(saveDialog.originalName);
    if (entry) {
      const ver = entry.versions.find(v => v.v === entry.currentVersion) || entry.versions[entry.versions.length - 1];
      if (ver) upsertUserPreset(voice, createRuntimeDrumPreset(voice, entry.name, ver.data, entry.tags));
      if (selectedPresetName === entry.name) setVersionEntry(entry);
    }
    setSaveDialog(null);
  }, [saveDialog, save, state, refresh, load, voice, selectedPresetName]);

  /* ── Save As ── */
  const handleSaveAs = useCallback(async () => {
    if (!saveAsName.trim()) return;
    const targetName = saveAsName.trim();

    const existing = presets.find(p => p.name === targetName);
    if (existing) {
      setSaveDialog(null);
      setConfirm({
        message: `"${targetName}" already exists. Overwrite?`,
        onConfirm: async () => {
          await save(targetName, state, 'Overwritten from voice editor');
          await refresh();
          const entry = await load(targetName);
          if (entry) {
            const ver = entry.versions.find(v => v.v === entry.currentVersion) || entry.versions[entry.versions.length - 1];
            if (ver) upsertUserPreset(voice, createRuntimeDrumPreset(voice, entry.name, ver.data, entry.tags));
          }
          setConfirm(null);
          setSaveAsName('');
        },
      });
      return;
    }

    await save(targetName, state, 'Saved from voice editor');
    await refresh();
    const entry = await load(targetName);
    if (entry) {
      const ver = entry.versions.find(v => v.v === entry.currentVersion) || entry.versions[entry.versions.length - 1];
      if (ver) upsertUserPreset(voice, createRuntimeDrumPreset(voice, entry.name, ver.data, entry.tags));
    }
    setSaveDialog(null);
    setSaveAsName('');
    setSelectedPresetName(targetName);
  }, [saveAsName, presets, save, state, refresh, load, voice]);

  /* ── Rate ── */
  const handleRate = useCallback(async (rating: number) => {
    if (!selectedPresetName) return;
    setLocalRatings(prev => ({ ...prev, [selectedPresetName]: rating }));
    try {
      await rateDrumPreset({
        voice,
        name: selectedPresetName,
        rating,
        presets,
        save,
        updateMetadata,
      });
    } catch (ratingError) {
      console.warn('Failed to update drum preset rating:', ratingError);
    }
  }, [selectedPresetName, voice, presets, save, updateMetadata]);

  /* ── Delete ── */
  const handleDelete = useCallback(() => {
    if (!selectedPresetName) return;
    setConfirm({
      message: `Delete "${selectedPresetName}"?`,
      onConfirm: async () => {
        const removed = await remove(selectedPresetName);
        if (!removed) return;
        setConfirm(null);
        setSelectedPresetName('');
        setShowVersions(false);
        setVersionEntry(null);
      },
    });
  }, [selectedPresetName, remove]);

  /* ── Version history data ── */
  const sorted = versionEntry ? [...versionEntry.versions].sort((a, b) => a.v - b.v) : [];
  const last3 = sorted.slice(-3);

  return (
    <div style={s.root}>
      <div style={s.header}>Presets</div>

      {/* Selected preset action row */}
      {selectedPresetName && (
        <>
          <div style={s.presetRow}>
            <select
              value={selectedPresetName}
              onChange={e => setSelectedPresetName(e.target.value)}
              style={s.select}
              title="Select preset"
            >
              <option value="">— Select Preset —</option>
              {stockPresetNames.length > 0 && (
                <optgroup label="Stock">
                  {stockPresetNames.map(name => (
                    <option key={`s:${name}`} value={name}>{name}</option>
                  ))}
                </optgroup>
              )}
              {userCreatedPresets.length > 0 && (
                <optgroup label="My Presets">
                  {userCreatedPresets.map(p => (
                    <option key={`u:${p.name}`} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {(selectedSummary || canRateDrumPreset(voice, selectedPresetName, presets)) && (
              <PresetRatingStars
                value={localRatings[selectedPresetName] ?? selectedSummary?.rating ?? 0}
                onChange={(r) => { void handleRate(r); }}
                color={color}
                size="0.6rem"
              />
            )}
            {selectedSummary && selectedSummary.versionCount > 1 && (
              <span style={s.versionBadge}>v{selectedSummary.currentVersion}</span>
            )}
            <button
              style={{ ...s.slotBtn, ...s.slotA }}
              onClick={() => handleLoadToSlot('A')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(126,184,208,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              title="Load into Slot A"
            >A</button>
            <button
              style={{ ...s.slotBtn, ...s.slotB }}
              onClick={() => handleLoadToSlot('B')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(208,168,126,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              title="Load into Slot B"
            >B</button>
            <button
              style={s.saveBtn}
              onClick={() => {
                setSaveAsName('');
                setSaveDialog({ originalName: selectedPresetName });
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#8fd18f'; e.currentTarget.style.background = 'rgba(95,143,95,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#5f8f5f'; e.currentTarget.style.background = 'none'; }}
              title={`Save current state as ${selectedPresetName}`}
            >💾</button>
            {PRESET_DELETE_ENABLED && (SHARED_PRESET_TEST_MODE || selectedSummary?.library !== 'stock') && (
              <button
                style={s.deleteBtn}
                onClick={handleDelete}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
                title={`Delete ${selectedPresetName}`}
              >✕</button>
            )}
            {selectedSummary && selectedSummary.versionCount > 1 && (
              <button
                style={{ ...s.expandBtn, ...(showVersions ? { color: '#a5c4d4' } : {}) }}
                onClick={() => { void toggleVersions(); }}
                title="Show version history"
              >+</button>
            )}
          </div>

          {/* Version history */}
          {showVersions && versionEntry && last3.map(ver => {
            const diffs = getVersionDiffs(versionEntry, ver.v);
            return (
              <React.Fragment key={ver.v}>
                <div style={s.versionRow}>
                  <span style={{ color: ver.v === versionEntry.currentVersion ? '#a5c4d4' : '#777' }}>
                    v{ver.v}
                  </span>
                  <span style={{ color: '#555', fontSize: '0.5rem' }}>
                    {new Date(ver.timestamp).toLocaleDateString()}
                  </span>
                </div>
                {diffs.fromPrev.length > 0 && (
                  <div style={s.diffSummary}>
                    vs prev: {diffs.fromPrev.slice(0, 5).join(', ')}
                    {diffs.fromPrev.length > 5 && ` +${diffs.fromPrev.length - 5}`}
                  </div>
                )}
                {ver.v > 1 && diffs.fromV1.length > 0 && (
                  <div style={{ ...s.diffSummary, color: '#555' }}>
                    vs v1: {diffs.fromV1.slice(0, 5).join(', ')}
                    {diffs.fromV1.length > 5 && ` +${diffs.fromV1.length - 5}`}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}

      {!selectedPresetName && (
        <div style={s.presetRow}>
          <select
            value={selectedPresetName}
            onChange={e => setSelectedPresetName(e.target.value)}
            style={s.select}
            title="Select preset"
          >
            <option value="">— Select Preset —</option>
            {stockPresetNames.length > 0 && (
              <optgroup label="Stock">
                {stockPresetNames.map(name => (
                  <option key={`s:${name}`} value={name}>{name}</option>
                ))}
              </optgroup>
            )}
            {userCreatedPresets.length > 0 && (
              <optgroup label="My Presets">
                {userCreatedPresets.map(p => (
                  <option key={`u:${p.name}`} value={p.name}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {/* Save dialog (Save + Save As in one popup) */}
      {saveDialog && (
        <div style={s.overlay} onClick={() => setSaveDialog(null)}>
          <div style={s.dialog} onClick={e => e.stopPropagation()}>
            <div style={s.dialogTitle}>Save Preset</div>

            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>
              Current: <strong style={{ color: '#a5c4d4' }}>{saveDialog.originalName}</strong>
            </div>

            {/* Save (overwrite) */}
            <button
              onClick={handleSaveOverwrite}
              style={{
                ...s.dialogBtn,
                background: '#2a5a8a',
                color: 'white',
                width: '100%',
                marginBottom: 10,
                padding: '8px 16px',
              }}
            >Save &quot;{saveDialog.originalName}&quot;</button>

            {/* Save As */}
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>
              Save as new preset:
            </div>
            <input
              type="text"
              value={saveAsName}
              onChange={e => setSaveAsName(e.target.value)}
              placeholder="New preset name"
              style={s.input}
              maxLength={40}
              onKeyDown={e => {
                if (e.key === 'Enter' && saveAsName.trim()) void handleSaveAs();
                if (e.key === 'Escape') setSaveDialog(null);
              }}
            />
            <div style={s.dialogBtnRow}>
              <button
                onClick={() => setSaveDialog(null)}
                style={{ ...s.dialogBtn, background: 'rgba(255,255,255,0.08)', color: '#999' }}
              >Cancel</button>
              <button
                onClick={() => void handleSaveAs()}
                disabled={!saveAsName.trim()}
                style={{
                  ...s.dialogBtn,
                  background: saveAsName.trim() ? '#2a6a4a' : '#333',
                  color: saveAsName.trim() ? 'white' : '#666',
                }}
              >Save As</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div style={s.overlay} onClick={() => setConfirm(null)}>
          <div style={{ ...s.dialog, textAlign: 'center' as const }} onClick={e => e.stopPropagation()}>
            <div>{confirm.message}</div>
            <div style={s.dialogBtnRow}>
              <button
                style={{ ...s.dialogBtn, background: '#c45c5c', color: 'white' }}
                onClick={() => { confirm.onConfirm(); }}
              >Yes</button>
              <button
                style={{ ...s.dialogBtn, background: 'rgba(255,255,255,0.1)', color: '#ccc' }}
                onClick={() => setConfirm(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrumPresetManager;
