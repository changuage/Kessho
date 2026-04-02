# Kessho Enhancements — Phase 3

This document captures the next major cleanup slice after the immediate CPU/battery fixes.
Phase 3 is about reducing structural risk: bringing TypeScript back under control, shrinking the
largest orchestration files, and standardizing the scheduling and state boundaries that currently
make performance regressions easy to reintroduce.

Designed against the live app as of April 2026.

---

## 1. Goals

**Primary goals**
- Restore TypeScript as a useful safety net instead of a noisy background task.
- Break up the largest mixed-responsibility modules into domain-sized pieces.
- Standardize scheduler behavior for UI-only animation vs background-capable audio state updates.
- Reduce duplicate morph / preset interpolation logic across App, Journey, and page-specific UI.

**Non-goals**
- No major feature redesign in this phase.
- No sound-engine rewrite.
- No “big bang” migration that blocks normal feature work for weeks.

---

## 2. Current Pressure Points

### Type safety debt
- `tsconfig.json` is strict, but the app still carries a large compiler-error backlog.
- `App.tsx` and `engine.ts` rely on many `as unknown as` / `as any` escape hatches.
- Archived code inside `src/` has previously added noise and confusion around what is “real.”

### Module size / mixed responsibilities
- `src/App.tsx` mixes app shell, preset loading, morph orchestration, journey wiring, recording,
  timer logic, tab mounting, and engine sync.
- `src/audio/engine.ts` mixes graph construction, state syncing, scheduler ownership, worklet
  messaging, and subsystem lifecycle.
- `src/ui/DiamondJourneyUI.tsx`, `src/ui/state.ts`, and `src/ui/synth/SynthPage.tsx` are all
  large enough that local reasoning is expensive.

### Inconsistent scheduling
- Some state progression is driven by `requestAnimationFrame`.
- Some progression is driven by `setInterval` / `setTimeout`.
- Audio-relevant background progression and UI-only animation are not consistently separated.

---

## 3. Phase 3 Workstreams

## 3.1 Type Safety Recovery

**Objective**
Reduce the error backlog in controlled slices until `npm run type-check` is usable in day-to-day work.

**Plan**
1. Establish an error-baseline snapshot.
2. Fix one domain at a time instead of touching the entire app at once.
3. Remove casts only after introducing the missing types or helper boundaries that make them unnecessary.

**Suggested slice order**
1. `src/presets/*`
2. `src/ui/delay/*`
3. `src/ui/journeyState.ts` + journey-facing UI wrappers
4. `src/ui/granular/*`
5. `src/App.tsx`
6. `src/audio/engine.ts`

**Concrete tactics**
- Introduce typed helper functions instead of repeated `Record<string, unknown>` coercions.
- Replace broad component casts with explicit shared prop interfaces.
- Add small local helper types for preset serialization / migration / partial state updates.
- Remove dead or archived code from the type-check surface instead of suppressing it.

**Acceptance criteria**
- Type-check errors trend downward by domain, not sideways.
- New code in cleaned domains ships without fresh `as any` / `as unknown as`.
- CI or local scripts can fail on regressions for cleaned domains.

---

## 3.2 App Shell Decomposition

**Objective**
Shrink `src/App.tsx` into an orchestration shell with clearer submodules.

**Target structure**
```text
src/app/
  appShell.tsx
  tabMounts.tsx
  playbackTimers.ts
  morphRuntime.ts
  journeyRuntime.ts
  presetLoading.ts
  recordingRuntime.ts
  engineBindings.ts
```

**Extraction order**
1. Preset loading / import / export helpers
2. Playback timer + recording timer state
3. Morph runtime helpers
4. Journey runtime wiring
5. Tab mount prop adapters

**Notes**
- Keep React state in App initially, but move logic first.
- Only move ownership once types and tests make the extracted boundary safe.

**Acceptance criteria**
- `App.tsx` becomes mostly composition and top-level wiring.
- Morph and journey code no longer live as long inline blocks in the app shell.

---

## 3.3 Engine Boundary Cleanup

**Objective**
Make `src/audio/engine.ts` easier to profile and safer to optimize.

**Target structure**
```text
src/audio/engine/
  AudioEngine.ts
  engineLifecycle.ts
  engineSchedulers.ts
  engineWorklets.ts
  engineRouting.ts
  engineMorphing.ts
  enginePad.ts
  engineLead.ts
  engineGranular.ts
  engineDelay.ts
```

**Plan**
- Extract lifecycle / teardown first.
- Extract scheduler ownership next.
- Extract worklet message building / caching into dedicated helpers.
- Keep one public engine facade so call sites do not all churn at once.

**Acceptance criteria**
- Scheduler code is grouped and searchable in one place.
- Worklet messaging paths are centralized.
- Teardown / startup logic is testable in isolation.

---

## 3.4 Scheduler Policy Unification

**Objective**
Create one clear policy for when work should use RAF, timeouts, or engine-owned time.

**Policy**
- UI-only visuals: run only while visible.
- Background-capable musical progression: use timeout-based progression or engine-owned time.
- Audio parameter smoothing: keep inside the engine or a dedicated runtime helper, not scattered across pages.

**Deliverables**
- Shared scheduling helpers for “visible-only loop” and “background-capable loop.”
- A short README or code comment standard so new loops follow the same rules.

**Acceptance criteria**
- New animation loops do not hand-roll visibility behavior.
- Journey and morph progression share the same scheduling primitives.

---

## 3.5 Preset / Morph Runtime Consolidation

**Objective**
Remove duplicated preset interpolation and dual-range merge behavior.

**Current duplication**
- App auto morph
- App manual/auto morph player
- Journey morph runner
- Preset endpoint handling

**Plan**
- Create one morph runtime module that owns:
  - preset interpolation
  - endpoint handling
  - dual-range merge strategy
  - random-walk ref synchronization
  - preference-key preservation

**Acceptance criteria**
- Journey and global morph use the same interpolation/merge codepath.
- Fixes to endpoint behavior happen in one place.

---

## 4. Delivery Strategy

### Slice A — Safety Foundation
- Exclude archives and dead code from active app surfaces.
- Add baseline docs: current type-check count, current large-file counts, current scheduler map.

### Slice B — Typeable Utility Layer
- Clean `presets/*`, migration helpers, and shared prop helpers.

### Slice C — Runtime Extraction
- Move morph and journey runtime logic out of `App.tsx`.

### Slice D — Engine Split
- Extract scheduler and lifecycle slices from `engine.ts`.

### Slice E — Final Tightening
- Remove remaining broad casts in touched domains.
- Re-profile background CPU and visible-tab CPU after each major extraction.

---

## 5. Guardrails

- No mixed “feature + refactor + performance rewrite” PRs in the same slice.
- Keep behavior parity checks for hidden playback, morph endpoints, and preset restoration.
- Prefer extraction plus tests over rewriting logic during the same pass.
- When a domain is cleaned, treat new `as any` in that domain as a regression.

---

## 6. Exit Criteria

Phase 3 is successful when:
- `App.tsx` and `engine.ts` are materially smaller and more focused.
- The type-check backlog is dramatically reduced and trending toward zero.
- New scheduling code follows shared visibility/background rules.
- Morph and journey logic no longer duplicate the same state-merge patterns in multiple places.
