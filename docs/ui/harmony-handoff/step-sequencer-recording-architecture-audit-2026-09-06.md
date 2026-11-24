# Step sequencer recording architecture audit

> September diagnostic snapshot. Reuse its failure cases. The later step-printing decision supersedes the editable timed-clip proposal in this audit. [Handoff and precedence](README.md).

Audited 6 September 2026 against the current working tree. This is an architectural audit and implementation proposal; no application behavior was changed. Existing unrelated edits were preserved. Findings below distinguish executable reproductions from conclusions based on tracing the source. No browser listening test, native build, or CPU benchmark was performed.

**Recommendation: make a recorded phrase a collection of timed notes, and make the step grid a view of that phrase.** Keyboard, Orbit, and Walker should feed the same recorder and persist the same note representation. Increasing a grid limit alone will not fix the current timing, duration, collision, and lifecycle problems.

## What exists today

| Input | Recording route | What reaches storage |
| --- | --- | --- |
| Computer keyboard / on-screen keys, live recording | `SynthPage` live-overdub state, using UI playhead position; rewrites the lane on each note | Pitch and derived nudge/trigger arrays; no per-note velocity or release duration |
| Keyboard while generated capture is active | Manual injection into generated capture scratch | Fixed keyboard velocity, integer target step, hard-coded 0.18-second gate; gate later discarded |
| Walker | C++ emitted layer events → capture ring → telemetry history → page polling → scratch → Step conversion | Pitch, velocity repurposed as expression, trigger bitmap, derived nudge; routing and duration discarded |
| Orbit | C++ crossing events → same generated route | Same conversion and losses as Walker |

The generated-event ABI is a useful starting point: it already carries an event ID, absolute sample time, MIDI note, velocity, gate, source identity, and continuous step position. Preserve this strength. The downstream conversion and lifecycle are the main problem.

The ordinary printed Step representation supplies one pitch per pitch-list position, but **the engine is not universally limited to one note per step**. `ProductSequencerState.h:92` holds multi-note overrides; `ProductSequencerRuntimeState.h:7` allows 32 voices per step; `SynthEuclidSequencer.cpp:2295` emits their individual pitches, velocity scales, and offsets. This chord/strum machinery is reusable, but it is not a complete recording model: normal event hold still comes from the lane, routing is lane-owned, and the override writer clamps note velocity to at least 0.05. Do not claim lossless recording simply by connecting capture to these overrides.

## Findings, in implementation priority order

### 1. P1 — Conflicting limits silently discard notes and trigger positions

`commitGeneratedCaptureToEuclid.ts:318` truncates input using `clampEuclideanSubLaneSteps`, whose maximum is **32** (`sequencerLimits.ts:4`). The same converter searches for grids up to **64**. `createBitmapTriggerClip` normalizes through a trigger-step maximum of **32**. C++ lane storage supports up to 64.

Executable probes against the actual exported conversion functions produced:

| Take | Input notes | Committed pitch entries | Requested grid | Stored clip grid | Requested / stored active triggers |
| --- | ---: | ---: | ---: | ---: | ---: |
| 32-step take, notes every 0.75 steps | 40 | 32 | 64 | 32 | 32 / 21 |
| 32-step take, notes at 0 and 0.4 | 2 | 2 | 64 | 32 | 2 / 2 |

This is a concrete mismatch inside one commit object, before considering playback. A pitch list longer than the surviving trigger pattern can cycle over different phrase boundaries.

**Fix:** one validated capacity contract across capture, editing, serialization, event encoding, native snapshots, and playback. Reject an unrepresentable conversion while retaining the take; never silently slice it. Separate note capacity from display-step capacity in the eventual model.

### 2. P1 — Increasing resolution changes the musical duration

The converter rescales note positions when it expands the grid, but neither its local setters nor `generatedCaptureProductCommit.ts` adjusts clock division or tempo multiplier. Playback computes samples per step independently of step count (`SequencerClock.cpp:5`, `SynthEuclidSequencer.cpp:1869`).

The existing regression example converts four steps into eight for notes at 0, 0.25, and 2. Its only numeric parameter changes are Steps, Hits, and Rotation. At unchanged step rate, the loop doubles in duration, and the rescaled onsets stretch with it. More grid cells are not automatically more temporal resolution.

