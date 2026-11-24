# Kessho Harmony — the instrument knows the way

> Musical design study. Use the recommendation and voice-leading rationale. The accepted design places the live destinations beside the circle and makes Brain a live performance control. [Handoff and precedence](README.md).

Design proposal, 13 October 2026. No application code changes.

Status updated 5 November 2026: this is an earlier interaction study. [Harmony, Random and Brain — accepted UX direction](../harmony-random-brain-design.md) governs the current design, including existing Random behavior as the default, key drift, the L4 fifths route and Brain at held intermediate blends.

The musician chooses a destination. Kessho helps the parts arrive together. One surface combines harmonic navigation, chord construction and musical performance. The intelligence is audible and visible in the notes; it does not need a dashboard.

## Three musical decisions, one instrument

**Choose:** tap a root on the compass or keyboard. In-key input supplies the chord quality. Three subtly outlined destinations offer alternatives. A manual quality or extension remains an intentional override.

**Shape:** four quality pads and four extension pads sit beside one voicing control. The voicing control moves through inversions and registers. Fine tune reveals spacing, bass, exact notes and individual note editing. On-screen pads support sequential taps; simultaneous hardware-style holds are optional shortcuts, never required.

**Perform:** one row selects Chord, Strum, Arp, Pattern or Harp. These articulate the same chord. Each selection exposes its relevant control in the same place. Slop becomes Human within Strum; one/two-octave versions become range settings. They do not become extra pages.

## What Brain contributes

