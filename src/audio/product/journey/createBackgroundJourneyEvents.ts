import type { CoreProductEvent } from '../../coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import type { ProductSceneInterpolation } from '../scene/compileProductSceneProgram';
import type { BackgroundJourneyPlan } from './compileBackgroundJourneyPlan';

const NO_PROGRAM = 0xffff;
const MAX_U64 = (1n << 64n) - 1n;

const interpolationIds: Record<ProductSceneInterpolation, number> = {
  linear: 0,
  log: 1,
  'discrete-a': 2,
  'discrete-b': 3,
  'enable-gate': 4,
};

function frameChunks(value: bigint): [number, number, number, number] {
  if (value < 0n || value > MAX_U64) throw new RangeError(`Journey frame value is outside uint64: ${value}`);
  return [0n, 16n, 32n, 48n].map((shift) => Number((value >> shift) & 0xffffn)) as [number, number, number, number];
}

function packedProgramSlot(programIndex: number, slot: number): number {
  if (!Number.isInteger(programIndex) || programIndex < 0 || programIndex >= 20) throw new RangeError('Journey transition program index is outside capacity');
  if (!Number.isInteger(slot) || slot < 0 || slot > 0xffff) throw new RangeError('Journey transition slot is outside capacity');
  return (programIndex << 16) | slot;
}

export function createCoreProductJourneyScheduleEvents(plan: BackgroundJourneyPlan): CoreProductEvent[] {
  if (plan.entries.length < 1 || plan.entries.length > 512 || plan.transitionPrograms.length > 20) {
    throw new RangeError('Journey plan exceeds Product Core capacity');
  }
  const events: CoreProductEvent[] = [{
    eventKind: KESSHO_PRODUCT_EVENT_IDS.BeginJourneySchedule,
    targetId: plan.rngStateAfterPlan >>> 0,
    value: plan.entries.length,
    value2: plan.transitionPrograms.length,
    value3: plan.loopStartIndex === null ? 0 : plan.loopStartIndex + 1,
    flags: plan.revision >>> 0,
  }];
  plan.entries.forEach((entry, index) => {
    const hold = frameChunks(entry.holdFrames);
    const morph = frameChunks(entry.morphFrames);
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEntryHold,
      targetId: entry.fromNodeIndex | (entry.toNodeIndex << 8),
      index,
      paramId: entry.transitionProgramIndex < 0 ? NO_PROGRAM : entry.transitionProgramIndex,
      value: hold[0], value2: hold[1], value3: hold[2], value4: hold[3],
      flags: entry.flags >>> 0,
    });
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEntryMorph,
      index,
      value: morph[0], value2: morph[1], value3: morph[2], value4: morph[3],
    });
  });
  plan.transitionPrograms.forEach((program, programIndex) => {
    if (program.unsupportedKeys.length > 0) throw new Error(`Unsupported Journey transition: ${program.unsupportedKeys.join(', ')}`);
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.BeginJourneyTransitionProgram,
      index: programIndex,
      value: program.entries.length,
      value2: program.boundaryCommands.length,
      flags: program.revision >>> 0,
    });
    program.entries.forEach((entry, slot) => events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyTransitionEntry,
      targetId: entry.targetId,
      index: packedProgramSlot(programIndex, slot),
      paramId: entry.paramId,
      value: entry.valueA,
      value2: entry.valueB,
      value3: entry.threshold,
      value4: entry.eventKind,
      flags: interpolationIds[entry.interpolation] | (entry.index << 8),
    }));
    program.boundaryCommands.forEach((command, slot) => {
      const commandEvent = command.event;
      events.push({
        eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyTransitionCommandHeader,
        targetId: commandEvent.targetId ?? 0,
        index: packedProgramSlot(programIndex, slot),
        paramId: commandEvent.paramId ?? 0,
        value: commandEvent.index ?? 0,
        value2: command.threshold,
        value3: commandEvent.eventKind,
        value4: command.direction === 'forward' ? 1 : 2,
        flags: commandEvent.flags ?? 0,
      });
      events.push({
        eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyTransitionCommandValues,
        index: packedProgramSlot(programIndex, slot),
        value: commandEvent.value ?? 0,
        value2: commandEvent.value2 ?? 0,
        value3: commandEvent.value3 ?? 0,
        value4: commandEvent.value4 ?? 0,
      });
    });
    events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitJourneyTransitionProgram, index: programIndex });
  });
  events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitJourneySchedule });
  return events;
}

export function createCoreProductJourneyScheduleEnabledEvent(enabled: boolean): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEnabled, value: enabled ? 1 : 0 };
}