**Fix:** store phrase duration in beats independently from resolution. For an interim grid conversion, multiply the effective step rate by `newSteps / oldSteps`, validate that the engine can represent that rate, and include it in the same commit. The durable solution must not require changing playback tempo to zoom or refine the editor.

### 3. P1 — Recorded gates are lost; velocity changes meaning

Scratch stores `gateSeconds`, but `GeneratedCaptureStepCommit` has no duration field. Playback assigns `event.hold_seconds = lane.hold_seconds` (`SynthEuclidSequencer.cpp:2199`). Short and held notes therefore cannot round-trip through printing.

Captured velocity becomes `expressionValues`. The native Step path calculates `event.velocity` from lane velocity and a voice scale, while `event.expression` is a separate value (`SynthEuclidSequencer.cpp:2026`, `2198`, `2213`). This is not preservation of the original note-on velocity, even if it sometimes creates a similar loudness change.

Keyboard live overdub accepts only MIDI pitch. Keyboard release calls the live-note service, not the recorder (`SynthPage.tsx:6321`). Keyboard injection during generated capture uses a fixed 0.18-second gate.

**Fix:** explicit per-note velocity and duration; pair keyboard note-on/off using note-instance IDs, including repeated same-pitch notes, sustain, cancellation, and release-all. Keep expression as a distinct optional performance parameter. Treat fixed computer-keyboard velocity as an input limitation, not a reason to discard velocity from other inputs.

### 4. P1 — Keyboard collisions replace the performed rhythm

`SynthPage.tsx:483–570` keeps trigger positions only while every recorded note maps to a distinct step. As soon as there is a collision, `synthLiveCaptureTriggerPattern` substitutes a Euclidean pattern, and `synthLiveNudgeValues` returns zeros. One additional fast note can consequently rearrange the whole take. The keyboard path also retains only the first 32 events, and its growing session list has no explicit phrase-cycle replacement policy.

Generated capture uses a different collision policy: grid expansion followed by nearest available step assignment and bounded nudge. That can move notes beyond what the nudge can recover. Simultaneous notes and rapid sequential notes need distinct treatment.

**Fix:** preserve each original onset. Multiple notes at the same time form a chord; multiple onsets inside one display cell remain separate timed notes. Any lossy monophonic conversion must be explicit, with a preview and retained original.

### 5. P1 — Completion depends on another note, and saving has no acknowledgement

`useGeneratedSequenceCapture.ts` advances scratch cycles and detects phrase completion from arriving events. The preview head and stop decision prefer the last captured note. If a phrase ends in silence, “Finishing” can wait for a later note while transport remains running. Empty bars do not provide authoritative completion.

Commit waits a fixed **320 ms** for telemetry, then marks the take committed. `onStepCommit` returns void; `useProductRuntimeSynthPageEvents.ts:110` starts the asynchronous product handoff and only logs failures. The UI can announce “Saved to Step” without confirmed engine acceptance. The local setter path and product patch also apply different resets: the latter clears ratchet, morph, distance, and ranges that the former preserves.

**Fix:** the engine owns capture start/end boundaries and publishes a final event sequence number. Drain through that number, then submit one validated clip transaction and await its revision acknowledgement. Keep the draft on failure. Derive UI state from that result. Eliminate the duplicate commit implementation.

### 6. P1 — Recording durability depends on a visible page

`SynthPage.tsx:4947` consumes capture through `useVisibleInterval`; its default pauses while hidden. Host history retains only 256 events (`CoreProductGeneratedSequencerCaptureTelemetryHistory.ts:4`) and silently drops older ones. Native ring overflow accounting does not report this host-history truncation. The three-event hidden-page regression does not exercise that capacity.

**Fix:** move authoritative ingestion/session ownership to the product runtime. Presentation may pause when hidden; recording must not. Use acknowledged batches or a runtime-owned take buffer with explicit capacity and dropped-event reporting. An engine suspension should end or pause the take explicitly, rather than inventing continued capture.

### 7. P2 — Source and target timing domains are confused

Capture config contains `target_lane_index`, but `maybeCaptureGeneratedFaceEvent` calculates target position from the passed **source lane** (`SynthEuclidSequencer.cpp:1047`). The hook then interprets that value using target-lane step count. Cross-lane printing can be wrong when clocks or origins differ.

