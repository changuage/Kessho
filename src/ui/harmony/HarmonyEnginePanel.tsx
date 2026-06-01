import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { SliderState } from '../state';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { HarmonyState } from '../../audio/harmony';
import type { ProductManualSynthNote, ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';
import {
  HARMONY_NOTE_KEYS,
  HARMONY_SLOT_TRIGGER_KEYS,
  commitBaselineMap,
  defaultHarmonyIntent,
  generateHarmonySequence,
  generateHarmonySlots,
  generateHarmonySlotsAndSequence,
  resolveProductHarmonyState,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyIntent,
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

const SEQUENCE_MODES: readonly { value: HarmonySequenceStepMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'intent', label: 'Intent' },
  { value: 'slotCopy', label: 'Copy' },
  { value: 'slotFollow', label: 'Follow' },
];

const BASS_MODES: readonly { value: HarmonyBassMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'root', label: 'Root' },
  { value: 'fifth', label: 'Fifth' },
];

const PRODUCT_SCALE_IDS = new Map<string, number>([
  ['Major (Ionian)', 1],
  ['Aeolian', 2],
  ['Major Pentatonic', 3],
  ['Octatonic Half-Whole', 4],
  ['Lydian', 5],
  ['Mixolydian', 6],
  ['Minor Pentatonic', 7],
  ['Dorian', 8],
  ['Harmonic Minor', 9],
  ['Melodic Minor', 10],
  ['Phrygian Dominant', 11],
]);

type HarmonyBank = 'A' | 'B';
type HarmonyPopup = 'manual' | 'lab' | null;
type VoicingInputMode = 'root' | 'degree';
type ChordLabTab = 'slots' | 'sequence' | 'generate';
type GenerateTarget = 'slots' | 'sequence' | 'both';
type GenerateStyle = 'baseline' | 'ambient' | 'functional' | 'modal' | 'dark' | 'bright';

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
  { value: 'piano', label: 'Piano' },
] as const;

