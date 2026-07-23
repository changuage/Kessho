# Unified Harmony baseline

Recorded on 2026-07-24 from branch `feature/unified-harmony-workspace`.

## Baseline validation

All required baseline commands passed:

- `npm install`
- `npm run type-check`
- `npm run test:synth-play-controls-ui`
- `npm run test:live-note-input`
- `npm run test:preset-sequencer-components`
- `npm run test:product-snapshot-policy`
- `npm run core:product:architecture`
- `npm run architecture:projection-unification`

`npm install` reported 9 audit findings (1 low, 1 moderate, 6 high, and
1 critical). Dependency remediation is outside this implementation plan.

The Synth Play controls browser regression passed at 1440×1200 and 390×844.
Both viewports rendered 16 steps, 16 muted controls, 8 output controls, and
the same eight chord labels.

## Reference inventory

The following searches were used before implementation:

```sh
rg -n 'Seq 5|seq5|seq 5|synthChordSequencer|synthChordGenerator' src scripts wasm native
rg -n 'chordProgression[A-Za-z]*' src scripts wasm native
rg -n 'synthArpConfigs|arpConfigs' src scripts wasm native
```

- Seq 5 / legacy chord generator references span 40 files. The main
  production surfaces are `src/ui/state.ts`, `src/ui/synth/SynthPage.tsx`,
  `src/App.tsx`, preset metadata/ownership code, Product Core host/runtime
  bindings, and the dedicated `src/audio/synthChordSequencer.ts` module.
- Old numeric `chordProgression*` references span 19 files. Authority is
  duplicated across authored state, `App.tsx`, the web reference engine,
  Product Core host projection/snapshot code, arrangement scheduling, and
  the legacy helpers in `src/audio/harmony.ts`.
- `synthArpConfigs` / `arpConfigs` references span 12 files. The persisted
  key flows through preset metadata, sequencer content extraction/restore,
  `App.tsx`, `useSynthPageSequencerBridge.ts`, and `SynthPage.tsx`.

## Current UI and behavior notes

- Harmony is a single monolithic `HarmonyEnginePanel.tsx` plus its stylesheet.
  It owns root/scale controls, Manual Voicing, Chord Lab, eight slots, the
  Harmony sequence, capture/preview controls, and keyboard shortcuts.
- Seq 1–4 already expose a Chord matrix backed by global Harmony slots, but
  `SynthPage.tsx` reconstructs a partial Harmony context locally and resolves
  Play patterns into UI-side step-note overrides.
- Seq 5 appears as `Seq 5 · Chord/Arp` and has separate authored state,
  routing, clock, scheduler, telemetry, Product Core bindings, and presets.
- Morph endpoint state already exists for Harmony slot banks and sequences,
  but there is no single projection that exposes endpoint ownership,
  read-only state, an effective live layer, and a continuous morph plan to
  both Harmony and Seq UI.
- The current responsive Synth Play regression is the visual baseline for
  desktop and mobile. No production behavior changed in this milestone.