The ABI includes `targetSourceId`, but scratch drops it. Walker layers routed to different instruments become notes on the destination lane's instrument without an explicit flattening decision.

**Fix:** timestamp in the shared transport domain, independently from either lane grid. Preserve source identity through capture. Offer “this instrument” or “preserve source parts” when multi-instrument output is printed; only create extra lanes when needed for routing.

### 8. P2 — Loop-edge rounding mixes two cycle conventions

An executable call to `generatedCapturePositionFromAuthoritativeTarget(15.8, null, 16, 0)` returns `{ stepIndex: 0, cycleIndex: 0 }`: the step uses a rounded position, while the cycle uses its unrounded floor. The subsequent nudge conversion can see a near-end timestamp attached to step zero with incompatible neighbors.

**Fix:** preserve continuous phrase time and derive display position separately. If quantizing across a loop boundary, derive both step and cycle from the same quantized absolute position. Test events immediately before and after the boundary, including negative microtiming and notes sustained across it.

### 9. P2 — Arming and count-in use presentation timing

Generated start is armed by observing the UI playhead cross zero (`SynthPage.tsx:5836`); the audio boundary has already happened when that observation reaches React. Keyboard placement likewise uses displayed playheads. `useLiveOverdubRecorder` drives count-in with browser intervals and a separate AudioContext, with a hard-coded four-beat metronome accent during recording.

**Fix:** schedule count-in and capture start against the product transport. UI requests “next bar” or “first note”; engine acknowledges the chosen timestamp. For external keyboard/MIDI input, map the input timestamp into that clock and retain calibrated latency handling.

### 10. P2 — The feedback counts notes, not phrase progress or playable capacity

`captureStepCount` returns event count. The preview marks the last note position and displays collision counts on the original grid; the eventual saved grid can be different. Recorder labels omit bars, total steps, pass number, and capacity. Overflow status falls through to ordinary “Capturing … notes” text.

**Fix:** separate elapsed musical position, note count, occupied cells, resolution, and capacity. Show the planned playback representation before applying it. Never use one number to mean both notes and steps.

## Proposed shared architecture

Use one small recorded-clip type, one recorder, and one playback compiler. Do not introduce a second full DAW framework or an event-sourcing system.

```text
Keyboard note-on/off ─┐
Walker emitted notes ├─ product-clock recorder ─ draft note clip
Orbit emitted notes ─┘                              │
                              validate → commit revision → playback
                                                   │
                                         step / piano-roll views
```

A clip owns its schema version, ID/revision, phrase length in beats, grid preference, and sorted notes. A note owns its ID, onset in beats, duration in beats, pitch, velocity, and optional source part. Preserve capture sample timestamps in the draft for accuracy checking; convert through the transport's tempo mapping rather than applying the current BPM retrospectively to a whole take.

Use beat positions with sufficient precision to compile back to sample-accurate events at the recording tempo. Quantization is an explicit edit, not an automatic loss at ingestion. Changing grid resolution never changes clip duration or original note times. Note-off events must identify their note instance so overlapping same-pitch notes do not release one another accidentally.

Persist absolute recorded pitches by default. “Follow harmony” should be an explicit musical transformation, with the original take retained; do not rely on harmony-relative offsets as the only saved record of what sounded.

Keep existing Euclidean/polyrhythmic generators and their independent control lanes. Their output and recorded clips can converge at the existing native note scheduling layer. For recorded notes, pitch, onset, duration, and velocity travel together; editing a trigger bitmap must not silently change which velocity belongs to which note.

**Granularity and polyphony:** start with a paged 16/32-cell editor and selectable musical divisions, plus a compact piano-roll/detail view for crowded cells. A cell contains zero or more timed notes. A proposed initial capacity is 1,024 notes per clip, subject to desktop and mobile measurement; it is independent of how many cells are visible. Simultaneous notes retain the same onset. A monophonic instrument uses an explicit voice policy, such as last-note priority or arpeggiation, without destroying stored chord notes. Reuse existing chord/strum dispatch where appropriate and extend duration/velocity handling rather than duplicating the scheduler.

## Recording interaction

Default to **one loop, Replace, Preserve timing**, with a visible phrase-length selector. Offer Overdub and Extend as explicit alternatives. Replace is staged until commit; cancel restores the previous clip. The current keyboard “overdub” implementation clears trigger/pitch data while arming, so it does not meet that expectation.

