import type { ManualSynthNoteOptions } from '../../engineSharedTypes';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductDrumTriggerEvent, createCoreProductManualNoteEvent } from '../../coreProductEvents';
import type { SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import {
  drumVoiceIndex,
  manualAuditionState,
  midiFromFrequency,
  requireFiniteRange,
  requireManualNote,
  requirePositive,
  sourceId,
  type RequiredManualSynthNote,
} from '../../CoreProductHostRuntimeGuards';
import type { CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';

export type CoreProductManualAuditionContext = {
  runtime: Pick<CoreProductRuntime, 'audioContext' | 'ensureStarted' | 'postEvent' | 'resume'>;
  assetRegistrar: Pick<CoreProductAssetRegistrar, 'ensurePianoAssetForNote'>;
  latestSliderState: () => Record<string, unknown> | null;
  setLatestSliderState: (state: Record<string, unknown>) => void;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  runtimeReady: () => boolean;
  setRuntimeReady: (ready: boolean) => void;
  applyProductStatePatch: (patch: Record<string, unknown>) => Promise<unknown>;
  applyLatestSnapshotUpdate: (reason: SnapshotReloadReason) => Promise<unknown>;
  recordSoundTrigger: () => void;
  publish: (name: string, ...args: unknown[]) => void;
};

function runtimeCanPostEventsImmediately(context: CoreProductManualAuditionContext): boolean {
  return context.runtimeReady() && context.runtime.audioContext?.state === 'running';
}

function productSourceEnabled(context: CoreProductManualAuditionContext, sourceIdValue: number): boolean {
  return context.latestProductSnapshot()?.sources.some((source) => source.sourceId === sourceIdValue && source.enabled) === true;
}

function productSourcesEnabled(context: CoreProductManualAuditionContext, sourceIds: readonly number[]): boolean {
  return sourceIds.every((sourceIdValue) => productSourceEnabled(context, sourceIdValue));
}

async function ensurePianoAssetsForManualNotes(
  context: CoreProductManualAuditionContext,
  notes: readonly RequiredManualSynthNote[],
): Promise<void> {
  const pending = notes
    .filter((note) => note.source === 'piano')
    .map((note) => context.assetRegistrar.ensurePianoAssetForNote(note.midi, note.velocity));
  if (pending.length > 0) await Promise.all(pending);
}

function postManualSynthNote(context: CoreProductManualAuditionContext, note: RequiredManualSynthNote): void {
  context.recordSoundTrigger();
  context.runtime.postEvent(createCoreProductManualNoteEvent(
    sourceId(note.source),
    note.midi,
    note.velocity,
    note.durationMs,
    note.source === 'pad1' || note.source === 'pad2' ? note.voiceIndex : undefined,
  ));
}

export async function triggerCoreProductDrumVoice(
  context: CoreProductManualAuditionContext,
  voice: unknown,
  velocity: number,
  externalState?: Record<string, unknown>,
): Promise<void> {
  const voiceIndex = drumVoiceIndex(voice);
  const triggerVelocity = requireFiniteRange(velocity, 'drum trigger velocity', 0.000001, 1);
  const post = () => {
    context.recordSoundTrigger();
    context.runtime.postEvent(createCoreProductDrumTriggerEvent(voiceIndex, triggerVelocity));
    context.publish('drumTrigger', voice, triggerVelocity);
  };
  if (runtimeCanPostEventsImmediately(context) && productSourceEnabled(context, CORE_PRODUCT_SOURCE_IDS.drum)) {
    post();
    return;
  }
  const shouldApplyExternalState = Boolean(externalState);
  if (externalState) context.setLatestSliderState({ ...externalState, drumEnabled: true });
  await context.runtime.ensureStarted();
  context.setRuntimeReady(true);
  await context.runtime.resume();
  if (shouldApplyExternalState || !productSourceEnabled(context, CORE_PRODUCT_SOURCE_IDS.drum)) {
    await context.applyLatestSnapshotUpdate('runtime-bootstrap');
  }
  post();
}

export function triggerCoreProductSynthVoice(
  context: CoreProductManualAuditionContext,
  voiceIndex: number,
  frequency: number,
  velocity: number,
  noteDuration = 0.18,
  padParamsOverride?: Record<string, unknown>,
): void {
  if (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex > 7) throw new Error(`Core Product synth trigger voiceIndex must be an integer in [0, 7]: ${String(voiceIndex)}`);
  const midi = midiFromFrequency(frequency);
  const triggerVelocity = requireFiniteRange(velocity, 'synth trigger velocity', 0.000001, 1);
  const durationSeconds = requirePositive(noteDuration, 'synth trigger duration');
  if (padParamsOverride) void context.applyProductStatePatch(padParamsOverride);
  const state = context.latestSliderState();
  const pad2Assign = typeof state?.pad2VoiceAssign === 'number' ? Math.round(state.pad2VoiceAssign) & 0xff : 0;
  const targetSource = state?.pad2Enabled === true && (pad2Assign & (1 << voiceIndex)) !== 0
    ? CORE_PRODUCT_SOURCE_IDS.pad2
    : CORE_PRODUCT_SOURCE_IDS.pad1;
  const post = () => {
    context.recordSoundTrigger();
    context.runtime.postEvent(createCoreProductManualNoteEvent(targetSource, midi, triggerVelocity, durationSeconds * 1000, voiceIndex));
  };
  if (runtimeCanPostEventsImmediately(context)) { post(); return; }
  if (context.runtimeReady()) { void context.runtime.resume().then(post); return; }
  void context.runtime.ensureStarted().then(() => {
    context.setRuntimeReady(true);
    return context.applyLatestSnapshotUpdate('runtime-bootstrap').then(() => context.runtime.resume());
  }).then(post);
}

export async function auditionCoreProductSynthNote(
  context: CoreProductManualAuditionContext,
  note: ManualSynthNoteOptions,
  externalState?: Record<string, unknown>,
): Promise<void> {
  const manualNote = requireManualNote(note);
  const targetSourceId = sourceId(manualNote.source);
  if (runtimeCanPostEventsImmediately(context) && productSourceEnabled(context, targetSourceId)) {
    if (manualNote.source === 'piano') await context.assetRegistrar.ensurePianoAssetForNote(manualNote.midi, manualNote.velocity);
    postManualSynthNote(context, manualNote);
    return;
  }
  const shouldApplyExternalState = Boolean(externalState);
  if (!productSourceEnabled(context, targetSourceId) || shouldApplyExternalState) {
    context.setLatestSliderState(manualAuditionState(manualNote.source, externalState ?? context.latestSliderState() ?? undefined));
  }
  await context.runtime.ensureStarted();
  context.setRuntimeReady(true);
  await context.runtime.resume();
  if (shouldApplyExternalState || !productSourceEnabled(context, targetSourceId)) {
    await context.applyLatestSnapshotUpdate(manualNote.source === 'piano' ? 'manual-piano-asset' : 'runtime-bootstrap');
  }
  if (manualNote.source === 'piano') await context.assetRegistrar.ensurePianoAssetForNote(manualNote.midi, manualNote.velocity);
  postManualSynthNote(context, manualNote);
}

export async function auditionCoreProductSynthNotes(
  context: CoreProductManualAuditionContext,
  notes: ManualSynthNoteOptions[],
  externalState?: Record<string, unknown>,
): Promise<void> {
  const manualNotes = notes.map(requireManualNote);
  const targetSourceIds = manualNotes.map((note) => sourceId(note.source));
  if (runtimeCanPostEventsImmediately(context) && productSourcesEnabled(context, targetSourceIds)) {
    await ensurePianoAssetsForManualNotes(context, manualNotes);
    for (const note of manualNotes) postManualSynthNote(context, note);
    return;
  }
  const shouldApplyExternalState = Boolean(externalState);
  if (!productSourcesEnabled(context, targetSourceIds) || shouldApplyExternalState) {
    let nextState = { ...(externalState ?? context.latestSliderState() ?? {}) };
    for (const note of manualNotes) nextState = manualAuditionState(note.source, nextState);
    context.setLatestSliderState(nextState);
  }
  await context.runtime.ensureStarted();
  context.setRuntimeReady(true);
  await context.runtime.resume();
  if (shouldApplyExternalState || !productSourcesEnabled(context, targetSourceIds)) {
    await context.applyLatestSnapshotUpdate(manualNotes.some((note) => note.source === 'piano') ? 'manual-piano-asset' : 'runtime-bootstrap');
  }
  await ensurePianoAssetsForManualNotes(context, manualNotes);
  for (const note of manualNotes) postManualSynthNote(context, note);
}
