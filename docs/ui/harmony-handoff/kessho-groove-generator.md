# Kessho Groove — generative drums that print to Steps

> Design proposal, 24 November 2026. No application changes. Part of the [wider redesign proposal](kessho-wider-redesign-proposal.md); subordinate to [Harmony, Random and Brain](../harmony-random-brain-design.md) for the shared slot, lane, print and control rules. Interactive reference: [Groove prototype](prototypes/kessho-groove.html). [Handoff index](README.md).

Groove replaces Scatter as Kessho's generative drum player. It is a player type for drum parts, beside Steps, Walker and Orbit. It plays indefinitely, and any moment of it can be printed into an editable Steps pattern.

## Why Scatter is replaced, not repaired

Scatter (`src/ui/drums/scatter`, `ProductScatterRuntime.cpp`; about 4,750 lines) has structural problems that tuning won't fix:

- **Every hit is re-pitched and re-voiced.** Each phrase forces a pitch spread of at least 8 semitones, capped at ±48 (`SCATTER_PITCH_OFFSET_LIMIT`). Eight `ensure…Variation` calls also force pitch, morph and distance to change between hits. Drums wobble on every hit instead of sounding like a kit.
- **Voices never relate.** Each voice generates its own Euclidean phrase, often 5, 7, 11 or 13 steps long. Kick, click and noise don't interlock, so the result is overlapping polymeters rather than a groove.
- **The controls aren't musical.** A Feel X/Y pad plus Anchor, Breath, Memory, Motion, Fracture and Spread. Feel Y jumps between five zones that change phrase length abruptly.
- **It loops and is edited one voice at a time.** A generated phrase loops, and voices are designed separately.

## Musical model

**Weighted groove maps.** A curated library gives every sixteenth a weight from 0 to 1 for each of four roles:

| Role | Musical job | Default voice |
| --- | --- | --- |
| Anchor | low end, downbeats | Kick (Sub available) |
| Backbeat | body, two and four | Noise |
| Pulse | time feel, subdivisions | Click |
| Color | ghosts, answers, fills | Beep lo |

The maps sit on a 3 × 3 grid with two axes. Columns run from straight to broken, and rows from minimal to driving. The nine maps are Heartbeat, Drift, Rain, Pulse, Glass, Tumble, Motorik, Shuffle and Broken. Maps are data files, so adding a groove needs no code.

**Each role has its own Style.** A role's Style is its own position on that grid, and its weights blend between the four nearest maps. The kick can sit in Heartbeat while the clicks drift toward Tumble. Moving all four positions together keeps the starting relationship between roles. Moving one role changes only that role.

**Each role has its own macros:**

| Macro | Effect |
| --- | --- |
| **Density** | Thresholds the weights: a step plays when its weight clears `1 − density`. Raising density adds the next-strongest hit, so the pattern grows rather than reshuffling. |
| **Variation** | Adds seeded noise of ±Variation/2 to the weights before thresholding. |
| **Accent** | Velocity follows weight, so strong positions play louder. |
| **Humanize** | Small seeded offsets to timing and velocity. |
| **Fill share** | How much this role takes part in fills (Anchor defaults to 0). |

**Shared controls apply to the whole kit:**

- **Master Density** scales every role's Density. It is the part's Overview macro.
- **Variation · all** scales every role's Variation.
- **Memory** (1, 2, 4 or 8 bars) sets how long one variation repeats before the next.
- **Fill** raises density on the last beat of every *n*-th bar (Fill every: 2, 4 or 8). It adds hits and ratchets in proportion to each role's Fill share.
- **Swing** delays the off-beat sixteenths.

Because the maps were written together, roles at nearby Style positions interlock. Spreading roles far apart is a deliberate, audible choice.

**Timbre is fixed by default.** Drums are never re-pitched by the generator. An optional **Color depth**, which starts at 0, adds gentle per-hit filter variation and a few cents of detune.

**Rate.** 1/16; 1/8 (half-time, which suits ambient presets); or 1/8 triplets, where the maps are resampled to 12 steps. Clock source and join policy sit in the part header, as for every part.

**Locks.** Each cell can be forced on, forced off or left free. Locks are part of the authored groove and survive rerolls.

**Reroll** changes the seed offset and keeps every Style, macro and lock.

## Loop: a temporary lock without printing

**Loop** keeps a groove you just heard playing, without writing anything to Steps. It is the drum counterpart of a latched Brain pad: temporary, never saved in the preset, and released at a musical boundary.

