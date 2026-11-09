# Harmony redesign: fit within Kessho

Updated 5 November 2026. Proposed integration of the accepted [Harmony, Random and Brain design](harmony-random-brain-design.md). The application has not been changed. Measurements below distinguish existing CSS contracts from proposed component budgets; rendered production fit still needs verification.

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

## Global: one compact performance area

Keep the L4 preset blend and Journey in their existing summary area. Harmony's circle displays their shared route; there is no second morph slider beside Brain. Keep the Mod A/B editors in Global's existing Modulation card. Parameter context controls link to those same sources.

Inside the existing Harmony card:

1. A compact header shows the resolved key/scale and current ownership or Journey status.
2. A circle of fifths approximately 180–220px across sits beside a small Brain pad bank when the panel has at least about 560px available. These are proposed budgets, not new global scaling constants. Below that width, stack the pads below the circle; touch layout uses sufficient ring spacing and larger targets.
3. A short progression strip stays separate from the twelve-key ring. Key motion is a concise Held / Free walk control with its details on disclosure.
4. Generative policy, source evidence and advanced routing open within the existing detail surface. They do not occupy permanent explanatory panels.

Brain has a stable location and a visible Return to Engine action while engaged. During an active Journey transition the same pad bank remains visible but unavailable, with one short status. No panel jumps, automatic page changes or duplicated circles. Static intermediate blends remain playable under the accepted Brain rule.

## Synth: preserve the subsequencer workspace

Keep sound editing on the left and performance editing on the right. Retain Simple / Detail / Overview as the existing density/navigation mechanism; do not add another Basic / Advanced switch. They expose the same musical state. Overview shows all parts' compact activity; Detail reveals independent sublane settings; Simple keeps the working lanes and relevant entry actions.

Keep the sequencer slot strip, mute/solo, variation rail and independent Trigger, Notes, Expression, Morph, Distance and Nudge lanes. Add Random to the existing type control. Put Notes / Chords beneath it only while Random is selected. Preserve at least six processes: four visible slots plus an expandable remaining pair at narrow panel widths; show all six when they fit. Expansion never disables hidden parts.

The selected slot header has source, type and one compact Harmony relationship control. Its detail separates pitch sourcing from Brain participation. Do not repeat Global's full context editor or circle here. Keep live Brain access through a compact shared performance disclosure that opens the same controls and state.

Selecting a Notes cell opens one inline editor immediately beneath that lane. It contains the selected step, chord/note preview, Copy/Place actions and a keyboard using the current key styling. Start with roughly 106–144px key height, matching the existing [live keyboard](../../src/ui/harmony/live/liveChordKeyboard.css). The complete editor can occupy roughly 200–260px depending on wrapping; this is a proposed budget. Closing it returns the space to the lanes.

Plain held keys enter literal notes; held Orchid modifiers temporarily change entry behavior. The four basic shape buttons stay beside/below the keyboard; extensions and voicing open on demand. Copy from the first trigger and Place into the third uses this same editor. Preserve existing keyboard shortcuts, explicit placement, mixed note/chord content and recording access.

Print opens a compact strip in the selected part. Capture progress, destination/fit issues and the resulting take appear in that strip only when relevant. Random, Walker and Orbit replace the selected player's main surface while retaining its header and controls; printing never adds another permanent pane.

## Fit by reflowing, not scaling the entire interface

Use panel-width-aware layout for the circle/pads, header groups, keyboard and parameter grids. At constrained widths, wrap action groups, move the keyboard below the preview, and expose fewer steps or keys per editing bank with explicit navigation. Preserve full pattern/key access and lengths. A compact overview can still show the whole pattern, while the active edit surface provides usable targets.

Do not place sixteen full chord names in sixteen tiny cells. Use the existing lane marks and compact note/chord indication; the selected cell shows its complete chord name and voicing in the editor. Never truncate essential context without an accessible way to read it. Avoid a permanent right inspector or another independently scrolling pane inside the already narrow sequencer column.

## Reuse and verification

Implement through the current [GlobalPage](../../src/ui/global/GlobalPage.tsx), [HarmonyWorkspace](../../src/ui/harmony/HarmonyWorkspace.tsx), [SynthPage](../../src/ui/synth/SynthPage.tsx), shared card/sequence styles and [shared slider contract](harmony-random-brain-design.md#all-sliders-use-the-existing-shared-architecture). Prefer rearranging and binding existing components over copying prototype markup into production. Limit new styles to layout and the new performance surface.

Verify the redesigned panel at 380px and at its normal desktop widths; verify whole pages at 320, 600, 900, 1,024, 1,280 and 1,500px with actual application padding and browser zoom. Exercise mouse, keyboard and touch; long preset names; eight-note voicings; six active slots; all supported pattern lengths; open entry/Print/Mod panels; Journey disabled/return states; and source/mode switches. Check uncut menus, focus restoration and visible selection after bank navigation.

Use current production controls in the integration review, including dual handles and runtime indicators. Reflow must not remount musical state, reset a generator or multiply subscriptions. Hidden views may stop their visual work; the native performance continues. Motion remains event-driven or uses the existing coalesced indicator path, with reduced-motion support and no decorative animation loops.

The accompanying fit study illustrates placement, colors and disclosure at the existing panel widths. It is not a production screenshot or a replacement for the complete interaction prototype. Its controls are illustrative; audio, recording, live key handling and the production dual-slider bindings require app integration.
