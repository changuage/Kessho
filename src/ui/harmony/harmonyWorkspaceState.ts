/**
 * Harmony-local authored history.
 *
 * The Global page owns the complete SliderState, but Harmony commands keep a
 * bounded, isolated snapshot history so Undo never rewinds an unrelated page
 * control. Runtime gestures (held notes, previews, focus, and view selection)
 * are deliberately represented as non-authored commands and are no-ops here.
 */

export type HarmonyWorkspaceView = 'simple' | 'detail' | 'overview';

export function harmonyWorkspaceSurfaceForView(view: HarmonyWorkspaceView) {
  return {
    simpleControls: view === 'simple',
    manualVoicing: view === 'detail',
    progressionEditor: view === 'overview',
    performanceSurface: view === 'overview',
  } as const;
}

export type HarmonyAuthoredSnapshot = Readonly<Record<string, unknown>>;

export type HarmonyAuthoredCommand =
  | { type: 'capture'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label?: string }
  | { type: 'suggestion/replace' | 'suggestion/insert' | 'suggestion/assign'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label?: string }
  | { type: 'progression/edit'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label?: string }
  | { type: 'print'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label?: string }
  | { type: 'adopt'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label?: string }
  | { type: 'authored'; before: HarmonyAuthoredSnapshot; after: HarmonyAuthoredSnapshot; label: string }
  | { type: 'held-notes' | 'preview' | 'focus' | 'view/select'; view?: HarmonyWorkspaceView };

export interface HarmonyHistoryEntry {
  id: number;
  command: Exclude<HarmonyAuthoredCommand, { type: 'held-notes' | 'preview' | 'focus' | 'view/select' }>;
  label: string;
}

export interface HarmonyWorkspaceHistoryState {
  present: HarmonyAuthoredSnapshot;
  past: readonly HarmonyHistoryEntry[];
  future: readonly HarmonyHistoryEntry[];
  nextId: number;
}

const TRANSIENT_COMMANDS = new Set<HarmonyAuthoredCommand['type']>([
  'held-notes',
  'preview',
  'focus',
  'view/select',
]);

function authoredCommand(command: HarmonyAuthoredCommand): command is HarmonyHistoryEntry['command'] {
  return !TRANSIENT_COMMANDS.has(command.type);
}

function snapshotsEqual(a: HarmonyAuthoredSnapshot, b: HarmonyAuthoredSnapshot): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && (
    Object.is(a[key], b[key]) || JSON.stringify(a[key]) === JSON.stringify(b[key])
  ));
}

function commandLabel(command: HarmonyHistoryEntry['command']): string {
  if (command.label) return command.label;
  switch (command.type) {
    case 'capture': return 'Capture chord';
    case 'suggestion/replace': return 'Replace suggestion';
    case 'suggestion/insert': return 'Insert suggestion';
    case 'suggestion/assign': return 'Assign suggestion';
    case 'progression/edit': return 'Edit progression';
    case 'print': return 'Print harmony';
    case 'adopt': return 'Adopt harmony';
    case 'authored': return 'Harmony edit';
  }
}

export function createHarmonyWorkspaceHistory(initial: HarmonyAuthoredSnapshot = {}): HarmonyWorkspaceHistoryState {
  return { present: initial, past: [], future: [], nextId: 1 };
}

export function reduceHarmonyWorkspaceHistory(
  state: HarmonyWorkspaceHistoryState,
  command: HarmonyAuthoredCommand,
): HarmonyWorkspaceHistoryState {
  if (!authoredCommand(command) || snapshotsEqual(command.before, command.after)) return state;
  const entry: HarmonyHistoryEntry = {
    id: state.nextId,
    command,
    label: commandLabel(command),
  };
  return {
    present: command.after,
    past: [...state.past, entry],
    future: [],
    nextId: state.nextId + 1,
  };
}

export function undoHarmonyWorkspaceHistory(state: HarmonyWorkspaceHistoryState): HarmonyWorkspaceHistoryState {
  const entry = state.past[state.past.length - 1];
  if (!entry) return state;
  return {
    present: entry.command.before,
    past: state.past.slice(0, -1),
    future: [entry, ...state.future],
    nextId: state.nextId,
  };
}

export function redoHarmonyWorkspaceHistory(state: HarmonyWorkspaceHistoryState): HarmonyWorkspaceHistoryState {
  const entry = state.future[0];
  if (!entry) return state;
  return {
    present: entry.command.after,
    past: [...state.past, entry],
    future: state.future.slice(1),
    nextId: state.nextId,
  };
}

export function harmonyHistoryCanUndo(state: HarmonyWorkspaceHistoryState): boolean {
  return state.past.length > 0;
}

export function harmonyHistoryCanRedo(state: HarmonyWorkspaceHistoryState): boolean {
  return state.future.length > 0;
}

export function harmonyWorkspaceActionsEnabled(morphReadOnly: boolean): boolean {
  return !morphReadOnly;
}

export function harmonyWorkspaceActionsLocked(morphReadOnly: boolean, projectionMorphLocked: boolean): boolean {
  return morphReadOnly || projectionMorphLocked;
}

/** Convenience helper for callers that already have a before/after snapshot. */
export function recordHarmonyAuthoredCommand(
  state: HarmonyWorkspaceHistoryState,
  type: Exclude<HarmonyAuthoredCommand['type'], 'held-notes' | 'preview' | 'focus' | 'view/select'>,
  before: HarmonyAuthoredSnapshot,
  after: HarmonyAuthoredSnapshot,
  label?: string,
): HarmonyWorkspaceHistoryState {
  return reduceHarmonyWorkspaceHistory(state, { type, before, after, ...(label ? { label } : {}) } as HarmonyAuthoredCommand);
}
