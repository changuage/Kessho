# Earth Texture Player — Implementation Spec

**Author**: Senior dev notes for junior implementation  
**Scope**: Add nature sample playback (birds, frogs) + update waves sample + interactive scene mixer UI

---

## 1. The Big Picture

The **Earth page** in Kessho is a generative soundscape engine. Right now it has:
- **Water** — WASM-synthesised water drops/stream/surf
- **Waves** — A looping OGG sample of Ghetary beach (`oceanSample*`)
- **Insects** — WASM-synthesised cricket/cicada sounds (2 layers)

We're adding **3 new sample-based layers** (birds ×2, frogs ×1) and replacing the old waves sample with a trimmed mono version. All new samples use a new playback system called **EarthTexturePlayer** — overlapping random slices instead of simple looping.

### New sample files (all in `public/samples/`)

| File | Channels | Rate | Duration | Decoded RAM |
|------|----------|------|----------|-------------|
| `Alps Birds_441_m_normalized.ogg` | mono | 44100 | 53s | ~9 MB |
| `Fujian Birds 2_441_m_normalized.ogg` | mono | 44100 | 49s | ~9 MB |
| `Fujian_Frogs_m_441_normalized.ogg` | mono | 44100 | 43s | ~8 MB |
| `Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg` | mono | 44100 | 119s | ~21 MB |

The old `Ghetary-Waves-Rocks_cl-normalized.ogg` (stereo, 48kHz, 288s, ~105 MB decoded) is replaced by the new trimmed mono version. Delete or archive the old file after confirming the new one works.

---

## 2. EarthTexturePlayer — Audio Engine Concept

### Why not just loop?

A simple `AudioBufferSourceNode` with `loop=true` repeats the exact same waveform forever. After a few cycles you hear the loop point and it sounds obviously artificial. For nature field recordings (birds, frogs), we want the sound to feel like a continuous, non-repeating natural environment.

### How the texture player works

The core idea: **always have 2–3 overlapping slices playing concurrently**, each starting at a random position in the buffer, crossfading in and out so you never hear a hard cut or a loop seam.

```
Time ──────────────────────────────────────────────────►

Slice A  ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲
Slice B       ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲
Slice C            ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲
Slice D                 ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲

         ╱ = fade in (attack)    ╲ = fade out (release)
         ‾ = sustain at full gain
```

