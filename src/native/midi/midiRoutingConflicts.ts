import { sameMidiControlSource } from './midiTypes';
import type { KesshoMidiBindingV2, KesshoMidiRoutingProfileV2 } from './midiRoutingProfile';

export type MidiRoutingConflictKind = 'duplicate-target' | 'duplicate-source' | 'disabled-target';

export type MidiRoutingConflict = {
  kind: MidiRoutingConflictKind;
  severity: 'warning' | 'error';
  bindingIDs: string[];
  message: string;
};

export function detectMidiRoutingConflicts(profile: KesshoMidiRoutingProfileV2): MidiRoutingConflict[] {
  const conflicts: MidiRoutingConflict[] = [];
  const enabledBindings = profile.bindings.filter((binding) => binding.enabled);

  for (const binding of enabledBindings) {
    const sameTarget = enabledBindings.filter((candidate) => (
      candidate.id !== binding.id && candidate.target.key === binding.target.key
    ));
    if (sameTarget.length > 0 && !conflicts.some((conflict) => conflict.kind === 'duplicate-target' && conflict.bindingIDs.includes(binding.id))) {
      conflicts.push({
        kind: 'duplicate-target',
        severity: 'warning',
        bindingIDs: [binding.id, ...sameTarget.map((item) => item.id)].sort(),
        message: `${binding.target.label} has multiple MIDI sources.`,
      });
    }

    const sameSource = enabledBindings.filter((candidate) => (
      candidate.id !== binding.id && sameMidiControlSource(candidate.source, binding.source)
    ));
    if (sameSource.length > 0 && !conflicts.some((conflict) => conflict.kind === 'duplicate-source' && conflict.bindingIDs.includes(binding.id))) {
      conflicts.push({
        kind: 'duplicate-source',
        severity: 'warning',
        bindingIDs: [binding.id, ...sameSource.map((item) => item.id)].sort(),
        message: `${formatBindingSource(binding)} controls multiple targets.`,
      });
    }
  }

  return dedupeConflicts(conflicts);
}

export function conflictsForBinding(
  bindingID: string,
  conflicts: readonly MidiRoutingConflict[],
): MidiRoutingConflict[] {
  return conflicts.filter((conflict) => conflict.bindingIDs.includes(bindingID));
}

function formatBindingSource(binding: KesshoMidiBindingV2): string {
  const number = typeof binding.source.number === 'number' ? ` ${binding.source.number}` : '';
  const channel = typeof binding.source.channel === 'number' ? ` Ch ${binding.source.channel + 1}` : '';
  return `${binding.source.kind}${number}${channel}`;
}

function dedupeConflicts(conflicts: MidiRoutingConflict[]): MidiRoutingConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.kind}:${conflict.bindingIDs.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
