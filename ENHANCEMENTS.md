# Kessho Enhancements Roadmap

This document tracks planned enhancements and their implementation status.

---

## Euclidean Sequencer Enhancement

### Overview
Transform the Euclidean sequencer from a lead-synth-only feature into a versatile multi-source polyrhythmic tool with its own dedicated menu.

### Current State (IMPLEMENTED ✓)
- Euclidean sequencer has probability and source controls per lane
- Can trigger Lead Synth OR individual Synth voices (1-6)
- 4 lanes with: steps, hits, rotation, preset, note range, level, probability, source
- Master enable and tempo controls
- Synth chord sequencer can be toggled off

---

### Phase 1: Probability Hit Parameter + Separate Menu

#### 1.1 Add Probability Hit Parameter ✓
- [x] **State**: Add `leadEuclid[1-4]Probability` to `SliderState` (0-1, default 1.0)
- [x] **Engine**: Modify `scheduleLeadMelody()` to check probability before scheduling each hit
- [x] **UI**: Add probability slider to each lane in the Euclidean section
- [x] **Presets**: STATE_KEYS updated to include probability

#### 1.2 Move Euclidean to Separate Menu ✓
- [x] **UI**: Create new collapsible "Euclidean Sequencer" panel in App.tsx
- [x] **UI**: Remove Euclidean controls from Lead Synth section
- [x] **UI**: Add visual indicator showing which sound sources are active

---

### Phase 2: Multi-Source Sound Selection ✓

#### 2.1 Add Sound Source Selection Per Lane ✓
- [x] **State**: Add `leadEuclid[1-4]Source` to `SliderState` 
  - Values: `'lead'` | `'synth1'` | `'synth2'` | `'synth3'` | `'synth4'` | `'synth5'` | `'synth6'`
  - Default: `'lead'`
- [x] **UI**: Add source dropdown to each lane
- [x] **Engine**: Route Euclidean triggers to appropriate sound source

#### 2.2 Implement Source Routing Logic ✓

**Lead Synth Source Behavior:**
- [x] Euclidean mode already disables the random lead sequencer when enabled

**Synth Voice Source Behavior:**
- [x] When a lane selects `'synthN'` as source:
  - Triggers that specific synth voice independently
  - Existing synth chord sequencer can be toggled
  
- [x] **State**: Add `synthChordSequencerEnabled` boolean (default: true)
  - When `false`: Synth voices only play from Euclidean triggers
  - When `true`: Normal chord changes continue + Euclidean overlays additional notes

#### 2.3 Engine Modifications ✓
- [x] Create `triggerSynthVoice(voiceIndex, frequency, velocity)` method
- [x] Modify Euclidean scheduling to check `source` per lane
- [x] Add `synthChordSequencerEnabled` check in `onPhraseBoundary()` and initial chord application

---

### State Changes Summary (IMPLEMENTED)

```typescript
// New properties for SliderState:
interface SliderState {
  // ... existing ...
  
  // Phase 1: Probability
  leadEuclid1Probability: number;  // 0-1, default 1.0
  leadEuclid2Probability: number;
  leadEuclid3Probability: number;
  leadEuclid4Probability: number;
  
  // Phase 2: Sound Source Selection
  leadEuclid1Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid2Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid3Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  leadEuclid4Source: 'lead' | 'synth1' | 'synth2' | 'synth3' | 'synth4' | 'synth5' | 'synth6';
  
  // Phase 2: Synth Sequencer Control
  synthChordSequencerEnabled: boolean;  // default true
}
```

---

### UI Design Notes

**Current Lane Layout (per lane when enabled):**
```
┌─ Lane N ──────────────────────────────────────────────┐
│ [Pattern Dots Visualization]                          │
│ Preset: [Dropdown]                                    │
│ Note Range: [Low slider] [High slider]                │
│ Level: [====○====]  Rotate: [←] [→]                  │
│ Probability: [====○====]  Source: [Dropdown]          │
│ (If custom: Steps + Hits sliders)                     │
└───────────────────────────────────────────────────────┘
```

**Synth Chord Sequencer Toggle (in Harmony panel):**
│ Lane 1: [✓] Source: [Lead ▼]                         │
│   Preset: [Lancaran ▼]  Probability: [====○]         │
│   Steps: 16  Hits: 4  Rotation: 0  Level: [===]      │
│   Note Range: [C4] to [C6]                           │
│                                                       │
│ Lane 2: [✓] Source: [Synth 1 ▼]                      │
│   ...                                                 │
│                                                       │
│ ─── Synth Options ───                                │
│ [✓] Chord Sequencer Enabled                          │
│   (Disable to use only Euclidean for synth voices)   │
└───────────────────────────────────────────────────────┘
```

---

### Implementation Order

1. **State changes** - Add new properties to SliderState with defaults
2. **Probability** - Simple addition, low risk
3. **UI reorganization** - Move to separate panel
4. **Source selection state** - Add source property per lane
5. **Lead routing** - Implement lead sequencer disable logic
6. **Synth voice trigger** - Create independent voice trigger method
7. **Synth routing** - Route Euclidean to synth voices
8. **Synth sequencer toggle** - Add chord sequencer disable option

---

### Testing Checklist

- [x] Probability 0 = no notes, 1 = all notes, 0.5 = ~half
- [x] Lead source + Euclidean enabled → existing lead sequencer disabled
- [x] Lead source + Euclidean disabled → existing lead sequencer works
- [x] Synth source → triggers individual voice
- [x] Synth chord sequencer enabled → both Euclidean and chords play
- [x] Synth chord sequencer disabled → only Euclidean triggers synth
- [x] Multiple lanes with different sources work simultaneously
- [x] Preset save/load includes all new parameters
- [ ] iOS parity (implement after web verified)

---

## Reverb Enable Toggle (CPU Saver)

### Overview
Add a reverb on/off toggle to save CPU when reverb is not needed. Defaults to ON.

### Implementation (IMPLEMENTED ✓)
- [x] **State**: Add `reverbEnabled: boolean` to `SliderState` (default: true)
- [x] **Engine**: Mute all reverb sends when disabled (synth, granular, lead, leadDelay)
- [x] **Engine**: Skip reverb parameter updates when disabled
- [x] **UI**: Add toggle button in Space panel with "Active" / "Bypassed (saves CPU)" states
- [x] **iOS**: Full parity - SliderState, AudioEngine, SliderControlsView, AppState updated

---

### Version History

| Date | Changes |
|------|---------|
| 2026-02-03 | Initial enhancement spec created |
| 2026-02-03 | Web implementation complete - all features working |
| 2026-02-03 | Reverb enable toggle added for CPU savings |
