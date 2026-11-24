# Harmony redesign: fit within Kessho

Updated 24 November 2026. Proposed integration of the accepted [Harmony, Random and Brain design](harmony-random-brain-design.md). The application has not been changed. Measurements below distinguish existing CSS contracts from proposed component budgets; rendered production fit still needs verification.

## Retain the application frame

Keep the existing navigation, transport, preset management, source colors and two-pane page structure. The redesign changes the contents and disclosure of the Harmony and selected-sequencer panels. It does not introduce a second application shell or another visual theme.

| Area | Existing sizing contract | Integration requirement |
| --- | --- | --- |
| Synth | 1,200px maximum content width; sound pane 460px; 10px gap; sequencer minimum 380px and flexible remaining width | Design the sequencer for roughly 380–730px. A large monitor must not be required to enter a chord. Account for the application's outside padding separately. |
| Global | 1,480px maximum content width; summary/presets column up to 460px; 10px gap; Harmony uses the remaining column | Keep presets/Journey on the left and Harmony/Brain on the right. Reuse the existing wide-screen variant. |
| Narrow page | Both page shells stack at the existing 900px breakpoint | Preserve the responsive page order. Use the actual panel width to reflow its inner controls, including a narrow panel on a wide desktop. |
| Cards | Shared 8px radius, 10px card gap; standard header padding 9px 12px 8px and body padding 10px 12px 12px | Reuse the shared card grammar; avoid another bordered card around each control group. |
| Sliders | Compact rail/thumb 8/12px; compact matrix 6/10px. Comfortable rail/thumb 14/22px; comfortable matrix 10/16px | Inherit the existing slider variant and density policy; these are visible dimensions, not hit-target sizes. |

The Synth shell is defined in [designSystem.css](../../src/designSystem/designSystem.css); Global's shell is in [global.css](../../src/ui/global/global.css). The shared slider owns its geometry in [sliderPrimitive.css](../../src/ui/sliderSystem/sliderPrimitive.css) and density selection in [layout.ts](../../src/ui/sliderSystem/layout.ts). Do not copy these measurements into a new parallel theme.

## Visual language

Use the existing warm charcoal surfaces, cream/soft-white text, quiet borders, 4px-based spacing tokens and system UI font. Global retains `--tab-global`; Synth retains `--tab-synth`. Preserve established source, lane and modulation colors. Color communicates selection, source or musical activity; it does not give every Brain destination a new decorative identity.

Use the existing `--k-fs-*` typography scale. Essential labels and values should generally use `--k-fs-3` through `--k-fs-5` (11.2–12.8px at a 16px root); card titles and the current chord can use the existing larger tokens. Remove the concept prototype's oversized headings, generous outer padding, large rounded tiles and repeated explanatory text. Do not reduce essential labels to the smallest legacy annotation sizes to make the design fit.

New or changed controls use the existing 32px fine-pointer / 44px touch target policy. Retain the current focus styling. Small visible icons and slider rails may have larger effective hit regions, but adjacent hit regions must not overlap. Where an existing local override undersizes a changed control, correct its use of the shared policy instead of adding another exception. Increase keyboard readability and reduce visible key span on small touch screens rather than shrinking targets indefinitely.

### Avoid generic UI patterns

The redesign should look like Kessho, not like a generated dashboard. Every new or changed surface follows these rules. Reviews check for them explicitly.

