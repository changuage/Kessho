# Placeholder for Impulse Response Files

This directory can contain impulse response (IR) files for the convolution reverb option.

## Recommended IR Formats
- WAV files (16 or 24 bit)
- 44.1kHz or 48kHz sample rate
- Stereo recommended
- Duration: 1-6 seconds typical

## Example Structure
```
ir/
├── plate.wav
├── hall.wav
├── cathedral.wav
└── dark-hall.wav
```

## Free IR Resources
- [OpenAir](https://www.openair.hosted.york.ac.uk/) - Academic IR library
- [Fokke van Saane](https://fokkie.home.xs4all.nl/IR.htm) - Free reverb IRs
- [Voxengo](https://www.voxengo.com/impulses/) - Free impulse responses

## Note
The default reverb engine is algorithmic and does not require IR files.
Convolution is an optional high-quality alternative.