Before recording, show source, destination, phrase length, and grid: **“Walker → Step 2 · 2 bars · 32 cells · 1/16.”**

During recording, show **“Bar 1/2 · Step 11/32 · 23 notes · Pass 1.”** Drive progress through rests from transport. For first-note mode, show “Waiting for first note” until the acknowledged origin exists. For long phrases, show a full-loop overview and a paged detailed grid with clear bar boundaries.

Crowded cells get a note-count badge and open into individual notes, with velocity bars and duration handles. Show a collision warning only for an explicitly requested monophonic export, not for valid polyphony. Refining the grid can change the cell count; it must not change the number of bars.

Use explicit controls: **Finish loop**, **Stop now**, **Cancel**. Finish loop always ends at a known boundary, including silence. Display final saved note count and any capacity error, retain the draft, and provide one-step undo. Keep recording ownership tied to the armed destination when the user changes tabs.

## CPU and maintenance constraints

- Preserve the native bounded ring approach; add session IDs and sequence acknowledgements rather than repeatedly reconciling overlapping telemetry histories.
- Append notes once and track open notes by ID. Current scratch deduplication scans the list and copies arrays for every event; keyboard recording rebuilds lane state on every keypress. Avoid this quadratic growth when increasing capacity.
- Compile and sort off the audio thread. Publish a prepared clip at an audio boundary through the existing control machinery. On the audio thread, advance a cursor over due events; do not scan every note or allocate per callback.
- Keep active voice/note-off work bounded and report overflow. Polyphony has synthesis cost even when event storage is cheap; benchmark dense simultaneous chords separately from long sparse clips.
- Render the visible page and coalesce previews. Throttling rendering must never throttle authoritative recording.
- Consolidate limits and the commit path; remove the keyboard Euclidean collision fallback and nearest-free-step relocation once recorded clips are supported. Keep legacy preset adapters at the boundary instead of maintaining two editable authorities.

## Delivery sequence and acceptance checks

1. **Stop corruption:** expose capacity errors, unify current limits, preserve drafts, fix loop-edge ownership, make completion clock-driven, and acknowledge commits. While the old format remains, do not label unsupported conversions as successfully saved.
2. **Introduce the shared note clip:** support per-note velocity, duration, and multiple onsets per cell; connect keyboard, Walker, and Orbit to it; compile into the existing scheduler. Remove old recording writers when their replacements pass parity checks.
3. **Make recording understandable:** fixed-length one-shot capture, explicit Replace/Overdub/Extend, transport progress, crowded-cell editing, and undo.
4. **Complete persistence and CPU validation:** versioned preset serialization, content hashing, export/import, save/load, native/web snapshot parity, and backward compatibility. Then tune the proposed capacity using measurements.

The release gate should compare the original captured **event stream** with compiled playback: note count, pitch, note-on velocity, onset, duration, and routing. At fixed tempo and with quantization disabled, target onset/duration agreement within one sample after declared origin and input-latency handling. This is a proposed test contract, not a measured guarantee.

Required cases: 33/64/65 notes; simultaneous notes; fast repeats; distinct durations; repeated same pitch with overlapping holds; sustain; silence at phrase end; multiple empty bars; boundaries just below/above loop end; non-4/4 count-in; non-power-of-two phrase lengths; resolution changes without duration changes; different source/destination clocks; hidden UI with more than 256 events; delayed/reordered batches; overflow; cancellation and immediate re-arm; failed commit; tempo change; save/reload; and switching the visible lane during recording.

Run the same capture-to-playback checks for all three inputs. Existing `node scripts/run-generated-sequencer-capture-regression.mjs` passed during this audit, but mostly asserts helper outputs and commit shapes. The native capture tests inspect emitted capture fields; the reviewed tests do not establish a complete record → save → reload → playback fidelity contract. Several helper assertions currently accept grid expansion and collision redistribution without checking elapsed musical time.

**Decision:** retain the engine and scheduling foundations. Replace the lossy conversion of performed notes into bitmap-plus-independent-lists with a shared timed-note clip. That addresses the recurring architectural failures while allowing the familiar step sequencer to become a precise editor for both simple patterns and dense performances.
