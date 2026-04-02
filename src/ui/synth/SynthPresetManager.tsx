// src/ui/synth/SynthPresetManager.tsx
// Compact preset manager for synth engine voices (L1).
// Dropdown selector + action row + version history.
// Same pattern as DrumPresetManager / L4 PresetFamilyTree.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { SliderState } from '../state';
import { usePresets } from '../../presets/usePresets';
import { getVersionData } from '../../presets/codec';
import {
  getPadPresetOptions,
  PAD1_TO_PAD2_KEY,
  upsertUserPadPreset,
  type PadPreset,
} from '../../audio/padPresets';
import type { PresetEntry } from '../../presets/types';

const humanize = (key: string) =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();

const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, string>;

function createRuntimePadPreset(scope: 'pad1' | 'pad2', name: string, data: Record<string, unknown>): PadPreset {
  const params: Record<string, number | string | boolean> = {};

  if (scope === 'pad1') {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[key] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      const pad1Key = PAD2_TO_PAD1_KEY[key];
      if (!pad1Key) continue;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[pad1Key] = value;
      }
    }
  }

  return {
    name,
    tags: [],
    params,
  };
}

interface SynthPresetManagerProps {
  engineScope: 'pad1' | 'pad2';
  slotAKey: keyof SliderState;
  slotBKey: keyof SliderState;
  slotALabel?: string;
  slotBLabel?: string;
  state: SliderState;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  color: string;
}

