# macOS MIDI Learn, Routing, and Live-Play Parity Plan

## Scope

This track owns shared TypeScript MIDI Learn/routing contracts and macOS parity preparation. iOS-native files remain out of scope. Native bridge capability remains disabled until the coordinated production evidence batch says otherwise.

## Architecture

- MIDI CC routing is profile data owned by React/TypeScript.
- CoreMIDI emits normalized message objects only; Swift does not own user mappings.
- Learn mode is UI state only: listen, capture the latest CC, assign on a real slider drag, then persist the binding.
- CC movement routes through Product parameter events or dirty-diff style UI patches. It must not request full Product snapshots.
- Live note-on/off is a Product event contract, not slider state. Notes must not reset transport or mutate patterns unless a future explicit record mode requests it.
- Realtime audio buffers must never cross the Capacitor JavaScript bridge. Native audio render prep keeps buffers inside the native callback and uses event queues for MIDI/live notes.

## UI

- A persistent `MIDI LEARN` button is visible in app chrome.
- Active learn mode shows a slim sticky bar.
- Slider headers show MIDI chips for learn, mapped, pickup, multi-map, and conflict states.
- The routing page has Inputs, Routings, Profiles, and Activity tabs with matrix, graph, inspector, conflict, profile import/export, and bounded monitor history.

## macOS Bridge

- CoreMIDI endpoint discovery reports stable IDs, friendly names, manufacturers, connected state, and host timestamps.
- Hotplug refreshes input state.
- Saved input IDs are reconnected by the shared profile/store when the service starts.
- UI activity is throttled in TypeScript so high-rate CC does not flood React state.

## Validation

- `npm run core:midi:mappable-params`
- `npm run core:midi:routing-profile`
- `npm run core:midi:learn-ui`
- `npm run core:midi:cc-product-routing`
- `npm run core:product:live-note-contract`
- `npm run core:product:macos-midi-routing-smoke`
- `npm run core:product:macos-live-note-latency`
- `npm run core:product:macos-midi-live-play-e2e`

Reports are additive under `docs/reports`. Production evidence ledgers are not modified here.