- **What it locks:** the **last 1, 2 or 4 bars that actually played**. It works retrospectively, so you lock something after hearing it. The generator keeps a short history of the hits it emitted (up to four bars), and Loop copies the chosen bars from it. What you heard is exactly what repeats, even if you were moving a Style pad during those bars.
- **Engage and release:** Loop engages at the next bar line and repeats those bars in order. **Release** returns to the live groove at the next bar line. The generator keeps its place underneath, so it resumes at the current bar as if it had never stopped, just as Brain's Return rejoins the current harmony.
- **While looping:** edits to Styles, macros, locks and Reroll are kept but not heard until Release. The grid shows the looped bars with a loop outline, and the status line shows "Looping bar k of n".
- **Stopping:** stopping the transport keeps the loop; pressing Play continues it.
- **Print loop:** writes the looped bars straight into a chosen Steps variation through the Print review. There is no capture wait, because the bars are already known. This is the "keep it" path. Release is the "drop it" path.
- **Replaces Hold bar.** One concept for freezing is enough. A 1-bar Loop covers what Hold did, and it locks exactly what was heard.

## Deterministic by construction

Whether a step plays is a pure function: `hit(seed, role, step, variationBar)`, evaluated with that role's Style and macros. The seed comes from the part's stable ID plus its reroll offset, as decided for per-slot randomness. Velocity and timing offsets also depend on the bar. No hidden random state exists, so:

- **Agreement:** preview, playback, printing and scrubbing always agree.
- **Look-ahead:** the grid can show exactly what the next bars will play.
- **Reloading:** a preset reload reproduces the same performance.
- **No ordering coupling:** there is no RNG call-ordering between voices to preserve.

## Interface

**Part surface (resting):**

- **Kit Style pad,** about 190px square, with the map names faintly at their grid points.
  - **Dots:** each role is a coloured dot, and a dashed ring marks their centre.
  - **Dragging:** drag a dot to move one role; drag anywhere else to move all four together, keeping their spacing.
- **Kit macros:** Variation · all, Fill and Swing.
- **Loop box:** 1 / 2 / 4 bars and **Lock last n**. While looping it shows **Release**, **Print loop** and the loop position. Then **Reroll**.
- **Role grid:** four rows (Anchor, Backbeat, Pulse, Color) by 16 or 12 steps. Each row has:
  - **Label:** a colour mark, the role's nearest style and its voices.
  - **Mini Style pad:** 56px, the same state as that role's dot on the kit pad.
  - **Cells.**
  - **Density and Variation** inline.
  - **A ⋯ button** that opens the row's Accent, Humanize and Fill share. One row's panel is open at a time.
  - **Cells:** shading shows the weight; a dot marks a hit in the current bar, and a bar-shaped dot marks a ratchet.
  - **Markers:** a coloured underline shows the fill zone, and an outline the playhead.
  - **Interaction:** tapping a cell cycles force-on → force-off → free. In production, a tap forces on and a long press forces off.
- **Status line:** bar, nearest style, memory and "fill in N bars".

**Drawers, one at a time:**

- **Voices:** a role-to-voice matrix. A role can play several voices, and a voice can serve several roles.
- **Timing:** Rate, Memory and Fill every, plus a pointer to the part header's clock.
- **Color:** Color depth.

**Overview row:** recent-hit activity and the master Density macro, following the Overview rule for generators. It notes when a loop is running.

**At narrow widths:** the kit pad stacks above the kit macros. Each role row puts its label, mini pad and macros on one line, and the cells on the line beneath.

**In production:** every pad and macro uses the shared control system. The mini pads and kit pad are one XY control bound to the same per-role state. Both pad axes and every macro are MIDI-learnable, so a controller can play one role's Style live.

## Printing

Printing uses the shared Print strip and destination rules: choose a variation, keep the take on failure, and Undo. There are two modes:

| Mode | Captures | Result in Steps |
| --- | --- | --- |
| **Performance** (default) | The next 1, 2 or 4 bars exactly as they play, starting at the next bar | One row per voice: triggers, velocity in Expression, humanize offsets in Nudge, fill ratchets in Ratchet. Nothing re-rolls on playback. |
| **Loop** (from the Loop box) | The looped bars, immediately | Exactly as Performance, for the bars you locked. |
| **Pattern** | The groove's model at this moment, immediately | Hits for every eligible step, with a **Probability** lane from the weights (the chance each step clears its threshold under the current Variation). Fill-only steps get a fill condition (`4:4` at Fill every 4). Forced cells print at 100% or not at all. The printed part keeps varying with no generator. |