The [OP-XY guide](https://teenage.engineering/guides/op-xy/auxiliary) documents intelligent transposition, automatic/manual key selection and participating-track routing. The [OP-Z master guide](https://teenage.engineering/guides/op-z/master) documents key/mode analysis, strong bass influence, selected-track transposition and programmed chord progressions. These sources do not establish the precise recommendation or voice-leading algorithm, or a rule that releasing a key autonomously chooses another chord. The proposal below defines Kessho's own behavior explicitly.

### Suggest a destination

Use the locked key or a stable estimate from participating, authored MIDI notes before transformation. Weight duration, rhythmic emphasis and bass context. Do not infer the source key from the notes the assistant just generated. If the evidence is weak, retain the previous frame and make manual locking easy. Re-evaluate at phrase boundaries with hysteresis, not after every passing note.

Generate diatonic chord destinations first. Score candidates using common tones, achievable voice movement, compatibility with sustained melody notes, bass direction, recent repetition and phrase position. Harmonic function is a stylistic preference, not a universal law. Modal, ambient and functional presets can use different weighting without becoming separate harmony engines.

Show three distinct choices rather than three near-duplicates. Borrowed chords remain available deliberately. A focus preview explains one concrete reason such as “three notes stay” or “resolves to home.” No invented confidence percentages. Freeze the offered choices during a gesture so targets do not move under the finger.

### Transpose the phrase

“Move phrase” applies a scale-degree displacement to the original phrase. It is non-destructive and non-cumulative. Preserve rhythm, duration, melodic contour and intentional repetitions. Define behavior for chromatic notes explicitly: preserve their alteration relative to the source degree, with an optional stricter in-scale policy. Do not independently snap every note to the closest chord tone.

Harmony parts resolve chord tones and voicings; melodic parts preserve their line; bass respects its chosen root or inversion role. Participating tracks share the destination and timing but retain their roles. Drums and exact-note parts opt out by default. Include a one-gesture return to zero displacement.

### Smooth every change

Smooth runs when a performed, sequenced or already-generated harmony event changes the target. Keep shared notes at the same pitch where practical; minimize other movement within the part's range, spacing, voice-count and bass constraints. Penalize voice crossing and unwanted leaps. Give explicit voicing edits and exact-note locks priority. Keep melody mapping separate from chord inversion search.

For Cmaj7 → Am7, C4–E4–G4–B4 can become C4–E4–G4–A4: three notes stay and B moves down a tone. The bass may separately move C → A. This is the audible result of [common-tone retention and economical voice leading](https://viva.pressbooks.pub/openmusictheory/chapter/jazz-voicings/), not a geometric property of a circle.

“Smooth” selects discrete pitches and articulations. Portamento is a separate sound-design choice. For sustained sounds, retain common tones where the voice architecture permits; for plucked modes, retrigger according to the performance pattern. New voices enter and departing voices release predictably when chord size changes.

When the player releases a temporary live gesture, the underlying phrase has continued. Return to its current harmony at the chosen musical boundary, using the same smooth transition. Latch holds the gesture. Idle time never silently authorizes composing new chords. Kessho's existing automatic progression can continue independently when explicitly enabled.

## The compass's theory

The earlier chromatic compass was a pitch-class clock. Adjacent positions were semitones, and its polygon displayed the chord's pitch-class set. It did not measure harmonic compatibility, register or inversion.

This revision orders roots by fifths: C–G–D–A–E–B–F♯–D♭–A♭–E♭–B♭–F. That gives stable geography for fifth relationships and nearby keys. It still does not rank smoothness: Cmaj7 → Am7 can share more tones than a neighboring root on the ring. Recommendations therefore have their own dotted outlines. The central voice diagram shows actual before/after pitches, with stationary shared notes and sloping moving voices. Exact octaves are available beside the voicing control. A keyboard expands from the same surface for familiar note entry.

The circle uses pitch classes; key-aware spelling should use correct enharmonics in production. Geometry is an orientation aid, never a promise that nearby means better.

## What Orchid contributes

[Orchid Key Mode](https://support.telepathicinstruments.com/hc/en-us/articles/15280829123087-How-to-Use-Key-Mode-for-Easy-Chord-Progressions) lets a root select its diatonic chord. Its [voicing dial](https://support.telepathicinstruments.com/hc/en-us/articles/15292199149839-Voicing-Engine-and-Inversions) moves notes through inversions and octaves. Its [performance modes](https://support.telepathicinstruments.com/hc/en-us/articles/15280943220367-Exploring-Performance-Modes-Arp-Strum-Pattern-and-More) separate articulation from chord choice; notably Pattern preserves a rhythmic sequence as chord size changes. These are the interaction principles to retain.

Orchid's [Simple, Advanced and Free playstyles](https://support.telepathicinstruments.com/hc/en-us/articles/15280843614863-What-s-the-Difference-Between-Playstyles) govern how held keys and chord buttons interact. In Kessho, use one forgiving default: either input order works, changing a modifier updates the chord, and release/latch behavior is explicit. Preserve alternative trigger/retrigger preferences under playing behavior, not as more top-level chord modes.

## Global and synth ownership

Global owns the home key, shared harmony phrase, participating parts and live harmonic displacement. Each synth follows that frame and owns its voicing, range, bass role and performance articulation. Synth step locks can override those values locally. Selecting a step uses the same instrument surface; clearing its lock restores inheritance. Never duplicate the bank or create a second harmonic source of truth.

Retain the existing eight shared chord slots and canonical progression capacity. The four-bar strip in the study is a compact example, not a storage reduction. Auto/Relative/Exact can be expressed through contextual Follow/Keep exact notes controls while preserving the existing semantics. Do not silently rewrite exact-note material.

Kessho already has chord/arp playback, straight/strum articulation and independent chord-choice timing. Expose those more coherently first. Pattern and Harp are proposed extensions; they are not merely renamed current modes. Preserve legacy choice-lane length and clock independently from trigger steps. Existing patterns with different lane lengths must keep their playback. The accepted design replaces the endpoint-only Brain restriction: held intermediate blends are playable; active Journey transitions own the key route and temporarily disable Brain. Preset-bank authoring permissions remain a separate concern.

## Delivery and validation

First consolidate the existing controls and implement one shared voicing resolver for live and scheduled changes. Then add bounded, explainable suggestions and phrase transposition. Add Pattern/Harp after the common performance contract is stable. Capture/print remains explicit and undoable; adopting a new home key is distinct from a temporary transpose gesture.

Compute candidates only when musical context changes, cache them, and keep suggestion analysis off the audio thread. The audio engine consumes a prepared result at a scheduled boundary. Bound voice search and keep a last-good result. Stop graphics when idle or hidden; redraw on musical/UI events. This design should reduce duplicate state and work, not add an always-running analysis loop.

Test musical correctness separately from preference: exact locks survive; two passes do not cause register drift; common tones can remain fixed; melody contour survives transposition; voice count changes release cleanly; local locks and global return are predictable; no stuck notes; legacy polymetric lanes retain timing. In usability sessions, measure whether a new player can create a progression, hear Smooth, add a ninth and lock a strum step without opening a help page. Also test whether they understand the dotted suggestions versus the sounding chord.

The interactive study demonstrates a small deterministic recommendation heuristic, bounded voicing search, chord pads, performance auditions and sequenced transitions. It does not infer a key from Kessho audio, implement the full production melody mapper or route real synth tracks. Its sound is an optional simple audition, not Kessho's engine. No application code was changed.
