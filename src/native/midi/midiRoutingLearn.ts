import type { SliderState } from '../../ui/state';
import { getMidiMappableParam } from './midiMappableParams';
import { detectMidiRoutingConflicts, type MidiRoutingConflict } from './midiRoutingConflicts';
import {
  createMidiBindingFromCapturedSource,
  type KesshoMidiBindingV2,
  type KesshoMidiRoutingProfileV2,
} from './midiRoutingProfile';
import type { KesshoMidiMessage } from './midiTypes';

export function createMidiBindingFromCapturedSourceAndSlider(
  captured: KesshoMidiMessage,
  targetKey: keyof SliderState,
  existingProfile: KesshoMidiRoutingProfileV2,
  options?: {
    replaceExistingTargetBinding?: boolean;
    allowDuplicateSource?: boolean;
  },
): {
  profile: KesshoMidiRoutingProfileV2;
  binding: KesshoMidiBindingV2 | null;
  conflicts: MidiRoutingConflict[];
} {
  const target = getMidiMappableParam(targetKey);
  const binding = target ? createMidiBindingFromCapturedSource(captured, target) : null;
  if (!binding) {
    return { profile: existingProfile, binding: null, conflicts: detectMidiRoutingConflicts(existingProfile) };
  }

  const replaceTarget = options?.replaceExistingTargetBinding ?? true;
  const nextBindings = [
    binding,
    ...existingProfile.bindings.filter((current) => (
      replaceTarget ? current.target.key !== targetKey : true
    )),
  ];
  const profile = {
    ...existingProfile,
    bindings: nextBindings,
    updatedAt: new Date().toISOString(),
  };
  return {
    profile,
    binding,
    conflicts: detectMidiRoutingConflicts(profile),
  };
}
