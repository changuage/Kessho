import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { HarmonyState } from '../../audio/harmony';
import { resolveHarmonyProjection, type HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import { SCALE_FAMILIES } from '../../audio/scales';
import type { ProductManualSynthNote, ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';
import {
  HARMONY_NOTE_KEYS,
  HARMONY_SEQUENCE_STEP_COUNT,
  HARMONY_SEQUENCE_STEP_MIN,
  HARMONY_SLOT_TRIGGER_KEYS,
  commitBaselineMap,
  defaultHarmonyIntent,
  generateHarmonySequence,
  generateHarmonySlots,
  generateHarmonySlotsAndSequence,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyIntent,
  sanitizeHarmonySequenceLength,
  sanitizeManualHarmonyControl,
  type HarmonyBassMode,
  type HarmonyChordQuality,
  type HarmonyChordSlot,
  type HarmonyControlStrength,
  type HarmonyIntent,
  type HarmonySequenceStep,
  type HarmonySequenceStepMode,
  type ManualHarmonyControlMode,
  type ManualHarmonyControlState,
  type ResolvedHarmonyFrame,
} from '../../audio/CoreProductHarmonyControl';
import {
  editSharedChordIntent,
  legacyHarmonySlotToSharedSlot,
} from '../../audio/harmony/harmonyChordAdapters';
import './HarmonyEnginePanel.css';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const ROMAN_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

const QUALITY_OPTIONS: readonly { value: HarmonyChordQuality; label: string; key?: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'dim', label: 'Dim', key: 'I' },
  { value: 'min', label: 'Min', key: 'O' },
  { value: 'maj', label: 'Maj', key: 'P' },
  { value: 'sus', label: 'Sus', key: '[' },
  { value: 'min7', label: 'm7' },
  { value: 'maj7', label: 'M7' },
  { value: 'dom7', label: '7' },
  { value: 'add9', label: 'add9' },
  { value: 'six', label: '6' },
  { value: 'sixNine', label: '6/9' },
  { value: 'nine', label: '9' },
  { value: 'quartal', label: 'Quartal' },
  { value: 'cluster', label: 'Cluster' },
];

const QUICK_QUALITY_KEYS: Record<string, HarmonyChordQuality> = {
  i: 'dim',
  o: 'min',
  p: 'maj',
  '[': 'sus',
};

const EXTENSION_KEYS: readonly { value: string; label: string; key: string }[] = [
  { value: 'six', label: '6', key: 'K' },
  { value: 'min7', label: 'm7', key: 'L' },
  { value: 'maj7', label: 'M7', key: ';' },
  { value: 'nine', label: '9', key: "'" },
];

const QUALITY_TITLE_LABELS: Readonly<Record<HarmonyChordQuality, string>> = {
  auto: 'Auto',
  dim: 'Dim',
  min: 'Min',
  maj: 'Maj',
  sus: 'Sus',
  maj7: 'M7',
  min7: 'm7',
  dom7: '7',
  add9: 'add9',
  six: '6',
  sixNine: '6/9',
  nine: '9',
  quartal: 'Quartal',
  cluster: 'Cluster',
  custom: 'Custom',
};

const EXTENSION_TITLE_LABELS: Readonly<Record<string, string>> = {
  six: '6',
  min7: 'm7',
  maj7: 'M7',
  dom7: '7',
  add9: '9',
  nine: '9',
  sixNine: '6/9',
};

const SEQUENCE_MODES: readonly { value: HarmonySequenceStepMode; label: string; tooltip: string }[] = [
  { value: 'auto', label: 'Auto', tooltip: 'Automatically choose chord based on scale degree' },
  { value: 'intent', label: 'Custom', tooltip: 'Define a specific custom chord for this step' },
  { value: 'slotCopy', label: 'Copy Slot', tooltip: 'Copy a slot chord (static — won\u2019t update if slot changes)' },
  { value: 'slotFollow', label: 'Link Slot', tooltip: 'Link to a slot (live — updates when slot changes)' },
];

const BASS_MODES: readonly { value: HarmonyBassMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'root', label: 'Root' },
  { value: 'fifth', label: 'Fifth' },
];

type HarmonyBank = 'A' | 'B';
type HarmonyPopup = 'manual' | 'lab' | null;
type VoicingInputMode = 'root' | 'degree';
type ChordLabSelectionKind = 'step' | 'slot';
type GenerateTarget = 'slots' | 'sequence' | 'both';

const TENSION_CHARACTER_STOPS = [
  { value: 0, label: 'Resolved', description: 'major and pentatonic scales with simple chord shapes' },
  { value: 0.15, label: 'Dreamy', description: 'Lydian and Mixolydian colors with light suspensions' },
  { value: 0.25, label: 'Warm Min', description: 'minor pentatonic and Dorian warmth' },
  { value: 0.35, label: 'Melancholy', description: 'Aeolian minor color' },
  { value: 0.5, label: 'Dramatic', description: 'harmonic and melodic minor color' },
  { value: 0.7, label: 'Unsettled', description: 'mixed color and high-tension scale choices' },
  { value: 0.9, label: 'High', description: 'octatonic and Phrygian-dominant tension' },
] as const;

const VOICING_ROOT_NATURAL_KEYS = [
  { note: 0, label: 'C', shortcut: 'A' },
  { note: 2, label: 'D', shortcut: 'S' },
  { note: 4, label: 'E', shortcut: 'D' },
  { note: 5, label: 'F', shortcut: 'F' },
  { note: 7, label: 'G', shortcut: 'G' },
  { note: 9, label: 'A', shortcut: 'H' },
  { note: 11, label: 'B', shortcut: 'J' },
] as const;

const VOICING_ROOT_ACCIDENTAL_KEYS = [
  { note: 1, label: 'C#', shortcut: 'W', column: 1 },
  { note: 3, label: 'D#', shortcut: 'E', column: 2 },
  { note: 6, label: 'F#', shortcut: 'T', column: 4 },
  { note: 8, label: 'G#', shortcut: 'Y', column: 5 },
  { note: 10, label: 'A#', shortcut: 'U', column: 6 },
] as const;

const AUDITION_SOURCE_OPTIONS: readonly { value: ProductManualSynthSource; label: string }[] = [
  { value: 'pad1', label: 'Pad 1' },
  { value: 'pad2', label: 'Pad 2' },
  { value: 'lead1', label: 'Lead 1' },
  { value: 'lead2', label: 'Lead 2' },
  { value: 'sample1', label: 'Sample 1' },
] as const;

