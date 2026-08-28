// Stable Vite entrypoint for the mobile voice-step prototype.
// v5 records one PCM take and compares five transcription algorithms against
// the same source. Audition transposition is handled inside the bench so the
// detected/visualized/committed pitch remains independent from test playback.
import './main-v5';