- **No side-edge colour bars.** No coloured left or right border, or inset shadow stripe, on cards, rows, inspectors or callouts to mark selection or category.
- **No decorative status dots.** No coloured dot before a label just to say "this is role X". Colour identifies content (a hit, a voice, a pad position), not headings.
- **No tinted selection cards.** Selection changes text strength, an existing control's pressed state, or the content area it belongs to, not a pastel box around the item.
- **No nested boxes for grouping.** Use spacing and Kessho's hairline head rules, and keep the existing card grammar rather than a bordered panel inside a card inside a card.
- **No glows or halo rings.** No soft halos, drop-shadow rings or gradient blobs to show focus, selection or "live". Use the existing focus ring and pressed states.
- **No pill-chip defaults.** Toggles and segmented choices use Kessho's 6px control shape and its sage on-state, not fully rounded chips.
- **No uppercase letter-spaced labels.** No small caps or tracking used as section labels; use the `--k-fs-*` scale and weight.
- **No chained middle-dot captions or instructional prose.** Don't use "A · B · C" captions under every heading, or instructional prose printed on the surface. Short values may sit together; explanations go in help, tooltips or first-run guidance.
- **No new palette.** Use Kessho's tokens: charcoal surfaces, cream and soft-white text, 12% borders, sage, clay, slate and the page's tab colour on the card title. Add no new hues, gradients or emoji for decoration.
- **Selected state must read as stronger, not dimmer.** Check every pressed and selected state for contrast against its unselected neighbours.

## Global: one compact performance area

Keep the L4 preset blend and Journey in their existing summary area. Harmony's circle displays their shared route; there is no second morph slider beside Brain. Keep the Mod A/B editors in Global's existing Modulation card. Parameter context controls link to those same sources.

Inside the existing Harmony card:

The Harmony card is **one surface with drawers**. The current Simple / Detail / Overview workspace tabs are removed; their functions move into the resting surface or a drawer, so the live surface never disappears behind a tab.

At rest:

1. A compact header shows the resolved key/scale and current ownership or Journey status.
2. A circle of fifths approximately 180–220px across sits beside a small Brain pad bank when the panel has at least about 560px available. These are proposed budgets, not new global scaling constants. Below that width, stack the pads below the circle; touch layout uses sufficient ring spacing and larger targets. Tapping a key on the circle shapes the root on the live layer; it does not change Home.
3. A short progression strip stays separate from the twelve-key ring. Each event shows `Auto` or its chord name. Key motion is a concise `Held / Drift` control with its details on disclosure.
4. Brain shows three suggested destinations. **All moves** expands the same list to every in-scale destination with the Z X C V B N M shortcuts; there is no separate suggestion grid. A suggestion has three actions only: press to play it on the live layer, **Place** into the selected progression event or Notes cell, and **Save** to the Palette.
5. The **Palette** is one row of saved chord chips (up to 16). Pressing a chip plays it on the live layer; dragging it, or Place, copies it into the selected target.

Drawers, opened one at a time inside the card:

- **Arrange** — progression rows: Add, Duplicate, Move, Delete, duration and `Auto` / Chord per event. There is no chord pool to manage.
- **Voicing** — the Chord editor for the selected progression event. It is the same component as Synth's Notes editor.
- **Generate** — generative policy, source evidence and advanced routing.

While the live layer is engaged, the header shows **Return** and **Keep**. Pads latch by default; holding with a modifier or long-pressing is momentary. Keep is disabled at an intermediate blend, with the reason in its tooltip; Brain stays playable. During an active Journey transition the same pad bank remains visible but unavailable, with one short status. No panel jumps, automatic page changes or duplicated circles. Remove the morph read-only banner; the disabled authoring controls and Journey status carry that state.

## Synth: preserve the subsequencer workspace

Keep sound editing on the left and performance editing on the right. The sequencer has two views, **Part** and **Overview**, over the same musical state. Simple is removed: its Chord Generator and Random Notes controls become Random slots. Do not add another Basic / Advanced switch.

