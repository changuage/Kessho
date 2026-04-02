# Slider Popup Plan

Date: 2026-03-27

## Goal

Add a reusable upper-right help popup that appears when a user adjusts a slider, and optionally when hovering the active thumb / indicator on desktop. The popup should explain what the control does in two layers:

- A condensed single-sentence summary
- A longer explanation that clearly describes low-value vs high-value behavior

The new source of truth for that copy lives in [src/ui/sliderHelpCatalog.ts](/Users/panguroo/Documents/generativemusic/src/ui/sliderHelpCatalog.ts).

## Recommended Data Shape

Use `paramKey` as the canonical lookup key, but keep page-specific `surfaces` under each key.

Reason:

- The same parameter can appear on multiple pages
- Some surfaces use the shared dual-slider system while others are still native single sliders
- Labels differ by page even when the parameter is the same

The catalog already stores:

- `short`
- `long`
- `surfaces[]` with `page`, `section`, `label`, `dualMode`, and audit notes

## Recommended UI Architecture

1. Add a small help-overlay controller at the App level.
2. Expose a shared `showSliderHelp({ paramKey, page, label })` callback to slider surfaces.
3. Trigger help from:
   - `pointerdown`
   - `focus`
   - `mouseenter` on desktop
   - drag start on dual-slider thumbs / dots
4. Keep the popup pinned while dragging, then fade it out shortly after release.
5. On mobile, skip hover behavior and show only on touch / focus / drag.

## Best Integration Points

Primary shared surfaces:

- [src/App.tsx](/Users/panguroo/Documents/generativemusic/src/App.tsx)
- [src/ui/DualSlider.tsx](/Users/panguroo/Documents/generativemusic/src/ui/DualSlider.tsx)

Custom slider surfaces that will need lightweight adapters:

- [src/ui/earth/EarthPage.tsx](/Users/panguroo/Documents/generativemusic/src/ui/earth/EarthPage.tsx)
- [src/ui/drums/VoiceCard.tsx](/Users/panguroo/Documents/generativemusic/src/ui/drums/VoiceCard.tsx)
- [src/ui/drums/MorphSlider.tsx](/Users/panguroo/Documents/generativemusic/src/ui/drums/MorphSlider.tsx)
- [src/ui/drums/VoiceCardAdvanced.tsx](/Users/panguroo/Documents/generativemusic/src/ui/drums/VoiceCardAdvanced.tsx)
- [src/ui/drums/DrumPage.tsx](/Users/panguroo/Documents/generativemusic/src/ui/drums/DrumPage.tsx)

## Audit Highlights

### Wiring status

1. `padFoldAmount` and `pad2FoldAmount` are wired through the pad WASM worklet.
   Remaining limitation: the legacy JS fallback voices still do not apply wavefolding.

2. `padMorphSpeed` and `pad2MorphSpeed` are now consumed by the pad Auto Morph loop.
   Current behavior: Auto Morph drives the morph slider when that morph control is in its normal single-slider mode.

### Dual-slider coverage limitations

1. Drum master-strip sliders, drum per-voice delay sends, and advanced drum parameter sliders still use native `<input type="range">`.
   They do not share the common dual-slider behavior yet.

2. `randomWalkSpeed`, `cofDriftRate`, `cofDriftRange`, `oceanFilterCutoff`, and `oceanFilterResonance` are all single-only on their current surfaces.

3. Some Earth parameters are walk-only by design in the current code:
   - `waterChannelsMorph`
   - `waterChannelsSpeed`
   - `insects*`
   - `insects2*`

   `App.tsx` forces sample-and-hold back to walk mode for those keys.

## Implementation Notes

- Start by wiring the popup to drag / focus events first. That will cover desktop and mobile reliably.
- Treat hover over the moving dot / thumb as a second-pass enhancement once the core popup is in place.
- Read popup copy from the catalog only. Do not hardcode text in page components.
- For components that still use native range inputs, pass `paramKey` through explicit props or `data-param-key` so they can opt into the same help system.

## Suggested Next Step

Implement the overlay shell first, then wire these surfaces in order:

1. Shared `Slider` + `DualSlider`
2. Earth `ParamSlider`
3. Drum custom sliders
4. Drum native advanced sliders

That sequence gets most of the app covered quickly while keeping the drum-specific cleanup isolated.