export interface HarmonyEnginePanelProps {
  state: SliderState;
  harmonyState?: HarmonyState | null;
  /** Shared read-only Harmony context supplied by the runtime host. */
  harmonyProjection?: HarmonyProjection;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  onAuditionNote?: (note: ProductManualSynthNote) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function midiNoteName(value: number): string {
  const safe = clamp(Math.round(value), 0, 127);
  const note = NOTE_NAMES[safe % 12] ?? 'C';
  const octave = Math.floor(safe / 12) - 1;
  return `${note}${octave}`;
}

function noteName(value: number): string {
  return NOTE_NAMES[pitchClass(value)] ?? 'C';
}

function seedFromState(state: SliderState, salt: number): number {
  if (Number.isFinite(state.harmonyGenerationSeed) && state.harmonyGenerationSeed > 0) {
    return Math.round(state.harmonyGenerationSeed) ^ salt;
  }
  const root = pitchClass(state.rootNote);
  const tension = Math.round(clamp(state.tension, 0, 1) * 1000);
  const randomness = Math.round(clamp(state.randomness, 0, 1) * 1000);
  return ((root + 1) * 131 + (tension + 17) * 313 + (randomness + 29) * 911 + salt * 3571) >>> 0;
}

function nextGenerationSeed(state: SliderState): number {
  const current = Number.isFinite(state.harmonyGenerationSeed) ? Math.max(0, Math.round(state.harmonyGenerationSeed)) : 0;
  return (current + 1) & 0x7fffffff;
}

function sourceLabel(source: ResolvedHarmonyFrame['activeSource'] | null): string {
  if (!source) return 'None';
  if (source === 'baseline') return 'Auto Harmony';
  if (source === 'manualControl') return 'Manual';
  if (source === 'slot') return 'Slot';
  if (source === 'presetMorph') return 'Morph';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function tensionCharacterFor(value: number): typeof TENSION_CHARACTER_STOPS[number] {
  const tension = clamp(value, 0, 1);
  return TENSION_CHARACTER_STOPS.reduce((best, item) => (
    Math.abs(item.value - tension) < Math.abs(best.value - tension) ? item : best
  ), TENSION_CHARACTER_STOPS[0]!);
}

function tensionScaleBandLabel(value: number): string {
  const tension = clamp(value, 0, 1);
  if (tension <= 0.1) return 'Major / Pent';
  if (tension <= 0.2) return 'Lydian / Mix';
  if (tension <= 0.3) return 'Min Pent / Dorian';
  if (tension <= 0.4) return 'Aeolian';
  if (tension <= 0.55) return 'Harm / Mel Min';
  if (tension <= 0.8) return 'Mixed High';
  return 'Oct / Phrygian';
}

function tensionChordBandLabel(value: number): string {
  const chordTension = (clamp(value, 0, 1) % 0.5) * 2;
  if (chordTension < 0.2) return 'Triads';
  if (chordTension < 0.4) return 'Sus / triads';
  if (chordTension < 0.6) return '7ths';
  if (chordTension < 0.8) return '9ths / add';
  return 'Clusters';
}

function generationMotionLabel(value: number): string {
  const motion = clamp(value, 0, 1);
  if (motion < 0.25) return 'Stable';
  if (motion < 0.55) return 'Flowing';
  if (motion < 0.8) return 'Active';
  return 'Adventurous';
}

function intentTitle(intent: HarmonyIntent | null | undefined): string {
  if (!intent) return 'Empty';
  const root = intent.rootMode === 'degree'
    ? ROMAN_DEGREES[clamp(intent.degree, 0, 6)] ?? 'I'
    : noteName(intent.rootNote);
  const quality = QUALITY_TITLE_LABELS[intent.quality] ?? intent.quality;
  const extensions = intent.extensions
    .map((extension) => EXTENSION_TITLE_LABELS[extension] ?? extension)
    .filter((extension) => extension !== quality);
  return [root, quality, ...extensions].join(' ');
}

function sequenceStepTitle(step: HarmonySequenceStep, slots: readonly HarmonyChordSlot[]): string {
  if (step.mode === 'slotCopy' && step.intent) return intentTitle(step.intent);
  if (step.mode === 'slotCopy' || step.mode === 'slotFollow') {
    const slot = step.slotId !== null ? slots[step.slotId] : null;
    return slot ? `S${slot.id + 1} ${intentTitle(slot.chord?.intent)}` : 'Slot';
  }
  if (step.mode === 'intent' && step.intent) return intentTitle(step.intent);
  return `${ROMAN_DEGREES[clamp(step.degree, 0, 6)] ?? 'I'} ${step.quality === 'auto' ? 'Auto' : step.quality}`;
}

function statePatch(patch: Record<string, unknown>): SliderState {
  return patch as unknown as SliderState;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function bankKeys(bank: HarmonyBank): { slots: string; sequence: string } {
  return bank === 'B'
    ? { slots: 'harmonyChordSlotsB', sequence: 'harmonyChordSequenceB' }
    : { slots: 'harmonyChordSlotsA', sequence: 'harmonyChordSequenceA' };
}

function shouldMirrorBaseBank(record: Record<string, unknown>, bank: HarmonyBank): boolean {
  if (bank !== 'A') return false;
  return record.harmonyChordSlotsA === undefined && record.harmonyChordSlotsB === undefined;
}

function modeForIntentUpdate(mode: ManualHarmonyControlMode, manualLocked: boolean): ManualHarmonyControlMode {
  if (manualLocked && mode !== 'audition') return 'audition';
  return mode;
}

function auditionNoteLimit(source: ProductManualSynthSource): number {
  if (source === 'lead1' || source === 'lead2') return 1;
  return source === 'sample1' || source === 'sample2' ? 8 : 6;
}

function auditionDurationMs(source: ProductManualSynthSource): number {
  if (source === 'lead1' || source === 'lead2') return 720;
  return source === 'sample1' || source === 'sample2' ? 1300 : 1600;
}

function frameChordTitle(frame: ResolvedHarmonyFrame): string {
  return intentTitle({ ...defaultHarmonyIntent(frame.activeSource, frame.degree), quality: frame.quality });
}

function stepSourceLabel(step: HarmonySequenceStep): string {
  if (step.mode === 'slotCopy') return 'Copy';
  if (step.mode === 'slotFollow') return 'Linked';
  if (step.mode === 'intent') return 'Custom';
  return 'Auto';
}

function generateTargetLabel(target: GenerateTarget): string {
  if (target === 'slots') return 'Palette';
  if (target === 'sequence') return 'Progression';
  return 'Both';
}

function progressionStepCount(value: unknown): number {
  return sanitizeHarmonySequenceLength(value);
}

function HarmonyNotePoolPills({ notes, compact = false }: { notes: readonly number[]; compact?: boolean }) {
  return (
    <div className={`harmony-note-pills${compact ? ' compact' : ''}`}>
      {notes.length > 0 ? notes.slice(0, compact ? 6 : 8).map((note) => (
        <span key={note}>{midiNoteName(note)}</span>
      )) : (
        <span className="empty">None</span>
      )}
    </div>
  );
}

function HarmonySourceBadge({ source }: { source: ResolvedHarmonyFrame['activeSource'] | null }) {
  return <span className={`harmony-source-badge source-${source ?? 'none'}`}>{sourceLabel(source)}</span>;
}

function harmonyHelpAttrs(helpKey: string, label?: string): Record<string, string> {
  return label
    ? { 'data-harmony-help-key': helpKey, 'data-harmony-help-label': label }
    : { 'data-harmony-help-key': helpKey };
}

function findHarmonyHelpElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[data-harmony-help-key]');
}

function HarmonyStatusTile({
  label,
  title,
  notes,
  source,
  meta,
  helpKey,
  helpLabel,
  locked = false,
  onClick,
}: {
  label: string;
  title: string;
  notes?: readonly number[];
  source?: ResolvedHarmonyFrame['activeSource'] | null;
  meta?: string;
  helpKey?: string;
  helpLabel?: string;
  locked?: boolean;
  onClick?: () => void;
}) {
  const helpProps = helpKey ? harmonyHelpAttrs(helpKey, helpLabel) : {};
  const body = (
    <>
      <span className="harmony-status-label">{label}</span>
      <strong>{title}</strong>
      {notes ? <HarmonyNotePoolPills notes={notes} compact /> : <em>{meta}</em>}
      {source !== undefined && <HarmonySourceBadge source={source} />}
      {locked && <small>Locked during morph</small>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`harmony-status-tile clickable${locked ? ' locked' : ''}`} onClick={onClick} {...helpProps}>
        {body}
      </button>
    );
  }
  return <div className={`harmony-status-tile${locked ? ' locked' : ''}`} {...helpProps}>{body}</div>;
}

function HarmonyActionButtons({
  activePopup,
  onTogglePopup,
}: {
  activePopup: HarmonyPopup;
  onTogglePopup: (popup: Exclude<HarmonyPopup, null>) => void;
}) {
  return (
    <div className="harmony-engine-actions">
      <button
        type="button"
        className={`harmony-engine-action${activePopup === 'manual' ? ' active' : ''}`}
        onClick={() => onTogglePopup('manual')}
        {...harmonyHelpAttrs('harmonyOpenVoicing')}
      >
        Voicing
      </button>
      <button
        type="button"
        className={`harmony-engine-action${activePopup === 'lab' ? ' active' : ''}`}
        onClick={() => onTogglePopup('lab')}
        {...harmonyHelpAttrs('harmonyOpenLab')}
      >
        Lab
      </button>
    </div>
  );
}

function HarmonySummaryCard({
  bank,
  rootLabel,
  scaleName,
  resolvedFrame,
  activePopup,
  manualLocked,
  chordSequenceEnabled,
  tension,
  rootNote,
  scaleMode,
  manualScale,
  onTogglePopup,
  onFocusNextStep,
  onTensionChange,
  onRootNoteChange,
  onScaleModeChange,
  onManualScaleChange,
}: {
  bank: HarmonyBank;
  rootLabel: string;
  scaleName: string;
  resolvedFrame: ResolvedHarmonyFrame;
  activePopup: HarmonyPopup;
  manualLocked: boolean;
  chordSequenceEnabled: boolean;
  tension: number;
  rootNote: number;
  scaleMode: string;
  manualScale: string;
  onTogglePopup: (popup: Exclude<HarmonyPopup, null>) => void;
  onFocusNextStep: () => void;
  onTensionChange?: (tension: number) => void;
  onRootNoteChange?: (rootNote: number) => void;
  onScaleModeChange?: (mode: string) => void;
  onManualScaleChange?: (scale: string) => void;
}) {
  const tensionCharacter = tensionCharacterFor(tension);
  const scaleBand = tensionScaleBandLabel(tension);
  const chordBand = tensionChordBandLabel(tension);
  const controlMeta = manualLocked
    ? 'Manual control locked'
    : resolvedFrame.activeStepIndex !== null
      ? `Step ${resolvedFrame.activeStepIndex + 1} / 8`
      : resolvedFrame.activeSlotId !== null
        ? `Slot ${resolvedFrame.activeSlotId + 1}`
        : chordSequenceEnabled
          ? 'Sequence armed'
          : 'Using auto harmony';

  return (
    <div className="harmony-summary-card">
      <div className="harmony-engine-header">
        <div>
          <div className="harmony-engine-title">Chord Harmony</div>
          <div className="harmony-engine-meta">
            {rootLabel} {scaleName} · Bank {bank} · Morph {Math.round(resolvedFrame.morphPercent)}%
          </div>
        </div>
        <HarmonyActionButtons activePopup={activePopup} onTogglePopup={onTogglePopup} />
      </div>
      <div className="harmony-tension-strip" title={`Tension still drives scale selection and chord complexity. Scale: ${scaleBand}. Chords: ${chordBand}. Character: ${tensionCharacter.label} (${tensionCharacter.description}).`}>
        <label className="harmony-tension-label" {...harmonyHelpAttrs('harmonyTension')}>
          <span>Tension / Character</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tension}
            onChange={onTensionChange ? (event) => onTensionChange(Number(event.target.value)) : undefined}
            disabled={!onTensionChange}
          />
          <strong>{Math.round(tension * 100)}%</strong>
        </label>
        <div className="harmony-tension-character" {...harmonyHelpAttrs('harmonyTensionCharacter')}>
          <span>Scale</span>
          <strong>{scaleBand}</strong>
          <span>Chords</span>
          <strong>{chordBand}</strong>
        </div>
        <div className="harmony-tension-stops" aria-label="Tension character stops">
          {TENSION_CHARACTER_STOPS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.label === tensionCharacter.label ? 'active' : ''}
              onClick={onTensionChange ? () => onTensionChange(item.value) : undefined}
              disabled={!onTensionChange}
              title={`${item.label}: ${item.description}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="harmony-palette-strip">
        <div className="harmony-palette-row">
          <label className="harmony-palette-select" {...harmonyHelpAttrs('harmonyRootNote')}>
            <span>Root</span>
            <select value={rootNote} onChange={onRootNoteChange ? (e) => onRootNoteChange(Number(e.target.value)) : undefined} disabled={!onRootNoteChange}>
              {NOTE_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
          </label>
          <label className="harmony-palette-select" {...harmonyHelpAttrs('harmonyScaleMode')}>
            <span>Scale</span>
            <select value={scaleMode} onChange={onScaleModeChange ? (e) => onScaleModeChange(e.target.value) : undefined} disabled={!onScaleModeChange}>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          {scaleMode === 'manual' && (
            <label className="harmony-palette-select harmony-palette-select--wide" {...harmonyHelpAttrs('harmonyManualScale')}>
              <span>Family</span>
              <select value={manualScale} onChange={onManualScaleChange ? (e) => onManualScaleChange(e.target.value) : undefined} disabled={!onManualScaleChange}>
                {SCALE_FAMILIES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="harmony-summary-grid">
        <HarmonyStatusTile
          label="Now"
          title={frameChordTitle(resolvedFrame)}
          notes={resolvedFrame.currentNotePool}
          source={resolvedFrame.activeSource}
          helpKey="harmonySummaryNow"
        />
        <HarmonyStatusTile
          label="Next"
          title={resolvedFrame.nextStepIndex !== null ? `Step ${resolvedFrame.nextStepIndex + 1}` : sourceLabel(resolvedFrame.nextSource)}
          notes={resolvedFrame.nextNotePool}
          source={resolvedFrame.nextSource}
          onClick={onFocusNextStep}
          helpKey="harmonySummaryNext"
        />
        <HarmonyStatusTile
          label="Control"
          title={sourceLabel(resolvedFrame.activeSource)}
          meta={controlMeta}
          locked={manualLocked}
          helpKey="harmonySummaryControl"
        />
      </div>
    </div>
  );
}

function ManualVoicingHeader({
  scaleLabel,
  manualLocked,
  onClear,
  canWriteState,
}: {
  scaleLabel: string;
  manualLocked: boolean;
  onClear: () => void;
  canWriteState: boolean;
}) {
  return (
    <div className="harmony-popup-header">
      <div>
        <span>Manual Voicing</span>
        <small>{scaleLabel}</small>
      </div>
      <button type="button" className="harmony-subtle-button" onClick={onClear} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualClear')}>
        Clear
      </button>
      {manualLocked && (
        <div className="harmony-lock-message">
          Manual control is locked during preset morph. Move morph to A or B endpoint.
        </div>
      )}
    </div>
  );
}

function ManualVoicingModeSwitch({
  manual,
  manualLocked,
  canWriteState,
  onModeChange,
  onStrengthChange,
}: {
  manual: ManualHarmonyControlState;
  manualLocked: boolean;
  canWriteState: boolean;
  onModeChange: (mode: ManualHarmonyControlMode) => void;
  onStrengthChange: (strength: HarmonyControlStrength) => void;
}) {
  void onModeChange;
  void onStrengthChange;
  void manualLocked;
  void canWriteState;
  void manual;
  // Mode strip removed — audition is always-on, control is implicit, capture is an action button.
  // Strength (Blend toggle) is now inside the Advanced disclosure.
  return null;
}

function ManualVoicingPreview({
  label,
  notes,
  auditionSource,
  auditionEnabled,
  onAuditionSourceChange,
  onAuditionPreview,
  onCapture,
  canWriteState,
  writeLocked,
  captureSlotId,
  onCaptureSlotChange,
  slots,
}: {
  label: string;
  notes: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
  onCapture?: () => void;
  canWriteState: boolean;
  writeLocked: boolean;
  captureSlotId: number;
  onCaptureSlotChange: (slotId: number) => void;
  slots: readonly HarmonyChordSlot[];
}) {
  return (
    <div className="harmony-manual-preview">
      <span>Preview</span>
      <strong>{label}</strong>
      <HarmonyNotePoolPills notes={notes} compact />
      <div className="harmony-audition-tools" aria-label="Audition sound engine">
        <label {...harmonyHelpAttrs('harmonyManualAuditionSound')} title="Choose which synth voice to preview chords through">
          <span>Sound</span>
          <select
            value={auditionSource}
            onChange={(event) => onAuditionSourceChange(event.target.value as ProductManualSynthSource)}
            disabled={!auditionEnabled}
          >
            {AUDITION_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="harmony-primary-button"
          onClick={onAuditionPreview}
          disabled={!auditionEnabled || notes.length === 0}
          title="Play the current chord selection through the chosen synth voice"
          {...harmonyHelpAttrs('harmonyManualAuditionPlay')}
        >
          Play
        </button>
        {onCapture && (
          <div className="harmony-capture-group">
            <select
              value={captureSlotId}
              onChange={(event) => onCaptureSlotChange(Number(event.target.value))}
              disabled={!canWriteState || writeLocked}
              title="Choose which slot to capture the current chord into"
              {...harmonyHelpAttrs('harmonyManualCaptureSlot')}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  S{slot.id + 1}{slot.locked ? ' 🔒' : ''}{slot.name ? ` ${slot.name}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="harmony-subtle-button"
              onClick={onCapture}
              disabled={!canWriteState || writeLocked || slots[captureSlotId]?.locked}
              title={`Snapshot current chord into Slot ${captureSlotId + 1}`}
              {...harmonyHelpAttrs('harmonyManualCapture')}
            >
              Capture
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function VoicingRootKeyGrid({
  selectedRootNote,
  previewNotes,
  onRootChange,
  canWriteState,
}: {
  selectedRootNote: number;
  previewNotes: readonly number[];
  onRootChange: (rootNote: number) => void;
  canWriteState: boolean;
}) {
  const previewPitchClasses = new Set(previewNotes.map(pitchClass));
  const renderKey = (
    key: typeof VOICING_ROOT_NATURAL_KEYS[number] | typeof VOICING_ROOT_ACCIDENTAL_KEYS[number],
    kind: 'natural' | 'accidental',
  ) => {
    const isRoot = selectedRootNote === key.note;
    const isPool = previewPitchClasses.has(key.note);
    const status = isRoot ? 'root' : isPool ? 'chord' : 'outside';
    const roleLabel = isRoot ? 'Root' : isPool ? 'Pool' : 'Out';
    const style = 'column' in key ? { gridColumn: `${key.column} / span 1` } : undefined;

    return (
      <button
        key={key.note}
        type="button"
        className={`harmony-root-key ${kind} harmony-${status}${isRoot ? ' active' : ''}`}
        style={style}
        onClick={() => onRootChange(key.note)}
        disabled={!canWriteState}
        aria-label={`Set root to ${key.label}, ${roleLabel.toLowerCase()}`}
        {...harmonyHelpAttrs('harmonyManualRootKey')}
      >
        <span className="harmony-root-key-shortcut">{key.shortcut}</span>
        <strong className="harmony-root-key-note">{key.label}</strong>
        <span className="harmony-root-key-role">{roleLabel}</span>
      </button>
    );
  };

  return (
    <div className="harmony-root-key-grid" aria-label="Root note key grid">
      <div className="harmony-root-key-row accidental">
        {VOICING_ROOT_ACCIDENTAL_KEYS.map((key) => renderKey(key, 'accidental'))}
      </div>
      <div className="harmony-root-key-row natural">
        {VOICING_ROOT_NATURAL_KEYS.map((key) => renderKey(key, 'natural'))}
      </div>
    </div>
  );
}

function DegreePadRow({
  selectedDegree,
  onDegreeChange,
  canWriteState,
}: {
  selectedDegree: number;
  onDegreeChange: (degree: number) => void;
  canWriteState: boolean;
}) {
  return (
    <div className="harmony-degree-pad-row">
      {ROMAN_DEGREES.map((degree, index) => (
        <button
          key={degree}
          type="button"
          className={`harmony-degree-pad${selectedDegree === index ? ' active' : ''}`}
          onClick={() => onDegreeChange(index)}
          disabled={!canWriteState}
          {...harmonyHelpAttrs('harmonyManualDegreePad')}
        >
          {degree}
        </button>
      ))}
    </div>
  );
}

function ChordModifierPanel({
  manual,
  canWriteState,
  onQualityChange,
  onToggleExtension,
}: {
  manual: ManualHarmonyControlState;
  canWriteState: boolean;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onToggleExtension: (extension: string) => void;
}) {
  return (
    <div className="harmony-modifier-panel">
      <div className="harmony-panel-label">Chord Type</div>
      <div className="harmony-control-cluster">
        <span>Quality</span>
        <div className="harmony-chip-row">
          {QUALITY_OPTIONS.slice(1, 5).map((quality) => (
            <button
              key={quality.value}
              type="button"
              className={`harmony-chip${manual.selectedQuality === quality.value ? ' active' : ''}`}
              onClick={() => onQualityChange(quality.value)}
              disabled={!canWriteState}
              title={`Set chord quality to ${quality.label}`}
              {...harmonyHelpAttrs('harmonyManualQuality')}
            >
              <em>{quality.key}</em>
              {quality.label}
            </button>
          ))}
        </div>
      </div>
      <div className="harmony-control-cluster">
        <span>Extensions</span>
        <div className="harmony-chip-row">
          {EXTENSION_KEYS.map((extension) => (
            <button
              key={extension.value}
              type="button"
              className={`harmony-chip${manual.selectedExtensions.includes(extension.value) ? ' active' : ''}`}
              onClick={() => onToggleExtension(extension.value)}
              disabled={!canWriteState}
              title={`Toggle ${extension.label} extension`}
              {...harmonyHelpAttrs('harmonyManualExtension')}
            >
              <em>{extension.key}</em>
              {extension.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoicingAdvancedDisclosure({
  manual,
  open,
  canWriteState,
  preserveExactVoicing,
  blendWithSequence,
  onToggleOpen,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onPreserveExactVoicingChange,
  onBlendChange,
}: {
  manual: ManualHarmonyControlState;
  open: boolean;
  canWriteState: boolean;
  preserveExactVoicing: boolean;
  blendWithSequence: boolean;
  onToggleOpen: () => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onPreserveExactVoicingChange: (preserve: boolean) => void;
  onBlendChange: (blend: boolean) => void;
}) {
  return (
    <div className="harmony-advanced-disclosure">
      <button type="button" className="harmony-disclosure-button" onClick={onToggleOpen} aria-expanded={open} title="Advanced voicing controls: octave, inversion, spread, bass, and blending" {...harmonyHelpAttrs('harmonyManualVoicingDisclosure')}>
        Advanced
      </button>
      {open && (
        <div className="harmony-advanced-grid">
          <div className="harmony-stepper">
            <span>Octave</span>
            <button type="button" onClick={() => onOctaveChange(-1)} disabled={!canWriteState} title="Lower octave" {...harmonyHelpAttrs('harmonyManualOctave')}>−</button>
            <strong>{manual.selectedOctave}</strong>
            <button type="button" onClick={() => onOctaveChange(1)} disabled={!canWriteState} title="Raise octave" {...harmonyHelpAttrs('harmonyManualOctave')}>+</button>
          </div>
          <div className="harmony-stepper">
            <span>Inversion</span>
            <button type="button" onClick={() => onInversionChange(-1)} disabled={!canWriteState} title="Invert down" {...harmonyHelpAttrs('harmonyManualInversion')}>−</button>
            <strong>{manual.selectedInversion}</strong>
            <button type="button" onClick={() => onInversionChange(1)} disabled={!canWriteState} title="Invert up" {...harmonyHelpAttrs('harmonyManualInversion')}>+</button>
          </div>
          <label className="harmony-range-control" title="How spread apart the notes in the chord are" {...harmonyHelpAttrs('harmonyManualSpread')}>
            <span>Spread</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={manual.selectedSpread}
              onChange={(event) => onSpreadChange(Number(event.target.value))}
              disabled={!canWriteState}
            />
            <strong>{Math.round(manual.selectedSpread * 100)}</strong>
          </label>
          <div className="harmony-stepper bass-mode">
            <span>Bass</span>
            {BASS_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={manual.selectedBassMode === mode.value ? 'active' : ''}
                onClick={() => onBassModeChange(mode.value)}
                disabled={!canWriteState}
                title={mode.value === 'off' ? 'No bass note' : mode.value === 'root' ? 'Add root note one octave below' : 'Add fifth below'}
                {...harmonyHelpAttrs('harmonyManualBass')}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <label className="harmony-checkbox-row" title="When enabled, your manual chord blends with the active sequence instead of overriding it" {...harmonyHelpAttrs('harmonyManualBlend')}>
            <input
              type="checkbox"
              checked={blendWithSequence}
              onChange={(event) => onBlendChange(event.target.checked)}
              disabled={!canWriteState}
            />
            Blend with sequence
          </label>
          <label className="harmony-checkbox-row" title="Preserve the exact MIDI notes from a captured voicing" {...harmonyHelpAttrs('harmonyManualPreserve')}>
            <input
              type="checkbox"
              checked={preserveExactVoicing}
              onChange={(event) => onPreserveExactVoicingChange(event.target.checked)}
              disabled={!canWriteState}
            />
            Preserve exact voicing
          </label>
        </div>
      )}
    </div>
  );
}

function ManualVoicingPopup({
  scaleLabel,
  manual,
  slots,
  manualLocked,
  canWriteState,
  inputMode,
  advancedOpen,
  previewLabel,
  previewNotes,
  auditionSource,
  auditionEnabled,
  preserveExactVoicing,
  writeLocked,
  captureSlotId,
  onAuditionSourceChange,
  onAuditionPreview,
  onInputModeChange,
  onAdvancedOpenChange,
  onClear,
  onModeChange,
  onStrengthChange,
  onRootChange,
  onDegreeChange,
  onQualityChange,
  onToggleExtension,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onPreserveExactVoicingChange,
  onCapture,
  onCaptureSlotChange,
  onKeyDown,
}: {
  scaleLabel: string;
  manual: ManualHarmonyControlState;
  slots: readonly HarmonyChordSlot[];
  manualLocked: boolean;
  canWriteState: boolean;
  inputMode: VoicingInputMode;
  advancedOpen: boolean;
  previewLabel: string;
  previewNotes: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  preserveExactVoicing: boolean;
  writeLocked: boolean;
  captureSlotId: number;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
  onInputModeChange: (mode: VoicingInputMode) => void;
  onAdvancedOpenChange: (open: boolean) => void;
  onClear: () => void;
  onModeChange: (mode: ManualHarmonyControlMode) => void;
  onStrengthChange: (strength: HarmonyControlStrength) => void;
  onRootChange: (rootNote: number) => void;
  onDegreeChange: (degree: number) => void;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onToggleExtension: (extension: string) => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onPreserveExactVoicingChange: (preserve: boolean) => void;
  onCapture: () => void;
  onCaptureSlotChange: (slotId: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="harmony-popup harmony-manual-popup" tabIndex={0} onKeyDown={onKeyDown} aria-label="Manual harmony voicing">
      <ManualVoicingHeader scaleLabel={scaleLabel} manualLocked={manualLocked} onClear={onClear} canWriteState={canWriteState} />
      <ManualVoicingModeSwitch
        manual={manual}
        manualLocked={manualLocked}
        canWriteState={canWriteState}
        onModeChange={onModeChange}
        onStrengthChange={onStrengthChange}
      />
      <ManualVoicingPreview
        label={previewLabel}
        notes={previewNotes}
        auditionSource={auditionSource}
        auditionEnabled={auditionEnabled}
        onAuditionSourceChange={onAuditionSourceChange}
        onAuditionPreview={onAuditionPreview}
        onCapture={onCapture}
        canWriteState={canWriteState}
        writeLocked={writeLocked}
        captureSlotId={captureSlotId}
        onCaptureSlotChange={onCaptureSlotChange}
        slots={slots}
      />
      <div className="harmony-manual-workspace">
        <div className="harmony-root-panel">
          <div className="harmony-panel-topline">
            <span>Root / Degree</span>
            <div className="harmony-segment-group compact">
              {(['root', 'degree'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`harmony-segment${inputMode === mode ? ' active' : ''}`}
                  onClick={() => onInputModeChange(mode)}
                  title={mode === 'root' ? 'Select chord root by note name' : 'Select chord root by scale degree (I-VII)'}
                  {...harmonyHelpAttrs(mode === 'root' ? 'harmonyManualInputRoot' : 'harmonyManualInputDegree')}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {inputMode === 'root' ? (
            <VoicingRootKeyGrid
              selectedRootNote={manual.selectedRootNote}
              previewNotes={previewNotes}
              onRootChange={onRootChange}
              canWriteState={canWriteState}
            />
          ) : (
            <DegreePadRow
              selectedDegree={manual.selectedDegree}
              onDegreeChange={onDegreeChange}
              canWriteState={canWriteState}
            />
          )}
        </div>
        <div className="harmony-right-panel">
          <ChordModifierPanel
            manual={manual}
            canWriteState={canWriteState}
            onQualityChange={onQualityChange}
            onToggleExtension={onToggleExtension}
          />
          <VoicingAdvancedDisclosure
            manual={manual}
            open={advancedOpen}
            canWriteState={canWriteState}
            preserveExactVoicing={preserveExactVoicing}
            blendWithSequence={manual.strength === 'bias'}
            onToggleOpen={() => onAdvancedOpenChange(!advancedOpen)}
            onOctaveChange={onOctaveChange}
            onInversionChange={onInversionChange}
            onSpreadChange={onSpreadChange}
            onBassModeChange={onBassModeChange}
            onPreserveExactVoicingChange={onPreserveExactVoicingChange}
            onBlendChange={(blend) => onStrengthChange(blend ? 'bias' : 'force')}
          />
        </div>
      </div>
    </div>
  );
}

function CompactSequenceStrip({
  sequence,
  sequenceLength,
  slots,
  activeStepId,
  chordSequenceEnabled,
  onToggleSequence,
  onStepClick,
}: {
  sequence: readonly HarmonySequenceStep[];
  sequenceLength: number;
  slots: readonly HarmonyChordSlot[];
  activeStepId: number | null;
  chordSequenceEnabled: boolean;
  onToggleSequence: () => void;
  onStepClick: (stepId: number) => void;
}) {
  const visibleSequence = sequence.slice(0, sequenceLength);
  return (
    <div className="harmony-compact-sequence">
      <button
        type="button"
        className={`harmony-compact-seq-toggle${chordSequenceEnabled ? ' active' : ''}`}
        onClick={onToggleSequence}
        title={chordSequenceEnabled ? 'Disable chord sequence' : 'Enable chord sequence'}
        {...harmonyHelpAttrs('harmonyCompactSeqToggle')}
      >
        Seq
      </button>
      <div className="harmony-compact-seq-steps">
        {visibleSequence.map((step) => (
          <button
            key={step.id}
            type="button"
            className={`harmony-compact-step${activeStepId === step.id ? ' active' : ''}${step.enabled ? '' : ' muted'}`}
            onClick={() => onStepClick(step.id)}
            title={`Step ${step.id + 1}: ${sequenceStepTitle(step, slots)}`}
            {...harmonyHelpAttrs('harmonyCompactStep')}
          >
            <span>{step.id + 1}</span>
            <strong>{sequenceStepTitle(step, slots)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChordLabHeader({
  bank,
  writeLocked,
  chordSequenceEnabled,
}: {
  bank: HarmonyBank;
  writeLocked: boolean;
  chordSequenceEnabled: boolean;
}) {
  return (
    <div className="harmony-popup-header chord-lab-header">
      <div>
        <span>Chord Lab</span>
        <small>{writeLocked ? 'Editing waits for endpoint A or B' : 'Progression, chord palette, and creation'}</small>
      </div>
      <div className="harmony-lab-status-pills">
        <span>Bank {bank}</span>
        <span>{chordSequenceEnabled ? 'Progression On' : 'Progression Off'}</span>
      </div>
    </div>
  );
}

function ChordSlotBank({
  slots,
  selectedSlotId,
  activeSlotId,
  inspectorKind,
  onSelectSlot,
  onActivateSlot,
}: {
  slots: readonly HarmonyChordSlot[];
  selectedSlotId: number;
  activeSlotId: number | null;
  inspectorKind: ChordLabSelectionKind;
  onSelectSlot: (slotId: number) => void;
  onActivateSlot: (slotId: number) => void;
}) {
  return (
    <div className="harmony-lab-section">
      <div className="harmony-lab-section-title" {...harmonyHelpAttrs('harmonyLabPalette')}>
        <span>Chord Palette</span>
        <small>Drag a chord to a step, or select one before copying/linking</small>
      </div>
      <div className="harmony-slot-bank">
        {slots.map((slot) => (
          (() => {
            const displayIntent = slot.chord?.intent ?? null;
            return (
          <button
            key={slot.id}
            type="button"
            draggable
            className={`harmony-slot-object${selectedSlotId === slot.id ? ' selected' : ''}${selectedSlotId === slot.id && inspectorKind !== 'slot' ? ' referenced' : ''}${activeSlotId === slot.id ? ' active' : ''}${slot.locked ? ' locked' : ''}`}
            onClick={() => onSelectSlot(slot.id)}
            onDoubleClick={() => onActivateSlot(slot.id)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('application/x-harmony-slot-id', String(slot.id));
              event.dataTransfer.setData('text/plain', String(slot.id));
            }}
            title={`S${slot.id + 1}: ${intentTitle(displayIntent)}`}
            {...harmonyHelpAttrs('harmonyLabSlot')}
          >
            <span>S{slot.id + 1}</span>
            <strong>{intentTitle(displayIntent)}</strong>
            <em>{displayIntent ? (displayIntent.rootMode === 'degree' ? ROMAN_DEGREES[displayIntent.degree] ?? 'I' : noteName(displayIntent.rootNote)) : '—'}</em>
            {slot.locked && <small>Locked</small>}
          </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}

function ChordSlotInspector({
  slot,
  canWriteState,
  writeLocked,
  onUpdateSlot,
  onCapture,
}: {
  slot: HarmonyChordSlot;
  canWriteState: boolean;
  writeLocked: boolean;
  onUpdateSlot: (slotId: number, patch: Partial<HarmonyChordSlot>) => void;
  onCapture: (slotId: number) => void;
}) {
  const updateIntent = (patch: Partial<HarmonyIntent>) => {
    onUpdateSlot(slot.id, { intent: sanitizeHarmonyIntent({ ...slot.intent, ...patch }) });
  };
  return (
    <div className="harmony-inspector">
      <div className="harmony-inspector-heading">
        <span className="harmony-inspector-title">Selected Chord</span>
        <small>Editing palette chord S{slot.id + 1}</small>
      </div>
      <div className="harmony-inspector-grid">
        <label {...harmonyHelpAttrs('harmonyLabSlotName')}>
          <span>Name</span>
          <input
            value={slot.name}
            onChange={(event) => onUpdateSlot(slot.id, { name: event.target.value })}
            disabled={!canWriteState || writeLocked}
          />
        </label>
        <label {...harmonyHelpAttrs('harmonyLabSlotDegree')}>
          <span>Degree</span>
          <select
            value={slot.intent.degree}
            onChange={(event) => updateIntent({ rootMode: 'degree', degree: Number(event.target.value) })}
            disabled={!canWriteState || writeLocked}
          >
            {ROMAN_DEGREES.map((degree, index) => (
              <option key={degree} value={index}>{degree}</option>
            ))}
          </select>
        </label>
        <label {...harmonyHelpAttrs('harmonyLabSlotQuality')}>
          <span>Quality</span>
          <select
            value={slot.intent.quality}
            onChange={(event) => updateIntent({ quality: event.target.value as HarmonyChordQuality })}
            disabled={!canWriteState || writeLocked}
          >
            {QUALITY_OPTIONS.map((quality) => (
              <option key={quality.value} value={quality.value}>{quality.label}</option>
            ))}
          </select>
        </label>
        <div className="harmony-segment-group compact">
          <span>Override</span>
          {([{ key: 'bias', label: 'Suggest', tip: 'Blend this chord with the active sequence' }, { key: 'force', label: 'Override', tip: 'Force this exact chord, ignoring the sequence' }] as const).map(({ key, label, tip }) => (
            <button
              key={key}
              type="button"
              className={`harmony-segment${slot.intent.strength === key ? ' active' : ''}`}
              onClick={() => updateIntent({ strength: key })}
              disabled={!canWriteState || writeLocked}
              title={tip}
              {...harmonyHelpAttrs('harmonyLabSlotStrength')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="harmony-segment-group wrap">
          <span>Extensions</span>
          {EXTENSION_KEYS.map((extension) => {
            const active = slot.intent.extensions.includes(extension.value);
            return (
              <button
                key={extension.value}
                type="button"
                className={`harmony-segment${active ? ' active' : ''}`}
                onClick={() => updateIntent({
                  extensions: active
                    ? slot.intent.extensions.filter((item) => item !== extension.value)
                    : [...slot.intent.extensions, extension.value].slice(0, 8),
                })}
                disabled={!canWriteState || writeLocked}
                {...harmonyHelpAttrs('harmonyLabSlotExtension')}
              >
                {extension.label}
              </button>
            );
          })}
        </div>
        <div className="harmony-inspector-actions">
          <button type="button" className="harmony-subtle-button" onClick={() => onCapture(slot.id)} disabled={!canWriteState || writeLocked || slot.locked} {...harmonyHelpAttrs('harmonyLabSlotCapture')}>
            Capture
          </button>
          <button type="button" className="harmony-subtle-button" onClick={() => onUpdateSlot(slot.id, { locked: !slot.locked })} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyLabSlotLock')}>
            {slot.locked ? 'Unlock' : 'Lock'}
          </button>
          <button type="button" className="harmony-subtle-button" onClick={() => onUpdateSlot(slot.id, { intent: defaultHarmonyIntent('slot', slot.id % 7) })} disabled={!canWriteState || writeLocked || slot.locked} {...harmonyHelpAttrs('harmonyLabSlotClear')}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function ChordSequenceStrip({
  sequence,
  sequenceLength,
  slots,
  selectedStepId,
  activeStepId,
  chordSequenceEnabled,
  onSelectStep,
  onSequenceEnabledChange,
  onSequenceLengthChange,
  onApplySlotToStep,
}: {
  sequence: readonly HarmonySequenceStep[];
  sequenceLength: number;
  slots: readonly HarmonyChordSlot[];
  selectedStepId: number;
  activeStepId: number | null;
  chordSequenceEnabled: boolean;
  onSelectStep: (stepId: number) => void;
  onSequenceEnabledChange: (enabled: boolean) => void;
  onSequenceLengthChange: (length: number) => void;
  onApplySlotToStep: (stepId: number, slotId: number, link: boolean) => void;
}) {
  const visibleSequence = sequence.slice(0, sequenceLength);
  return (
    <div className={`harmony-lab-section harmony-progression-lane${chordSequenceEnabled ? '' : ' disabled'}`}>
      <div className="harmony-lab-section-title" {...harmonyHelpAttrs('harmonyLabProgression')}>
        <span>Progression</span>
        <div className="harmony-progression-controls">
          <button
            type="button"
            className={`harmony-seq-enable${chordSequenceEnabled ? ' on' : ''}`}
            onClick={() => onSequenceEnabledChange(!chordSequenceEnabled)}
            {...harmonyHelpAttrs('harmonyLabSequenceEnable')}
          >
            {chordSequenceEnabled ? 'On' : 'Off'}
          </button>
          <label className="harmony-step-count-control" {...harmonyHelpAttrs('harmonyLabSequenceLength')}>
            <span>Steps</span>
            <input
              type="number"
              min={HARMONY_SEQUENCE_STEP_MIN}
              max={HARMONY_SEQUENCE_STEP_COUNT}
              step={1}
              value={sequenceLength}
              onChange={(event) => onSequenceLengthChange(progressionStepCount(Number(event.target.value)))}
            />
          </label>
          <div className="harmony-step-count-pills" aria-label="Progression step count">
            {Array.from({ length: HARMONY_SEQUENCE_STEP_COUNT - HARMONY_SEQUENCE_STEP_MIN + 1 }, (_, index) => HARMONY_SEQUENCE_STEP_MIN + index).map((count) => (
              <button
                key={count}
                type="button"
                className={sequenceLength === count ? 'active' : ''}
                onClick={() => onSequenceLengthChange(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="harmony-sequence-strip" style={{ '--harmony-step-count': sequenceLength } as React.CSSProperties}>
        {visibleSequence.map((step) => (
          <button
            key={step.id}
            type="button"
            className={`harmony-step-object${selectedStepId === step.id ? ' selected' : ''}${activeStepId === step.id ? ' active' : ''}${step.enabled ? '' : ' muted'}${step.locked ? ' locked' : ''}`}
            onClick={() => onSelectStep(step.id)}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('application/x-harmony-slot-id')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(event) => {
              const slotId = Number(event.dataTransfer.getData('application/x-harmony-slot-id'));
              if (!Number.isFinite(slotId)) return;
              event.preventDefault();
              onApplySlotToStep(step.id, slotId, false);
            }}
            {...harmonyHelpAttrs('harmonyLabSequenceStep')}
          >
            <span className="harmony-step-number">{step.id + 1}</span>
            <span className="harmony-step-cell">
              <strong>{sequenceStepTitle(step, slots)}</strong>
              <em>{stepSourceLabel(step)}</em>
            </span>
            <i style={{ transform: `scaleX(${clamp(step.probability, 0, 1)})` }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ChordStepInspector({
  step,
  slots,
  canWriteState,
  writeLocked,
  selectedSlot,
  onUpdateStep,
  onCopySlotToStep,
  onLinkSlotToStep,
}: {
  step: HarmonySequenceStep;
  slots: readonly HarmonyChordSlot[];
  canWriteState: boolean;
  writeLocked: boolean;
  selectedSlot: HarmonyChordSlot;
  onUpdateStep: (stepId: number, patch: Partial<HarmonySequenceStep>) => void;
  onCopySlotToStep: (slotId: number) => void;
  onLinkSlotToStep: (slotId: number) => void;
}) {
  const updateIntent = (patch: Partial<HarmonyIntent>) => {
    onUpdateStep(step.id, {
      mode: 'intent',
      intent: sanitizeHarmonyIntent({
        ...(step.intent ?? defaultHarmonyIntent('sequence', step.degree)),
        source: 'sequence',
        degree: step.degree,
        quality: step.quality,
        ...patch,
      }),
    });
  };
  const snapshotSlotIntent = (slotId: number | null): HarmonyIntent | null => {
    if (slotId === null) return null;
    const slot = slots[slotId];
    return slot?.chord?.intent
      ? sanitizeHarmonyIntent({ ...slot.chord.intent, source: 'sequence' })
      : null;
  };
  return (
    <div className="harmony-inspector">
      <div className="harmony-inspector-heading">
        <span className="harmony-inspector-title">Selected Chord</span>
        <small>Editing progression step {step.id + 1}</small>
      </div>
      <div className="harmony-inspector-grid">
        <div className="harmony-segment-group compact">
          <span>Step</span>
          <button
            type="button"
            className={`harmony-segment${step.enabled ? ' active' : ''}`}
            onClick={() => onUpdateStep(step.id, { enabled: !step.enabled })}
            disabled={!canWriteState || writeLocked}
            {...harmonyHelpAttrs('harmonyLabStepEnable')}
          >
            {step.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="harmony-step-slot-actions" {...harmonyHelpAttrs('harmonyLabStepSlotActions')}>
          <span>Palette Source</span>
          <strong>S{selectedSlot.id + 1} {intentTitle(selectedSlot.intent)}</strong>
          <div>
            <button
              type="button"
              className="harmony-subtle-button"
              onClick={() => onCopySlotToStep(selectedSlot.id)}
              disabled={!canWriteState || writeLocked || step.locked}
            >
              Copy S{selectedSlot.id + 1} Here
            </button>
            <button
              type="button"
              className="harmony-subtle-button"
              onClick={() => onLinkSlotToStep(selectedSlot.id)}
              disabled={!canWriteState || writeLocked || step.locked}
            >
              Link S{selectedSlot.id + 1}
            </button>
          </div>
        </div>
        <label {...harmonyHelpAttrs('harmonyLabStepMode')}>
          <span>Mode</span>
          <select
            value={step.mode}
            onChange={(event) => {
              const mode = event.target.value as HarmonySequenceStepMode;
              onUpdateStep(step.id, {
                mode,
                intent: mode === 'slotCopy' ? snapshotSlotIntent(step.slotId) : mode === 'intent' ? step.intent : null,
              });
            }}
            disabled={!canWriteState || writeLocked}
          >
            {SEQUENCE_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
        <label {...harmonyHelpAttrs('harmonyLabStepDegree')}>
          <span>Degree</span>
          <select
            value={step.degree}
            onChange={(event) => onUpdateStep(step.id, { degree: Number(event.target.value), intent: null })}
            disabled={!canWriteState || writeLocked}
          >
            {ROMAN_DEGREES.map((degree, index) => (
              <option key={degree} value={index}>{degree}</option>
            ))}
          </select>
        </label>
        <label {...harmonyHelpAttrs('harmonyLabStepQuality')}>
          <span>Quality</span>
          <select
            value={step.quality}
            onChange={(event) => onUpdateStep(step.id, { quality: event.target.value as HarmonyChordQuality, intent: null })}
            disabled={!canWriteState || writeLocked}
          >
            {QUALITY_OPTIONS.map((quality) => (
              <option key={quality.value} value={quality.value}>{quality.label}</option>
            ))}
          </select>
        </label>
        <label {...harmonyHelpAttrs('harmonyLabStepSlot')}>
          <span>Slot</span>
          <select
            value={step.slotId ?? ''}
            onChange={(event) => {
              const slotId = event.target.value === '' ? null : Number(event.target.value);
              onUpdateStep(step.id, {
                slotId,
                intent: step.mode === 'slotCopy' ? snapshotSlotIntent(slotId) : step.intent,
              });
            }}
            disabled={!canWriteState || writeLocked || (step.mode !== 'slotCopy' && step.mode !== 'slotFollow')}
          >
            <option value="">None</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>S{slot.id + 1}</option>
            ))}
          </select>
        </label>
        <label className="harmony-range-control inspector-range" {...harmonyHelpAttrs('harmonyLabStepProbability')}>
          <span>Probability</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={step.probability}
            onChange={(event) => onUpdateStep(step.id, { probability: Number(event.target.value) })}
            disabled={!canWriteState || writeLocked}
          />
          <strong>{Math.round(step.probability * 100)}</strong>
        </label>
        <div className="harmony-segment-group compact">
          <span>Override</span>
          {([{ key: 'bias', label: 'Suggest', tip: 'Blend this step with surrounding context' }, { key: 'force', label: 'Override', tip: 'Force this exact chord on this step' }] as const).map(({ key, label, tip }) => (
            <button
              key={key}
              type="button"
              className={`harmony-segment${(step.intent?.strength ?? 'bias') === key ? ' active' : ''}`}
              onClick={() => updateIntent({ strength: key })}
              disabled={!canWriteState || writeLocked}
              title={tip}
              {...harmonyHelpAttrs('harmonyLabStepStrength')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="harmony-inspector-actions">
          <button type="button" className="harmony-subtle-button" onClick={() => onUpdateStep(step.id, { locked: !step.locked })} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyLabStepLock')}>
            {step.locked ? 'Unlock' : 'Lock'}
          </button>
          <button type="button" className="harmony-subtle-button" onClick={() => onUpdateStep(step.id, { mode: 'auto', intent: null, slotId: null, quality: 'auto' })} disabled={!canWriteState || writeLocked || step.locked} {...harmonyHelpAttrs('harmonyLabStepReset')}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function ChordGeneratePanel({
  target,
  tension,
  variation,
  motion,
  respectLocks,
  canWriteState,
  writeLocked,
  onTargetChange,
  onVariationChange,
  onMotionChange,
  onRespectLocksChange,
  onGenerate,
  onCommitBaseline,
}: {
  target: GenerateTarget;
  tension: number;
  variation: number;
  motion: number;
  respectLocks: boolean;
  canWriteState: boolean;
  writeLocked: boolean;
  onTargetChange: (target: GenerateTarget) => void;
  onVariationChange: (variation: number) => void;
  onMotionChange: (motion: number) => void;
  onRespectLocksChange: (respectLocks: boolean) => void;
  onGenerate: (target: GenerateTarget) => void;
  onCommitBaseline: () => void;
}) {
  const tensionCharacter = tensionCharacterFor(tension);
  const scaleBand = tensionScaleBandLabel(tension);
  const chordBand = tensionChordBandLabel(tension);
  const motionBand = generationMotionLabel(motion);

  return (
    <div className="harmony-generate-panel">
      <div className="harmony-theory-recipe" {...harmonyHelpAttrs('harmonyGenerateTheoryRecipe')}>
        <span>Theory Recipe</span>
        <div>
          <strong>{tensionCharacter.label}</strong>
          <em>{Math.round(tension * 100)}%</em>
        </div>
        <div>
          <small>Scale</small>
          <strong>{scaleBand}</strong>
        </div>
        <div>
          <small>Chords</small>
          <strong>{chordBand}</strong>
        </div>
        <div>
          <small>Motion</small>
          <strong>{motionBand}</strong>
        </div>
      </div>
      <div className="harmony-control-cluster">
        <span>Target</span>
        <div className="harmony-chip-row">
          {(['slots', 'sequence', 'both'] as const).map((item) => (
            <button key={item} type="button" className={`harmony-chip${target === item ? ' active' : ''}`} onClick={() => onTargetChange(item)} {...harmonyHelpAttrs('harmonyGenerateTarget')}>
              {generateTargetLabel(item)}
            </button>
          ))}
        </div>
      </div>
      <label className="harmony-wide-range" {...harmonyHelpAttrs('harmonyGenerateMotion')}>
        <span>Motion</span>
        <small>Stable</small>
        <input type="range" min={0} max={1} step={0.01} value={motion} onChange={(event) => onMotionChange(Number(event.target.value))} />
        <small>Active</small>
      </label>
      <label className="harmony-wide-range" {...harmonyHelpAttrs('harmonyGenerateVariation')}>
        <span>Variation</span>
        <small>Close</small>
        <input type="range" min={0} max={1} step={0.01} value={variation} onChange={(event) => onVariationChange(Number(event.target.value))} />
        <small>Surprising</small>
      </label>
      <div className="harmony-generate-actions">
        <button type="button" className={`harmony-segment${respectLocks ? ' active' : ''}`} onClick={() => onRespectLocksChange(!respectLocks)} {...harmonyHelpAttrs('harmonyGenerateRespectLocks')}>
          Respect Locks
        </button>
        <button type="button" className="harmony-subtle-button" onClick={onCommitBaseline} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyGenerateBaselineMap')}>
          Capture Auto
        </button>
        <button type="button" className="harmony-primary-button" onClick={() => onGenerate(target)} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyGenerateRun')}>
          Generate {generateTargetLabel(target)}
        </button>
      </div>
    </div>
  );
}

function ChordCreateDisclosure({
  target,
  tension,
  variation,
  motion,
  respectLocks,
  canWriteState,
  writeLocked,
  onTargetChange,
  onVariationChange,
  onMotionChange,
  onRespectLocksChange,
  onGenerate,
  onCommitBaseline,
}: {
  target: GenerateTarget;
  tension: number;
  variation: number;
  motion: number;
  respectLocks: boolean;
  canWriteState: boolean;
  writeLocked: boolean;
  onTargetChange: (target: GenerateTarget) => void;
  onVariationChange: (variation: number) => void;
  onMotionChange: (motion: number) => void;
  onRespectLocksChange: (respectLocks: boolean) => void;
  onGenerate: (target: GenerateTarget) => void;
  onCommitBaseline: () => void;
}) {
  const tensionCharacter = tensionCharacterFor(tension);
  return (
    <details className="harmony-create-disclosure">
      <summary {...harmonyHelpAttrs('harmonyLabCreate')}>
        <span>Create</span>
        <em>{tensionCharacter.label} · {generateTargetLabel(target)}</em>
      </summary>
      <ChordGeneratePanel
        target={target}
        tension={tension}
        variation={variation}
        motion={motion}
        respectLocks={respectLocks}
        canWriteState={canWriteState}
        writeLocked={writeLocked}
        onTargetChange={onTargetChange}
        onVariationChange={onVariationChange}
        onMotionChange={onMotionChange}
        onRespectLocksChange={onRespectLocksChange}
        onGenerate={onGenerate}
        onCommitBaseline={onCommitBaseline}
      />
    </details>
  );
}

function ChordLabPopup({
  bank,
  slots,
  sequence,
  sequenceLength,
  manual,
  selectionKind,
  selectedSlotId,
  selectedStepId,
  activeStepId,
  canWriteState,
  writeLocked,
  chordSequenceEnabled,
  generateTarget,
  tension,
  generateVariation,
  generateMotion,
  generateRespectLocks,
  onSelectSlot,
  onActivateSlot,
  onUpdateSlot,
  onCaptureSlot,
  onSelectStep,
  onUpdateStep,
  onSequenceEnabledChange,
  onSequenceLengthChange,
  onApplySlotToStep,
  onGenerateTargetChange,
  onGenerateVariationChange,
  onGenerateMotionChange,
  onGenerateRespectLocksChange,
  onGenerate,
  onCommitBaseline,
}: {
  bank: HarmonyBank;
  slots: readonly HarmonyChordSlot[];
  sequence: readonly HarmonySequenceStep[];
  sequenceLength: number;
  manual: ManualHarmonyControlState;
  selectionKind: ChordLabSelectionKind;
  selectedSlotId: number;
  selectedStepId: number;
  activeStepId: number | null;
  canWriteState: boolean;
  writeLocked: boolean;
  chordSequenceEnabled: boolean;
  generateTarget: GenerateTarget;
  tension: number;
  generateVariation: number;
  generateMotion: number;
  generateRespectLocks: boolean;
  onSelectSlot: (slotId: number) => void;
  onActivateSlot: (slotId: number) => void;
  onUpdateSlot: (slotId: number, patch: Partial<HarmonyChordSlot>) => void;
  onCaptureSlot: (slotId: number) => void;
  onSelectStep: (stepId: number) => void;
  onUpdateStep: (stepId: number, patch: Partial<HarmonySequenceStep>) => void;
  onSequenceEnabledChange: (enabled: boolean) => void;
  onSequenceLengthChange: (length: number) => void;
  onApplySlotToStep: (stepId: number, slotId: number, link: boolean) => void;
  onGenerateTargetChange: (target: GenerateTarget) => void;
  onGenerateVariationChange: (variation: number) => void;
  onGenerateMotionChange: (motion: number) => void;
  onGenerateRespectLocksChange: (respectLocks: boolean) => void;
  onGenerate: (target: GenerateTarget) => void;
  onCommitBaseline: () => void;
}) {
  const selectedSlot = slots[selectedSlotId] ?? slots[0];
  const selectedStep = sequence[Math.min(selectedStepId, sequenceLength - 1)] ?? sequence[0];

  return (
    <div className="harmony-popup harmony-lab-popup" aria-label="Chord Lab">
      <ChordLabHeader
        bank={bank}
        writeLocked={writeLocked}
        chordSequenceEnabled={chordSequenceEnabled}
      />
      {selectedStep && (
        <ChordSequenceStrip
          sequence={sequence}
          sequenceLength={sequenceLength}
          slots={slots}
          selectedStepId={selectedStep.id}
          activeStepId={activeStepId}
          chordSequenceEnabled={chordSequenceEnabled}
          onSelectStep={onSelectStep}
          onSequenceEnabledChange={onSequenceEnabledChange}
          onSequenceLengthChange={onSequenceLengthChange}
          onApplySlotToStep={onApplySlotToStep}
        />
      )}
      {selectedSlot && (
        <ChordSlotBank
          slots={slots}
          selectedSlotId={selectedSlot.id}
          activeSlotId={manual.activeSlotId}
          inspectorKind={selectionKind}
          onSelectSlot={onSelectSlot}
          onActivateSlot={onActivateSlot}
        />
      )}
      <ChordCreateDisclosure
        target={generateTarget}
        tension={tension}
        variation={generateVariation}
        motion={generateMotion}
        respectLocks={generateRespectLocks}
        canWriteState={canWriteState}
        writeLocked={writeLocked}
        onTargetChange={onGenerateTargetChange}
        onVariationChange={onGenerateVariationChange}
        onMotionChange={onGenerateMotionChange}
        onRespectLocksChange={onGenerateRespectLocksChange}
        onGenerate={onGenerate}
        onCommitBaseline={onCommitBaseline}
      />
      {selectionKind === 'slot' && selectedSlot ? (
        <ChordSlotInspector
          slot={selectedSlot}
          canWriteState={canWriteState}
          writeLocked={writeLocked}
          onUpdateSlot={onUpdateSlot}
          onCapture={onCaptureSlot}
        />
      ) : selectedStep && selectedSlot ? (
        <ChordStepInspector
          step={selectedStep}
          slots={slots}
          selectedSlot={selectedSlot}
          canWriteState={canWriteState}
          writeLocked={writeLocked}
          onUpdateStep={onUpdateStep}
          onCopySlotToStep={(slotId) => onApplySlotToStep(selectedStep.id, slotId, false)}
          onLinkSlotToStep={(slotId) => onApplySlotToStep(selectedStep.id, slotId, true)}
        />
      ) : null}
    </div>
  );
}

export function HarmonyEnginePanel({ state, harmonyState, harmonyProjection, onStateChange, onAuditionNote }: HarmonyEnginePanelProps) {
  const [activePopup, setActivePopup] = useState<HarmonyPopup>(null);
  const [voicingInputMode, setVoicingInputMode] = useState<VoicingInputMode>('root');
  const [voicingAdvancedOpen, setVoicingAdvancedOpen] = useState(false);
  const [auditionSource, setAuditionSource] = useState<ProductManualSynthSource>('pad1');
  const [labSelectionKind, setLabSelectionKind] = useState<ChordLabSelectionKind>('step');
  const [selectedSlotId, setSelectedSlotId] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState(0);
  const [generateTarget, setGenerateTarget] = useState<GenerateTarget>('both');
  const [generateVariation, setGenerateVariation] = useState(0.35);
  const [generateMotion, setGenerateMotion] = useState(0.35);
  const [generateRespectLocks, setGenerateRespectLocks] = useState(true);
  const { announceHelp } = useSliderHelp();
  const lastHelpTargetRef = useRef<string>('');

  const announceHarmonyHelp = useCallback((target: EventTarget | null) => {
    const helpElement = findHarmonyHelpElement(target);
    if (!helpElement) return;
    const helpKey = helpElement.dataset.harmonyHelpKey;
    if (!helpKey) return;
    const helpLabel = helpElement.dataset.harmonyHelpLabel;
    const helpToken = `${helpKey}\u0000${helpLabel ?? ''}`;
    if (lastHelpTargetRef.current === helpToken) return;
    lastHelpTargetRef.current = helpToken;
    announceHelp(helpKey, helpLabel ? { page: 'global', label: helpLabel } : { page: 'global' });
  }, [announceHelp]);

  const harmonyContext = useMemo(() => {
    if (harmonyProjection) {
      return {
        bank: harmonyProjection.bank,
        rootMidi: harmonyProjection.engine.rootMidi,
        scaleId: harmonyProjection.engine.scaleId,
        scaleName: harmonyProjection.engine.scaleName,
        tension: harmonyProjection.tension,
        morphPercent: harmonyProjection.activeFrame.morphPercent,
        isEndpoint: harmonyProjection.isEndpoint,
        manualControl: harmonyProjection.manualControl,
        chordSlots: harmonyProjection.slots,
        chordSequence: harmonyProjection.chordSequence,
        chordSequenceEnabled: harmonyProjection.chordSequenceEnabled,
        chordSequenceLength: harmonyProjection.chordSequenceLength,
        chordSequenceStepIndex: harmonyProjection.chordSequenceStepIndex,
        resolvedHarmonyFrame: harmonyProjection.activeFrame,
      };
    }
    const projection = resolveHarmonyProjection(state, { harmonyState });
    return {
      bank: projection.bank,
      rootMidi: projection.engine.rootMidi,
      scaleId: projection.engine.scaleId,
      scaleName: projection.engine.scaleName,
      tension: projection.tension,
      morphPercent: projection.activeFrame.morphPercent,
      isEndpoint: projection.isEndpoint,
      manualControl: projection.manualControl,
      chordSlots: projection.slots,
      chordSequence: projection.chordSequence,
      chordSequenceEnabled: projection.chordSequenceEnabled,
      chordSequenceLength: projection.chordSequenceLength,
      chordSequenceStepIndex: projection.chordSequenceStepIndex,
      resolvedHarmonyFrame: projection.activeFrame,
    };
  }, [harmonyProjection, harmonyState, state]);

  const record = state as unknown as Record<string, unknown>;
  const manual = harmonyContext.manualControl;
  const slots = harmonyContext.chordSlots;
  const sequence = harmonyContext.chordSequence;
  const sequenceLength = harmonyContext.chordSequenceLength;
  const resolvedFrame = harmonyContext.resolvedHarmonyFrame;
  const canWriteState = Boolean(onStateChange);
  const manualLocked = !resolvedFrame.manualControlAvailable || !harmonyContext.isEndpoint;
  const writeLocked = !harmonyContext.isEndpoint;

  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    if (!onStateChange) return;
    onStateChange((prev) => statePatch({ ...(prev as unknown as Record<string, unknown>), ...patch }));
  }, [onStateChange]);

  const patchSlots = useCallback((nextSlots: HarmonyChordSlot[], extraPatch: Record<string, unknown> = {}) => {
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = { ...extraPatch, [keys.slots]: nextSlots };
    if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = nextSlots;
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, record]);

  const patchSequence = useCallback((nextSequence: HarmonySequenceStep[], extraPatch: Record<string, unknown> = {}) => {
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = { ...extraPatch, [keys.sequence]: nextSequence };
    if (record.harmonyChordSequenceA === undefined && record.harmonyChordSequenceB === undefined && harmonyContext.bank === 'A') {
      patch.harmonyChordSequence = nextSequence;
    }
    applyPatch(patch);
  }, [applyPatch, harmonyContext.bank, record]);

  const updateManual = useCallback((nextManual: ManualHarmonyControlState) => {
    applyPatch({ manualHarmonyControl: sanitizeManualHarmonyControl(nextManual) });
  }, [applyPatch]);

  const selectedBaseIntent = useCallback((
    source: HarmonyIntent['source'],
    overrides: Partial<HarmonyIntent> = {},
  ): HarmonyIntent => {
    const reference = manual.activeIntent ?? manual.auditionIntent ?? defaultHarmonyIntent(source, manual.selectedDegree);
    const rootMode = overrides.rootMode ?? reference.rootMode ?? 'absolute';
    return sanitizeHarmonyIntent({
      ...reference,
      source,
      strength: manual.strength,
      rootMode,
      degree: manual.selectedDegree,
      rootNote: manual.selectedRootNote,
      quality: manual.selectedQuality,
      extensions: manual.selectedExtensions,
      octave: manual.selectedOctave,
      inversion: manual.selectedInversion,
      spread: manual.selectedSpread,
      bassMode: manual.selectedBassMode,
      ...overrides,
    });
  }, [manual]);

  const applyManualSelection = useCallback((
    selection: Partial<ManualHarmonyControlState>,
    intentOverrides: Partial<HarmonyIntent> = {},
  ) => {
    const nextMode = modeForIntentUpdate(selection.mode ?? manual.mode, manualLocked);
    const mergedManual = sanitizeManualHarmonyControl({ ...manual, ...selection, mode: nextMode });
    const source: HarmonyIntent['source'] = nextMode === 'control' && !manualLocked ? 'manualControl' : 'audition';
    const intent = selectedBaseIntent(source, intentOverrides);
    if (nextMode === 'control' && !manualLocked) {
      updateManual({
        ...mergedManual,
        enabled: true,
        activeIntent: intent,
        auditionIntent: null,
        slotTriggerMode: false,
        activeSlotId: null,
      });
      return;
    }
    updateManual({
      ...mergedManual,
      enabled: false,
      activeIntent: nextMode === 'audition' ? mergedManual.activeIntent : null,
      auditionIntent: { ...intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [manual, manualLocked, selectedBaseIntent, updateManual]);

  const setManualMode = useCallback((mode: ManualHarmonyControlMode) => {
    if (mode !== 'audition' && manualLocked) return;
    applyManualSelection({ mode }, {});
  }, [applyManualSelection, manualLocked]);

  const clearManualControl = useCallback(() => {
    updateManual({
      ...manual,
      enabled: false,
      activeIntent: null,
      auditionIntent: null,
      slotTriggerMode: false,
      activeSlotId: null,
    });
  }, [manual, updateManual]);

  const resolveIntentPreviewNotes = useCallback((intent: HarmonyIntent) => (
    resolveHarmonyIntentToNotePool({
      intent,
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    })
  ), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension]);

  const playPreviewNotes = useCallback((notes: readonly number[], source: ProductManualSynthSource = auditionSource) => {
    if (!onAuditionNote || notes.length === 0) return;
    const maxNotes = auditionNoteLimit(source);
    const durationMs = auditionDurationMs(source);
    notes.slice(0, maxNotes).forEach((midi, index) => {
      const note: ProductManualSynthNote = {
        source,
        midi,
        velocity: index === 0 ? 0.78 : 0.64,
        durationMs,
        ...(source === 'pad1' || source === 'pad2' ? { voiceIndex: index % 6 } : {}),
      };
      onAuditionNote(note);
    });
  }, [auditionSource, onAuditionNote]);

  const previewAuditionIntent = useCallback((intent: HarmonyIntent) => {
    playPreviewNotes(resolveIntentPreviewNotes({ ...intent, source: 'audition' }));
  }, [playPreviewNotes, resolveIntentPreviewNotes]);

  const captureSelectedToSlot = useCallback((slotId: number) => {
    if (writeLocked) return;
    const currentSlot = slots[slotId];
    if (!currentSlot || currentSlot.locked) return;
    const intent = selectedBaseIntent('slot', {
      source: 'slot',
      rootMode: manual.auditionIntent?.rootMode ?? manual.activeIntent?.rootMode ?? 'absolute',
    });
    const migrated = legacyHarmonySlotToSharedSlot({ id: slotId, intent }, {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    });
    patchSlots(slots.map((slot) => slot.id === slotId
      ? { ...slot, intent, chord: migrated.chord, name: slot.name || `Slot ${slotId + 1}` }
      : slot));
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manual, patchSlots, selectedBaseIntent, slots, writeLocked]);

  const activateSlot = useCallback((slotId: number) => {
    const slot = slots[slotId];
    if (!slot?.chord?.intent) return;
    if (manual.mode === 'capture') {
      captureSelectedToSlot(slotId);
      return;
    }
    if (manual.mode === 'control' && !manualLocked) {
      if (!slot.chord) return;
      updateManual({
        ...manual,
        enabled: false,
        activeIntent: null,
        auditionIntent: null,
        slotTriggerMode: true,
        activeSlotId: slotId,
      });
      return;
    }
    if (!slot.chord?.intent) return;
    updateManual({
      ...manual,
      mode: 'audition',
      enabled: false,
      auditionIntent: { ...slot.chord.intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
    previewAuditionIntent({ ...slot.chord.intent, source: 'audition' });
  }, [captureSelectedToSlot, manual, manualLocked, previewAuditionIntent, slots, updateManual]);

  const updateSlot = useCallback((slotId: number, patch: Partial<HarmonyChordSlot>) => {
    if (writeLocked) return;
    patchSlots(slots.map((slot) => {
      if (slot.id !== slotId) return slot;
      if (patch.intent && !patch.chord) {
        const chord = slot.chord
          ? editSharedChordIntent(slot.chord, patch.intent, {
            rootMidi: harmonyContext.rootMidi,
            scaleId: harmonyContext.scaleId,
            tension: harmonyContext.tension,
          })
          : legacyHarmonySlotToSharedSlot({ id: slotId, intent: patch.intent }, {
            rootMidi: harmonyContext.rootMidi,
            scaleId: harmonyContext.scaleId,
            tension: harmonyContext.tension,
          }).chord;
        return { ...slot, ...patch, chord };
      }
      return { ...slot, ...patch };
    }));
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSlots, slots, writeLocked]);

  const updateStep = useCallback((stepId: number, patch: Partial<HarmonySequenceStep>) => {
    if (writeLocked) return;
    patchSequence(sequence.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }, [patchSequence, sequence, writeLocked]);

  const applySlotToStep = useCallback((stepId: number, slotId: number, link: boolean) => {
    if (writeLocked) return;
    const slot = slots[slotId];
    const step = sequence[stepId];
    if (!slot || !step || step.locked) return;
    const slotIntent = slot.chord?.intent;
    if (!slotIntent) return;
    setSelectedSlotId(slot.id);
    setSelectedStepId(step.id);
    setLabSelectionKind('step');
    if (link) {
      updateStep(step.id, {
        mode: 'slotFollow',
        slotId: slot.id,
        intent: null,
        degree: slotIntent.degree,
        quality: slotIntent.quality,
      });
      return;
    }
    const copiedIntent = sanitizeHarmonyIntent({ ...slotIntent, source: 'sequence' });
    updateStep(step.id, {
      mode: 'slotCopy',
      slotId: slot.id,
      intent: copiedIntent,
      degree: copiedIntent.degree,
      quality: copiedIntent.quality,
    });
  }, [sequence, slots, updateStep, writeLocked]);

  const setSequenceEnabled = useCallback((enabled: boolean) => {
    applyPatch({ harmonyChordSequenceEnabled: enabled });
  }, [applyPatch]);

  const setSequenceLength = useCallback((length: number) => {
    const nextLength = progressionStepCount(length);
    setSelectedStepId((current) => Math.min(current, nextLength - 1));
    applyPatch({
      harmonyChordSequenceLength: nextLength,
      harmonyChordSequenceStepIndex: harmonyContext.chordSequenceStepIndex % nextLength,
    });
  }, [applyPatch, harmonyContext.chordSequenceStepIndex]);

  const generateSlotsAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSlots = generateHarmonySlots(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
      variation: generateVariation,
      motion: generateMotion,
      respectLocks: generateRespectLocks,
    }, slots);
    patchSlots(nextSlots, { harmonyGenerationSeed: generationSeed });
  }, [generateMotion, generateRespectLocks, generateVariation, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSlots, slots, state, writeLocked]);

  const generateSequenceAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSequence = generateHarmonySequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
      variation: generateVariation,
      motion: generateMotion,
      respectLocks: generateRespectLocks,
    }, sequence, slots);
    patchSequence(nextSequence, { harmonyGenerationSeed: generationSeed });
  }, [generateMotion, generateRespectLocks, generateVariation, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSequence, sequence, slots, state, writeLocked]);

  const generateBothAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const generated = generateHarmonySlotsAndSequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
      variation: generateVariation,
      motion: generateMotion,
      respectLocks: generateRespectLocks,
    }, slots, sequence);
    const keys = bankKeys(harmonyContext.bank);
    const patch: Record<string, unknown> = {
      [keys.slots]: generated.slots,
      [keys.sequence]: generated.sequence,
      harmonyChordSequenceEnabled: true,
      harmonyGenerationSeed: generationSeed,
    };
    if (shouldMirrorBaseBank(record, harmonyContext.bank)) patch.harmonyChordSlots = generated.slots;
    if (record.harmonyChordSequenceA === undefined && record.harmonyChordSequenceB === undefined && harmonyContext.bank === 'A') {
      patch.harmonyChordSequence = generated.sequence;
    }
    applyPatch(patch);
  }, [applyPatch, generateMotion, generateRespectLocks, generateVariation, harmonyContext.bank, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, record, sequence, slots, state, writeLocked]);

  const commitBaselineAction = useCallback(() => {
    if (writeLocked) return;
    patchSequence(commitBaselineMap({
      seed: seedFromState(state, 0),
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
      existingSequence: sequence,
    }));
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSequence, sequence, state, writeLocked]);

  const setStrength = useCallback((strength: HarmonyControlStrength) => {
    applyManualSelection({ strength }, { strength });
  }, [applyManualSelection]);

  const setRoot = useCallback((rootNote: number) => {
    const selectedRootNote = pitchClass(rootNote);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'absolute', rootNote: selectedRootNote };
    applyManualSelection({ selectedRootNote }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setDegree = useCallback((degree: number) => {
    const safeDegree = clamp(Math.round(degree), 0, 6);
    const intentOverrides: Partial<HarmonyIntent> = { rootMode: 'degree', degree: safeDegree };
    applyManualSelection({ selectedDegree: safeDegree }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setQuality = useCallback((quality: HarmonyChordQuality) => {
    const intentOverrides: Partial<HarmonyIntent> = { quality };
    applyManualSelection({ selectedQuality: quality }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const toggleExtension = useCallback((extension: string) => {
    const selectedExtensions = manual.selectedExtensions.includes(extension)
      ? manual.selectedExtensions.filter((item) => item !== extension)
      : [...manual.selectedExtensions, extension].slice(0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { extensions: selectedExtensions };
    applyManualSelection({ selectedExtensions }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedExtensions, previewAuditionIntent, selectedBaseIntent]);

  const setOctave = useCallback((delta: number) => {
    const selectedOctave = clamp(manual.selectedOctave + delta, 0, 8);
    const intentOverrides: Partial<HarmonyIntent> = { octave: selectedOctave };
    applyManualSelection({ selectedOctave }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedOctave, previewAuditionIntent, selectedBaseIntent]);

  const setInversion = useCallback((delta: number) => {
    const selectedInversion = clamp(manual.selectedInversion + delta, -4, 4);
    const intentOverrides: Partial<HarmonyIntent> = { inversion: selectedInversion };
    applyManualSelection({ selectedInversion }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, manual.selectedInversion, previewAuditionIntent, selectedBaseIntent]);

  const setSpread = useCallback((spread: number) => {
    const selectedSpread = clamp(spread, 0, 1);
    const intentOverrides: Partial<HarmonyIntent> = { spread: selectedSpread };
    applyManualSelection({ selectedSpread }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const setBassMode = useCallback((bassMode: HarmonyBassMode) => {
    const intentOverrides: Partial<HarmonyIntent> = { bassMode };
    applyManualSelection({ selectedBassMode: bassMode }, intentOverrides);
    previewAuditionIntent(selectedBaseIntent('audition', intentOverrides));
  }, [applyManualSelection, previewAuditionIntent, selectedBaseIntent]);

  const handleManualKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextInputTarget(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const noteIndex = (HARMONY_NOTE_KEYS as readonly string[]).indexOf(key);
    if (noteIndex >= 0) {
      event.preventDefault();
      setRoot(noteIndex);
      return;
    }
    const slotIndex = (HARMONY_SLOT_TRIGGER_KEYS as readonly string[]).indexOf(key);
    if (slotIndex >= 0 && manual.slotTriggerMode && !manualLocked) {
      event.preventDefault();
      activateSlot(slotIndex);
      return;
    }
    const quality = QUICK_QUALITY_KEYS[key];
    if (quality) {
      event.preventDefault();
      setQuality(quality);
      return;
    }
    const extension = EXTENSION_KEYS.find((item) => item.key.toLowerCase() === key);
    if (extension) {
      event.preventDefault();
      toggleExtension(extension.value);
      return;
    }
    if (key === '.') {
      event.preventDefault();
      setOctave(-1);
    } else if (key === '/') {
      event.preventDefault();
      setOctave(1);
    }
  }, [activateSlot, manual.slotTriggerMode, manualLocked, setOctave, setQuality, setRoot, toggleExtension]);

  const activeIntentLabel = useMemo(() => {
    if (manual.slotTriggerMode && manual.activeSlotId !== null) {
      const slot = slots[manual.activeSlotId];
      return slot ? `Slot ${slot.id + 1} ${intentTitle(slot.chord?.intent)}` : 'Slot';
    }
    return intentTitle(manual.activeIntent ?? manual.auditionIntent ?? selectedBaseIntent('audition'));
  }, [manual.activeIntent, manual.activeSlotId, manual.auditionIntent, manual.slotTriggerMode, selectedBaseIntent, slots]);

  const manualPreviewIntent = useMemo(() => {
    return manual.auditionIntent ?? manual.activeIntent ?? selectedBaseIntent(manual.mode === 'control' ? 'manualControl' : 'audition');
  }, [manual.activeIntent, manual.auditionIntent, manual.mode, selectedBaseIntent]);

  const manualPreviewNotes = useMemo(() => (
    resolveHarmonyIntentToNotePool({
      intent: manualPreviewIntent,
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    })
  ), [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, manualPreviewIntent]);

  const preserveExactVoicing = Boolean((manual.activeIntent ?? manual.auditionIntent)?.preserveCapturedVoicing);

  const playManualPreview = useCallback(() => {
    playPreviewNotes(manualPreviewNotes);
  }, [manualPreviewNotes, playPreviewNotes]);

  const togglePopup = useCallback((popup: Exclude<HarmonyPopup, null>) => {
    setActivePopup((current) => current === popup ? null : popup);
  }, []);

  const focusNextStep = useCallback(() => {
    if (resolvedFrame.nextStepIndex === null) return;
    setSelectedStepId(resolvedFrame.nextStepIndex);
    setLabSelectionKind('step');
    setActivePopup('lab');
  }, [resolvedFrame.nextStepIndex]);

  const selectSlot = useCallback((slotId: number) => {
    setSelectedSlotId(slotId);
    setLabSelectionKind('slot');
    if (manual.mode !== 'audition') return;
    const slot = slots[slotId];
    if (!slot?.chord?.intent) return;
    updateManual({
      ...manual,
      mode: 'audition',
      enabled: false,
      auditionIntent: { ...slot.chord.intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
    previewAuditionIntent({ ...slot.chord.intent, source: 'audition' });
  }, [manual, previewAuditionIntent, slots, updateManual]);


  const setPreserveExactVoicing = useCallback((preserve: boolean) => {
    applyManualSelection({}, { preserveCapturedVoicing: preserve });
  }, [applyManualSelection]);

  const runGenerate = useCallback((target: GenerateTarget) => {
    if (target === 'slots') {
      generateSlotsAction();
      return;
    }
    if (target === 'sequence') {
      generateSequenceAction();
      return;
    }
    generateBothAction();
  }, [generateBothAction, generateSequenceAction, generateSlotsAction]);

  return (
    <div
      className="harmony-engine-panel"
      onMouseOver={(event) => announceHarmonyHelp(event.target)}
      onPointerDownCapture={(event) => announceHarmonyHelp(event.target)}
      onFocusCapture={(event) => announceHarmonyHelp(event.target)}
    >
      <HarmonySummaryCard
        bank={harmonyContext.bank}
        rootLabel={noteName(harmonyContext.rootMidi)}
        scaleName={harmonyContext.scaleName}
        resolvedFrame={resolvedFrame}
        activePopup={activePopup}
        manualLocked={manualLocked}
        chordSequenceEnabled={harmonyContext.chordSequenceEnabled}
        tension={harmonyContext.tension}
        rootNote={state.rootNote ?? 4}
        scaleMode={state.scaleMode ?? 'auto'}
        manualScale={typeof state.manualScale === 'string' ? state.manualScale : 'Major (Ionian)'}
        onTogglePopup={togglePopup}
        onFocusNextStep={focusNextStep}
        onTensionChange={onStateChange ? (value) => applyPatch({ tension: value }) : undefined}
        onRootNoteChange={onStateChange ? (value) => applyPatch({ rootNote: value }) : undefined}
        onScaleModeChange={onStateChange ? (value) => applyPatch({ scaleMode: value }) : undefined}
        onManualScaleChange={onStateChange ? (value) => applyPatch({ manualScale: value }) : undefined}
      />

      {harmonyContext.chordSequenceEnabled && (
        <CompactSequenceStrip
          sequence={sequence}
          sequenceLength={sequenceLength}
          slots={slots}
          activeStepId={harmonyContext.chordSequenceStepIndex}
          chordSequenceEnabled={harmonyContext.chordSequenceEnabled}
          onToggleSequence={() => setSequenceEnabled(!harmonyContext.chordSequenceEnabled)}
          onStepClick={(stepId) => {
            setSelectedStepId(stepId);
            setLabSelectionKind('step');
            setActivePopup('lab');
          }}
        />
      )}

      {activePopup === 'manual' && (
        <ManualVoicingPopup
          scaleLabel={`${noteName(harmonyContext.rootMidi)} ${harmonyContext.scaleName}`}
          manual={manual}
          slots={slots}
          manualLocked={manualLocked}
          canWriteState={canWriteState}
          inputMode={voicingInputMode}
          advancedOpen={voicingAdvancedOpen}
          previewLabel={activeIntentLabel}
          previewNotes={manualPreviewNotes}
          auditionSource={auditionSource}
          auditionEnabled={Boolean(onAuditionNote)}
          preserveExactVoicing={preserveExactVoicing}
          writeLocked={writeLocked}
          onAuditionSourceChange={setAuditionSource}
          onAuditionPreview={playManualPreview}
          onInputModeChange={setVoicingInputMode}
          onAdvancedOpenChange={setVoicingAdvancedOpen}
          onClear={clearManualControl}
          onModeChange={setManualMode}
          onStrengthChange={setStrength}
          onRootChange={setRoot}
          onDegreeChange={setDegree}
          onQualityChange={setQuality}
          onToggleExtension={toggleExtension}
          onOctaveChange={setOctave}
          onInversionChange={setInversion}
          onSpreadChange={setSpread}
          onBassModeChange={setBassMode}
          onPreserveExactVoicingChange={setPreserveExactVoicing}
          onCapture={() => captureSelectedToSlot(selectedSlotId)}
          onCaptureSlotChange={setSelectedSlotId}
          captureSlotId={selectedSlotId}
          onKeyDown={handleManualKeyDown}
        />
      )}

      {activePopup === 'lab' && (
        <ChordLabPopup
          bank={harmonyContext.bank}
          slots={slots}
          sequence={sequence}
          sequenceLength={sequenceLength}
          manual={manual}
          selectionKind={labSelectionKind}
          selectedSlotId={selectedSlotId}
          selectedStepId={selectedStepId}
          activeStepId={harmonyContext.chordSequenceStepIndex}
          canWriteState={canWriteState}
          writeLocked={writeLocked}
          chordSequenceEnabled={harmonyContext.chordSequenceEnabled}
          generateTarget={generateTarget}
          tension={harmonyContext.tension}
          generateVariation={generateVariation}
          generateMotion={generateMotion}
          generateRespectLocks={generateRespectLocks}
          onSelectSlot={selectSlot}
          onActivateSlot={activateSlot}
          onUpdateSlot={updateSlot}
          onCaptureSlot={captureSelectedToSlot}
          onSelectStep={(stepId) => {
            setSelectedStepId(stepId);
            setLabSelectionKind('step');
          }}
          onUpdateStep={updateStep}
          onSequenceEnabledChange={setSequenceEnabled}
          onSequenceLengthChange={setSequenceLength}
          onApplySlotToStep={applySlotToStep}
          onGenerateTargetChange={setGenerateTarget}
          onGenerateVariationChange={setGenerateVariation}
          onGenerateMotionChange={setGenerateMotion}
          onGenerateRespectLocksChange={setGenerateRespectLocks}
          onGenerate={runGenerate}
          onCommitBaseline={commitBaselineAction}
        />
      )}
    </div>
  );
}