- **Part** (today's Detail) is the selected slot's full editor: its header, type surface and independent sublanes.
- **Overview** is the high-level macros view: all six slots on one screen, one compact row each. Every row edits enable/mute/solo, sound destination, Respond to Brain, type and Random mode, and Print. The existing sequencer chain rail sits at the top. Selecting a row's name opens that slot in Part.

**Overview rows show only what each type uses:**

| Type | Rhythm column | Macro | A–D |
| --- | --- | --- | --- |
| Steps | Trigger toggles | — | Yes |
| Walker, step-grid mode | Trigger toggles | Movement | No |
| Walker on its own clock, Orbit, Random | Recent-note activity | Movement / Speed / Density (Notes) / Wave timing (Chords) | No |

Variations hold Steps patterns and printed takes, so generator rows have no A–D; Print chooses its destination in its own strip. The activity strip draws recent notes from the same generated-event stream that capture uses, refreshed on musical events, not animation frames. When Walker layers route to other sounds, the sound control shows the extra count (for example "Pad 1 +1").

**Subsequencers in Part.** Each slot owns its lanes separately in each variation A–D, and nothing is shared between slots.

- **Lane settings:** every lane, Notes included, has the same three settings: length, direction and Advance (Hits: only audible triggers move it; Steps: every step moves it). This mirrors the engine's existing per-sublane fields.
- **Showing lanes:** Trigger and Notes always show. Other active lanes show as one-line summaries with their shape, length and playhead.
- **Turning lanes on and off:** **Add or turn on a lane** lists the inactive ones: Pitch, Morph, Distance, Nudge, Probability, Ratchet and trig conditions. Probability and Ratchet are lanes with their own length, as in the engine; the Notes editor can still override them for one cell.
- **One detail panel:** tapping a lane label opens one detail panel beneath the lanes. Closing it only collapses the panel, and the lane keeps playing. **Turn lane off** is the separate, explicit way to stop a lane, and it keeps the lane's values.

**Generators in Part.** Random and Orbit replace the lane area with their surface; their parameter motion comes from Mod A/B, not sublanes.

- **Walker trigger modes:** Walker has three: gesture hold, step grid and auto clock.
- **Step-grid mode:** Walker moves on its slot's trigger lane and is thinned by the Probability lane and trig conditions, as the engine does today. So the Walker surface keeps those two lanes visible beneath it.
- **Layer routing:** each Walker layer can route to its own sound, in the anchor and routing details.

Keep the sequencer slot strip, mute/solo, variation rail and independent Trigger, Notes, Expression, Morph, Distance and Nudge lanes. Add Random to the existing type control. Put Notes / Chords beneath it only while Random is selected. The slot strip shows all six uniform slots; at narrow panel widths it wraps to two rows of three rather than hiding any. Remove the unused `scatter` and `chain` members from `SequencerViewMode` along with `simple`.

The selected slot header has source, type and one compact Harmony relationship control. Its detail separates pitch sourcing from Brain participation. Do not repeat Global's full context editor or circle here. Keep live Brain access through a compact shared performance disclosure that opens the same controls and state.

There is one pitch lane, **Notes**; the separate Play/Chords chord-choice lane is removed. Each cell shows a compact mark for a Chord (single note or chord), `H` for Harmony, or empty for Rest. The lane settings hold its length, `Advance: Steps / Hits` and default articulation (Chord · Strum · Arp).

Selecting a Notes cell opens one inline editor immediately beneath that lane. It contains the selected step, chord/note preview, a **Follow / Fixed** toggle, an articulation override, Copy/Place actions and a keyboard using the current key styling. Start with roughly 106–144px key height, matching the existing [live keyboard](../../src/ui/harmony/live/liveChordKeyboard.css). The complete editor can occupy roughly 200–260px depending on wrapping; this is a proposed budget. Closing it returns the space to the lanes.

Plain held keys enter literal notes; held Orchid modifiers temporarily change entry behavior. The four basic shape buttons stay beside/below the keyboard; extensions and voicing open on demand. Literal notes are stored as a Fixed chord; picking a root and shape creates a Follow chord. Edits apply immediately with Undo; there is no Draft or Capture step. Copy from the first Notes cell and Place into the third uses this same editor, and every Place makes an independent copy. Shift-select several cells to edit them together. Global's Voicing drawer reuses this component. Preserve existing keyboard shortcuts, explicit placement, mixed note/chord content and recording access.

Print opens a compact strip in the selected part. Capture progress, destination/fit issues and the resulting take appear in that strip only when relevant. Random, Walker and Orbit replace the selected player's main surface while retaining its header and controls (a step-grid Walker also keeps its Trigger and Probability lanes); printing never adds another permanent pane.

## Fit by reflowing, not scaling the entire interface

Use panel-width-aware layout for the circle/pads, header groups, keyboard and parameter grids. At constrained widths, wrap action groups, move the keyboard below the preview, and expose fewer steps or keys per editing bank with explicit navigation. Preserve full pattern/key access and lengths. A compact overview can still show the whole pattern, while the active edit surface provides usable targets.

Do not place sixteen full chord names in sixteen tiny cells. Use the existing lane marks and compact note/chord indication; the selected cell shows its complete chord name and voicing in the editor. Never truncate essential context without an accessible way to read it. Avoid a permanent right inspector or another independently scrolling pane inside the already narrow sequencer column.

## Reuse and verification

Implement through the current [GlobalPage](../../src/ui/global/GlobalPage.tsx), [HarmonyWorkspace](../../src/ui/harmony/HarmonyWorkspace.tsx), [SynthPage](../../src/ui/synth/SynthPage.tsx), shared card/sequence styles and [shared slider contract](harmony-random-brain-design.md#all-sliders-use-the-existing-shared-architecture). Prefer rearranging and binding existing components over copying prototype markup into production. Limit new styles to layout and the new performance surface.

Verify the redesigned panel at 380px and at its normal desktop widths; verify whole pages at 320, 600, 900, 1,024, 1,280 and 1,500px with actual application padding and browser zoom. Exercise mouse, keyboard and touch; long preset names; eight-note voicings; six active slots; all supported pattern lengths; open entry/Print/Mod panels; Journey disabled/return states; and source/mode switches. Check uncut menus, focus restoration and visible selection after bank navigation.

Use current production controls in the integration review, including dual handles and runtime indicators. Reflow must not remount musical state, reset a generator or multiply subscriptions. Hidden views may stop their visual work; the native performance continues. Motion remains event-driven or uses the existing coalesced indicator path, with reduced-motion support and no decorative animation loops.

The accompanying [fit study](harmony-handoff/prototypes/kessho-panel-fit.html) was rebuilt on 24 November 2026 for the decisions in the design doc. It uses the production slider primitive for the preset morph and for Overview's generator macros.

- **Global:** the circle shapes the root. The three Brain pads latch, with All moves, Return and Keep (endpoint-only). The progression strip shows Auto / Follow / Fixed events. Key motion is Held / Drift. There is a Palette row and Arrange, Voicing and Generate drawers, with progression edits locked at an intermediate blend.
- **Synth Part:** six slots in two rows of three on narrow panels. The Notes editor has Follow / Fixed, Harmony and Rest, plus Copy, Place and Undo. Notes-lane Advance (Hits / Steps) and articulation settings are included, and Expression has its own Advance. The trigger lane labels which Notes cell each hit plays. **Add or turn on a lane** lists every other sublane. The Walker slot shows its step-grid Trigger and Probability lanes.
- **Synth Overview:** all six parts with On, Solo, Print and the chain. Rows are shaped by type: Steps rows show A–D and trigger toggles; the step-grid Walker shows trigger toggles, a macro and "+1" for its routed layer; Random and Orbit rows show activity and a macro.

The keyboard in this study displays the voicing; the full interaction prototype covers live key entry.

A Chromium check on 24 November 2026 exercised eight viewport widths: 320, 390, 600, 768, 900, 1,024, 1,280 and 1,500 CSS pixels. Widths below 768 were emulated as touch devices, so the 44px target rules were active.

- **Panel widths:** the Synth panel measured 292px at 320, 362px on a 390px phone, 506px at 1,024, and 730px in the full desktop layout.
- **Fit:** at every width there was no horizontal page overflow and no clipped control in any of four states. The states were Global with All moves and Arrange open, Synth Part with the Notes editor and every lane panel open, the Walker part, and Synth Overview.
- **Behavior checked:** latching and releasing a pad, root shaping with Keep disabled at 50/50 and working at an endpoint, the Arrange lock at an intermediate blend, copying the first Notes cell into the third, Fixed → Follow conversion, and the Hits / Steps trigger mapping.
- **Not covered:** native audio, preset persistence, production modulation bindings and integration with the complete app remain separate verification work.