/* ── Styles (matching L4 PresetFamilyTree) ── */
const s: Record<string, React.CSSProperties> = {
  root: {
    padding: '4px 0',
    marginBottom: 2,
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
  starRow: {
    display: 'flex',
    gap: 1,
    cursor: 'pointer',
    fontSize: '0.6rem',
    lineHeight: 1,
    flexShrink: 0,
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
    background: '#1a1a2e',
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

/* ── Rating Stars ── */
const RatingStars: React.FC<{ value: number; onChange: (r: number) => void; color?: string }> = ({ value, onChange, color = '#d4a55a' }) => (
  <span style={s.starRow}>
    {[1, 2, 3, 4, 5].map(n => (
      <span
        key={n}
        onClick={(e) => { e.stopPropagation(); onChange(value === n ? 0 : n); }}
        style={{ color: n <= value ? color : '#444' }}
      >★</span>
    ))}
  </span>
);

const SynthPresetManager: React.FC<SynthPresetManagerProps> = ({
  engineScope,
  slotAKey,
  slotBKey,
  slotALabel = 'A',
  slotBLabel = 'B',
  state,
  onSelectChange,
  color,
}) => {
  const { presets, save, load, remove, refresh, updateMetadata } = usePresets('engine', engineScope);

  const slotAValue = String(state[slotAKey] || '');
  const presetOptions = useMemo(() => getPadPresetOptions(engineScope), [engineScope, presets]);

  // Dropdown selection
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const selectedOption = useMemo(
    () => presetOptions.find(option => option.id === selectedPresetId) ?? null,
    [presetOptions, selectedPresetId],
  );
  const selectedEntryName = selectedOption?.name ?? selectedPresetId;
  const selectedSummary = presets.find(
    preset => preset.id === selectedPresetId || preset.name === selectedEntryName || preset.name === selectedPresetId,
  );

  // Grouped preset lists for dropdown
  const stockPresets = useMemo(() => presetOptions.filter(option => option.library === 'stock'), [presetOptions]);
  const userCreatedPresets = useMemo(() => presetOptions.filter(option => option.library === 'user'), [presetOptions]);
  const cloudPresets = useMemo(() => presetOptions.filter(option => option.library === 'cloud'), [presetOptions]);

  // UI state
  const [saveDialog, setSaveDialog] = useState<{ originalName: string } | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [versionEntry, setVersionEntry] = useState<PresetEntry | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  // Auto-select slot A preset on scope change
  useEffect(() => {
    setSelectedPresetId(slotAValue || '');
    setSaveDialog(null);
    setConfirm(null);
    setVersionEntry(null);
    setShowVersions(false);
  }, [engineScope, slotAValue]);

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
    if (!selectedEntryName) return;
    const entry = await load(selectedEntryName);
    if (entry) setVersionEntry(entry);
    setShowVersions(true);
  }, [showVersions, selectedEntryName, load]);

  /* ── Load preset into morph slot ── */
  const handleLoadToSlot = useCallback((slot: 'A' | 'B') => {
    if (!selectedPresetId) return;
    const key = slot === 'A' ? slotAKey : slotBKey;
    onSelectChange(key, selectedPresetId as SliderState[keyof SliderState]);
  }, [selectedPresetId, slotAKey, slotBKey, onSelectChange]);

  /* ── Save (overwrite) ── */
  const handleSaveOverwrite = useCallback(async () => {
    if (!saveDialog || !selectedEntryName) return;
    await save(saveDialog.originalName, state, 'Updated from synth editor');
    await refresh();
    const entry = await load(saveDialog.originalName);
    if (entry) {
      const version = entry.versions.find(item => item.v === entry.currentVersion)
        || entry.versions[entry.versions.length - 1];
      if (version) {
        upsertUserPadPreset(engineScope, {
          id: entry.id ?? entry.name,
          name: entry.name,
          library: (entry.library ?? 'user') === 'stock' ? 'user' : (entry.library ?? 'user'),
          preset: createRuntimePadPreset(engineScope, entry.name, version.data),
        });
      }
      if (selectedEntryName === entry.name) setVersionEntry(entry);
      setSelectedPresetId(entry.id ?? entry.name);
    }
    setSaveDialog(null);
  }, [engineScope, load, refresh, save, saveDialog, selectedEntryName, state]);

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
          await save(targetName, state, 'Overwritten from synth editor');
          await refresh();
          const entry = await load(targetName);
          if (entry) {
            const version = entry.versions.find(item => item.v === entry.currentVersion)
              || entry.versions[entry.versions.length - 1];
            if (version) {
              upsertUserPadPreset(engineScope, {
                id: entry.id ?? entry.name,
                name: entry.name,
                library: (entry.library ?? 'user') === 'stock' ? 'user' : (entry.library ?? 'user'),
                preset: createRuntimePadPreset(engineScope, entry.name, version.data),
              });
            }
            setSelectedPresetId(entry.id ?? entry.name);
          }
          setConfirm(null);
          setSaveAsName('');
        },
      });
      return;
    }

    await save(targetName, state, 'Saved from synth editor');
    await refresh();
    const entry = await load(targetName);
    if (entry) {
      const version = entry.versions.find(item => item.v === entry.currentVersion)
        || entry.versions[entry.versions.length - 1];
      if (version) {
        upsertUserPadPreset(engineScope, {
          id: entry.id ?? entry.name,
          name: entry.name,
          library: (entry.library ?? 'user') === 'stock' ? 'user' : (entry.library ?? 'user'),
          preset: createRuntimePadPreset(engineScope, entry.name, version.data),
        });
      }
      setSelectedPresetId(entry.id ?? entry.name);
    }
    setSaveDialog(null);
    setSaveAsName('');
  }, [engineScope, load, presets, refresh, save, saveAsName, state]);

  /* ── Rate ── */
  const handleRate = useCallback(async (rating: number) => {
    if (!selectedEntryName) return;
    await updateMetadata(selectedEntryName, { rating: rating || undefined });
  }, [selectedEntryName, updateMetadata]);

  /* ── Delete ── */
  const handleDelete = useCallback(() => {
    if (!selectedEntryName) return;
    setConfirm({
      message: `Delete "${selectedEntryName}"?`,
      onConfirm: async () => {
        await remove(selectedEntryName);
        setConfirm(null);
        setSelectedPresetId('');
        setShowVersions(false);
        setVersionEntry(null);
      },
    });
  }, [remove, selectedEntryName]);

  /* ── Version history data ── */
  const sorted = versionEntry ? [...versionEntry.versions].sort((a, b) => a.v - b.v) : [];
  const last3 = sorted.slice(-3);

  return (
    <div style={s.root}>
      {/* Selected preset action row */}
      {selectedPresetId && (
        <>
          <div style={s.presetRow}>
            <select
              value={selectedPresetId}
              onChange={e => setSelectedPresetId(e.target.value)}
              style={s.select}
              title="Select preset"
            >
              <option value="">— Select Preset —</option>
              {stockPresets.length > 0 && (
                <optgroup label="Stock">
                  {stockPresets.map(option => (
                    <option key={`s:${option.id}`} value={option.id}>{option.name}</option>
                  ))}
                </optgroup>
              )}
              {userCreatedPresets.length > 0 && (
                <optgroup label="My Presets">
                  {userCreatedPresets.map(option => (
                    <option key={`u:${option.id}`} value={option.id}>{option.name}</option>
                  ))}
                </optgroup>
              )}
              {cloudPresets.length > 0 && (
                <optgroup label="Cloud">
                  {cloudPresets.map(option => (
                    <option key={`c:${option.id}`} value={option.id}>{option.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedSummary && (
              <RatingStars
                value={selectedSummary.rating ?? 0}
                onChange={(r) => { void handleRate(r); }}
                color={color}
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
              title={`Load into Slot ${slotALabel}`}
            >{slotALabel}</button>
            <button
              style={{ ...s.slotBtn, ...s.slotB }}
              onClick={() => handleLoadToSlot('B')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(208,168,126,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              title={`Load into Slot ${slotBLabel}`}
            >{slotBLabel}</button>
            <button
              style={s.saveBtn}
              onClick={() => {
                setSaveAsName('');
                setSaveDialog({ originalName: selectedEntryName });
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#8fd18f'; e.currentTarget.style.background = 'rgba(95,143,95,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#5f8f5f'; e.currentTarget.style.background = 'none'; }}
              title={`Save current state as ${selectedEntryName}`}
            >💾</button>
            <button
              style={s.deleteBtn}
              onClick={handleDelete}
              onMouseEnter={e => { e.currentTarget.style.color = '#ff6666'; e.currentTarget.style.background = 'rgba(143,95,95,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8f5f5f'; e.currentTarget.style.background = 'none'; }}
              title={`Delete ${selectedEntryName}`}
            >✕</button>
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

      {!selectedPresetId && (
        <div style={s.presetRow}>
          <select
            value={selectedPresetId}
            onChange={e => setSelectedPresetId(e.target.value)}
            style={s.select}
            title="Select preset"
          >
            <option value="">— Select Preset —</option>
            {stockPresets.length > 0 && (
              <optgroup label="Stock">
                {stockPresets.map(option => (
                  <option key={`s:${option.id}`} value={option.id}>{option.name}</option>
                ))}
              </optgroup>
            )}
            {userCreatedPresets.length > 0 && (
              <optgroup label="My Presets">
                {userCreatedPresets.map(option => (
                  <option key={`u:${option.id}`} value={option.id}>{option.name}</option>
                ))}
              </optgroup>
            )}
            {cloudPresets.length > 0 && (
              <optgroup label="Cloud">
                {cloudPresets.map(option => (
                  <option key={`c:${option.id}`} value={option.id}>{option.name}</option>
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

export default SynthPresetManager;
