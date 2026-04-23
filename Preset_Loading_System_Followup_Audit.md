# Preset Loading System Follow-Up Audit

Date: 2026-04-21

## Goal

Validate whether the immediate course of action should focus on metadata correctness first, or whether the project should jump straight to deeper preset normalization work such as refs and database restructuring.

## Confirmed findings

### 1. The first priority was correctly identified as correctness, not normalization

The follow-up review confirmed that the most urgent problems were not database-shape problems. They were metadata round-trip problems that could lose or mismatch state during normal use.

Confirmed issues:

- `migratePreset()` dropped `synthPitchBindingModes` on load/migration.
- `PresetFamilyTree` only supplied partial live metadata when saving state presets.
- Promoting an older preset version re-saved its data but not its metadata.
- Legacy import and bundled preset loading had additional metadata omissions around `synthPitchBindingModes`.

Conclusion:

- The right immediate course of action was to fix correctness first.
- Refs, overrides, and database normalization remain valid future improvements, but they were not the right first move.

### 2. The broken scope was narrower than “all state saves”, but wider than one tree save path

The review confirmed this split:

- The Capacitor/local state save path already persisted the full metadata set.
- The hierarchical in-app state preset tree was incomplete on save.
- Several load/import paths were also incomplete.

Conclusion:

- The right fix was a targeted metadata audit and repair across all state preset load/save/promotion surfaces, not a blanket rewrite.

## Executed plan

### Implemented

- Restored `synthPitchBindingModes` in `migratePreset()`.
- Added a shared preset metadata helper so state preset metadata is built consistently.
- Added a shared version snapshot helper so version promotion uses the selected version’s data and metadata together.
- Updated `PresetFamilyTree` to use a canonical live metadata callback for state saves.
- Fixed version promotion so it carries the promoted version’s metadata.
- Fixed legacy import to preserve `synthPitchBindingModes`.
- Fixed bundled preset loading to pass through `synthPitchBindingModes`.
- Fixed wrapped cloud preset loading to pass through the full supported metadata set.
- Fixed manual import to use migrated `synthPitchBindingModes` instead of the raw parsed field.
- Added a small regression test runner and targeted metadata regression checks.

### Verified

- `npm run type-check`
- `npm run test:preset-metadata`

Note:

- The regression script still prints the existing `PARAM_REGISTRY has 871 entries, expected 865` runtime assertion from the app code. That pre-existing warning did not block the metadata checks, but it should be cleaned up separately.

## Why this remains the right course

This follow-up confirmed that correctness fixes were the highest-leverage work because they directly affected saved preset fidelity. If refs and normalization had been tackled first, the codebase would still have been carrying active metadata loss and metadata mismatch bugs.

The current order remains the right one:

1. Make metadata round-trip correctly.
2. Make version promotion preserve the selected version faithfully.
3. Lock those flows with regression checks.
4. Revisit refs, subtree overrides, and version-table normalization afterward.

## Deferred work

Still recommended, but intentionally deferred:

- Add real `refs` plus subtree overrides for L3/L4 presets.
- Normalize cloud version storage into a dedicated `preset_versions` table.
- Revisit delta rebasing so long-lived presets do not always compress against the original `v1`.
- Clean up the stale `PARAM_REGISTRY` expected-count assertion.
