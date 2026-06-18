# Soundscape Texture Slices

Product Core owns production soundscape texture playback. The Web TypeScript `EarthTexturePlayer` remains the behavioral reference for randomized slice scheduling, not a production fallback.

## Semantics

- Texture-capable nature assets are `ocean`, `birds`, `birds2`, and `frogs`.
- In normal mode, each texture voice starts at a randomized offset inside the registered decoded sample and plays a bounded slice with fade-in/fade-out.
- Texture params are optional. When a snapshot omits them, Product Core uses the same fallback defaults as the scheduler helpers instead of switching to legacy whole-sample playback.
- The parity fixture intentionally disables texture slices and uses deterministic legacy soundscape playback.

## Debug Expectations

For an enabled texture asset in normal mode:

- `useTextureSlices` is true.
- `textureParamsAvailable` reflects whether snapshot params were present.
- `parityFixture` is false.
- `maxOffset` is greater than zero when the asset is long enough for the requested slice duration.
- queued slice offsets vary over time.
- allocator pressure reports `voice budget exceeded` rather than overwriting an active voice.

For short assets, Product Core may still schedule texture voices, but `assetTooShortForRequestedSlice` is true and `maxOffset` is zero. This is a source/metadata or slice-duration issue, not a failed random offset picker.

## Quality Constraints

The scheduler must not hide restart artifacts by shortening fades or routing production audio to Web TS. It should preserve click-safe fades, stable seeds, and predictable block-level CPU work. Low-cost CPU optimizations should cache texture slot/layer/routing values outside the per-sample hot path without changing audible behavior.
