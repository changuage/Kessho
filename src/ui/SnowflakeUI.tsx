/**
 * Snowflake UI Component (Procedural Version)
 * 
 * Instant recursive branching snowflake - no particles, no worker.
 * Each arm's complexity is computed directly from its slider value.
 * Changes are immediate with no regeneration delay.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { SliderState, SavedPreset, type SliderMode } from './state';
import { JourneyState, JourneyConfig, JourneyNode } from '../audio/journeyTypes';
import { PHRASE_LENGTH } from '../audio/harmony';
import { useSliderHelp } from './SliderHelpOverlay';
import type { PresetSummary } from '../presets/types';
import type { JourneyValidationResult } from '../presets/journeyPresetCodec';
import { isMobileDevice } from '../platform';
import { JourneyPresetGlyph } from './JourneyPresetGlyph';
import { useSnowflakeV2, FX_COLORS, ENGINE_GROUPS, type EngineGroupDef } from './snowflakeV2';
import { generateSnowflake } from '../snowflake/SnowflakeGenerator';
import type { SnowflakeParams, SnowflakeRingStyle } from '../snowflake/types';
import { getRuntimeSliderPosition, useRuntimeSliderVersion } from './runtimeSliderState';
import { getRuntimeValue, useRuntimeValueVersion } from './runtimeValueState';

/** Set to true to enable V2 snowflake rendering. Flip to false to revert to V1. */
const SNOWFLAKE_V2_ENABLED = true;
const SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO = 0.8;
const SNOWFLAKE_V2_ORNAMENT_SCALE = 0.9;
const SNOWFLAKE_V2_STROKE_SCALE = 1.15;
const SNOWFLAKE_V2_CONTROL_FADE_MS = 450;

// Unicode symbols with text variation selector (U+FE0E) to prevent emoji rendering on mobile
const TEXT_SYMBOLS = {
  play: '▶\uFE0E',
  stop: '■\uFE0E',
  record: '●\uFE0E',
  hexagon: '⬡\uFE0E',
  sparkle: '☳\uFE0E',
  diamond: '⟡\uFE0E',
  visualizer: '\u06DE',
} as const;

// Format recording time as M:SS
function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Re-export SavedPreset for backwards compatibility
export type { SavedPreset };

interface SnowflakeUIProps {
  state: SliderState;
  onChange: (key: keyof SliderState, value: number) => void;
  onShowAdvanced: () => void;
  onShowJourney?: () => void;
  onShowVisualizer?: () => void;
  onTogglePlay: () => void;
  onLoadPreset: (preset: SavedPreset) => boolean | void | Promise<boolean | void>;
  journeyPresets?: PresetSummary[];
  onLoadJourneyPreset?: (name: string) => void | Promise<void>;
  presets: SavedPreset[];
  isPlaying: boolean;
  // Recording display (read-only - recording controlled from Advanced UI)
  isRecording?: boolean;
  recordingDuration?: number;
  onStopRecording?: () => void;
  // Journey status bar (shown when journey is playing)
  journeyState?: JourneyState;
  journeyConfig?: JourneyConfig | null;
  isJourneyPlaying?: boolean;
  activeJourneyName?: string;
  journeyValidation?: JourneyValidationResult;
  sliderModes?: Record<string, SliderMode>;
  dualSliderRanges?: Partial<Record<keyof SliderState, { min: number; max: number } | undefined>>;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
  forceFullArmOpacity?: boolean;
}

// Macro slider configuration
// 6 prongs starting from top, going clockwise: Reverb, Synth, Granular, Lead, Drum, Wave
// Length = level, Width/complexity = reverb send (except Reverb which has no send)
interface MacroSlider {
  key: keyof SliderState;           // Level parameter (controls prong length)
  reverbSendKey?: keyof SliderState; // Reverb send parameter (controls prong width/complexity)
  label: string;
  min: number;
  max: number;
  color: string;
}

const MACRO_SLIDERS: MacroSlider[] = [
  { key: 'reverbLevel', reverbSendKey: 'reverbDecay', label: 'Reverb', min: 0, max: 2, color: '#E8DCC4' },          // Warm cream - width = decay
  { key: 'synthLevel', reverbSendKey: 'pad1ReverbSend', label: 'Pad 1', min: 0, max: 1, color: '#C4724E' },         // Muted orange
  { key: 'granularLevel', reverbSendKey: 'granularReverbSend', label: 'Granular', min: 0, max: 4, color: '#7B9A6D' }, // Sage green
  { key: 'lead1Level', reverbSendKey: 'lead1ReverbSend', label: 'Lead', min: 0, max: 1, color: '#D4A520' },            // Mustard gold
  { key: 'drumLevel', reverbSendKey: 'drumReverbSend', label: 'Drum', min: 0, max: 1, color: '#8B5CF6' },            // Purple
  { key: 'oceanSampleLevel', reverbSendKey: 'oceanFilterCutoff', label: 'Wave', min: 0, max: 1, color: '#5A7B8A' }, // Slate blue - width = filter cutoff
];

const SNOWFLAKE_RUNTIME_KEYS: readonly (keyof SliderState)[] = Array.from(new Set<keyof SliderState>([
  'masterVolume',
  'tension',
  'reverbLevel',
  'reverbDecay',
  'reverbDiffusion',
  ...MACRO_SLIDERS.flatMap((slider) => [slider.key, slider.reverbSendKey]),
  ...ENGINE_GROUPS.flatMap((engine) => [
    engine.levelKey,
    engine.sends.delayA,
    engine.sends.delayB,
    engine.sends.granular,
    engine.sends.reverb,
  ]),
].filter((key): key is keyof SliderState => key !== null && key !== undefined)));

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getSnowflakeRuntimeNumber(
  state: SliderState,
  key: keyof SliderState,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Partial<Record<keyof SliderState, { min: number; max: number } | undefined>>,
): number | null {
  const authored = state[key];
  if (typeof authored !== 'number' || !Number.isFinite(authored)) return null;

  const keyString = String(key);
  const liveValue = getRuntimeValue(keyString);
  if (typeof liveValue === 'number' && Number.isFinite(liveValue)) return liveValue;

  const mode = sliderModes?.[keyString] ?? 'single';
  if (mode === 'single') return authored;

  const runtimePosition = getRuntimeSliderPosition(keyString, mode);
  if (typeof runtimePosition !== 'number' || !Number.isFinite(runtimePosition)) return authored;

  const range = (dualSliderRanges as Partial<Record<string, { min: number; max: number } | undefined>> | undefined)?.[keyString];
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return runtimePosition;

  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 0.000001) return authored;

  return min + clamp01(runtimePosition) * (max - min);
}

function resolveSnowflakeRuntimeState(
  state: SliderState,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Partial<Record<keyof SliderState, { min: number; max: number } | undefined>>,
): SliderState {
  if (!sliderModes && !dualSliderRanges) return state;

  let nextState: SliderState | null = null;
  for (const key of SNOWFLAKE_RUNTIME_KEYS) {
    const value = getSnowflakeRuntimeNumber(state, key, sliderModes, dualSliderRanges);
    if (value === null) continue;
    if (Math.abs(value - (state[key] as number)) <= 0.0005) continue;
    nextState ??= { ...state };
    (nextState as unknown as Record<string, number>)[String(key)] = value;
  }

  return nextState ?? state;
}

function normalizeEngineLevel(engine: EngineGroupDef, value: number): number {
  const range = engine.levelMax - engine.levelMin;
  if (range <= 0) return 0;
  return clamp01((value - engine.levelMin) / range);
}

function getSnowflakeDualLevelRange(
  engine: EngineGroupDef,
  sliderModes?: Record<string, SliderMode>,
  dualSliderRanges?: Partial<Record<keyof SliderState, { min: number; max: number } | undefined>>,
): { minNorm: number; maxNorm: number; midNorm: number } | null {
  const keyString = String(engine.levelKey);
  const mode = sliderModes?.[keyString] ?? 'single';
  if (mode === 'single') return null;

  const range = dualSliderRanges?.[engine.levelKey];
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;

  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return {
    minNorm: normalizeEngineLevel(engine, min),
    maxNorm: normalizeEngineLevel(engine, max),
    midNorm: normalizeEngineLevel(engine, (min + max) * 0.5),
  };
}

// Logarithmic scaling: lower values get more slider space
// Uses power curve: slider position = value^(1/curve), value = slider^curve
const LOG_CURVE = 2.5; // Higher = more space for lower values

// Convert actual value (min-max) to slider position (0-1) with log scaling
function valueToSliderPosition(value: number, min: number, max: number): number {
  const normalized = (value - min) / (max - min);
  return Math.pow(normalized, 1 / LOG_CURVE);
}

// Convert slider position (0-1) to actual value (min-max) with log scaling
function sliderPositionToValue(position: number, min: number, max: number): number {
  const curved = Math.pow(position, LOG_CURVE);
  return min + curved * (max - min);
}

function getSendValue(state: SliderState, key: keyof SliderState | null): number {
  if (!key) return 0;
  const value = state[key];
  return typeof value === 'number' ? value : 0;
}

// Get normalized arm values (0-1) from current state - with log scaling for display
// Returns { lengths, widths } where lengths are based on level and widths on reverb send (or filter cutoff for Wave)
function getArmValues(state: SliderState): { lengths: number[], widths: number[] } {
  const lengths = MACRO_SLIDERS.map(slider => {
    const value = state[slider.key] as number;
    return Math.max(0, Math.min(1, valueToSliderPosition(value, slider.min, slider.max)));
  });
  
  const widths = MACRO_SLIDERS.map(slider => {
    if (!slider.reverbSendKey) return 0.3; // No width control, use base width
    const sendValue = state[slider.reverbSendKey] as number;
    let normalized: number;
    // Special case: oceanFilterCutoff is 40-12000 Hz, normalize to 0-1
    if (slider.reverbSendKey === 'oceanFilterCutoff') {
      normalized = Math.max(0, Math.min(1, (sendValue - 40) / (12000 - 40)));
    } else {
      normalized = Math.max(0, Math.min(1, sendValue)); // 0-1 directly for reverb send/decay
    }
    // Apply exponential curve so lower values show more complexity
    // Drum gets very aggressive curve (0.1): 1% → 63%, 5% → 78%, 10% → 79%
    // Others use sqrt curve (0.5): 25% → 50%, 50% → 71%
    const exponent = slider.reverbSendKey === 'drumReverbSend' ? 0.1 : 0.5;
    return Math.pow(normalized, exponent);
  });
  
  return { lengths, widths };
}

