import type { KesshoMidiEndpointInfo } from '../midiTypes';
import { MIDI_CONTROLLER_MANIFESTS } from './controllerManifests';
import type { MidiControllerManifest } from './controllerSurfaceTypes';

export type MidiControllerManifestMatch = {
  manifest: MidiControllerManifest;
  score: number;
};

function patternMatches(patterns: readonly RegExp[] | undefined, text: string): boolean {
  return !!patterns?.some((pattern) => pattern.test(text));
}

export function scoreMidiControllerManifest(
  manifest: MidiControllerManifest,
  input: KesshoMidiEndpointInfo,
): number {
  const name = `${input.name} ${input.displayName ?? ''}`.trim();
  const manufacturer = input.manufacturer ?? '';
  let score = 0;

  if (patternMatches(manifest.matcher.namePatterns, name)) score += 100;
  if (patternMatches(manifest.matcher.manufacturerPatterns, manufacturer)) score += 30;
  if (input.transport && manifest.matcher.preferredTransports?.includes(input.transport)) score += 10;
  if (input.isBluetooth && manifest.matcher.preferredTransports?.includes('bluetooth')) score += 5;

  return score;
}

export function matchMidiControllerManifests(
  input: KesshoMidiEndpointInfo,
): readonly MidiControllerManifestMatch[] {
  return MIDI_CONTROLLER_MANIFESTS
    .map((manifest) => ({ manifest, score: scoreMidiControllerManifest(manifest, input) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function resolveMidiControllerManifest(
  input: KesshoMidiEndpointInfo,
): MidiControllerManifest | null {
  return matchMidiControllerManifests(input)[0]?.manifest ?? null;
}
