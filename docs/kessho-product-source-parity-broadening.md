# Product Core Source Parity Broadening

This gate keeps the next migration pass focused on Product Core-owned source behavior instead of moving preset interpretation back into web or native hosts.

## Covered

- Pad preset family probes: generated metadata now asserts all 24 Pad presets carry exact Product Core Pad patch data, and representative Pad presets render through Product Core.
- Pad 2 probes: representative generated Pad preset render checks run for both Pad 1 and Pad 2.
- Broader Lead preset probes: `LeadSoftRhodes` and `LeadGamelan` render and produce distinct Product Core output through both Lead 1 and Lead 2.
- Drum source probes: `DrumDefault` generated patch metadata and render output remain covered, along with generated drum voice preset morph selection.
- Piano asset probes: Product Core reports missing piano assets instead of faking host playback, renders registered host-decoded piano buffers, selects nearest registered piano samples, and preserves stereo channel behavior.
- Soundscape asset probes: Product Core reports missing soundscape assets, renders looped and layered host-decoded soundscape buffers, crossfades loop boundaries, randomizes deterministic starts, and applies texture spread policy.
- Representative full-arrangement probe: Product Core renders a mixed Pad/Lead/Drum/Piano/Soundscape scene with registered piano and soundscape buffers and verifies source stems plus preset telemetry.

## Guardrail

`npm run core:product:source-parity` statically verifies that the broad source tests, asset probes, and this status document remain present. The behavioral coverage runs through `npm run core:product:sources` and `npm run core:product:assets`, both of which are part of `npm run core:product:ci`.

## Remaining Work

- Broader web-vs-Product sonic parity still needs acceptance-corpus probes beyond the focused default Pad and `lead-manual-dry` checks.
- Piano and soundscape production asset packaging, native decode matrix, and scene-level nature policy depth remain part of the later asset/native release gates.
- Exact Pad/Lead/Drum patch bridges remain temporary compatibility fields until generated preset IDs plus user overrides fully reconstruct source state across web and native.