// Seeded random for consistent branch patterns
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Draw a single arm with recursive branching
// complexity (0-1) controls prong LENGTH (how far it extends)
// width (0-1) controls THICKNESS and branch density (reverb send amount)
// highlightColor (optional) - if provided, branches glow with this color
function drawArm(
  ctx: CanvasRenderingContext2D,
  complexity: number,  // 0-1, controls prong length and main structure
  width: number,       // 0-1, controls line thickness and branch density (reverb send)
  armIndex: number,
  maxLength: number,
  baseWidth: number,
  highlightColor?: string  // Optional highlight color for branches when dragging width
) {
  const rng = seededRandom(armIndex * 1000 + 42);
  
  // Width affects branch density and line thickness (reduced by ~20% for cleaner look)
  const widthMultiplier = 0.4 + width * 1.2; // 0.4x to 1.6x thickness
  const branchDensity = 0.2 + width * 0.6;   // 20-80% branch probability based on width
  
  // Complexity affects depth and length
  const maxDepth = Math.floor(1 + complexity * 3);  // 1-4 levels deep
  const branchProbability = branchDensity;
  
  // Main stem length scales with complexity (length)
  const stemLength = maxLength * (0.3 + complexity * 0.7);
  
  // Number of main shoots - more with higher width (reduced from 2-6 to 2-5)
  const numMainShoots = Math.floor(2 + width * 3);  // 2-5 main shoots based on width
  
  // Draw the main stem first - thickness based on width
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(stemLength, 0);
  ctx.strokeStyle = 'rgba(220, 235, 255, 0.95)';
  ctx.lineWidth = baseWidth * widthMultiplier;
  ctx.lineCap = 'round';
  ctx.stroke();
  
  // Draw main shoots along the stem
  for (let i = 0; i < numMainShoots; i++) {
    // Position along stem (evenly distributed, starting at 20%)
    const t = 0.2 + (i / numMainShoots) * 0.7;
    const shootX = stemLength * t;
    
    // Shoot length decreases toward the tip, also affected by width
    const shootLength = stemLength * (0.5 - t * 0.3) * (0.4 + width * 0.6);
    
    // Branch angle - steeper near base, flatter near tip
    const shootAngle = 0.8 - t * 0.3 + rng() * 0.2;  // ~45-30 degrees
    
    // Draw shoot on one side (mirroring happens at arm level)
    drawBranch(
      shootX, 0,
      shootAngle,
      shootLength,
      baseWidth * 0.7 * widthMultiplier,
      1
    );
  }
  
  // End crystal - size based on width (reduced by 20%)
  ctx.beginPath();
  ctx.arc(stemLength, 0, baseWidth * 0.5 * widthMultiplier, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(230, 245, 255, 0.9)';
  ctx.fill();
  
  function drawBranch(
    x: number, 
    y: number, 
    angle: number, 
    length: number, 
    branchWidth: number, 
    depth: number
  ) {
    if (depth > maxDepth || length < 4) return;
    
    // Calculate end point
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    
    // Draw the branch line - use highlight color if provided
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    if (highlightColor) {
      // Highlighted: glow with the highlight color
      ctx.strokeStyle = highlightColor;
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = `rgba(220, 235, 255, ${0.85 - depth * 0.12})`;
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = Math.max(1, branchWidth);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;  // Reset shadow
    
    // Add sub-branches based on width (reverb send controls complexity)
    if (depth < maxDepth) {
      const numBranches = Math.floor(1 + branchDensity * 2.5);  // 1-3 sub-branches based on reverb send
      
      for (let i = 0; i < numBranches; i++) {
        if (rng() > branchProbability) continue;
        
        // Position along the branch (25% to 85% of length)
        const t = 0.25 + rng() * 0.6;
        const branchX = x + Math.cos(angle) * length * t;
        const branchY = y + Math.sin(angle) * length * t;
        
        // Branch angle (40-70 degrees off parent)
        const branchAngle = 0.7 + rng() * 0.5;
        
        const subLength = length * (0.45 + rng() * 0.25);
        const subWidth = branchWidth * 0.65;
        
        // Sub-branch (same side as parent, creating feather pattern)
        drawBranch(
          branchX, branchY,
          angle + branchAngle,
          subLength,
          subWidth,
          depth + 1
        );
      }
    }
    
    // Tiny crystal at branch ends (reduced by 20%)
    if (depth >= maxDepth - 1 || length < 10) {
      ctx.beginPath();
      ctx.arc(endX, endY, branchWidth * 0.65, 0, Math.PI * 2);
      if (highlightColor) {
        ctx.fillStyle = highlightColor;
        ctx.shadowColor = highlightColor;
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = 'rgba(220, 240, 255, 0.8)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Status bar colors (matching DiamondJourneyUI)
const STATUS_COLORS = {
  popup: 'rgba(20, 20, 35, 0.5)',
  popupBorder: 'rgba(232, 220, 196, 0.3)',
  text: '#E8DCC4',
  textMuted: 'rgba(232, 220, 196, 0.5)',
  filledNode: '#7B9A6D',
  morphingConnection: '#B8E0FF',
  endConnection: 'rgba(220, 235, 255, 0.7)',
};

type PresetPanelTab = 'state' | 'journey';
type PresetSortMode = 'updated' | 'az' | 'children';

type StatePresetFamily = {
  familyId: string;
  familyName: string;
  updatedAt: number;
  variants: SavedPreset[];
};

const PRESET_PANEL_SYMBOLS = {
  state: TEXT_SYMBOLS.hexagon,
  journey: TEXT_SYMBOLS.diamond,
  search: '⌕',
  updated: '◷\uFE0E',
  az: 'A↧',
  children: '⧉',
  expand: '›',
  collapse: '⌄',
  load: '↗\uFE0E',
  empty: '∅',
} as const;

const STATE_CHILD_COLORS = ['#C4724E', '#8B5CF6', '#7B9A6D', '#D4A520', '#5A7B8A', '#B8E0FF'];

function presetAccentColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return STATE_CHILD_COLORS[Math.abs(hash) % STATE_CHILD_COLORS.length] ?? STATE_CHILD_COLORS[0]!;
}

function normalizePresetQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getStatePresetFamilyId(preset: SavedPreset): string {
  const fallbackName = preset.familyName || preset.name;
  return preset.familyId || `state:${fallbackName.toLocaleLowerCase()}`;
}

function getStatePresetFamilyName(preset: SavedPreset): string {
  return preset.familyName || preset.name;
}

function getStatePresetVariantName(preset: SavedPreset): string {
  return preset.variantName || preset.name;
}

function getStatePresetUpdatedAt(preset: SavedPreset): number {
  const timestamp = new Date(preset.timestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function presetSourceLabel(source: SavedPreset['source'] | PresetSummary['library'] | undefined): string {
  if (source === 'cloud') return 'Cloud';
  if (source === 'stock' || source === 'bundled') return 'Stock';
  if (source === 'user' || source === 'device-local') return 'Local';
  return 'Preset';
}

function formatPresetDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function stateVariantMatchesQuery(preset: SavedPreset, query: string): boolean {
  if (!query) return true;
  const haystack = [
    preset.name,
    preset.familyName,
    preset.variantName,
    preset.source,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return haystack.includes(query);
}

function journeyMatchesQuery(preset: PresetSummary, query: string): boolean {
  if (!query) return true;
  const haystack = [
    preset.name,
    preset.familyName,
    preset.variantName,
    preset.library,
    preset.description,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return haystack.includes(query);
}

function journeyPresetHoverTitle(preset: PresetSummary): string {
  return preset.description
    ? `Load journey: ${preset.name}\n${preset.description}`
    : `Load journey: ${preset.name}`;
}

function compareStateVariants(left: SavedPreset, right: SavedPreset): number {
  const rankDiff = (left.variantRank ?? Number.MAX_SAFE_INTEGER) - (right.variantRank ?? Number.MAX_SAFE_INTEGER);
  if (rankDiff !== 0) return rankDiff;
  return getStatePresetVariantName(left).localeCompare(getStatePresetVariantName(right));
}

const SnowflakeUI: React.FC<SnowflakeUIProps> = ({ state, onChange, onShowAdvanced, onShowJourney, onShowVisualizer, onTogglePlay, onLoadPreset, journeyPresets = [], onLoadJourneyPreset, presets, isPlaying, isRecording, recordingDuration, onStopRecording, journeyState, journeyConfig, isJourneyPlaying, activeJourneyName, journeyValidation, sliderModes, dualSliderRanges, onDualRangeChange, forceFullArmOpacity = false }) => {
  const { announceHelp } = useSliderHelp();
  const bindHelp = useCallback((helpKey: string) => ({
    onMouseEnter: () => announceHelp(helpKey),
    onPointerDown: () => announceHelp(helpKey),
    onFocus: () => announceHelp(helpKey),
  }), [announceHelp]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);  // Dragging prong handle (level)
  const [hovering, setHovering] = useState<number | null>(null);
  const [draggingWidth, setDraggingWidth] = useState<number | null>(null);  // Dragging prong body (reverb send)
  const [hoveringWidth, setHoveringWidth] = useState<number | null>(null);
  const dragStartXRef = useRef<number>(0);  // Track start X position for tangential drag
  const dragStartYRef = useRef<number>(0);  // Track start Y position for tangential drag
  const dragStartValueRef = useRef<number>(0);  // Track initial reverb send value
  const specialDragStartValueRef = useRef<number>(0);
  const specialDragStartYRef = useRef<number>(0);
  // Special drag states: 'hexagon' for tension, 'ring' for master volume, 'reverb' for global ornament.
  const [specialDrag, setSpecialDrag] = useState<'hexagon' | 'ring' | 'reverb' | null>(null);
  const [specialHover, setSpecialHover] = useState<'hexagon' | 'ring' | 'reverb' | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [presetTab, setPresetTab] = useState<PresetPanelTab>('state');
  const [presetSort, setPresetSort] = useState<PresetSortMode>('updated');
  const [presetSearch, setPresetSearch] = useState('');
  const [expandedStateFamilies, setExpandedStateFamilies] = useState<Record<string, boolean>>({});
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  
  // Journey status bar expanded state
  const [statusBarExpanded, setStatusBarExpanded] = useState(false);
  
  // Auto-hide controls after inactivity
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3000); // Hide after 3 seconds of inactivity
  }, []);
  
  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);
  
  // Start the hide timer initially
  useEffect(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  const presetQuery = useMemo(() => normalizePresetQuery(presetSearch), [presetSearch]);

  const statePresetFamilies = useMemo(() => {
    const familyMap = new Map<string, StatePresetFamily>();
    for (const preset of presets) {
      const familyId = getStatePresetFamilyId(preset);
      const familyName = getStatePresetFamilyName(preset);
      const existing = familyMap.get(familyId);
      const updatedAt = getStatePresetUpdatedAt(preset);
      if (existing) {
        existing.updatedAt = Math.max(existing.updatedAt, updatedAt);
        existing.variants.push(preset);
      } else {
        familyMap.set(familyId, {
          familyId,
          familyName,
          updatedAt,
          variants: [preset],
        });
      }
    }

    const families = Array.from(familyMap.values()).map((family) => ({
      ...family,
      variants: [...family.variants].sort(compareStateVariants),
    })).filter((family) => {
      if (!presetQuery) return true;
      const familyMatch = family.familyName.toLocaleLowerCase().includes(presetQuery);
      return familyMatch || family.variants.some((variant) => stateVariantMatchesQuery(variant, presetQuery));
    });

    return families.sort((left, right) => {
      if (presetSort === 'children') {
        const childDiff = right.variants.length - left.variants.length;
        if (childDiff !== 0) return childDiff;
      }
      if (presetSort === 'az') return left.familyName.localeCompare(right.familyName);
      const updatedDiff = right.updatedAt - left.updatedAt;
      if (updatedDiff !== 0) return updatedDiff;
      return left.familyName.localeCompare(right.familyName);
    });
  }, [presetQuery, presetSort, presets]);

  const sortedJourneyPresets = useMemo(() => {
    const next = journeyPresets.filter((preset) => journeyMatchesQuery(preset, presetQuery));
    return next.sort((left, right) => {
      if (presetSort === 'children') {
        const versionDiff = right.versionCount - left.versionCount;
        if (versionDiff !== 0) return versionDiff;
      }
      if (presetSort === 'az') return left.name.localeCompare(right.name);
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);
    });
  }, [journeyPresets, presetQuery, presetSort]);
  
  // Responsive canvas size - smaller on mobile
  const [windowSize, setWindowSize] = useState({ width: typeof window !== 'undefined' ? window.innerWidth : 800, height: typeof window !== 'undefined' ? window.innerHeight : 600 });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    // Set initial size
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const runtimeSliderVersion = useRuntimeSliderVersion();
  const runtimeValueVersion = useRuntimeValueVersion();
  const snowflakeState = useMemo(
    () => resolveSnowflakeRuntimeState(state, sliderModes, dualSliderRanges),
    [dualSliderRanges, runtimeSliderVersion, runtimeValueVersion, sliderModes, state],
  );

  // --- Snowflake V2 hook (no-op when disabled, zero cost) ---
  const v2 = useSnowflakeV2(snowflakeState, onChange, {
    sliderModes,
    dualSliderRanges,
    onDualRangeChange,
  });
  
  // Calculate canvas size based on viewport - fully responsive
  // Mobile (width < 1024px): use 87.5% (25% larger for better touch targets)
  // Desktop: use original 70% of smaller dimension, capped at 550px
  const smallerDimension = Math.min(windowSize.width, windowSize.height - 100);
  const isMobile = windowSize.width < 1024;
  const disablePresetPopupBlur = isMobile || isMobileDevice();
  const canvasSize = isMobile 
    ? Math.max(250, Math.min(smallerDimension * 0.875, 650))
    : Math.max(200, Math.min(smallerDimension * 0.7, 550));
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  
  // Scale factors for responsive sizing
  const scaleFactor = canvasSize / 600;
  
  // Fixed base values for reference (scaled)
  const baseHexRadius = 35 * scaleFactor;
  const outerRingRadius = 250 * scaleFactor;
  // In V2, master volume controls visual brightness/presence, not snowflake size.
  const masterPresence = clamp01(snowflakeState.masterVolume);
  const masterScale = SNOWFLAKE_V2_ENABLED ? 1 : masterPresence;
  const v2MasterBrightness = 0.28 + masterPresence * 0.72;
  
  // Tension controls inner hexagon size (0% = normal, 100% = 3x)
  const hexagonScale = 1 + snowflakeState.tension * 2;  // 1x to 3x
  
  const baseRadius = 35 * scaleFactor * hexagonScale;
  const maxProngLength = 160 * scaleFactor * masterScale;
  const maxArmLength = 220 * scaleFactor * masterScale;
  const v2ReverbLevel = clamp01(snowflakeState.reverbLevel);
  const v2ReverbNodeRadius = Math.max(14, (14 + v2ReverbLevel * 24) * scaleFactor);
  const v2ReverbHitRadius = Math.max(38, (44 + v2ReverbLevel * 56) * scaleFactor);
  const v2ReverbLabelOffset = Math.max(34 * scaleFactor, v2ReverbNodeRadius + 14 * scaleFactor);
  const showV2Controls = showControls || v2.draggingArm !== null || specialDrag !== null || v2.stars.some((star) => star.activePoint !== null);
  const v2GlobalOrnament = useMemo(() => {
    if (!SNOWFLAKE_V2_ENABLED) return null;
    const sourceArm = v2.arms.find((arm) => !arm.isMirror && Math.abs(arm.macros.ornament) > 0.001);
    if (!sourceArm) return null;

    const hexRingStyle: SnowflakeRingStyle = sourceArm.params.motifs.rings > 1
      ? 'doubleHexRing'
      : (sourceArm.params.motifs.rings > 0 ? 'innerHexRing' : 'none');
    const params: SnowflakeParams = {
      ...sourceArm.params,
      symmetry: {
        ...sourceArm.params.symmetry,
        arms: 6,
        rotationOffset: 0,
      },
      motifs: {
        ...sourceArm.params.motifs,
        ringStyle: hexRingStyle,
      },
    };
    const generated = generateSnowflake(params);
    const shapePaths = generated.shapePaths.filter((shape) => (
      shape.id.startsWith('ring-')
      || shape.id.startsWith('plate-')
      || shape.id.startsWith('center-')
      || shape.id === 'spoke-connectors'
    ));

    return shapePaths.length > 0 ? { generated, shapePaths } : null;
  }, [v2.arms]);

  // Draw snowflake - runs on every state change, but it's fast!
  useEffect(() => {
    if (SNOWFLAKE_V2_ENABLED) return; // V2 uses its own render path below
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with transparent background first
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    
    // EXPERIMENTAL: Draw radial gradient background that fades to transparent at edges
    // Original was: ctx.fillStyle = '#060606'; ctx.fillRect(0, 0, canvasSize, canvasSize);
    const bgGradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, canvasSize / 2
    );
    bgGradient.addColorStop(0, '#100f0e');      // Dark center
    bgGradient.addColorStop(0.7, '#100f0e');    // Stay solid until 70%
    bgGradient.addColorStop(0.85, 'rgba(16, 15, 14, 0.7)');  // Start fading
    bgGradient.addColorStop(0.92, 'rgba(16, 15, 14, 0.3)');  // More transparent
    bgGradient.addColorStop(1, 'rgba(16, 15, 14, 0)');       // Fully transparent at edge
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, canvasSize / 2, 0, Math.PI * 2);
    ctx.fill();

    const { lengths: armLengths, widths: armWidths } = getArmValues(snowflakeState);

    // Only draw arms if master volume > 0
    if (masterScale > 0.01) {
      // Draw each arm
      ctx.save();
      ctx.translate(centerX, centerY);
    
    for (let arm = 0; arm < 6; arm++) {
      const slider = MACRO_SLIDERS[arm];
      if (!slider) continue;
      const length = armLengths[arm] ?? 0;    // Level controls length
      const width = armWidths[arm] ?? 0;       // Reverb send controls width/complexity
      const rotation = (arm * Math.PI * 2) / 6 - Math.PI / 2; // Start at top
      
      // Highlight branches when width is being dragged (tangential drag)
      const isWidthActive = draggingWidth === arm || hoveringWidth === arm;
      const highlightColor = isWidthActive ? slider.color : undefined;
      
      // Draw arm with 2-fold mirror symmetry (across the arm axis)
      for (const mirror of [1, -1]) {
        ctx.save();
        ctx.rotate(rotation);
        ctx.scale(1, mirror);
        
        // Start from edge of center hexagon
        ctx.translate(baseRadius * 0.7, 0);
        
        drawArm(ctx, length, width, arm, maxArmLength, 3, highlightColor);
        
        ctx.restore();
      }
    }
    
    ctx.restore();
    }

    // Draw center hexagon (size controlled by tension)
    ctx.save();
    ctx.translate(centerX, centerY);
    
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
      const x = Math.cos(angle) * baseRadius * 0.7;
      const y = Math.sin(angle) * baseRadius * 0.7;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(210, 230, 255, 0.95)';
    ctx.fill();

    // Center icon - scale with hexagon
    const fontSize = Math.max(14, Math.min(40, 20 * hexagonScale * scaleFactor));
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isPlaying ? '#3a70b9' : '#556';
    ctx.fillText(isPlaying ? '' : '', 0, 1);
    
    ctx.restore();

  }, [snowflakeState, isPlaying, centerX, centerY, canvasSize, scaleFactor, baseRadius, maxProngLength, maxArmLength, hexagonScale, draggingWidth, hoveringWidth]);

  // --- Snowflake V2: no canvas render needed (SVG-based) ---

  // Handle pointer events for prong dragging
  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(index);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Handle center reverb drag (global ornament/reverb level)
    if (specialDrag === 'reverb') {
      const sensitivity = Math.max(90, 190 * scaleFactor);
      const normalizedReverb = Math.max(0, Math.min(1, specialDragStartValueRef.current - (e.clientY - specialDragStartYRef.current) / sensitivity));
      onChange('reverbLevel', normalizedReverb);
      return;
    }
    
    // Handle hexagon drag (tension)
    if (specialDrag === 'hexagon') {
      // Map distance to tension: smaller drag = 0, larger = 1
      // Hex radius ranges from baseHexRadius (tension=0) to baseHexRadius*3 (tension=1)
      const minRadius = baseHexRadius * 0.5;
      const maxRadius = baseHexRadius * 2.5;
      const normalizedTension = Math.max(0, Math.min(1, (distance - minRadius) / (maxRadius - minRadius)));
      onChange('tension', normalizedTension);
      return;
    }
    
    // Handle ring drag (master volume)
    if (specialDrag === 'ring') {
      // Map distance to master volume: closer to center = 0, edge = 1
      const minRadius = baseHexRadius * 1.5;
      const maxRadius = outerRingRadius;
      const normalizedVolume = Math.max(0, Math.min(1, (distance - minRadius) / (maxRadius - minRadius)));
      onChange('masterVolume', normalizedVolume);
      return;
    }
    
    // Handle width drag (reverb send or filter cutoff) - tangential movement
    if (draggingWidth !== null) {
      const slider = MACRO_SLIDERS[draggingWidth];
      if (slider?.reverbSendKey) {
        // Calculate tangential movement (perpendicular to prong direction)
        const prongAngle = (draggingWidth * 60 - 90) * (Math.PI / 180);
        // Tangent is perpendicular to the prong direction
        const tangentX = -Math.sin(prongAngle);
        const tangentY = Math.cos(prongAngle);
        // Project movement onto tangent (using both X and Y deltas)
        const deltaX = x - dragStartXRef.current;
        const deltaY = y - dragStartYRef.current;
        const tangentMovement = deltaX * tangentX + deltaY * tangentY;
        // Scale: ~100 pixels = full range
        const sensitivity = 100;
        const normalizedValue = Math.max(0, Math.min(1, dragStartValueRef.current + tangentMovement / sensitivity));
        
        // Convert to actual value - special case for oceanFilterCutoff
        if (slider.reverbSendKey === 'oceanFilterCutoff') {
          const hzValue = 40 + normalizedValue * (12000 - 40);
          onChange(slider.reverbSendKey, hzValue);
        } else {
          onChange(slider.reverbSendKey, normalizedValue);
        }
      }
      return;
    }
    
    if (dragging === null) return;
    
    const slider = MACRO_SLIDERS[dragging];
    if (!slider) return;
    // Use scaled interaction radius (must match getProngPosition for consistent drag)
    const interactionBaseRadius = 35 * scaleFactor;
    const interactionMaxLength = 160 * scaleFactor;
    const normalizedDistance = Math.max(0, Math.min(1, (distance - interactionBaseRadius) / interactionMaxLength));
    // Apply logarithmic curve: slider position -> actual value
    const value = sliderPositionToValue(normalizedDistance, slider.min, slider.max);
    
    onChange(slider.key, value);
  }, [dragging, draggingWidth, specialDrag, onChange, centerX, centerY, baseHexRadius, outerRingRadius, scaleFactor]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(null);
    setDraggingWidth(null);
    setSpecialDrag(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  // Calculate prong positions (scaled for responsive display)
  const getProngPosition = (index: number, value: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180);
    const slider = MACRO_SLIDERS[index] ?? MACRO_SLIDERS[0]!;
    // Apply logarithmic scaling: actual value -> slider position
    const normalizedValue = valueToSliderPosition(value, slider.min, slider.max);
    // Use scaled interaction radius
    const interactionBaseRadius = 35 * scaleFactor;
    const interactionMaxLength = 160 * scaleFactor;
    const prongLength = interactionBaseRadius + normalizedValue * interactionMaxLength;
    
    return {
      x: centerX + Math.cos(angle) * prongLength,
      y: centerY + Math.sin(angle) * prongLength,
      angle,
      normalizedValue,
    };
  };
  
  // Scaled sizes for touch targets - use scaleFactor for responsive sizing
  const handleRadius = 14 * scaleFactor;
  const handleRadiusActive = 18 * scaleFactor;
  const labelFontSize = Math.max(9, 11 * scaleFactor);
  const labelHeight = 20 * scaleFactor;
  
  // Calculate button positions - halfway between canvas edge and screen edge
  const canvasTop = (windowSize.height - canvasSize) / 2;
  const canvasBottom = canvasTop + canvasSize;
  const topGap = canvasTop;
  const bottomGap = windowSize.height - canvasBottom;
  const playButtonTop = topGap / 2 - 22; // Center of top gap, offset by half button height
  const advancedButtonBottom = bottomGap / 2 - 22; // Center of bottom gap, offset by half of 44px button height

  return (
    <div style={styles.container}>
      {/* Armed journey status bar */}
      {!isJourneyPlaying && activeJourneyName && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setStatusBarExpanded(!statusBarExpanded);
          }}
          style={{
            position: 'fixed',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: STATUS_COLORS.popup,
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            border: `1px solid ${journeyValidation?.playable === false ? '#d8b36a' : STATUS_COLORS.popupBorder}`,
            borderRadius: statusBarExpanded ? 12 : 20,
            padding: statusBarExpanded ? '10px 14px' : '6px 14px',
            display: 'flex',
            flexDirection: statusBarExpanded ? 'column' : 'row',
            alignItems: statusBarExpanded ? 'stretch' : 'center',
            gap: statusBarExpanded ? 8 : 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            color: STATUS_COLORS.text,
            pointerEvents: 'auto',
            cursor: 'pointer',
            minWidth: statusBarExpanded ? 180 : undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: journeyValidation?.playable === false ? '#d8b36a' : STATUS_COLORS.filledNode,
              boxShadow: `0 0 6px ${journeyValidation?.playable === false ? '#d8b36a' : STATUS_COLORS.filledNode}`,
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: journeyValidation?.playable === false ? '#d8b36a' : STATUS_COLORS.filledNode }}>
              {journeyValidation?.playable === false ? 'Journey needs edit' : 'Journey armed'}
            </span>
            {!statusBarExpanded && (
              <span style={{ fontSize: 10, color: STATUS_COLORS.text, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeJourneyName}
              </span>
            )}
          </div>
          {statusBarExpanded && (
            <>
              <div style={{ fontSize: 12, color: STATUS_COLORS.text }}>{activeJourneyName}</div>
              {journeyValidation?.playable === false && (
                <div style={{ fontSize: 10, color: '#d8b36a', lineHeight: 1.35 }}>
                  {journeyValidation.issues.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Journey status bar - expandable compact view */}
      {isJourneyPlaying && journeyState && journeyConfig && (() => {
        // Get current and next playing node info
        const currentNode = journeyConfig.nodes.find((n: JourneyNode) => n.id === journeyState.currentNodeId);
        const nextNode = journeyConfig.nodes.find((n: JourneyNode) => n.id === journeyState.nextNodeId);
        const plannedNode = journeyConfig.nodes.find((n: JourneyNode) => n.id === journeyState.plannedNextNodeId);
        
        // Calculate time remaining
        const phraseDuration = journeyState.resolvedPhraseDuration || currentNode?.phraseLength || 1;
        const morphDuration = journeyState.resolvedMorphDuration || 2;
        const phraseTimeTotal = phraseDuration * PHRASE_LENGTH;
        const phraseTimeRemaining = phraseTimeTotal * (1 - journeyState.phraseProgress);
        const morphTimeTotal = morphDuration * PHRASE_LENGTH;
        const morphTimeRemaining = morphTimeTotal * (1 - journeyState.morphProgress);
        
        const formatTime = (seconds: number) => {
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          if (mins > 0) {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
          }
          return `${secs}s`;
        };
        
        const isExpanded = statusBarExpanded;
        const isNextEnd = plannedNode?.position === 'center' || plannedNode?.presetId === '__CENTER__';
        const isNextSelf = plannedNode?.id === journeyState.currentNodeId;
        
        const getPhaseDisplay = () => {
          switch (journeyState.phase) {
            case 'playing': return 'Playing';
            case 'morphing': return 'Morphing';
            case 'self-loop': return 'Looping';
            case 'ending': return 'Ending';
            default: return journeyState.phase;
          }
        };
        
        return (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setStatusBarExpanded(!statusBarExpanded);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: STATUS_COLORS.popup,
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: `1px solid ${STATUS_COLORS.popupBorder}`,
              borderRadius: isExpanded ? 12 : 20,
              padding: isExpanded ? '12px 16px' : '6px 14px',
              display: 'flex',
              flexDirection: isExpanded ? 'column' : 'row',
              alignItems: isExpanded ? 'stretch' : 'center',
              gap: isExpanded ? 10 : 10,
              boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
              fontFamily: "'Avenir', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              color: STATUS_COLORS.text,
              pointerEvents: 'auto',
              cursor: 'pointer',
              minWidth: isExpanded ? 180 : undefined,
              transition: 'all 0.2s ease',
            }}
          >
            {isExpanded ? (
              // === EXPANDED VIEW ===
              <>
                {/* Phase indicator header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: journeyState.phase === 'morphing' 
                      ? STATUS_COLORS.morphingConnection 
                      : journeyState.phase === 'ending' 
                        ? STATUS_COLORS.endConnection 
                        : (currentNode?.color || STATUS_COLORS.filledNode),
                    boxShadow: `0 0 8px ${journeyState.phase === 'morphing' 
                      ? STATUS_COLORS.morphingConnection 
                      : journeyState.phase === 'ending' 
                        ? STATUS_COLORS.endConnection 
                        : (currentNode?.color || STATUS_COLORS.filledNode)}`,
                  }} />
                  <span style={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: journeyState.phase === 'morphing' 
                      ? STATUS_COLORS.morphingConnection 
                      : journeyState.phase === 'ending' 
                        ? STATUS_COLORS.endConnection 
                        : (currentNode?.color || STATUS_COLORS.filledNode),
                  }}>
                    {getPhaseDisplay()}
                  </span>
                </div>
                
                {/* Current preset */}
                {currentNode?.presetName && (
                  <div>
                    <div style={{ fontSize: 9, color: STATUS_COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Current
                    </div>
                    <div style={{ 
                      fontSize: 12, 
                      fontWeight: 500,
                      color: currentNode.color || STATUS_COLORS.filledNode,
                    }}>
                      {currentNode.presetName}
                    </div>
                  </div>
                )}
                
                {/* Phrase progress (playing/self-loop) */}
                {(journeyState.phase === 'playing' || journeyState.phase === 'self-loop') && (
                  <div>
                    <div style={{ fontSize: 9, color: STATUS_COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Phrase ({Math.round(journeyState.phraseProgress * 100)}%)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        flex: 1,
                        height: 4, 
                        background: 'rgba(255,255,255,0.1)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${journeyState.phraseProgress * 100}%`, 
                          height: '100%', 
                          background: currentNode?.color || STATUS_COLORS.filledNode,
                          borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: STATUS_COLORS.text, minWidth: 35, textAlign: 'right' }}>
                        {formatTime(phraseTimeRemaining)}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Morph progress */}
                {journeyState.phase === 'morphing' && nextNode && (
                  <div>
                    <div style={{ fontSize: 9, color: STATUS_COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Morphing to
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      color: nextNode.color || STATUS_COLORS.filledNode,
                      marginBottom: 4,
                    }}>
                      {nextNode.presetName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        flex: 1, 
                        height: 4, 
                        background: 'rgba(255,255,255,0.1)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${journeyState.morphProgress * 100}%`, 
                          height: '100%', 
                          background: STATUS_COLORS.morphingConnection,
                          borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: STATUS_COLORS.text, minWidth: 35, textAlign: 'right' }}>
                        {formatTime(morphTimeRemaining)}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Ending progress */}
                {journeyState.phase === 'ending' && (
                  <div>
                    <div style={{ fontSize: 9, color: STATUS_COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Fading out
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        flex: 1, 
                        height: 4, 
                        background: 'rgba(255,255,255,0.1)', 
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}>
                        <div style={{ 
                          width: `${journeyState.morphProgress * 100}%`, 
                          height: '100%', 
                          background: STATUS_COLORS.endConnection,
                          borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: STATUS_COLORS.text, minWidth: 35, textAlign: 'right' }}>
                        {formatTime(morphTimeRemaining)}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Next stop */}
                {(journeyState.phase === 'playing' || journeyState.phase === 'self-loop') && plannedNode && (
                  <div style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${STATUS_COLORS.popupBorder}` }}>
                    <div style={{ fontSize: 9, color: STATUS_COLORS.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Next
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      color: isNextEnd ? STATUS_COLORS.endConnection : (isNextSelf ? currentNode?.color : plannedNode.color) || STATUS_COLORS.filledNode,
                    }}>
                      {isNextEnd ? '⬡ End' : (isNextSelf ? '↺ Self-loop' : plannedNode.presetName)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // === COMPACT VIEW ===
              <>
                {/* Phase dot */}
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: journeyState.phase === 'morphing' 
                    ? STATUS_COLORS.morphingConnection 
                    : journeyState.phase === 'ending' 
                      ? STATUS_COLORS.endConnection 
                      : (currentNode?.color || STATUS_COLORS.filledNode),
                  boxShadow: `0 0 6px ${journeyState.phase === 'morphing' 
                    ? STATUS_COLORS.morphingConnection 
                    : journeyState.phase === 'ending' 
                      ? STATUS_COLORS.endConnection 
                      : (currentNode?.color || STATUS_COLORS.filledNode)}`,
                }} />
                
                {/* Current/Morphing info with progress */}
                {journeyState.phase === 'morphing' && nextNode ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ 
                      fontSize: 10, 
                      color: currentNode?.color || STATUS_COLORS.textMuted,
                      maxWidth: 60,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {currentNode?.presetName || '?'}
                    </span>
                    <span style={{ fontSize: 9, color: STATUS_COLORS.textMuted }}>→</span>
                    <span style={{ 
                      fontSize: 10, 
                      color: nextNode.color || STATUS_COLORS.filledNode,
                      maxWidth: 60,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {nextNode.presetName || 'END'}
                    </span>
                    <div style={{ 
                      width: 40, 
                      height: 3, 
                      background: 'rgba(255,255,255,0.15)', 
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}>
                      <div style={{ 
                        width: `${journeyState.morphProgress * 100}%`, 
                        height: '100%', 
                        background: STATUS_COLORS.morphingConnection,
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ) : journeyState.phase === 'ending' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: STATUS_COLORS.endConnection }}>Ending</span>
                    <div style={{ 
                      width: 40, 
                      height: 3, 
                      background: 'rgba(255,255,255,0.15)', 
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}>
                      <div style={{ 
                        width: `${journeyState.morphProgress * 100}%`, 
                        height: '100%', 
                        background: STATUS_COLORS.endConnection,
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ 
                      fontSize: 10, 
                      color: currentNode?.color || STATUS_COLORS.filledNode,
                      maxWidth: 80,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}>
                      {currentNode?.presetName || '?'}
                    </span>
                    <div style={{ 
                      width: 40, 
                      height: 3, 
                      background: 'rgba(255,255,255,0.15)', 
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}>
                      <div style={{ 
                        width: `${journeyState.phraseProgress * 100}%`, 
                        height: '100%', 
                        background: currentNode?.color || STATUS_COLORS.filledNode,
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
      
      {/* Play button and Preset button - positioned between top edge and canvas */}
      <div style={{
        position: 'absolute',
        top: Math.max(10, playButtonTop),
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '30px',
        alignItems: 'center',
      }}>
        <button 
          style={isPlaying ? styles.stopButton : styles.playButton} 
          onClick={onTogglePlay}
          {...bindHelp('appPlayToggle')}
        >
          {isPlaying ? TEXT_SYMBOLS.stop : TEXT_SYMBOLS.play}
        </button>
        {/* Preset button OR Recording indicator (when recording is active) */}
        {isRecording ? (
          <button 
            style={{
              ...styles.advancedButton,
              color: '#FF4444',
              position: 'relative',
            }} 
            onClick={onStopRecording}
            title={`Recording ${formatRecordingTime(recordingDuration || 0)} - Click to stop`}
          >
            <span style={{
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              {TEXT_SYMBOLS.record}
            </span>
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-8px',
              fontSize: '0.5rem',
              background: '#FF4444',
              color: 'white',
              padding: '1px 4px',
              borderRadius: '8px',
              fontWeight: 'bold',
            }}>
              {formatRecordingTime(recordingDuration || 0)}
            </span>
          </button>
        ) : (
          <button 
            style={{
              ...styles.advancedButton,
              color: showPresets ? '#ED5A24' : 'rgba(255,255,255,0.6)',
            }} 
            onClick={() => setShowPresets(!showPresets)}
            title="Presets"
          >
            {TEXT_SYMBOLS.hexagon}
          </button>
        )}
      </div>

      {/* Snowflake centered */}
      <div style={styles.snowflakeWrapper}>
      <div 
        style={styles.canvasContainer}
        onPointerMove={(e) => {
          if (SNOWFLAKE_V2_ENABLED) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            v2.onStarDrag(e.clientX, e.clientY, scaleFactor);
            v2.onLevelDrag(e.clientX - rect.left, e.clientY - rect.top, centerX, centerY, maxArmLength, scaleFactor);
          }
          if (!SNOWFLAKE_V2_ENABLED || v2.draggingArm === null) {
            handlePointerMove(e);
          }
          resetHideTimer();
        }}
        onPointerUp={(e) => {
          if (SNOWFLAKE_V2_ENABLED) {
            v2.onStarDragEnd();
            v2.onLevelDragEnd();
          }
          handlePointerUp(e);
        }}
        onPointerEnter={resetHideTimer}
        onPointerDown={resetHideTimer}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={styles.canvas}
        />
        
        {/* V2 SVG Snowflake Rendering (macro-driven, per-arm) */}
        {SNOWFLAKE_V2_ENABLED && (
          <svg
            width={canvasSize}
            height={canvasSize}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              overflow: 'visible',
            }}
          >
            {/* Background gradient */}
            <defs>
              <radialGradient id="snowflake-v2-bg">
                <stop offset="0%" stopColor="#100f0e" />
                <stop offset="70%" stopColor="#100f0e" />
                <stop offset="85%" stopColor="#100f0e" stopOpacity="0.7" />
                <stop offset="92%" stopColor="#100f0e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#100f0e" stopOpacity="0" />
              </radialGradient>
              <filter id="snowflake-v2-ring-halo-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="12" />
              </filter>
            </defs>
            <circle cx={centerX} cy={centerY} r={canvasSize / 2} fill="url(#snowflake-v2-bg)" />

            {/* Generator ornament layer: global rings/plates/center motifs driven by Reverb Level */}
            {v2GlobalOrnament && (
              <g
                transform={`translate(${centerX}, ${centerY}) scale(${(maxArmLength / 220) * SNOWFLAKE_V2_ORNAMENT_SCALE}) translate(${-v2GlobalOrnament.generated.size / 2}, ${-v2GlobalOrnament.generated.size / 2})`}
                opacity={v2MasterBrightness}
                style={{ pointerEvents: 'none' }}
              >
                {v2GlobalOrnament.shapePaths.map((shape) => (
                  <path
                    key={`global-ornament-${shape.id}`}
                    d={shape.d}
                    fill={shape.fill === '#ffffff' || shape.fill === 'white' ? 'none' : shape.fill}
                    stroke={shape.stroke === '#009ee3' ? 'rgba(210, 230, 255, 0.8)' : shape.stroke}
                    strokeWidth={shape.strokeWidth * SNOWFLAKE_V2_STROKE_SCALE}
                    opacity={shape.opacity}
                    fillRule={shape.fillRule}
                  />
                ))}
              </g>
            )}

            {/* Render each arm's generated snowflake paths, rotated into position */}
            {v2.arms.map((arm) => {
              const { generated, normalizedLevel, engine, slot, isMirror } = arm;
              const rotation = slot * 60; // 60° per slot
              const armScale = maxArmLength / 220;
              const opacity = forceFullArmOpacity && !isMirror
                ? 1
                : (isMirror ? 0.2 : (normalizedLevel < 0.01 ? 0.2 : 1));
              const localShapePaths = generated.shapePaths.filter((shape) => (
                !shape.id.startsWith('ring-')
                && !shape.id.startsWith('center-')
                && !shape.id.startsWith('plate-')
                && shape.id !== 'spoke-connectors'
              ));

              return (
                <g
                  key={`arm-${slot}-${engine.id}`}
                  transform={`translate(${centerX}, ${centerY}) rotate(${rotation}) scale(${armScale}) translate(${-generated.size / 2}, ${-generated.size / 2})`}
                  opacity={opacity * v2MasterBrightness}
                >
                  {/* Path layers (arm segments by depth) */}
                  {generated.pathLayers.map((layer) => (
                    <path
                      key={layer.id}
                      d={layer.d}
                      fill="none"
                      stroke="rgba(210, 230, 255, 0.95)"
                      strokeWidth={layer.strokeWidth * SNOWFLAKE_V2_STROKE_SCALE}
                      strokeOpacity={forceFullArmOpacity && !isMirror ? Math.max(layer.strokeOpacity, 0.92) : layer.strokeOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {/* Shape paths (rings, center, nodes) */}
                  {localShapePaths.map((shape) => (
                    <path
                      key={shape.id}
                      d={shape.d}
                      fill={shape.fill === '#ffffff' || shape.fill === 'white' ? 'none' : shape.fill}
                      stroke={shape.stroke === '#009ee3' ? 'rgba(210, 230, 255, 0.8)' : shape.stroke}
                      strokeWidth={shape.strokeWidth * SNOWFLAKE_V2_STROKE_SCALE}
                      opacity={forceFullArmOpacity && !isMirror ? Math.max(shape.opacity, 0.86) : shape.opacity}
                      fillRule={shape.fillRule}
                    />
                  ))}
                </g>
              );
            })}

            <g
              opacity={showV2Controls ? 1 : 0}
              style={{
                pointerEvents: showV2Controls ? 'auto' : 'none',
                transition: `opacity ${SNOWFLAKE_V2_CONTROL_FADE_MS}ms ease-out`,
              }}
            >
            {/* Master volume outer ring */}
            <circle
              cx={centerX}
              cy={centerY}
              r={outerRingRadius}
              fill="none"
              stroke={`rgba(60,113,129,${0.06 + masterPresence * 0.28})`}
              strokeWidth={8 + masterPresence * 18}
              style={{
                filter: 'url(#snowflake-v2-ring-halo-blur)',
                pointerEvents: 'none',
              }}
            />
            <circle
              cx={centerX}
              cy={centerY}
              r={outerRingRadius}
              fill="none"
              stroke={specialHover === 'ring' || specialDrag === 'ring' ? '#3C7181' : `rgba(60,113,129,${0.18 + masterPresence * 0.42})`}
              strokeWidth={specialHover === 'ring' || specialDrag === 'ring' ? 8 : 4}
              style={{
                cursor: 'crosshair',
                filter: specialHover === 'ring' || specialDrag === 'ring' ? 'drop-shadow(0 0 12px rgba(60,113,129,0.7))' : undefined,
                pointerEvents: 'stroke',
                transition: 'stroke-width 0.15s ease-out, stroke 0.15s ease-out',
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSpecialDrag('ring');
                (e.target as Element).setPointerCapture(e.pointerId);
                resetHideTimer();
              }}
              onPointerEnter={() => {
                setSpecialHover('ring');
                resetHideTimer();
              }}
              onPointerLeave={() => setSpecialHover(null)}
            />
            {(specialHover === 'ring' || specialDrag === 'ring') && (
              <g style={{ pointerEvents: 'none' }}>
                <rect
                  x={centerX - 50 * scaleFactor}
                  y={30 * scaleFactor}
                  width={100 * scaleFactor}
                  height={22 * scaleFactor}
                  rx={4}
                  fill="rgba(0,0,0,0.85)"
                  stroke="#3C7181"
                />
                <text x={centerX} y={45 * scaleFactor} textAnchor="middle" fill="white" fontSize={11 * scaleFactor} fontWeight="bold">
                  Volume: {Math.round(snowflakeState.masterVolume * 100)}%
                </text>
              </g>
            )}

            {/* Center reverb node controls global reverb level / ornament magnitude */}
            <g>
              <circle
                cx={centerX}
                cy={centerY}
                r={v2ReverbHitRadius}
                fill="transparent"
                style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  specialDragStartValueRef.current = v2ReverbLevel;
                  specialDragStartYRef.current = e.clientY;
                  setSpecialDrag('reverb');
                  (e.target as Element).setPointerCapture(e.pointerId);
                  resetHideTimer();
                }}
                onPointerEnter={() => {
                  setSpecialHover('reverb');
                  resetHideTimer();
                }}
                onPointerMove={() => resetHideTimer()}
                onPointerLeave={() => setSpecialHover(null)}
              />
              <circle
                cx={centerX}
                cy={centerY}
                r={v2ReverbNodeRadius}
                fill={FX_COLORS.reverb}
                fillOpacity={0.22 + v2ReverbLevel * 0.5}
                stroke={specialHover === 'reverb' || specialDrag === 'reverb' ? 'white' : FX_COLORS.reverb}
                strokeWidth={specialHover === 'reverb' || specialDrag === 'reverb' ? 2.4 : 1.4}
                strokeOpacity={0.86}
                style={{
                  filter: specialHover === 'reverb' || specialDrag === 'reverb' ? `drop-shadow(0 0 10px ${FX_COLORS.reverb})` : undefined,
                  pointerEvents: 'none',
                  transition: 'r 0.12s ease-out, stroke-width 0.12s ease-out',
                }}
              />
              <text
                x={centerX}
                y={centerY + v2ReverbLabelOffset}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={specialHover === 'reverb' || specialDrag === 'reverb' ? 'white' : FX_COLORS.reverb}
                stroke="rgba(12,14,18,0.86)"
                strokeWidth={2.2 * scaleFactor}
                paintOrder="stroke"
                fontSize={8.5 * scaleFactor}
                fontWeight="600"
                opacity={specialHover === 'reverb' || specialDrag === 'reverb' ? 1 : 0.68}
                style={{ pointerEvents: 'none' }}
              >
                {specialDrag === 'reverb' ? `${Math.round(v2ReverbLevel * 100)}%` : 'Reverb'}
              </text>
            </g>

            {/* Hold-to-reveal FX star — Journey-style diamond ring */}
            {v2.arms.map((arm) => {
              if (arm.isMirror) return null;
              const starState = v2.stars[arm.slot];
              if (!starState || !starState.isOpen) return null;

              const { engine, normalizedLevel, slot } = arm;
              const angle = (slot * 60 - 90) * (Math.PI / 180);
              const innerGap = 30 * scaleFactor;
              const armReach = SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO + normalizedLevel * (1 - SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO);
              const handleDist = innerGap + armReach * maxArmLength;
              const hx = centerX + Math.cos(angle) * handleDist;
              const hy = centerY + Math.sin(angle) * handleDist;

              // Larger ring for mobile friendliness
              const ringR = 34 * scaleFactor;
              const nodeR = 8 * scaleFactor; // large tap target
              const hitR = 16 * scaleFactor; // invisible hit area even larger

              const starPoints = [
                { key: 'reverb' as const, label: 'Rev', startAngle: -Math.PI / 2, dx: 0, dy: -1, color: FX_COLORS.reverb, value: getSendValue(snowflakeState, engine.sends.reverb) },
                { key: 'delayB' as const, label: 'DlyB', startAngle: 0, dx: 1, dy: 0, color: FX_COLORS.delayB, value: getSendValue(snowflakeState, engine.sends.delayB) },
                { key: 'granular' as const, label: 'Gran', startAngle: Math.PI / 2, dx: 0, dy: 1, color: FX_COLORS.granular, value: getSendValue(snowflakeState, engine.sends.granular) },
                { key: 'delayA' as const, label: 'DlyA', startAngle: Math.PI, dx: -1, dy: 0, color: FX_COLORS.delayA, value: getSendValue(snowflakeState, engine.sends.delayA) },
              ];

              const availablePoints = starPoints.filter((p) => engine.sends[p.key] !== null);

              return (
                <g key={`star-${slot}`}>
                  {/* Background ring */}
                  <circle
                    cx={hx} cy={hy} r={ringR}
                    fill="none"
                    stroke="rgba(184,224,255,0.12)"
                    strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }}
                  />

                  {availablePoints.map((point) => {
                    const isActive = starState.activePoint === point.key;
                    const nodeX = hx + point.dx * ringR;
                    const nodeY = hy + point.dy * ringR;

                    // Arc segment: thickness based on value
                    const arcThickness = (3 + point.value * 5) * scaleFactor;
                    const sweepAngle = Math.PI / 2 * 0.7;
                    const halfSweep = sweepAngle / 2;
                    const arcStartAngle = point.startAngle - halfSweep;
                    const arcEndAngle = point.startAngle + halfSweep;
                    const arcX1 = hx + Math.cos(arcStartAngle) * ringR;
                    const arcY1 = hy + Math.sin(arcStartAngle) * ringR;
                    const arcX2 = hx + Math.cos(arcEndAngle) * ringR;
                    const arcY2 = hy + Math.sin(arcEndAngle) * ringR;
                    const arcPath = `M ${arcX1} ${arcY1} A ${ringR} ${ringR} 0 0 1 ${arcX2} ${arcY2}`;

                    // Label outside the ring
                    const labelDist = ringR + 14 * scaleFactor;
                    const labelX = hx + point.dx * labelDist;
                    const labelY = hy + point.dy * labelDist;

                    return (
                      <g key={point.key}>
                        {/* Arc segment showing value level */}
                        <path
                          d={arcPath}
                          fill="none"
                          stroke={point.color}
                          strokeWidth={arcThickness}
                          strokeOpacity={point.value > 0 ? 0.55 + point.value * 0.35 : 0.12}
                          strokeLinecap="round"
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Invisible enlarged hit target */}
                        <circle
                          cx={nodeX} cy={nodeY} r={hitR}
                          fill="transparent"
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            (e.target as Element).setPointerCapture(e.pointerId);
                            v2.onStarPointPointerDown(slot, point.key, e.clientX, e.clientY);
                          }}
                        />
                        {/* Visible node */}
                        <circle
                          cx={nodeX} cy={nodeY}
                          r={isActive ? nodeR * 1.3 : nodeR}
                          fill={point.value > 0 ? point.color : 'rgba(40,40,40,0.6)'}
                          fillOpacity={point.value > 0 ? 0.85 : 0.5}
                          stroke={isActive ? 'white' : point.color}
                          strokeWidth={isActive ? 2.5 : 1.2}
                          strokeOpacity={point.value > 0 ? 0.9 : 0.4}
                          style={{
                            pointerEvents: 'none',
                            filter: isActive ? `drop-shadow(0 0 8px ${point.color})` : undefined,
                            transition: 'r 0.12s ease-out',
                          }}
                        />
                        {/* FX label */}
                        <text
                          x={labelX} y={labelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={isActive ? 'white' : point.color}
                          fontSize={8.5 * scaleFactor}
                          fontWeight="600"
                          opacity={isActive ? 1 : 0.6}
                          style={{ pointerEvents: 'none' }}
                        >
                          {isActive ? `${Math.round(point.value * 100)}%` : point.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Interactive handle circles + labels for level drag */}
            {v2.arms.map((arm) => {
              if (arm.isMirror) return null;
              const { engine, normalizedLevel, slot } = arm;
              const angle = (slot * 60 - 90) * (Math.PI / 180);
              const innerGap = 30 * scaleFactor;
              const armReach = SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO + normalizedLevel * (1 - SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO);
              const handleDist = innerGap + armReach * maxArmLength;
              const hx = centerX + Math.cos(angle) * handleDist;
              const hy = centerY + Math.sin(angle) * handleDist;
              const isActive = v2.draggingArm === slot;
              const handleR = (isActive ? 16 : 12) * scaleFactor;
              const dualLevelRange = getSnowflakeDualLevelRange(engine, sliderModes, dualSliderRanges);
              const rangePoint = (levelNorm: number) => {
                const reach = SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO + levelNorm * (1 - SNOWFLAKE_V2_MIN_ARM_LENGTH_RATIO);
                const dist = innerGap + reach * maxArmLength;
                return {
                  x: centerX + Math.cos(angle) * dist,
                  y: centerY + Math.sin(angle) * dist,
                };
              };
              const rangeMinPoint = dualLevelRange ? rangePoint(dualLevelRange.minNorm) : null;
              const rangeMaxPoint = dualLevelRange ? rangePoint(dualLevelRange.maxNorm) : null;
              const rangeMidPoint = dualLevelRange ? rangePoint(dualLevelRange.midNorm) : null;

              // Label position: slightly beyond the handle along the arm axis
              const labelDist = handleDist + handleR + 26 * scaleFactor;
              const lx = centerX + Math.cos(angle) * labelDist;
              const ly = centerY + Math.sin(angle) * labelDist;

              return (
                <g key={`handle-group-${slot}`}>
                  {dualLevelRange && rangeMinPoint && rangeMaxPoint && rangeMidPoint && (
                    <g style={{ pointerEvents: 'none' }}>
                      <line
                        x1={rangeMinPoint.x}
                        y1={rangeMinPoint.y}
                        x2={rangeMaxPoint.x}
                        y2={rangeMaxPoint.y}
                        stroke={engine.color}
                        strokeWidth={Math.max(2, 4 * scaleFactor)}
                        strokeLinecap="round"
                        opacity={isActive ? 0.54 : 0.28}
                      />
                      <circle
                        cx={rangeMidPoint.x}
                        cy={rangeMidPoint.y}
                        r={Math.max(3, 4.5 * scaleFactor)}
                        fill="rgba(10,14,20,0.82)"
                        stroke="rgba(255,255,255,0.78)"
                        strokeWidth={1.4}
                        opacity={isActive ? 0.95 : 0.68}
                      />
                    </g>
                  )}
                  <circle
                    cx={hx}
                    cy={hy}
                    r={handleR}
                    fill={engine.color}
                    stroke="white"
                    strokeWidth={2}
                    style={{
                      cursor: 'grab',
                      filter: isActive
                        ? `drop-shadow(0 0 12px ${engine.color})`
                        : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                      pointerEvents: 'auto',
                      transition: 'r 0.15s ease-out',
                    }}
                    onPointerEnter={() => {
                      v2.onLevelNodePointerEnter(slot);
                      resetHideTimer();
                    }}
                    onPointerMove={() => {
                      v2.onLevelNodePointerEnter(slot);
                      resetHideTimer();
                    }}
                    onPointerLeave={() => {
                      v2.onLevelNodePointerLeave(slot);
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      v2.onLevelDragStart(slot, e);
                      resetHideTimer();
                    }}
                  />
                  {/* Engine name label */}
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    stroke="rgba(12,14,18,0.86)"
                    strokeWidth={2.4 * scaleFactor}
                    paintOrder="stroke"
                    fontSize={9 * scaleFactor}
                    fontWeight="500"
                    opacity={0.8}
                    style={{ pointerEvents: 'none' }}
                  >
                    {engine.label}
                  </text>
                </g>
              );
            })}
            </g>
          </svg>
        )}

        {/* V1 Interactive prong handles (legacy, disabled when V2 active) */}
        {!SNOWFLAKE_V2_ENABLED && <svg 
          width={canvasSize} 
          height={canvasSize} 
          style={{
            ...styles.svgOverlay,
            opacity: showControls || dragging !== null || specialDrag !== null ? 1 : 0,
            transition: 'opacity 0.5s ease-in-out',
          }}
        >
          {/* Soft halo glow behind the outer ring - EXPERIMENTAL, remove if not wanted */}
          <defs>
            <filter id="ringHaloBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" />
            </filter>
          </defs>
          <circle
            cx={centerX}
            cy={centerY}
            r={outerRingRadius}
            fill="none"
            stroke="rgba(60,113,129,0.25)"
            strokeWidth={20}
            style={{ 
              filter: 'url(#ringHaloBlur)',
              pointerEvents: 'none',
            }}
          />
          
          {/* Outer ring for Master Volume */}
          <circle
            cx={centerX}
            cy={centerY}
            r={outerRingRadius}
            fill="none"
            stroke={specialHover === 'ring' || specialDrag === 'ring' ? '#3C7181' : 'rgba(60,113,129,0.35)'}
            strokeWidth={specialHover === 'ring' || specialDrag === 'ring' ? 8 : 4}
            style={{
              cursor: 'ew-resize',
              filter: specialHover === 'ring' || specialDrag === 'ring' ? 'drop-shadow(0 0 12px rgba(60,113,129,0.7))' : 'none',
              transition: 'all 0.15s ease-out',
              pointerEvents: 'stroke',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSpecialDrag('ring');
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerEnter={() => setSpecialHover('ring')}
            onPointerLeave={() => setSpecialHover(null)}
          />
          
          {/* Master Volume label */}
          {(specialHover === 'ring' || specialDrag === 'ring') && (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={centerX - 50 * scaleFactor} y={30 * scaleFactor} width={100 * scaleFactor} height={22 * scaleFactor} rx={4} fill="rgba(0,0,0,0.85)" stroke="#3C7181" />
              <text x={centerX} y={45 * scaleFactor} textAnchor="middle" fill="white" fontSize={11 * scaleFactor} fontWeight="bold">
                Volume: {Math.round(snowflakeState.masterVolume * 100)}%
              </text>
            </g>
          )}
          
          {/* Center hexagon for Tension */}
          <polygon
            points={Array.from({length: 6}, (_, i) => {
              const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
              const r = baseRadius * 0.7;
              return `${centerX + Math.cos(angle) * r},${centerY + Math.sin(angle) * r}`;
            }).join(' ')}
            fill={specialHover === 'hexagon' || specialDrag === 'hexagon' ? 'rgba(193,147,10,0.25)' : 'transparent'}
            stroke={specialHover === 'hexagon' || specialDrag === 'hexagon' ? '#C1930A' : 'rgba(244,233,213,0.4)'}
            strokeWidth={specialHover === 'hexagon' || specialDrag === 'hexagon' ? 3 : 2}
            style={{
              cursor: 'nesw-resize',
              filter: specialHover === 'hexagon' || specialDrag === 'hexagon' ? 'drop-shadow(0 0 10px rgba(193,147,10,0.7))' : 'none',
              transition: 'all 0.15s ease-out',
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSpecialDrag('hexagon');
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerEnter={() => setSpecialHover('hexagon')}
            onPointerLeave={() => setSpecialHover(null)}
          />
          
          {/* Tension label */}
          {(specialHover === 'hexagon' || specialDrag === 'hexagon') && (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={centerX - 45 * scaleFactor} y={centerY + baseRadius + 8 * scaleFactor} width={90 * scaleFactor} height={22 * scaleFactor} rx={4} fill="rgba(0,0,0,0.85)" stroke="#C1930A" />
              <text x={centerX} y={centerY + baseRadius + 22 * scaleFactor} textAnchor="middle" fill="white" fontSize={11 * scaleFactor} fontWeight="bold">
                Tension: {Math.round(snowflakeState.tension * 100)}%
              </text>
            </g>
          )}
          
          {MACRO_SLIDERS.map((slider, index) => {
            const value = snowflakeState[slider.key] as number;
            const pos = getProngPosition(index, value);
            const isActive = dragging === index || hovering === index;
            const isWidthActive = draggingWidth === index || hoveringWidth === index;
            const hasReverbSend = !!slider.reverbSendKey;
            const reverbSendValue = hasReverbSend ? (snowflakeState[slider.reverbSendKey!] as number) : 0;
            // Normalize for drag calculation - oceanFilterCutoff is 40-12000Hz, others are 0-1
            const normalizedSendValue = slider.reverbSendKey === 'oceanFilterCutoff' 
              ? (reverbSendValue - 40) / (12000 - 40)
              : reverbSendValue;
            
            return (
              <g key={index}>
                {/* Visible prong line */}
                <line
                  x1={centerX + Math.cos(pos.angle) * baseHexRadius}
                  y1={centerY + Math.sin(pos.angle) * baseHexRadius}
                  x2={pos.x}
                  y2={pos.y}
                  stroke={isWidthActive ? slider.color : (isActive ? slider.color : 'rgba(255,255,255,0.3)')}
                  strokeWidth={isWidthActive ? 8 : (isActive ? 3 : 2)}
                  strokeLinecap="round"
                  style={{ 
                    filter: isWidthActive ? `drop-shadow(0 0 12px ${slider.color})` : (isActive ? `drop-shadow(0 0 8px ${slider.color})` : 'none'),
                    transition: 'all 0.15s ease-out',
                    pointerEvents: 'none',
                  }}
                />
                {/* Wide invisible hit area for reverb send drag (4x wider) */}
                {hasReverbSend && (
                  <line
                    x1={centerX + Math.cos(pos.angle) * baseHexRadius}
                    y1={centerY + Math.sin(pos.angle) * baseHexRadius}
                    x2={pos.x}
                    y2={pos.y}
                    stroke="transparent"
                    strokeWidth={32 * scaleFactor}
                    strokeLinecap="round"
                    style={{ 
                      cursor: 'ew-resize',
                      pointerEvents: 'stroke',
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Store relative position (matching handlePointerMove calculation)
                      const rect = (e.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect();
                      if (rect) {
                        dragStartXRef.current = e.clientX - rect.left;
                        dragStartYRef.current = e.clientY - rect.top;
                      }
                      setDraggingWidth(index);
                      dragStartValueRef.current = normalizedSendValue;
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                    onPointerEnter={() => setHoveringWidth(index)}
                    onPointerLeave={() => setHoveringWidth(null)}
                  />
                )}
                
                {/* Width label - shown when hovering or dragging prong body */}
                {hasReverbSend && (isWidthActive) && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect 
                      x={pos.x - 40 * scaleFactor} 
                      y={pos.y + (pos.y > centerY ? -40 : 20) * scaleFactor} 
                      width={80 * scaleFactor} 
                      height={22 * scaleFactor} 
                      rx={4} 
                      fill="rgba(0,0,0,0.85)" 
                      stroke={slider.color} 
                    />
                    <text 
                      x={pos.x} 
                      y={pos.y + (pos.y > centerY ? -25 : 35) * scaleFactor} 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize={10 * scaleFactor} 
                      fontWeight="bold"
                    >
                      {slider.reverbSendKey === 'oceanFilterCutoff' 
                        ? `Filter: ${Math.round(reverbSendValue / 1000)}kHz`
                        : slider.reverbSendKey === 'reverbDecay'
                        ? `Decay: ${Math.round(reverbSendValue * 100)}%`
                        : `Verb: ${Math.round(reverbSendValue * 100)}%`}
                    </text>
                  </g>
                )}
                
                {/* Handle - larger touch target on mobile */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? handleRadiusActive : handleRadius}
                  fill={slider.color}
                  stroke="white"
                  strokeWidth={2}
                  style={{ 
                    cursor: 'grab',
                    filter: isActive ? `drop-shadow(0 0 12px ${slider.color})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                    transition: 'all 0.15s ease-out',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  onPointerEnter={() => setHovering(index)}
                  onPointerLeave={() => setHovering(null)}
                />
                
                {/* Width crossbar - perpendicular line past the handle for reverb send control */}
                {hasReverbSend && (() => {
                  // Position the crossbar about 1.5 diameters away from the handle circle
                  const handleR = isActive ? handleRadiusActive : handleRadius;
                  const crossbarDistance = handleR * 3.75;  // ~1.5 diameter gap from edge
                  const crossbarCenterX = pos.x + Math.cos(pos.angle) * crossbarDistance;
                  const crossbarCenterY = pos.y + Math.sin(pos.angle) * crossbarDistance;
                  // Perpendicular direction (90 degrees from prong angle)
                  const perpX = -Math.sin(pos.angle);
                  const perpY = Math.cos(pos.angle);
                  // Crossbar length based on width value (shorter range)
                  const baseLength = 12 * scaleFactor;
                  const maxLength = 24 * scaleFactor;
                  const crossbarHalfLength = baseLength + normalizedSendValue * (maxLength - baseLength);
                  
                  return (
                    <>
                      {/* Visible crossbar line */}
                      <line
                        x1={crossbarCenterX - perpX * crossbarHalfLength}
                        y1={crossbarCenterY - perpY * crossbarHalfLength}
                        x2={crossbarCenterX + perpX * crossbarHalfLength}
                        y2={crossbarCenterY + perpY * crossbarHalfLength}
                        stroke={isWidthActive ? slider.color : `${slider.color}99`}
                        strokeWidth={isWidthActive ? 6 : 4}
                        strokeLinecap="round"
                        style={{ 
                          filter: isWidthActive ? `drop-shadow(0 0 8px ${slider.color})` : 'none',
                          transition: 'all 0.15s ease-out',
                          pointerEvents: 'none',
                        }}
                      />
                      {/* Wide invisible hit area for crossbar (easy to tap on mobile) */}
                      <line
                        x1={crossbarCenterX - perpX * (crossbarHalfLength + 10 * scaleFactor)}
                        y1={crossbarCenterY - perpY * (crossbarHalfLength + 10 * scaleFactor)}
                        x2={crossbarCenterX + perpX * (crossbarHalfLength + 10 * scaleFactor)}
                        y2={crossbarCenterY + perpY * (crossbarHalfLength + 10 * scaleFactor)}
                        stroke="transparent"
                        strokeWidth={28 * scaleFactor}
                        strokeLinecap="round"
                        style={{ 
                          cursor: 'ew-resize',
                          pointerEvents: 'stroke',
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = (e.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect();
                          if (rect) {
                            dragStartXRef.current = e.clientX - rect.left;
                            dragStartYRef.current = e.clientY - rect.top;
                          }
                          setDraggingWidth(index);
                          dragStartValueRef.current = normalizedSendValue;
                          (e.target as Element).setPointerCapture(e.pointerId);
                        }}
                        onPointerEnter={() => setHoveringWidth(index)}
                        onPointerLeave={() => setHoveringWidth(null)}
                      />
                      {/* End caps for visual clarity */}
                      <circle
                        cx={crossbarCenterX - perpX * crossbarHalfLength}
                        cy={crossbarCenterY - perpY * crossbarHalfLength}
                        r={3 * scaleFactor}
                        fill={isWidthActive ? slider.color : `${slider.color}99`}
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        cx={crossbarCenterX + perpX * crossbarHalfLength}
                        cy={crossbarCenterY + perpY * crossbarHalfLength}
                        r={3 * scaleFactor}
                        fill={isWidthActive ? slider.color : `${slider.color}99`}
                        style={{ pointerEvents: 'none' }}
                      />
                    </>
                  );
                })()}
                
                {/* Label */}
                <g style={{ pointerEvents: 'none' }}>
                  <text
                    x={pos.x}
                    y={pos.y + (pos.y > centerY ? labelHeight + labelFontSize : -labelHeight + labelFontSize * 0.3)}
                    textAnchor="middle"
                    fill="white"
                    fontSize={labelFontSize}
                    fontWeight="bold"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6)' }}
                  >
                    {slider.label}: {slider.max > 1 ? value.toFixed(1) : Math.round(value * 100) + '%'}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>}
      </div>
      </div>

      {/* Preset popup - appears below the top preset button */}
      {showPresets && (
        <div
          style={{
            position: 'absolute',
            top: Math.max(58, playButtonTop + 50),
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(92vw, 420px)',
            maxHeight: 'min(77vh, 660px)',
            overflow: 'hidden',
            background: disablePresetPopupBlur ? 'rgba(22,21,19,0.94)' : 'rgba(22,21,19,0.72)',
            backdropFilter: disablePresetPopupBlur ? 'none' : 'blur(10px)',
            WebkitBackdropFilter: disablePresetPopupBlur ? 'none' : 'blur(10px)',
            borderRadius: 12,
            padding: 0,
            boxShadow: '0 18px 54px rgba(0,0,0,0.48), inset 0 1px 0 rgba(232,220,196,0.08)',
            border: '1px solid rgba(232,220,196,0.28)',
            zIndex: 30,
          }}
        >
          <div style={{
            padding: '14px 14px 12px',
            borderBottom: '1px solid rgba(232,220,196,0.13)',
            display: 'grid',
            gap: 10,
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{
              color: '#E8DCC4',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>
              Snowflake Load
            </div>
            <div style={{
              color: 'rgba(232,220,196,0.55)',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}>
              {presetTab === 'state' ? 'State' : 'Journey'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 2,
              padding: 2,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(232,220,196,0.16)',
            }}>
              {(['state', 'journey'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPresetTab(tab)}
                  title={tab === 'state' ? 'State presets' : 'Journey presets'}
                  style={{
                    minHeight: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 6,
                    border: '1px solid transparent',
                    background: presetTab === tab ? '#E8DCC4' : 'transparent',
                    color: presetTab === tab ? '#171615' : 'rgba(232,220,196,0.55)',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    fontWeight: 760,
                    letterSpacing: 0,
                  }}
                >
                  <span style={{ fontSize: tab === 'state' ? '1rem' : '1.06rem', lineHeight: 1 }}>
                    {tab === 'state' ? PRESET_PANEL_SYMBOLS.state : PRESET_PANEL_SYMBOLS.journey}
                  </span>
                  <span>{tab === 'state' ? 'State' : 'Journey'}</span>
                </button>
              ))}
            </div>
            <div
              title={presetTab === 'state' ? 'Visible state families' : 'Visible journeys'}
              style={{
                minWidth: 50,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                color: 'rgba(232,220,196,0.66)',
                background: 'rgba(0,0,0,0.14)',
                border: '1px solid rgba(232,220,196,0.12)',
                fontSize: '0.72rem',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {presetTab === 'state' ? statePresetFamilies.length : sortedJourneyPresets.length}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              padding: '0 10px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.18)',
              border: '1px solid rgba(232,220,196,0.16)',
              color: 'rgba(232,220,196,0.48)',
            }}>
              <span style={{ fontSize: '1.02rem' }}>{PRESET_PANEL_SYMBOLS.search}</span>
              <input
                value={presetSearch}
                onChange={(event) => setPresetSearch(event.target.value)}
                placeholder="Search"
                style={{
                  width: '100%',
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: '#F4EFE6',
                  fontSize: '0.84rem',
                  fontFamily: 'inherit',
                }}
              />
              {presetSearch && (
                <button
                  type="button"
                  title="Clear search"
                  onClick={() => setPresetSearch('')}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(232,220,196,0.72)',
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 32px)',
              gap: 4,
              padding: 2,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(232,220,196,0.14)',
            }}>
              {([
                ['updated', PRESET_PANEL_SYMBOLS.updated, 'Sort by updated'],
                ['az', PRESET_PANEL_SYMBOLS.az, 'Sort alphabetically'],
                ['children', PRESET_PANEL_SYMBOLS.children, 'Sort by children'],
              ] as const).map(([sort, symbol, title]) => (
                <button
                  key={sort}
                  type="button"
                  title={title}
                  onClick={() => setPresetSort(sort)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: '1px solid transparent',
                    background: presetSort === sort ? 'rgba(159,194,143,0.18)' : 'transparent',
                    color: presetSort === sort ? '#BFD8B5' : 'rgba(232,220,196,0.55)',
                    cursor: 'pointer',
                    fontSize: sort === 'az' ? '0.68rem' : '0.96rem',
                    fontWeight: 760,
                    lineHeight: 1,
                  }}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
          </div>

          <div style={{
            maxHeight: 'calc(min(77vh, 660px) - 132px)',
            overflowY: 'auto',
            padding: '8px 8px 8px',
          }}>
            {presetTab === 'state' && statePresetFamilies.length === 0 && (
              <div style={{
                height: 104,
                display: 'grid',
                placeItems: 'center',
                color: 'rgba(232,220,196,0.46)',
                border: '1px dashed rgba(232,220,196,0.16)',
                borderRadius: 8,
                fontSize: '0.82rem',
              }}>
                {PRESET_PANEL_SYMBOLS.empty}
              </div>
            )}
            {presetTab === 'state' && statePresetFamilies.map((family) => {
              const hasChildren = family.variants.length > 1;
              const expanded = Boolean(expandedStateFamilies[family.familyId]) || Boolean(presetQuery && hasChildren);
              const familyMatches = family.familyName.toLocaleLowerCase().includes(presetQuery);
              const visibleVariants = presetQuery && !familyMatches
                ? family.variants.filter((variant) => stateVariantMatchesQuery(variant, presetQuery))
                : family.variants;
              const primary = family.variants[0];
              const childCount = Math.max(0, family.variants.length - 1);
              const toggleFamily = () => {
                setExpandedStateFamilies((prev) => ({
                  ...prev,
                  [family.familyId]: !prev[family.familyId],
                }));
              };
              const loadPrimary = async () => {
                if (!primary) return;
                const didLoad = await onLoadPreset(primary);
                if (didLoad !== false) setShowPresets(false);
              };

              return (
                <div
                  key={family.familyId}
                  style={{
                    marginBottom: 8,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.045)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      minHeight: 54,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 11px',
                    }}
                  >
                    <button
                      type="button"
                      title={hasChildren ? 'Show child states' : 'Load state'}
                      onClick={hasChildren ? toggleFamily : loadPrimary}
                      style={{
                        minWidth: 0,
                        minHeight: 34,
                        display: 'grid',
                        gridTemplateColumns: '32px minmax(0, 1fr)',
                        gap: 10,
                        alignItems: 'center',
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        color: '#F2E7D1',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{
                        width: 30,
                        height: 30,
                        borderRadius: 7,
                        display: 'grid',
                        placeItems: 'center',
                        background: hasChildren ? 'rgba(232,220,196,0.12)' : 'rgba(184,224,255,0.10)',
                        color: hasChildren ? '#E8DCC4' : '#B8E0FF',
                        fontSize: '1.08rem',
                      }}>
                        {PRESET_PANEL_SYMBOLS.state}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.9rem',
                          fontWeight: 760,
                        }}>
                          {family.familyName}
                        </span>
                        <span style={{
                          display: 'flex',
                          gap: 8,
                          marginTop: 4,
                          color: 'rgba(232,220,196,0.48)',
                          fontSize: '0.68rem',
                        }}>
                          <span>{presetSourceLabel(primary?.source)}</span>
                          {childCount > 0 && <span>{PRESET_PANEL_SYMBOLS.children} {childCount}</span>}
                          {family.updatedAt > 0 && <span>{formatPresetDate(family.updatedAt)}</span>}
                        </span>
                      </span>
                    </button>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 5,
                    }}>
                      {hasChildren && (
                        <button
                          type="button"
                          title={expanded ? 'Hide child states' : 'Show child states'}
                          aria-label={expanded ? `Hide child states for ${family.familyName}` : `Show child states for ${family.familyName}`}
                          onClick={toggleFamily}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid rgba(232,220,196,0.12)',
                            background: 'rgba(232,220,196,0.06)',
                            color: 'rgba(232,220,196,0.62)',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            fontWeight: 760,
                            lineHeight: 1,
                          }}
                        >
                          {expanded ? PRESET_PANEL_SYMBOLS.collapse : PRESET_PANEL_SYMBOLS.expand}
                        </button>
                      )}
                      <button
                        type="button"
                        title={`Load ${family.familyName}`}
                        aria-label={`Load ${family.familyName}`}
                        disabled={!primary}
                        onClick={loadPrimary}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: '1px solid rgba(159,194,143,0.22)',
                          background: 'rgba(159,194,143,0.10)',
                          color: '#9fc28f',
                          cursor: primary ? 'pointer' : 'default',
                          fontSize: '1rem',
                          fontWeight: 760,
                          lineHeight: 1,
                          opacity: primary ? 1 : 0.45,
                        }}
                      >
                        {PRESET_PANEL_SYMBOLS.load}
                      </button>
                    </div>
                  </div>

                  {hasChildren && expanded && (
                    <div style={{ padding: '0 8px 8px 50px' }}>
                      {visibleVariants.map((variant) => (
                        <button
                          key={`${variant.name}:${variant.variantName ?? ''}`}
                          type="button"
	                          title="Load state"
	                          onClick={() => {
	                            void (async () => {
	                              const didLoad = await onLoadPreset(variant);
	                              if (didLoad !== false) setShowPresets(false);
	                            })();
	                          }}
                          style={{
                            width: '100%',
                            minHeight: 40,
                            display: 'grid',
                            gridTemplateColumns: '16px 1fr auto',
                            gap: 8,
                            alignItems: 'center',
                            marginTop: 5,
                            padding: '8px 10px',
                            borderRadius: 7,
                            border: '1px solid rgba(255,255,255,0.07)',
                            background: 'rgba(0,0,0,0.22)',
                            color: 'rgba(242,231,209,0.86)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontFamily: 'inherit',
                          }}
                        >
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            justifySelf: 'center',
                            background: presetAccentColor(variant.name),
                            boxShadow: `0 0 8px ${presetAccentColor(variant.name)}99`,
                          }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                            }}>
                              {getStatePresetVariantName(variant)}
                            </span>
                            <span style={{
                              display: 'block',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'rgba(232,220,196,0.40)',
                              fontSize: '0.64rem',
                            }}>
                              {variant.name}
                            </span>
                          </span>
                          <span style={{ color: '#9fc28f', fontSize: '0.94rem' }}>{PRESET_PANEL_SYMBOLS.load}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {presetTab === 'journey' && sortedJourneyPresets.length === 0 && (
              <div style={{
                height: 104,
                display: 'grid',
                placeItems: 'center',
                color: 'rgba(184,224,255,0.48)',
                border: '1px dashed rgba(184,224,255,0.18)',
                borderRadius: 8,
                fontSize: '0.82rem',
              }}>
                {PRESET_PANEL_SYMBOLS.empty}
              </div>
            )}
            {presetTab === 'journey' && sortedJourneyPresets.map((preset) => (
              <button
                key={`${preset.library}:${preset.name}`}
                type="button"
                title={journeyPresetHoverTitle(preset)}
                onClick={() => {
                  void onLoadJourneyPreset?.(preset.name);
                  setShowPresets(false);
                }}
                style={{
                  width: '100%',
                  minHeight: 54,
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 8,
                  padding: '10px 11px',
                  borderRadius: 8,
                  border: '1px solid rgba(184,224,255,0.14)',
                  background: 'rgba(184,224,255,0.065)',
                  color: '#E8F0FF',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(184,224,255,0.12)',
                  color: '#B8E0FF',
                  fontSize: '1.08rem',
                }}>
                  <JourneyPresetGlyph preview={preset.journeyPreview} color="#B8E0FF" mutedColor="rgba(184,224,255,0.36)" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.9rem',
                    fontWeight: 760,
                  }}>
                    {preset.name}
                  </span>
                  <span style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 4,
                    color: 'rgba(184,224,255,0.50)',
                    fontSize: '0.68rem',
                  }}>
                    <span>{presetSourceLabel(preset.library)}</span>
                    {preset.versionCount > 1 && <span>{PRESET_PANEL_SYMBOLS.children} {preset.versionCount}</span>}
                    {preset.updatedAt > 0 && <span>{formatPresetDate(preset.updatedAt)}</span>}
                  </span>
                </span>
                <span style={{ color: '#9fc28f', fontSize: '1rem' }}>{PRESET_PANEL_SYMBOLS.load}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom navigation buttons */}
      <div
        style={{
          position: 'absolute',
          bottom: Math.max(10, advancedButtonBottom),
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '23px',
          alignItems: 'center',
        }}
      >
        {onShowVisualizer && (
          <button
            style={{ ...styles.advancedButton, ...styles.visualizerButton }}
            onClick={onShowVisualizer}
            title="Visualizer Mode"
            aria-label="Visualizer Mode"
            {...bindHelp('appVisualizerView')}
          >
            {TEXT_SYMBOLS.visualizer}
          </button>
        )}
        {onShowJourney && (
          <button
            style={styles.advancedButton}
            onClick={onShowJourney}
            title="Journey Mode"
            {...bindHelp('appJourneyView')}
          >
            {TEXT_SYMBOLS.diamond}
          </button>
        )}
        <button
          style={{ ...styles.advancedButton, ...styles.advancedModeButton }}
          onClick={onShowAdvanced}
          title="Advanced Mode"
          aria-label="Advanced Mode"
          {...bindHelp('appAdvancedView')}
        >
          {TEXT_SYMBOLS.sparkle}
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    height: '100dvh',
    width: '100%',
    background: 'linear-gradient(180deg, #100f0e 0%, #171615 40%, #1c1b19 100%)',
    backgroundAttachment: 'fixed',
    overflow: 'hidden',
    padding: 'calc(10px + env(safe-area-inset-top)) calc(5px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(5px + env(safe-area-inset-left))',
    boxSizing: 'border-box',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  snowflakeWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasContainer: {
    position: 'relative',
    touchAction: 'none',
  },
  canvas: {
    borderRadius: '50%',
    // EXPERIMENTAL soft halo edge - original was just the boxShadow below
    // Original: boxShadow: '0 0 60px rgba(100, 150, 220, 0.2), inset 0 0 40px rgba(100, 150, 220, 0.1)',
    boxShadow: `
      0 0 30px rgba(60, 113, 129, 0.3),
      0 0 60px rgba(60, 113, 129, 0.2),
      0 0 100px rgba(60, 113, 129, 0.15),
      0 0 150px rgba(22, 33, 62, 0.4),
      inset 0 0 40px rgba(100, 150, 220, 0.1)
    `,
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
  playButton: {
    padding: '8px',
    fontSize: '1.32rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: '#FFFFFF',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '39px',
    height: '39px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    padding: '0',
    fontSize: '1.65rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: '#ED5A24',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0.8,
    paddingBottom: '5px',
  },
  advancedButton: {
    padding: '10px',
    fontSize: '1.58rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    transition: 'all 0.2s',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    width: '46px',
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerButton: {
    fontSize: '0.92rem',
    lineHeight: 1,
  },
  advancedModeButton: {
    fontSize: '1.38rem',
    fontWeight: 300,
    lineHeight: 1,
    textShadow: '0 2px 6px rgba(0,0,0,0.45)',
  },
};

export default SnowflakeUI;
