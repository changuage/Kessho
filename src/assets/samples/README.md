# Placeholder for Audio Samples

This directory can contain audio sample files for Paulstretch processing.

## Current Implementation
The Paulstretch worker generates a synthetic input sample at runtime using the seeded RNG. 
This ensures deterministic output without requiring external audio files.

## Adding Custom Samples
To use a custom audio file as the Paulstretch source:

1. Add a short WAV file (2-10 seconds recommended)
2. Modify `src/audio/engine.ts` to load the file:

```typescript
// In triggerPaulstretchRender():
const response = await fetch('/assets/samples/your-sample.wav');
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

// Convert to Float32Arrays for worker
const inputBuffer = [
  audioBuffer.getChannelData(0),
  audioBuffer.numberOfChannels > 1 
    ? audioBuffer.getChannelData(1) 
    : audioBuffer.getChannelData(0)
];
```

## Sample Recommendations
- Ambient textures work best
- Harmonic content in E scales will blend well
- Avoid samples with strong rhythmic elements
- Drone-like sources produce most ethereal results
