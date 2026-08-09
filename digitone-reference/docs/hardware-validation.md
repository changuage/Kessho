# Hardware-validation checklist and unknowns

The workflow makes captures repeatable, but several Digitone behaviors remain
empirical.  Treat every calibration value as provisional until measured on the
target hardware/firmware.

## Capture protocol

1. Record Digitone model, firmware, OS, MIDI port names, sample rate, and
   track/voice state in the capture metadata.
2. Capture the same Sound at least three times and retain every raw `.syx`;
   compare hashes and decoded fields before using a sample as a golden.
3. Render the deterministic MIDI sequence through the instrument and record a
   line-level WAV with fixed gain, clock, and monitoring path.
4. Run `compare` with the raw SysEx path so each WAV can be traced back to its
   bytes and canonical JSON.

For synchronized line capture, use `record-reference`; it schedules the same
note events sent to the native renderer and records the MIDI output, channel,
actual event sample positions, backend-reported latency, and overflow count in
the sidecar metadata. Check the recorded PCM16 peak/RMS before comparing
waveforms so gain or clipping differences are not mistaken for synthesis
behavior.

Use `--relaxed` only to archive/research a future Sound frame whose size or
checksum is not yet recognized. Keep that artifact marked as relaxed and add a
validated fixture before treating the new layout as supported.

## Unknowns requiring hardware measurements

* complete random access semantics for +Drive Sound slots and bank dumps;
* exact SysEx request/response framing across firmware revisions and USB/MIDI
  transports, including timeout and retransmission behavior;
* packed parameter bit ordering, signedness, quantisation, and undocumented
  bytes not represented by the canonical model;
* operator phase, ratio/HARM transfer curves, grouped B1/B2 behavior,
  feedback scaling, and X/Y carrier-mix law;
* envelope time/level curves, velocity/key tracking, retrigger behavior, and
  filter/amp nonlinearities;
* LFO/controller routing depth, smoothing, interpolation, and modulation
  update timing;
* output gain, clipping, sample-rate conversion, stereo image, and any
  firmware-specific oversampling or anti-aliasing.

The comparison tool removes fixed leading latency using a threshold-based
onset measurement and reports both the measured offset and resulting RMS. This
is not phase alignment: manually inspect or add a better calibration sequence
when filters/envelopes make onset detection ambiguous.

Until these are measured, comparisons should report structural metadata and
waveform differences without calling them exact emulation.  Add calibration
tables/curves in the native core or model metadata as evidence arrives; do not
hide a new approximation in the transport or Kessho Lead implementation.