Each slice:
1. Picks a **random start offset** within the decoded buffer (with guard so it doesn't overshoot the end)
2. Creates an `AudioBufferSourceNode`, sets `buffer`, sets `start(when, offset, duration)`
3. Uses a `GainNode` envelope: ramp up (fade in) → hold → ramp down (fade out)
4. Schedules the **next slice** to start before the current one finishes (overlap = fade-in time)
5. Cleans up (`disconnect()`) after playback ends via `onended`

### Key parameters per slot

| Param | Purpose | Range |
|-------|---------|-------|
| `enabled` | On/off toggle | boolean |
| `level` | Output volume | 0–1 |
| `sliceDuration` | How long each slice plays (seconds) | 6–30s |
| `fadeTime` | Crossfade overlap duration (seconds) | 2–8s |
| `reverbSend` | Send level to shared reverb bus | 0–1 |
| `delayASend` | Send level to shared Delay A | 0–1 |
| `delayBSend` | Send level to shared Delay B | 0–1 |

`fadeTime` should always be less than `sliceDuration / 2` to ensure there's always a sustain section.

### Implementation skeleton (in engine.ts)

```typescript
interface TextureSlot {
  url: string;                                // OGG path 
  buffer: AudioBuffer | null;                 // decoded PCM
  loaded: boolean;
  activeSlices: { source: AudioBufferSourceNode; gain: GainNode }[];
  outputGain: GainNode | null;                // master level for this slot
  haasDelay: DelayNode | null;                // for stereo widening (see §3)
  levelGain: GainNode | null;                 // dry path → earthBus
  reverbSend: GainNode | null;                // → reverbInputBus
  delayASend: GainNode | null;                // → shared Delay A
  delayBSend: GainNode | null;                // → shared Delay B
  nextSliceTimer: number | null;              // setTimeout ID
}
```

#### Loading

Follow the existing `loadOceanSample()` pattern at engine.ts line ~6100:

```typescript
private async loadTextureSlot(slot: TextureSlot): Promise<void> {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  const response = await fetch(`${base}/samples/${encodeURIComponent(slot.url)}`);
  // Note: encodeURIComponent because filenames have spaces!
  if (!response.ok) { console.warn(`Sample not found: ${slot.url}`); return; }
  const arrayBuffer = await response.arrayBuffer();
  slot.buffer = await this.ctx!.decodeAudioData(arrayBuffer);
  slot.loaded = true;
  console.log(`Texture loaded: ${slot.url} (${slot.buffer.duration.toFixed(1)}s)`);
}
```

#### Scheduling slices

```typescript
private scheduleTextureSlice(slot: TextureSlot, sliceDuration: number, fadeTime: number): void {
  if (!this.ctx || !slot.buffer || !slot.outputGain) return;

  const buf = slot.buffer;
  const maxOffset = Math.max(0, buf.duration - sliceDuration);
  const offset = Math.random() * maxOffset;
  const now = this.ctx.currentTime;

  // Create source
  const source = this.ctx.createBufferSource();
  source.buffer = buf;

  // Create envelope gain
  const env = this.ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(1, now + fadeTime);              // fade in
  env.gain.setValueAtTime(1, now + sliceDuration - fadeTime);       // hold
  env.gain.linearRampToValueAtTime(0, now + sliceDuration);         // fade out

  // Connect: source → env → slot.outputGain (which routes to Haas → earthBus)
  source.connect(env);
  env.connect(slot.outputGain);

  source.start(now, offset, sliceDuration);

  const entry = { source, gain: env };
  slot.activeSlices.push(entry);

  // Cleanup on end
  source.onended = () => {
    try { source.disconnect(); env.disconnect(); } catch {}
    const idx = slot.activeSlices.indexOf(entry);
    if (idx !== -1) slot.activeSlices.splice(idx, 1);
  };

  // Schedule NEXT slice to start before this one finishes (overlap by fadeTime)
  const nextIn = (sliceDuration - fadeTime) * 1000; // ms
  slot.nextSliceTimer = window.setTimeout(() => {
    this.scheduleTextureSlice(slot, sliceDuration, fadeTime);
  }, nextIn);
}
```

#### Start/stop

```typescript
private startTextureSlot(slot: TextureSlot, sliceDuration: number, fadeTime: number): void {
  this.stopTextureSlot(slot);
  this.scheduleTextureSlice(slot, sliceDuration, fadeTime);
}

private stopTextureSlot(slot: TextureSlot): void {
  if (slot.nextSliceTimer !== null) {
    clearTimeout(slot.nextSliceTimer);
    slot.nextSliceTimer = null;
  }
  for (const { source, gain } of slot.activeSlices) {
    try {
      // Quick fade out to avoid click
      const now = this.ctx?.currentTime ?? 0;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.05);
      source.stop(now + 0.2);
    } catch {}
  }
  slot.activeSlices = [];
}
```

### Where to put this

Add the `TextureSlot` type and these 4 methods (`loadTextureSlot`, `scheduleTextureSlice`, `startTextureSlot`, `stopTextureSlot`) as private members/methods of the existing `KesshoEngine` class in `src/audio/engine.ts`.

Add private slot instances near line 560 (where existing ocean members live):

```typescript
// Nature texture slots
private birdsSlot: TextureSlot = { url: 'Alps Birds_441_m_normalized.ogg', ... };
private birds2Slot: TextureSlot = { url: 'Fujian Birds 2_441_m_normalized.ogg', ... };
private frogsSlot: TextureSlot = { url: 'Fujian_Frogs_m_441_normalized.ogg', ... };
```

### Waves sample update

Replace the old ocean sample path in `loadOceanSample()` (~line 6105):
```
'Ghetary-Waves-Rocks_cl-normalized.ogg'  →  'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg'
```

Optionally, convert waves to use the texture player too instead of simple loop. This would sound better but is not required for v1 — the loop is shorter now (119s vs 288s) so it's a bigger win to do it. Your call.

---

## 3. Haas Stereo Widening

All 4 sample files are **mono**. To make them sound spatial in a stereo mix, apply the **Haas effect**: send the mono signal to both L and R channels, but delay one side by ~12–18ms. Your brain perceives this as width/space without it sounding like a distinct echo.

### Signal chain per slot

```
                    ┌──► StereoPannerNode(pan: -1) ──┐
source → outputGain ┤                                 ├──► levelGain → earthBus
                    └──► DelayNode(~0.015s) → StereoPannerNode(pan: +1) ──┘
```

Implementation:
1. Create a `StereoPannerNode` panned hard left
2. Create a `DelayNode` with `delayTime.value = 0.015` (15ms)
3. Create a `StereoPannerNode` panned hard right  
4. Connect: `outputGain → panL → merger`, `outputGain → delay → panR → merger`
5. The merger feeds into `levelGain` which feeds `earthBus`

**Cost**: Each `DelayNode` buffer is ~7 KB of memory (15ms × 44100 × 4 bytes). Negligible.

Alternatively, you can use a `ChannelMergerNode` approach if `StereoPannerNode` causes issues — but `StereoPannerNode` is simpler and well-supported.

---

## 4. State Changes (src/ui/state.ts)

### New params to add to `SliderState` interface

Add after the existing ocean params block (~line 898):

```typescript
// ─── Nature Texture Samples ───
birdsEnabled: boolean;          // Alps Birds on/off
birdsLevel: number;             // 0..1 output volume
birdsReverbSend: number;        // 0..1
birdsDelayASend: number;        // 0..1
birdsDelayBSend: number;        // 0..1

birds2Enabled: boolean;         // Fujian Birds on/off
birds2Level: number;            // 0..1
birds2ReverbSend: number;       // 0..1
birds2DelayASend: number;       // 0..1
birds2DelayBSend: number;       // 0..1

frogsEnabled: boolean;          // Fujian Frogs on/off
frogsLevel: number;             // 0..1
frogsReverbSend: number;        // 0..1
frogsDelayASend: number;        // 0..1
frogsDelayBSend: number;        // 0..1
```

### Default values (add to `DEFAULT_STATE` after ocean defaults ~line 2470)

```typescript
// Nature texture samples
birdsEnabled: false,
birdsLevel: 0.6,
birdsReverbSend: 0.15,
birdsDelayASend: 0,
birdsDelayBSend: 0,

birds2Enabled: false,
birds2Level: 0.5,
birds2ReverbSend: 0.15,
birds2DelayASend: 0,
birds2DelayBSend: 0,

frogsEnabled: false,
frogsLevel: 0.5,
frogsReverbSend: 0.2,
frogsDelayASend: 0,
frogsDelayBSend: 0,
```

### Quantization ranges (add to `QUANTIZATION` after ocean entries ~line 3154)

```typescript
// Nature texture samples
birdsLevel: { min: 0, max: 1, step: 0.01 },
birdsReverbSend: { min: 0, max: 1, step: 0.01 },
birdsDelayASend: { min: 0, max: 1, step: 0.01 },
birdsDelayBSend: { min: 0, max: 1, step: 0.01 },
birds2Level: { min: 0, max: 1, step: 0.01 },
birds2ReverbSend: { min: 0, max: 1, step: 0.01 },
birds2DelayASend: { min: 0, max: 1, step: 0.01 },
birds2DelayBSend: { min: 0, max: 1, step: 0.01 },
frogsLevel: { min: 0, max: 1, step: 0.01 },
frogsReverbSend: { min: 0, max: 1, step: 0.01 },
frogsDelayASend: { min: 0, max: 1, step: 0.01 },
frogsDelayBSend: { min: 0, max: 1, step: 0.01 },
```

### STATE_KEYS array (~line 1708)

Add the new keys after the ocean keys:

```typescript
'birdsEnabled', 'birdsLevel', 'birdsReverbSend', 'birdsDelayASend', 'birdsDelayBSend',
'birds2Enabled', 'birds2Level', 'birds2ReverbSend', 'birds2DelayASend', 'birds2DelayBSend',
'frogsEnabled', 'frogsLevel', 'frogsReverbSend', 'frogsDelayASend', 'frogsDelayBSend',
```

### EARTH_DUAL_KEYS in EarthPage.tsx (~line 63)

Add the new level/send keys so the dual slider renderer knows about them:

```typescript
'birdsLevel', 'birdsReverbSend', 'birdsDelayASend', 'birdsDelayBSend',
'birds2Level', 'birds2ReverbSend', 'birds2DelayASend', 'birds2DelayBSend',
'frogsLevel', 'frogsReverbSend', 'frogsDelayASend', 'frogsDelayBSend',
```

---

## 5. Engine Routing (src/audio/engine.ts — applyParams)

Wire the new texture slots the same way ocean is wired. Look at how `oceanSampleEnabled` / `oceanSampleLevel` is handled in `applyParams()` and follow the same pattern:

1. **~line 5779**: The `oceanSampleGain` on/off gate — do the same for each texture slot's `outputGain`
2. **~line 5793**: The "start playback if enabled and not already playing" check — do the same but call `startTextureSlot()` instead of `startOceanSamplePlayback()`
3. **~line 6081**: The `oceanLevelGain` dry fader — do the same for each slot's `levelGain`
4. **~line 6086**: The `oceanReverbSendNode` — do the same for each slot's `reverbSend`
5. **~line 5582–5583**: The delay sends — do the same for each slot's `delayASend` / `delayBSend`

Also handle the inverse: if a slot that was enabled gets disabled, call `stopTextureSlot()`.

---

## 6. UI Components

### 6a. New component: `NatureCard.tsx`

Create `src/ui/earth/components/NatureCard.tsx` — a reusable card for any sample texture slot. Pattern it on `OceanCard.tsx`:

```
src/ui/earth/components/NatureCard.tsx
```

Props:

```typescript
type NatureCardProps = {
  cardId: string;            // 'birds' | 'birds2' | 'frogs'
  title: string;             // 'Birds — Alps' | 'Birds — Fujian' | 'Frogs'
  accent: string;            // color token
  enabledKey: keyof SliderState;   // 'birdsEnabled' etc.
  levelKey: keyof SliderState;     // 'birdsLevel' etc.
  reverbSendKey: keyof SliderState;
  delayASendKey: keyof SliderState;
  delayBSendKey: keyof SliderState;
  state: SliderState;
  ds: EarthDualSliderRenderer;
  expandedCards: Set<string>;
  onToggleCard: (id: string) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
};
```

Body layout (inside `EarthCard`):
1. Enable toggle button (● / ○) + label + ON/OFF status — same pattern as OceanCard line 33–43
2. `ds(levelKey, 'Level', accent)` — level slider using the dual slider renderer
3. Section label "Sends"
4. `ds(reverbSendKey, 'Reverb Send', 'rgba(139,92,246,0.5)')`
5. `ds(delayASendKey, 'Delay A Send', 'rgba(168,85,247,0.5)')`
6. `ds(delayBSendKey, 'Delay B Send', 'rgba(168,85,247,0.5)')`

### 6b. Add to EarthPage.tsx

Import `NatureCard` and add 3 instances between `<OceanCard>` and `<InsectsCard>` (~line 507):

```tsx
<NatureCard
  cardId="birds" title="Birds — Alps" accent="#a5c4d4"
  enabledKey="birdsEnabled" levelKey="birdsLevel"
  reverbSendKey="birdsReverbSend" delayASendKey="birdsDelayASend" delayBSendKey="birdsDelayBSend"
  state={state} ds={ds} expandedCards={expandedCards}
  onToggleCard={toggleCard} onSelectChange={onSelectChange}
/>
<NatureCard
  cardId="birds2" title="Birds — Fujian" accent="#8ec5d4"
  enabledKey="birds2Enabled" levelKey="birds2Level"
  reverbSendKey="birds2ReverbSend" delayASendKey="birds2DelayASend" delayBSendKey="birds2DelayBSend"
  ... (same remaining props)
/>
<NatureCard
  cardId="frogs" title="Frogs" accent="#b4b450"
  enabledKey="frogsEnabled" levelKey="frogsLevel"
  reverbSendKey="frogsReverbSend" delayASendKey="frogsDelayASend" delayBSendKey="frogsDelayBSend"
  ... (same remaining props)
/>
```

### 6c. Update EarthMixerSection.tsx

Add level rows + sends for the 3 new slots. Follow the existing pattern for water/ocean/insects rows. Use these colors:
- Birds: `rgba(165,196,212,0.5)` — sky blue
- Birds 2: `rgba(142,197,212,0.5)` — lighter sky blue  
- Frogs: `rgba(180,180,80,0.5)` — earthy yellow-green

---

## 7. Interactive Scene Mixer — Visual Concept

This is a **future feature** (build the audio first, then this). Historical mockups are kept outside the active app repository.

### Core concept

The Earth page gets a **Scene panel** — a modular SVG illustration that acts as both a visualizer AND a mixer. It replaces the need for a separate "preview" and "mixer" — the scene IS the mixer.

### Layout

```
┌────────────────────────────────────────────────────────┐
│  Scene                    drag left/right on zone = level │
│ ┌────────────────────────────────────────────────────┐ │
│ │  BIRDS        ▏▏▏▏▏▏▏ 70                          │ │ ← sky zone
│ │       ~v~        ~v~                                │ │
│ │╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶│ │ ← divider
│ │  INSECTS      ▏▏▏▏▏▏▏▏▏▏ 84                       │ │ ← foliage zone
│ │  🌿 · · ·  · ·      ·                              │ │
│ │╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶│ │
│ │  TOADS        ▏▏▏▏▏ 50                            │ │ ← ground zone
│ │  🐸 · ·                                            │ │
│ │╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶│ │
│ │  WATER        ▏▏▏▏▏▏▏▏▏ 90                        │ │ ← surface zone
│ │  ○ ripple    ○ ripple                               │ │
│ │╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶╶│ │
│ │  WAVES        ▏▏▏▏▏▏ 60                           │ │ ← ocean zone
│ │  ~~~   ~~~ foam                                     │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Rules

1. **Modular**: Only enabled zones appear. If birds + waves are on but nothing else, the SVG is just those 2 zones stacked. The SVG height adapts.

2. **Bidirectional**: Dragging left/right on a zone changes its level slider. Changing a slider in the parameter panel updates the scene visual. Both directions stay in sync.

3. **Parameter-driven visuals**: This is the most important design principle. Audio parameters don't just control sound — they visibly change the scene illustration:

### Zone visual mappings

#### Birds (sky zone, color `#a5c4d4`)
- **Level** → overall opacity of bird shapes
- SVG content: 2 small V-shaped bird silhouettes (`<path d="M0,0 Q3,-4 6,0 Q9,-4 12,0">`) drifting with a slow CSS `drift` animation (12s ease-in-out infinite)
- Height: 55px in the viewBox

#### Insects (foliage zone, color `#2ecc71`)
- **Level** → opacity of the foliage shape + dots
- **Density** → number of glowing dots (1–7 dots). `count = Math.round(1 + (density/100) * 6)`
- **Temperature** → dot glow animation speed. Higher temp = faster blink. `speed = 0.5 + (1 - temp/100) * 3` seconds per cycle
- SVG content: jagged foliage silhouette (`<path>` with zigzag profile), green animated dots (`<circle class="dot">` with `glow` keyframes: opacity pulses 0.15→0.6→0.15)
- Height: 65px

#### Toads/Frogs (ground zone, color `#b4b450`)
- **Level** → opacity of toad silhouette + background
- SVG content: dark earthy rectangle background, 2 thin reed lines, small ellipse (toad body), 2 yellow eye dots with a `blink` animation (eyes briefly dim every 5s)
- Height: 45px

#### Water (surface zone, color `#4a9eff`)
- **Level** → overall opacity
- **Intensity** → ripple size. `ripSize = 3 + (intensity/100) * 14` — affects `rx`/`ry` of animated expanding ellipses
- **Rate** → ripple animation speed. `ripSpeed = 1.5 + (1 - rate/100) * 5` seconds per cycle
- **Hardness** → water drop opacity. `hardAlpha = 0.15 + (hardness/100) * 0.4`
- **Drop Size** → water drop circle radius. `dropR = 0.5 + (dropSize/100) * 2`
- SVG content: 3 concentric ripple ellipses (`<ellipse class="rip">` with `ripOut` animation: expanding + fading), 3 water drop circles (`<circle class="wdrop">` with `dropFall` animation: falling + splashing)
- Height: 60px

#### Waves (ocean zone, color `#00d4ff`)
- **Level** → overall opacity
- **Depth** → wave amplitude. `amp = 3 + (depth/100) * 8`. Affects the Y oscillation of the wave path's quadratic curves
- **Foam** → foam line opacity. `foam = (foamPct/100) * 0.12`. Small white rectangles simulating foam streaks
- SVG content: 2 sine-ish wave paths (`<path>` built via quadratic bezier loop), scrolling horizontally with `roll` animation (8s/11s linear infinite). 3 foam rectangles
- Height: 55px

### CSS animations reference

```css
@keyframes drift    { 0%{transform:translate(0,0)} 50%{translate(6px,-1.5px)} 100%{translate(0,0)} }
@keyframes glow     { 0%,100%{opacity:0.15} 50%{opacity:0.6} }
@keyframes ripOut   { 0%{rx:2;ry:0.8;opacity:0.35} 100%{rx:14;ry:3;opacity:0} }
@keyframes roll     { 0%{translateX(0)} 100%{translateX(-30px)} }
@keyframes blink    { 0%,88%,100%{opacity:0.5} 92%{opacity:0.1} }
@keyframes dropFall { 0%{opacity:0;translateY(-6px)} 40%{opacity:0.7;translateY(0)} 100%{opacity:0;translateY(2px) scaleX(1.8)} }
```

### Interaction — drag-to-level

Each zone listens for `pointerdown` / `pointermove` / `pointerup`:
- On `pointermove`, if horizontal displacement > 4px, enter drag mode
- Map pointer X position relative to the SVG width → 0–100% → update the zone's level param
- The level change flows through normal `onParamChange` → state update → re-render cycle
- The scene re-renders reactively (SVG content rebuilt with new param values)

### Design tokens (match existing earth.css)

```
--bg-surface:     rgba(15,25,40,0.95)
--accent-primary: #a5c4d4
--accent-water:   #4a9eff
--accent-ocean:   #00d4ff
--accent-insects: #2ecc71
--border-accent:  rgba(100,150,200,0.3)
--font-xs:        0.55rem
--font-sm:        0.6rem
```

Scene container uses the same card styling as `EarthCard` (rounded corners, left accent border, subtle header).

### Implementation notes

- Build this as a React component `EarthSceneMixer.tsx` in `src/ui/earth/components/`
- The SVG should be generated programmatically (not a static file) since zone content depends on current slider values
- Use `useMemo` to memoize the zone rendering (keyed on relevant params) — no need to rebuild SVG on every render
- The scene reads from `SliderState` and calls `onParamChange` — no local state duplication needed
- Consider `useRef` for pointer drag state to avoid re-renders during drag
- Place the scene above the existing sound panel in `EarthPage.tsx`

---

## 8. Build & Test

```bash
# Type check (catches missing params, wrong types)
npx tsc --noEmit

# Dev server
npm run dev
```

### Manual test checklist

- [ ] Enable each sample slot → hear audio within 1–2s
- [ ] Level slider → volume changes smoothly (no clicks/pops)
- [ ] Disable slot → audio fades out (not hard cut)
- [ ] Verify stereo image — birds/frogs should sound spatially wide, not center-panned mono
- [ ] After 2+ minutes of playback, no audible loop point or repetition pattern
- [ ] Waves uses the new 119s mono sample (check console log for "Ocean sample loaded: 118.7 seconds")
- [ ] All reverb/delay sends work (enable reverb, turn up send, hear effect)
- [ ] Enabling all 4 samples + water + 2 insects simultaneously → no crackling/dropout
- [ ] Memory check: DevTools → Memory → heap should be ~46 MB for all 4 decoded buffers (not 105 MB)

---

## 9. File Change Summary

| File | What to change |
|------|----------------|
| `src/ui/state.ts` | Add 15 new params to `SliderState`, `DEFAULT_STATE`, `QUANTIZATION`, `STATE_KEYS` |
| `src/audio/engine.ts` | Add `TextureSlot` type, 4 methods, 3 slot instances, Haas nodes, routing, applyParams wiring, update ocean sample path |
| `src/ui/earth/components/NatureCard.tsx` | **New file** — reusable card for birds/birds2/frogs |
| `src/ui/earth/components/EarthMixerSection.tsx` | Add level rows + send sliders for 3 new slots |
| `src/ui/earth/EarthPage.tsx` | Import NatureCard, add 3 instances, add keys to `EARTH_DUAL_KEYS` |
| `src/ui/earth/components/EarthSceneMixer.tsx` | **New file** (future) — interactive SVG scene mixer |