**Pattern probability.** With Variation *v* and threshold *t*, a free step's probability is `clamp((w + v/2 − t) / v, 0, 1)`. When Variation is 0, it is 1 if *w* > *t* and 0 otherwise.

**Use steps.** This hands the part to Steps with the printed variation selected. Groove's settings stay saved, and **Return to Groove** resumes it.

**Mapping onto the shared model.** Printing writes Steps content through the shared payload. Velocity, offset and ratchet are `ChordNote` fields or lanes. Probability and the fill condition use the Probability and trig-condition lanes from the shared lane model.

## Architecture

- **One native generator instance per drum part,** alongside the per-slot Random instances. The groove maps are bounded data loaded at preset load; the per-step decision is a hash and a compare, with no allocation on the audio thread.
- **Capture:** Performance print taps scheduled events through the shared capture path, as for every generator. Pattern print is computed from the model in the UI layer and committed through the same destination-aware transaction.
- **Loop:** the native instance keeps a bounded ring of the last four emitted bars (hits, velocity, offset, ratchet per role and step). Loop playback reads from a frozen copy of that ring. Release switches back at a bar boundary. Loop state is runtime-only, like the live layer, and is never written to a preset.
- **Drum part shape:** a drum part is a kit. In Steps it shows one row per voice; Groove addresses roles, which map onto voices. The 6 drum lanes that today each target a set of voices become this per-voice row model. Groove's printed rows land in it directly.
- **Delete in the same change:** `src/ui/drums/scatter/*` (`ScatterPage`, `FeelField2D`, the phrase generator and printer, the preview and runtime hooks), `ProductScatterRuntime.cpp` and `ProductScatterRuntimeState.h`, and the Scatter view in `DrumPage`. Scatter state in loaded presets is ignored and dropped on save. Bundled presets only carry inactive Scatter entries.

## Acceptance

1. **Density only adds:** for any style and bar, raising one role's density never removes a hit that role was playing.
2. **Repeatable:** the same seed, part ID, Styles, macros and locks produce the same events on every run and after a preset reload. Reroll changes them; locks survive.
3. **Never re-pitched:** with Color depth at 0, no hit changes pitch or timbre.
4. **Memory and Fill:** *n* repeats a bar's variation for *n* bars. Fill applies only to the last quarter of every *Fill every*-th bar, in proportion to each role's Fill share.
5. **Performance print:** reproduces the captured bars exactly, including humanize timing, velocity and fill ratchets, and preserves other variations.
6. **Pattern print:** yields a Steps part whose long-run hit frequency per step matches the model's probability, and whose fills fire only on their condition.
7. **Return to Groove:** resumes the generator with its settings unchanged after a print.
8. **Fit:** the surface fits the 380px panel with 44px touch targets, and the Overview row follows the generator rule.
9. **Per-role independence:** moving one role's Style, or changing one role's Variation, never changes another role's hits. Dragging the kit pad's background moves all four roles by the same amount.
10. **Loop:** Lock last *n* replays exactly the *n* bars that were heard, from the next bar line, until Release. Edits made while looping don't change what loops. Release returns to the live groove at the next bar line, at the generator's current bar. Print loop writes the looped bars into Steps. Nothing about a loop is saved in the preset.

## Prototype status

The [Groove prototype](prototypes/kessho-groove.html) implements:

- **Generator:** the nine maps; a Style position for each role, on the kit pad (drag one dot or all four) and on each row's mini pad; per-role Density, Variation, Accent, Humanize and Fill share; kit Variation · all, Fill and Swing; Memory, the three rates and locks.
- **Loop:** retrospective 1, 2 or 4 bars, with Release and Print loop.
- **Controls:** Reroll, the role-to-voice matrix and Color depth.
- **Printing and Steps:** both print modes, and a Steps view (used voices by default, all seven on request) with probability and fill-condition labels. The Overview row has activity and a master Density.

It plays a simple synthesized kit that stands in for Kessho's drum engine, and its sliders illustrate placement only; production uses the shared slider. Scripted checks confirmed that:

- **Density** only adds hits.
- **Results** are deterministic.
- **Style pads:** moving one role's Style or Variation leaves the other roles unchanged.
- **Loop** replays the bars heard, ignores edits while looping, and releases to the live groove.
- **Performance and Loop prints** capture exactly what played.
- **Pattern print** writes probabilities and fill conditions. The page had no horizontal overflow at phone and desktop widths. The groove maps are a first draft and should be tuned by ear.