export interface HarmonyEnginePanelProps {
  state: SliderState;
  harmonyState?: HarmonyState | null;
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

function scaleIdFromName(name: string | undefined): number {
  if (!name) return 1;
  const exact = PRODUCT_SCALE_IDS.get(name);
  if (exact) return exact;
  const normalized = name.toLowerCase();
  if (normalized.includes('major pentatonic')) return 3;
  if (normalized.includes('minor pentatonic')) return 7;
  if (normalized.includes('harmonic minor')) return 9;
  if (normalized.includes('melodic minor')) return 10;
  if (normalized.includes('phrygian')) return 11;
  if (normalized.includes('octatonic') || normalized.includes('hirajoshi')) return 4;
  if (normalized.includes('mixolydian')) return 6;
  if (normalized.includes('lydian')) return 5;
  if (normalized.includes('dorian')) return 8;
  if (normalized.includes('minor') || normalized.includes('aeolian')) return 2;
  return 1;
}

function rootMidiFromState(state: SliderState): number {
  const record = state as unknown as Record<string, unknown>;
  const explicit = record.rootMidi;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return clamp(explicit, 0, 127);
  return 60 + pitchClass(state.rootNote);
}

function morphPercentFromState(state: SliderState): number {
  const record = state as unknown as Record<string, unknown>;
  const explicit = record.harmonyMorphPercent;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return clamp(explicit, 0, 100);
  const journeyPhase = record.journeyMorphPhase;
  if (typeof journeyPhase === 'number' && Number.isFinite(journeyPhase)) return clamp(journeyPhase * 100, 0, 100);
  return 0;
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
  if (source === 'manualControl') return 'Manual';
  if (source === 'slot') return 'Slot';
  if (source === 'presetMorph') return 'Morph';
  return source.charAt(0).toUpperCase() + source.slice(1);
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
  if (step.mode === 'slotCopy' || step.mode === 'slotFollow') {
    const slot = step.slotId !== null ? slots[step.slotId] : null;
    return slot ? `S${slot.id + 1} ${intentTitle(slot.intent)}` : 'Slot';
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
  return source === 'piano' ? 8 : 6;
}

function auditionDurationMs(source: ProductManualSynthSource): number {
  if (source === 'lead1' || source === 'lead2') return 720;
  return source === 'piano' ? 1300 : 1600;
}

function frameChordTitle(frame: ResolvedHarmonyFrame): string {
  return intentTitle({ ...defaultHarmonyIntent(frame.activeSource, frame.degree), quality: frame.quality });
}

function stepSourceLabel(step: HarmonySequenceStep): string {
  if (step.mode === 'slotCopy') return 'Copy';
  if (step.mode === 'slotFollow') return 'Follow';
  if (step.mode === 'intent') return 'Intent';
  return 'Auto';
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
  onTogglePopup,
  onFocusNextStep,
}: {
  bank: HarmonyBank;
  rootLabel: string;
  scaleName: string;
  resolvedFrame: ResolvedHarmonyFrame;
  activePopup: HarmonyPopup;
  manualLocked: boolean;
  chordSequenceEnabled: boolean;
  onTogglePopup: (popup: Exclude<HarmonyPopup, null>) => void;
  onFocusNextStep: () => void;
}) {
  const controlMeta = manualLocked
    ? 'Manual control locked'
    : resolvedFrame.activeStepIndex !== null
      ? `Step ${resolvedFrame.activeStepIndex + 1} / 8`
      : resolvedFrame.activeSlotId !== null
        ? `Slot ${resolvedFrame.activeSlotId + 1}`
        : chordSequenceEnabled
          ? 'Sequence armed'
          : 'Generated baseline';

  return (
    <div className="harmony-summary-card">
      <div className="harmony-engine-header">
        <div>
          <div className="harmony-engine-title">Harmony Engine</div>
          <div className="harmony-engine-meta">
            {rootLabel} {scaleName} · Bank {bank} · Morph {Math.round(resolvedFrame.morphPercent)}% · {manualLocked ? 'Manual locked' : 'Manual available'}
          </div>
        </div>
        <HarmonyActionButtons activePopup={activePopup} onTogglePopup={onTogglePopup} />
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
  return (
    <div className="harmony-voicing-switch-row">
      <div className="harmony-segment-group">
        {(['audition', 'control', 'capture'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`harmony-segment ${mode}${manual.mode === mode ? ' active' : ''}`}
            onClick={() => onModeChange(mode)}
            disabled={!canWriteState || (mode !== 'audition' && manualLocked)}
            {...harmonyHelpAttrs(`harmonyManualMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}
          >
            {mode}
          </button>
        ))}
      </div>
      <div className="harmony-segment-group compact">
        <span>Strength</span>
        {(['bias', 'force'] as const).map((strength) => (
          <button
            key={strength}
            type="button"
            className={`harmony-segment${manual.strength === strength ? ' active' : ''}`}
            onClick={() => onStrengthChange(strength)}
            disabled={!canWriteState}
            {...harmonyHelpAttrs(`harmonyManualStrength${strength.charAt(0).toUpperCase()}${strength.slice(1)}`)}
          >
            {strength}
          </button>
        ))}
      </div>
    </div>
  );
}

function ManualVoicingPreview({
  label,
  notes,
  auditionSource,
  auditionEnabled,
  onAuditionSourceChange,
  onAuditionPreview,
}: {
  label: string;
  notes: readonly number[];
  auditionSource: ProductManualSynthSource;
  auditionEnabled: boolean;
  onAuditionSourceChange: (source: ProductManualSynthSource) => void;
  onAuditionPreview: () => void;
}) {
  return (
    <div className="harmony-manual-preview">
      <span>Preview</span>
      <strong>{label}</strong>
      <HarmonyNotePoolPills notes={notes} compact />
      <div className="harmony-audition-tools" aria-label="Audition sound engine">
        <label {...harmonyHelpAttrs('harmonyManualAuditionSound')}>
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
          {...harmonyHelpAttrs('harmonyManualAuditionPlay')}
        >
          Play
        </button>
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
      <div className="harmony-panel-label">Chord Modifiers</div>
      <div className="harmony-control-cluster">
        <span>Type</span>
        <div className="harmony-chip-row">
          {QUALITY_OPTIONS.slice(1, 5).map((quality) => (
            <button
              key={quality.value}
              type="button"
              className={`harmony-chip${manual.selectedQuality === quality.value ? ' active' : ''}`}
              onClick={() => onQualityChange(quality.value)}
              disabled={!canWriteState}
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
  onToggleOpen,
  onOctaveChange,
  onInversionChange,
  onSpreadChange,
  onBassModeChange,
  onPreserveExactVoicingChange,
}: {
  manual: ManualHarmonyControlState;
  open: boolean;
  canWriteState: boolean;
  preserveExactVoicing: boolean;
  onToggleOpen: () => void;
  onOctaveChange: (delta: number) => void;
  onInversionChange: (delta: number) => void;
  onSpreadChange: (spread: number) => void;
  onBassModeChange: (bassMode: HarmonyBassMode) => void;
  onPreserveExactVoicingChange: (preserve: boolean) => void;
}) {
  return (
    <div className="harmony-advanced-disclosure">
      <button type="button" className="harmony-disclosure-button" onClick={onToggleOpen} aria-expanded={open} {...harmonyHelpAttrs('harmonyManualVoicingDisclosure')}>
        Voicing
      </button>
      {open && (
        <div className="harmony-advanced-grid">
          <div className="harmony-stepper">
            <span>Octave</span>
            <button type="button" onClick={() => onOctaveChange(-1)} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualOctave')}>.</button>
            <strong>{manual.selectedOctave}</strong>
            <button type="button" onClick={() => onOctaveChange(1)} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualOctave')}>/</button>
          </div>
          <div className="harmony-stepper">
            <span>Inversion</span>
            <button type="button" onClick={() => onInversionChange(-1)} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualInversion')}>-</button>
            <strong>{manual.selectedInversion}</strong>
            <button type="button" onClick={() => onInversionChange(1)} disabled={!canWriteState} {...harmonyHelpAttrs('harmonyManualInversion')}>+</button>
          </div>
          <label className="harmony-range-control" {...harmonyHelpAttrs('harmonyManualSpread')}>
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
                {...harmonyHelpAttrs('harmonyManualBass')}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <label className="harmony-checkbox-row" {...harmonyHelpAttrs('harmonyManualPreserve')}>
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

function SlotTriggerStrip({
  manual,
  slots,
  manualLocked,
  canWriteState,
  onSlotTriggerModeChange,
  onSlotActivate,
}: {
  manual: ManualHarmonyControlState;
  slots: readonly HarmonyChordSlot[];
  manualLocked: boolean;
  canWriteState: boolean;
  onSlotTriggerModeChange: (enabled: boolean) => void;
  onSlotActivate: (slotId: number) => void;
}) {
  return (
    <div className="harmony-slot-strip">
      <div className="harmony-slot-strip-header">
        <span>Slots</span>
        <button
          type="button"
          className={`harmony-segment${manual.slotTriggerMode ? ' active' : ''}`}
          onClick={() => onSlotTriggerModeChange(!manual.slotTriggerMode)}
          disabled={!canWriteState || manualLocked}
          {...harmonyHelpAttrs('harmonyManualTriggerMode')}
        >
          Trigger mode
        </button>
      </div>
      <div className="harmony-slot-trigger-row">
        {slots.map((slot, index) => (
          <button
            key={slot.id}
            type="button"
            className={`harmony-slot-trigger${manual.activeSlotId === slot.id ? ' active' : ''}${slot.locked ? ' locked' : ''}`}
            onClick={() => onSlotActivate(slot.id)}
            disabled={!canWriteState || (manual.mode !== 'audition' && manualLocked)}
            {...harmonyHelpAttrs('harmonyManualSlotTrigger')}
          >
            <span>{HARMONY_SLOT_TRIGGER_KEYS[index]?.toUpperCase()}</span>
            S{slot.id + 1}
          </button>
        ))}
      </div>
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
  onSlotTriggerModeChange,
  onSlotActivate,
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
  onSlotTriggerModeChange: (enabled: boolean) => void;
  onSlotActivate: (slotId: number) => void;
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
          <SlotTriggerStrip
            manual={manual}
            slots={slots}
            manualLocked={manualLocked}
            canWriteState={canWriteState}
            onSlotTriggerModeChange={onSlotTriggerModeChange}
            onSlotActivate={onSlotActivate}
          />
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
            onToggleOpen={() => onAdvancedOpenChange(!advancedOpen)}
            onOctaveChange={onOctaveChange}
            onInversionChange={onInversionChange}
            onSpreadChange={onSpreadChange}
            onBassModeChange={onBassModeChange}
            onPreserveExactVoicingChange={onPreserveExactVoicingChange}
          />
        </div>
      </div>
    </div>
  );
}

function ChordLabHeader({
  bank,
  labTab,
  writeLocked,
  chordSequenceEnabled,
  onTabChange,
}: {
  bank: HarmonyBank;
  labTab: ChordLabTab;
  writeLocked: boolean;
  chordSequenceEnabled: boolean;
  onTabChange: (tab: ChordLabTab) => void;
}) {
  return (
    <div className="harmony-popup-header chord-lab-header">
      <div>
        <span>Chord Lab · {labTab === 'sequence' ? `Sequence ${chordSequenceEnabled ? 'ON' : 'OFF'}` : `Bank ${bank}`}</span>
        <small>{writeLocked ? 'Editing waits for endpoint A or B' : 'Slots, sequence, and generation'}</small>
      </div>
      <ChordLabTabs activeTab={labTab} onTabChange={onTabChange} />
    </div>
  );
}

function ChordLabTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ChordLabTab;
  onTabChange: (tab: ChordLabTab) => void;
}) {
  return (
    <div className="harmony-lab-tabs" role="tablist" aria-label="Chord Lab tabs">
      {(['slots', 'sequence', 'generate'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={`harmony-lab-tab${activeTab === tab ? ' active' : ''}`}
          onClick={() => onTabChange(tab)}
          {...harmonyHelpAttrs(`harmonyLabTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function ChordSlotBank({
  slots,
  selectedSlotId,
  activeSlotId,
  onSelectSlot,
  onActivateSlot,
}: {
  slots: readonly HarmonyChordSlot[];
  selectedSlotId: number;
  activeSlotId: number | null;
  onSelectSlot: (slotId: number) => void;
  onActivateSlot: (slotId: number) => void;
}) {
  return (
    <div className="harmony-lab-section">
      <div className="harmony-lab-section-title">Slot Bank</div>
      <div className="harmony-slot-bank">
        {slots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={`harmony-slot-object${selectedSlotId === slot.id ? ' selected' : ''}${activeSlotId === slot.id ? ' active' : ''}${slot.locked ? ' locked' : ''}`}
            onClick={() => onSelectSlot(slot.id)}
            onDoubleClick={() => onActivateSlot(slot.id)}
            {...harmonyHelpAttrs('harmonyLabSlot')}
          >
            <span>S{slot.id + 1}</span>
            <strong>{intentTitle(slot.intent)}</strong>
            <em>{slot.intent.rootMode === 'degree' ? ROMAN_DEGREES[slot.intent.degree] ?? 'I' : noteName(slot.intent.rootNote)}</em>
            <small>{slot.locked ? 'locked' : 'unlocked'}</small>
          </button>
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
      <div className="harmony-inspector-title">Selected Slot Inspector</div>
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
          <span>Strength</span>
          {(['bias', 'force'] as const).map((strength) => (
            <button
              key={strength}
              type="button"
              className={`harmony-segment${slot.intent.strength === strength ? ' active' : ''}`}
              onClick={() => updateIntent({ strength })}
              disabled={!canWriteState || writeLocked}
              {...harmonyHelpAttrs('harmonyLabSlotStrength')}
            >
              {strength}
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
  slots,
  selectedStepId,
  activeStepId,
  onSelectStep,
}: {
  sequence: readonly HarmonySequenceStep[];
  slots: readonly HarmonyChordSlot[];
  selectedStepId: number;
  activeStepId: number | null;
  onSelectStep: (stepId: number) => void;
}) {
  return (
    <div className="harmony-lab-section">
      <div className="harmony-lab-section-title">8-Step Harmony Sequence</div>
      <div className="harmony-sequence-strip">
        {sequence.map((step) => (
          <button
            key={step.id}
            type="button"
            className={`harmony-step-object${selectedStepId === step.id ? ' selected' : ''}${activeStepId === step.id ? ' active' : ''}${step.enabled ? '' : ' muted'}${step.locked ? ' locked' : ''}`}
            onClick={() => onSelectStep(step.id)}
            {...harmonyHelpAttrs('harmonyLabSequenceStep')}
          >
            <span>{step.id + 1}</span>
            <strong>{sequenceStepTitle(step, slots)}</strong>
            <em>{stepSourceLabel(step)}</em>
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
  chordSequenceEnabled,
  onSequenceEnabledChange,
  onUpdateStep,
}: {
  step: HarmonySequenceStep;
  slots: readonly HarmonyChordSlot[];
  canWriteState: boolean;
  writeLocked: boolean;
  chordSequenceEnabled: boolean;
  onSequenceEnabledChange: (enabled: boolean) => void;
  onUpdateStep: (stepId: number, patch: Partial<HarmonySequenceStep>) => void;
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
  return (
    <div className="harmony-inspector">
      <div className="harmony-inspector-title">Selected Step Inspector</div>
      <div className="harmony-inspector-grid">
        <div className="harmony-segment-group compact">
          <span>Sequence</span>
          <button
            type="button"
            className={`harmony-segment${chordSequenceEnabled ? ' active' : ''}`}
            onClick={() => onSequenceEnabledChange(!chordSequenceEnabled)}
            disabled={!canWriteState}
            {...harmonyHelpAttrs('harmonyLabSequenceEnable')}
          >
            {chordSequenceEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`harmony-segment${step.enabled ? ' active' : ''}`}
            onClick={() => onUpdateStep(step.id, { enabled: !step.enabled })}
            disabled={!canWriteState || writeLocked}
            {...harmonyHelpAttrs('harmonyLabStepEnable')}
          >
            Step
          </button>
        </div>
        <label {...harmonyHelpAttrs('harmonyLabStepMode')}>
          <span>Mode</span>
          <select
            value={step.mode}
            onChange={(event) => onUpdateStep(step.id, { mode: event.target.value as HarmonySequenceStepMode })}
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
            onChange={(event) => onUpdateStep(step.id, { slotId: event.target.value === '' ? null : Number(event.target.value) })}
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
          <span>Strength</span>
          {(['bias', 'force'] as const).map((strength) => (
            <button
              key={strength}
              type="button"
              className={`harmony-segment${(step.intent?.strength ?? 'bias') === strength ? ' active' : ''}`}
              onClick={() => updateIntent({ strength })}
              disabled={!canWriteState || writeLocked}
              {...harmonyHelpAttrs('harmonyLabStepStrength')}
            >
              {strength}
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
  style,
  complexity,
  motion,
  respectLocks,
  canWriteState,
  writeLocked,
  onTargetChange,
  onStyleChange,
  onComplexityChange,
  onMotionChange,
  onRespectLocksChange,
  onGenerate,
  onCommitBaseline,
}: {
  target: GenerateTarget;
  style: GenerateStyle;
  complexity: number;
  motion: number;
  respectLocks: boolean;
  canWriteState: boolean;
  writeLocked: boolean;
  onTargetChange: (target: GenerateTarget) => void;
  onStyleChange: (style: GenerateStyle) => void;
  onComplexityChange: (complexity: number) => void;
  onMotionChange: (motion: number) => void;
  onRespectLocksChange: (respectLocks: boolean) => void;
  onGenerate: (target: GenerateTarget) => void;
  onCommitBaseline: () => void;
}) {
  return (
    <div className="harmony-generate-panel">
      <div className="harmony-control-cluster">
        <span>Target</span>
        <div className="harmony-chip-row">
          {(['slots', 'sequence', 'both'] as const).map((item) => (
            <button key={item} type="button" className={`harmony-chip${target === item ? ' active' : ''}`} onClick={() => onTargetChange(item)} {...harmonyHelpAttrs('harmonyGenerateTarget')}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="harmony-control-cluster">
        <span>Style</span>
        <div className="harmony-chip-row">
          {(['baseline', 'ambient', 'functional', 'modal', 'dark', 'bright'] as const).map((item) => (
            <button key={item} type="button" className={`harmony-chip${style === item ? ' active' : ''}`} onClick={() => onStyleChange(item)} {...harmonyHelpAttrs('harmonyGenerateStyle')}>
              {item === 'baseline' ? 'Baseline Map' : item}
            </button>
          ))}
        </div>
      </div>
      <label className="harmony-wide-range" {...harmonyHelpAttrs('harmonyGenerateComplexity')}>
        <span>Complexity</span>
        <small>Auto</small>
        <input type="range" min={0} max={1} step={0.01} value={complexity} onChange={(event) => onComplexityChange(Number(event.target.value))} />
        <small>Extended</small>
      </label>
      <label className="harmony-wide-range" {...harmonyHelpAttrs('harmonyGenerateMotion')}>
        <span>Motion</span>
        <small>Stable</small>
        <input type="range" min={0} max={1} step={0.01} value={motion} onChange={(event) => onMotionChange(Number(event.target.value))} />
        <small>Active</small>
      </label>
      <div className="harmony-generate-actions">
        <button type="button" className={`harmony-segment${respectLocks ? ' active' : ''}`} onClick={() => onRespectLocksChange(!respectLocks)} {...harmonyHelpAttrs('harmonyGenerateRespectLocks')}>
          Respect Locks
        </button>
        <button type="button" className="harmony-subtle-button" onClick={onCommitBaseline} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyGenerateBaselineMap')}>
          Baseline Map
        </button>
        <button type="button" className="harmony-primary-button" onClick={() => onGenerate(target)} disabled={!canWriteState || writeLocked} {...harmonyHelpAttrs('harmonyGenerateRun')}>
          Generate
        </button>
      </div>
    </div>
  );
}

function ChordLabPopup({
  bank,
  labTab,
  slots,
  sequence,
  manual,
  selectedSlotId,
  selectedStepId,
  activeStepId,
  canWriteState,
  writeLocked,
  chordSequenceEnabled,
  generateTarget,
  generateStyle,
  generateComplexity,
  generateMotion,
  generateRespectLocks,
  onTabChange,
  onSelectSlot,
  onActivateSlot,
  onUpdateSlot,
  onCaptureSlot,
  onSelectStep,
  onUpdateStep,
  onSequenceEnabledChange,
  onGenerateTargetChange,
  onGenerateStyleChange,
  onGenerateComplexityChange,
  onGenerateMotionChange,
  onGenerateRespectLocksChange,
  onGenerate,
  onCommitBaseline,
}: {
  bank: HarmonyBank;
  labTab: ChordLabTab;
  slots: readonly HarmonyChordSlot[];
  sequence: readonly HarmonySequenceStep[];
  manual: ManualHarmonyControlState;
  selectedSlotId: number;
  selectedStepId: number;
  activeStepId: number | null;
  canWriteState: boolean;
  writeLocked: boolean;
  chordSequenceEnabled: boolean;
  generateTarget: GenerateTarget;
  generateStyle: GenerateStyle;
  generateComplexity: number;
  generateMotion: number;
  generateRespectLocks: boolean;
  onTabChange: (tab: ChordLabTab) => void;
  onSelectSlot: (slotId: number) => void;
  onActivateSlot: (slotId: number) => void;
  onUpdateSlot: (slotId: number, patch: Partial<HarmonyChordSlot>) => void;
  onCaptureSlot: (slotId: number) => void;
  onSelectStep: (stepId: number) => void;
  onUpdateStep: (stepId: number, patch: Partial<HarmonySequenceStep>) => void;
  onSequenceEnabledChange: (enabled: boolean) => void;
  onGenerateTargetChange: (target: GenerateTarget) => void;
  onGenerateStyleChange: (style: GenerateStyle) => void;
  onGenerateComplexityChange: (complexity: number) => void;
  onGenerateMotionChange: (motion: number) => void;
  onGenerateRespectLocksChange: (respectLocks: boolean) => void;
  onGenerate: (target: GenerateTarget) => void;
  onCommitBaseline: () => void;
}) {
  const selectedSlot = slots[selectedSlotId] ?? slots[0];
  const selectedStep = sequence[selectedStepId] ?? sequence[0];

  return (
    <div className="harmony-popup harmony-lab-popup" aria-label="Chord Lab">
      <ChordLabHeader
        bank={bank}
        labTab={labTab}
        writeLocked={writeLocked}
        chordSequenceEnabled={chordSequenceEnabled}
        onTabChange={onTabChange}
      />
      {labTab === 'slots' && selectedSlot && (
        <>
          <ChordSlotBank
            slots={slots}
            selectedSlotId={selectedSlot.id}
            activeSlotId={manual.activeSlotId}
            onSelectSlot={onSelectSlot}
            onActivateSlot={onActivateSlot}
          />
          <ChordSlotInspector
            slot={selectedSlot}
            canWriteState={canWriteState}
            writeLocked={writeLocked}
            onUpdateSlot={onUpdateSlot}
            onCapture={onCaptureSlot}
          />
        </>
      )}
      {labTab === 'sequence' && selectedStep && (
        <>
          <ChordSequenceStrip
            sequence={sequence}
            slots={slots}
            selectedStepId={selectedStep.id}
            activeStepId={activeStepId}
            onSelectStep={onSelectStep}
          />
          <ChordStepInspector
            step={selectedStep}
            slots={slots}
            canWriteState={canWriteState}
            writeLocked={writeLocked}
            chordSequenceEnabled={chordSequenceEnabled}
            onSequenceEnabledChange={onSequenceEnabledChange}
            onUpdateStep={onUpdateStep}
          />
        </>
      )}
      {labTab === 'generate' && (
        <ChordGeneratePanel
          target={generateTarget}
          style={generateStyle}
          complexity={generateComplexity}
          motion={generateMotion}
          respectLocks={generateRespectLocks}
          canWriteState={canWriteState}
          writeLocked={writeLocked}
          onTargetChange={onGenerateTargetChange}
          onStyleChange={onGenerateStyleChange}
          onComplexityChange={onGenerateComplexityChange}
          onMotionChange={onGenerateMotionChange}
          onRespectLocksChange={onGenerateRespectLocksChange}
          onGenerate={onGenerate}
          onCommitBaseline={onCommitBaseline}
        />
      )}
    </div>
  );
}

export function HarmonyEnginePanel({ state, harmonyState, onStateChange, onAuditionNote }: HarmonyEnginePanelProps) {
  const [activePopup, setActivePopup] = useState<HarmonyPopup>(null);
  const [voicingInputMode, setVoicingInputMode] = useState<VoicingInputMode>('root');
  const [voicingAdvancedOpen, setVoicingAdvancedOpen] = useState(false);
  const [auditionSource, setAuditionSource] = useState<ProductManualSynthSource>('pad1');
  const [labTab, setLabTab] = useState<ChordLabTab>('slots');
  const [selectedSlotId, setSelectedSlotId] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState(0);
  const [generateTarget, setGenerateTarget] = useState<GenerateTarget>('both');
  const [generateStyle, setGenerateStyle] = useState<GenerateStyle>('baseline');
  const [generateComplexity, setGenerateComplexity] = useState(0.4);
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
    const rootMidi = rootMidiFromState(state);
    const scaleName = harmonyState?.scaleFamily.name ?? state.manualScale;
    const scaleId = scaleIdFromName(scaleName);
    const tension = clamp(state.tension, 0, 1);
    const morphPercent = morphPercentFromState(state);
    const resolved = resolveProductHarmonyState({
      state: state as unknown as Record<string, unknown>,
      rootMidi,
      scaleId,
      tension,
      seed: seedFromState(state, 0),
      morphPercent,
    });
    const bank: HarmonyBank = morphPercent >= 50 ? 'B' : 'A';
    return {
      bank,
      rootMidi,
      scaleId,
      scaleName,
      tension,
      morphPercent,
      isEndpoint: morphPercent <= 0 || morphPercent >= 100,
      ...resolved,
    };
  }, [harmonyState, state]);

  const record = state as unknown as Record<string, unknown>;
  const manual = harmonyContext.manualControl;
  const slots = harmonyContext.chordSlots;
  const sequence = harmonyContext.chordSequence;
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
    if (manual.mode !== 'audition') return;
    playPreviewNotes(resolveIntentPreviewNotes({ ...intent, source: 'audition' }));
  }, [manual.mode, playPreviewNotes, resolveIntentPreviewNotes]);

  const captureSelectedToSlot = useCallback((slotId: number) => {
    if (writeLocked) return;
    const currentSlot = slots[slotId];
    if (!currentSlot || currentSlot.locked) return;
    const intent = selectedBaseIntent('slot', {
      source: 'slot',
      rootMode: manual.auditionIntent?.rootMode ?? manual.activeIntent?.rootMode ?? 'absolute',
    });
    patchSlots(slots.map((slot) => slot.id === slotId
      ? { ...slot, intent, name: slot.name || `Slot ${slotId + 1}` }
      : slot));
  }, [manual, patchSlots, selectedBaseIntent, slots, writeLocked]);

  const activateSlot = useCallback((slotId: number) => {
    const slot = slots[slotId];
    if (!slot) return;
    if (manual.mode === 'capture') {
      captureSelectedToSlot(slotId);
      return;
    }
    if (manual.mode === 'control' && !manualLocked) {
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
    updateManual({
      ...manual,
      mode: 'audition',
      enabled: false,
      auditionIntent: { ...slot.intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
    previewAuditionIntent({ ...slot.intent, source: 'audition' });
  }, [captureSelectedToSlot, manual, manualLocked, previewAuditionIntent, slots, updateManual]);

  const updateSlot = useCallback((slotId: number, patch: Partial<HarmonyChordSlot>) => {
    if (writeLocked) return;
    patchSlots(slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot));
  }, [patchSlots, slots, writeLocked]);

  const updateStep = useCallback((stepId: number, patch: Partial<HarmonySequenceStep>) => {
    if (writeLocked) return;
    patchSequence(sequence.map((step) => step.id === stepId ? { ...step, ...patch } : step));
  }, [patchSequence, sequence, writeLocked]);

  const setSequenceEnabled = useCallback((enabled: boolean) => {
    applyPatch({ harmonyChordSequenceEnabled: enabled });
  }, [applyPatch]);

  const generateSlotsAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSlots = generateHarmonySlots(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    }, slots);
    patchSlots(nextSlots, { harmonyGenerationSeed: generationSeed });
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSlots, slots, state, writeLocked]);

  const generateSequenceAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const nextSequence = generateHarmonySequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
    }, sequence, slots);
    patchSequence(nextSequence, { harmonyGenerationSeed: generationSeed });
  }, [harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, patchSequence, sequence, slots, state, writeLocked]);

  const generateBothAction = useCallback(() => {
    if (writeLocked) return;
    const generationSeed = nextGenerationSeed(state);
    const generated = generateHarmonySlotsAndSequence(seedFromState({ ...state, harmonyGenerationSeed: generationSeed }, 0), {
      rootMidi: harmonyContext.rootMidi,
      scaleId: harmonyContext.scaleId,
      tension: harmonyContext.tension,
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
  }, [applyPatch, harmonyContext.bank, harmonyContext.rootMidi, harmonyContext.scaleId, harmonyContext.tension, record, sequence, slots, state, writeLocked]);

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
      return slot ? `Slot ${slot.id + 1} ${intentTitle(slot.intent)}` : 'Slot';
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
    if (manual.mode !== 'audition') return;
    playPreviewNotes(manualPreviewNotes);
  }, [manual.mode, manualPreviewNotes, playPreviewNotes]);

  const togglePopup = useCallback((popup: Exclude<HarmonyPopup, null>) => {
    setActivePopup((current) => current === popup ? null : popup);
  }, []);

  const focusNextStep = useCallback(() => {
    if (resolvedFrame.nextStepIndex === null) return;
    setSelectedStepId(resolvedFrame.nextStepIndex);
    setLabTab('sequence');
    setActivePopup('lab');
  }, [resolvedFrame.nextStepIndex]);

  const selectSlot = useCallback((slotId: number) => {
    setSelectedSlotId(slotId);
    if (manual.mode !== 'audition') return;
    const slot = slots[slotId];
    if (!slot) return;
    updateManual({
      ...manual,
      mode: 'audition',
      enabled: false,
      auditionIntent: { ...slot.intent, source: 'audition' },
      slotTriggerMode: false,
      activeSlotId: null,
    });
    previewAuditionIntent({ ...slot.intent, source: 'audition' });
  }, [manual, previewAuditionIntent, slots, updateManual]);

  const setSlotTriggerMode = useCallback((enabled: boolean) => {
    updateManual({
      ...manual,
      slotTriggerMode: enabled,
      activeSlotId: enabled ? manual.activeSlotId : null,
      auditionIntent: enabled ? null : manual.auditionIntent,
    });
  }, [manual, updateManual]);

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
        onTogglePopup={togglePopup}
        onFocusNextStep={focusNextStep}
      />

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
          auditionEnabled={Boolean(onAuditionNote) && manual.mode === 'audition'}
          preserveExactVoicing={preserveExactVoicing}
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
          onSlotTriggerModeChange={setSlotTriggerMode}
          onSlotActivate={activateSlot}
          onKeyDown={handleManualKeyDown}
        />
      )}

      {activePopup === 'lab' && (
        <ChordLabPopup
          bank={harmonyContext.bank}
          labTab={labTab}
          slots={slots}
          sequence={sequence}
          manual={manual}
          selectedSlotId={selectedSlotId}
          selectedStepId={selectedStepId}
          activeStepId={harmonyContext.chordSequenceStepIndex}
          canWriteState={canWriteState}
          writeLocked={writeLocked}
          chordSequenceEnabled={harmonyContext.chordSequenceEnabled}
          generateTarget={generateTarget}
          generateStyle={generateStyle}
          generateComplexity={generateComplexity}
          generateMotion={generateMotion}
          generateRespectLocks={generateRespectLocks}
          onTabChange={setLabTab}
          onSelectSlot={selectSlot}
          onActivateSlot={activateSlot}
          onUpdateSlot={updateSlot}
          onCaptureSlot={captureSelectedToSlot}
          onSelectStep={setSelectedStepId}
          onUpdateStep={updateStep}
          onSequenceEnabledChange={setSequenceEnabled}
          onGenerateTargetChange={setGenerateTarget}
          onGenerateStyleChange={setGenerateStyle}
          onGenerateComplexityChange={setGenerateComplexity}
          onGenerateMotionChange={setGenerateMotion}
          onGenerateRespectLocksChange={setGenerateRespectLocks}
          onGenerate={runGenerate}
          onCommitBaseline={commitBaselineAction}
        />
      )}
    </div>
  );
}
