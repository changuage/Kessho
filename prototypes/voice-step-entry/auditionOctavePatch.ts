import { WebProductEngine } from '../../src/audio/product/WebProductEngine';

const AUDITION_TRANSPOSE_SEMITONES = 12;

type AuditionNoteOptions = {
  source: string;
  midi: number;
  velocity: number;
  durationMs: number;
};

type PatchedPrototype = WebProductEngine & {
  __voiceStepAuditionOctavePatched?: boolean;
};

const prototype = WebProductEngine.prototype as PatchedPrototype;

if (!prototype.__voiceStepAuditionOctavePatched) {
  const originalAuditionSynthNote = WebProductEngine.prototype.auditionSynthNote;

  WebProductEngine.prototype.auditionSynthNote = function auditionSynthNoteOneOctaveUp(
    options: AuditionNoteOptions,
  ) {
    const transposedMidi = Math.max(
      0,
      Math.min(127, Math.round(options.midi + AUDITION_TRANSPOSE_SEMITONES)),
    );
    return originalAuditionSynthNote.call(this, {
      ...options,
      midi: transposedMidi,
    });
  };

  prototype.__voiceStepAuditionOctavePatched = true;
}
