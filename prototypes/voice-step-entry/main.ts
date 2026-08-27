// Stable Vite entrypoint for the mobile voice-step prototype.
// The audition patch transposes Product Core synth audition +12 semitones only;
// detected/visualized/committed sequencer pitch remains unchanged.
import './auditionOctavePatch';

void import('./main-v3');
