# Granular Engine Manual

This manual describes the current Product Core granular engine as it is exposed in the Granular page. The engine is no longer the old hidden legacy granulator. It is a shared rolling buffer with four independent reader voices, a macro layer, quality/CPU controls, live visualization, and routing into the shared delay/reverb system.

## Mental model

The Granular engine has one stereo recording buffer and four voices that read from it:

```text
source sends -> rolling stereo buffer -> four reader voices -> granular bus
  -> smear / output filtering -> Granular Level
  -> optional Delay A, Delay B, and Reverb sends
```

The buffer is divided into 16 slices. Each voice can read one slice directly, chase the live write head, scan around the buffer, or emit grains from positions around an anchor.

The visible voice modes are:

- `Clean`: a looper / tape-head reader. It reads the buffer continuously and is best for Loop Forest, tape bloom, harmonic rate layers, and stable micro-loops.
- `Granular`: the cloud engine. It schedules individual grains with density, size, spray, pitch-cloud, bloom, glide, and tempo-grid controls.

Legacy mode is not a visible engine mode anymore. Saved presets or URLs that contain `legacy` are sanitized into the modern granular mode, and `legacy_cloud` is loaded as `classic_cloud`.

## First setup

To hear the engine:

1. Turn `Granular FX` on.
2. Feed the buffer from at least one source in `Input Sources` or the Routing page.
3. Keep at least one voice enabled.
4. Raise `Granular Level`.

The default source feed is `Pad 1 -> Granular = 1.0`. Most other source feeds default to zero.

## Buffer and freeze

`Length` chooses the recording buffer size shown in the UI:

- `4s`: tighter, more rhythmic, easier to hear as loops and chops.
- `16s`: broader memory, better for ambient beds and slow-moving textures.

`Freeze` stops the write head so the voices keep reading the captured buffer. Use it after the buffer contains material. If the engine is frozen before useful source material is recorded, the voices may keep reading silence or stale audio.

The buffer visualizer shows:

- `write head`: the current record position.
- `anchor`: the base point a voice is using.
- `window`: the motion, spray, or look-back region.
- `current`: the current clean read point or representative granular read point.
- `grains`: particle events emitted by granular voices.
- `Live Grains`: the current DSP grain count across all voices.

`Visual` has two detail profiles:

- `basic`: lower visual update/detail cost.
- `full`: adds more lookback, write-guard, spray, timing, stars, particle, and glide detail.

On mobile, the live canvas starts off by default to reduce CPU and battery use. The DSP still runs; only the visual telemetry/rendering is reduced.

## Modes and macros

The top `Modes & Macros` section controls global behavior before you edit individual voices.

### Space

`Diffuse` makes the granular space path softer and more ambient. It raises bus diffusion and timing randomness in the macro model, and the Delay B space voicing leans away from a strict grid.

`Clocked` keeps the space section more rhythmic. It uses note-based delay tap relationships and is better for pulse, mosaic, chop, and syncopated repeats.

### Behavior

`Pure` keeps presets and per-voice settings more literal. Macro pushes are gentler, tension has less influence, and the sound stays closer to the saved voice controls.

`Expressive` lets the macro model push the voices harder. Activity, Texture, Motion, Tone, Chaos, Spray, Cloud, Pitch Macro, and tension can move density, grain size, blur, bloom, pitch jitter, and modulation further from the base settings.

### Shape

`Shape` sets the global grain envelope contour for granular voices:

- `Triangle`: balanced fade in/out, the safest default.
- `Rise`: saw-up contour, softer attack into sharper release.
- `Fall`: sharper onset into falling tail.
- `Square`: harder, choppier grain contour.

Clean voices use their own continuous read and loop crossfade behavior; Shape is mainly for granular grains.

### Quality and max grains

`Quality` selects the interpolation and anti-alias profile:

- `eco`: cheapest. Uses linear reads at lower rates and fewer anti-alias stages.
- `balanced`: default. Uses higher-quality reads once playback rates move away from normal and adds moderate anti-aliasing.
- `hq`: most expensive. Favors windowed-sinc reads and stronger anti-aliasing across more pitch/rate ranges.

`Max Grains` is the global active-grain cap. It limits total live grains across all voices, including bloom ghost grains. Lower it to protect CPU; raise it when dense voices are audibly choking.

### Musical macros

These sliders change the effective values sent to the engine. When a macro changes a voice parameter, the UI can show a ghost value on the affected slider.

`Smear` is the bus glue macro. Higher values raise bus diffusion and timing spread, lengthen grain envelopes, add blur, and darken the granular output/reverb LPFs.

`Activity` pushes granular voices toward more density, larger grain windows, longer tails, and more overlap. Clean voices are mostly protected from the non-clean activity pushes.

`Texture` makes voices blurrier and more smeared. It increases blur, grain size, shimmer tendency, and decay.

`Motion` drives internal movement. It raises position LFO depth/rate and pan movement.

`Tone` darkens the granular output and reverb feeds by lowering the effective LPF values.

`Chaos` increases instability. It adds reverse LFO activity and more octave-shift tendency.

`Spray` is a direct macro for position/timing spread. It affects position spray, timing spray, and some pitch jitter.

`Cloud` pushes density, grain size, blur, and bloom.

`Pitch Macro` pushes pitch jitter and shimmer probability, and the DSP also adds up to 12 semitones of extra pitch spread internally.

`Chord Bias` pulls grain pitch choices toward current chord tones when chord-aware pitch modes are active.

### Tension

The global `Per-Engine Tension` controls on the Global page can feed the granular macro model.

- `bypass`: granular ignores tension.
- `follow`: granular uses global tension plus the granular offset.
- `locked`: granular uses the granular value as an absolute tension amount.

Lower effective tension makes the cloud softer and more bed-like: longer attacks, longer decays, fuller density, and more blur. Higher effective tension can add octave lift and pitch spread, especially in Expressive behavior.

## Space and output controls

`Granular Level` is the granular return level.

`Feedback` sends the granular output back into the buffer path. Low values add mild self-layering. High values can build autonomous clouds quickly.

`FB LPF` darkens the feedback loop. Lower cutoffs make recirculation softer and more stable.

`Reverb Send` feeds the shared reverb.

`Reverb LPF` filters the granular reverb feed. Macros can lower the effective value.

`Output LPF` filters the granular output before it reaches the mix/routing returns. Macros can lower the effective value.

`Clocked Space` exposes the shared Delay B multitap path from the Granular page:

- `Time Division`: master note grid for the multitap.
- `Activity`: how many taps speak and how dense the pattern feels.
- `Repeats`: feedback/length of the multitap.
- `Filter`: dark/bright tone of repeats.
- `Vibrato`: delay-time motion.
- `Send`: granular output into Delay B, when the shared route is not already driven elsewhere.
- `Reverb Send`: Delay B output into shared reverb.

The Routing page can also feed Delay A or Delay B into Granular and feed Granular into Delay A, Delay B, or Reverb.

## Input sources

The Granular page exposes source sends for:

- Pad 1
- Pad 2
- Lead 1
- Lead 2
- Drums
- Waves
- Water
- Insects

The broader state/routing layer also supports Piano and Nature granular sends. If a source send is zero, that source does not seed the granular buffer from this route.

## Voice controls

Each voice has an enable button, a mode, a slice assignment, and collapsible control groups.

### Shared voice controls

`Slice` picks the voice home region from the 16-slice buffer.

`Pitch` transposes the voice by semitones. In Clean mode this changes playback pitch/rate behavior. In Granular mode it is the base pitch before cloud pitch modes, jitter, shimmer, and pitch macros.

`REV` flips playback direction. Granular voices can also flip individual grains with `Rev Chance` and `Rev LFO`.

`Fade In` and `Fade Out` shape voice edges:

- In Granular mode, they are per-grain attack/decay.
- In Clean mode, they mainly support smoother loop/head behavior alongside `Loop Xfade`.

`Blur` adds per-voice allpass diffusion. Use it to soften transients and merge grains into a bed.

`Gain` sets that voice level before the voice stack is summed.

`Pan`, `Pan LFO`, and `Spread` control the stereo field. `Spread` also affects random grain panning and some cloud-style behavior.

`Pos Rate` and `Pos Depth` move the read point through the buffer.

`Rev LFO` periodically flips direction.

`Rec LFO` periodically pushes write-follow toward the live write head. In Clean mode this behaves more like a gated recapture gesture than a constant wobble.

`Write Fol` blends between the chosen slice and fresher material behind the write head.

### Clean mode

Clean mode turns the voice into a continuous loop/read head. It ignores the granular cloud scheduler and stays more direct under macros.

Clean has two motion modes:

- `Linear`: the voice advances through the assigned slice at the selected `Rate Ratio`.
- `Scan`: the voice parks speed at zero and uses scan rate plus position modulation to move around its region. Pitch no longer makes the scan head race through the buffer, so this mode is useful for stable tape-head and Loop Forest behavior.

`Rate Ratio` values are harmonic playback/scanning multipliers: 0.25x, 0.30x, 0.50x, 0.75x, 1.00x, 1.50x, 2.00x, 3.00x, and 4.00x.

`Loop Xfade` sets clean looper crossfade time from 4 to 80 ms. Increase it if a clean voice clicks at the loop boundary; lower it if loops feel too softened.

Use Clean mode for:

- multi-head loopers
- octave/double/half-speed layers
- soft tape bloom
- slow scan textures
- Microcosm-style fixed-rate layers

### Granular mode

Granular mode emits individual grains from the buffer.

`Free` uses the continuous grain scheduler. Timing follows density, timing spray, global timing randomness, and the engine's internal scheduling.

`Tempo` uses the tempo-gated scheduler. Grains are pulsed on the selected clock division while still using the same voice pitch, slice, spray, envelope, and cloud controls.

Available grain clock divisions are `1/4`, `1/8`, `1/16`, `1/32`, `1/64`, and `1/8T`.

#### Grain density and position

`Density` sets grains per second for the voice. Higher density costs more CPU and increases overlap.

`Size` sets grain duration in ms. Longer grains are smoother but keep grains alive longer.

`Position Spray` controls where grains can appear around the voice anchor. Low values stay focused. High values reach across a wider region of buffer history.

`Timing Spray` randomizes the spacing between grain starts. At zero, the scheduler is near-periodic. At higher values, grain timing spreads around the target density without the old forced jitter.

`Lookback` controls how far behind the live write head a write-following voice reads. In granular mode it maps roughly from 60 ms to 8 seconds, limited by buffer size.

`Write Guard` protects against reading too close to the write head. It maps roughly from 15 ms to 120 ms and helps avoid live-buffer clicks or unstable near-zero-delay reads.

#### Pitch cloud

`Shimmer` adds octave-like coloration. The engine mostly adds +12 semitones, with some downward octave behavior at higher randomness.

`Pitch Mode` chooses how each grain chooses pitch around the base pitch:

- `Pitch Fixed`: base pitch, jitter, quantization, shimmer, and macro pitch only.
- `Octaves`: chooses from octave offsets, expanding as Pitch Spread rises.
- `Fifths`: chooses fifth/octave relationships.
- `Chord`: chooses from active chord tones when chord data is available.
- `Scale`: chooses from active scale intervals and can add octave offsets as spread rises.
- `Free`: chooses random pitch offsets inside Pitch Spread.

`Pitch Spread` sets the pitch range for non-fixed modes.

`Pitch Jitter` adds cents-level micro-variation.

`Pitch Lock` blends random pitch choices back toward the active quantized scale/chord result. Higher values sound more harmonically constrained.

`Glide` adds per-grain pitch movement over the grain length. In the visualizer, glide grains get a diagonal particle mark in full detail mode.

#### Direction and bloom

`Rev Chance` gives each grain an independent chance to reverse, in addition to the manual reverse button and reverse LFO.

`Bloom` creates quieter ghost grains after a source grain. It thickens the cloud and raises CPU because ghost grains count against `Max Grains`.

#### Cloud style

`Cloud Style` selects extra DSP behavior:

- `Classic`: the neutral cloud style.
- `Mosaic`: currently behaves like the classic DSP path; use it with Mosaic presets/rate layers to label that intent.
- `Bloom`: adds extra bloom amount before ghost-grain spawning.
- `Tide`: amplitude-modulates each grain envelope for wave-like pulsing.
- `Orbit`: randomizes grain pan around a stereo radius and adds tiny orbit pitch motion.
- `Stars`: replaces the normal base anchor with one of five fixed anchor points across the buffer.

`Anchor Pattern` matters most for `Stars`:

- `Forward`: steps through star anchors left to right.
- `Reverse`: steps right to left.
- `Pendulum`: moves forward then backward.
- `Random`: chooses anchors randomly.

## Presets

The Granular page `Preset` control stores a full granular scene:

- all four voices
- kit-level macro settings
- source-level granular controls

Built-in reference targets include:

- `Classic Cloud (Granular)`: modern replacement for the old legacy cloud.
- `Loop Forest (ZOIA)`: four clean looper heads with drift.
- `Mosaic A/B/C/D`: fixed-rate Microcosm-style octave, half-speed, shimmer, and wide layers.
- `Tape Bloom`: dual clean loop heads with warm motion.
- `Microcosm Wash` and `Microcosm Pulse`: hybrid ambient/clocked behaviors.
- `Mood Slip Stretch`: micro-loop stretch and smear.
- `Ambient Pad`, `Flux Drift`, and `Self-Generating Bloom`: ambient/experimental clouds.
- `Glitch Chop` and `Polyrhythmic Cascade`: rhythmic granular voices.

Preset loads normalize older fields:

- `legacy_cloud` becomes `classic_cloud`.
- voice mode `legacy` becomes `granular`.
- older `Spray` values seed modern `Position Spray` when needed.
- missing advanced fields receive safe defaults.

## Recipes

### Clean tape head

1. Enable one Clean voice.
2. Choose `Linear`.
3. Set `Rate Ratio` to 1.00x or 0.50x.
4. Keep `Blur` low to moderate.
5. Add `Loop Xfade` if edges click.
6. Add slow `Pan LFO` and small `Pos Depth`.

### Loop Forest

1. Enable four Clean voices.
2. Put them on different slices.
3. Use mixed Rate Ratios such as 0.50x, 0.75x, 1.00x, and 1.50x.
4. Use `Scan` on one or two voices for hovering motion.
5. Raise `Smear`, `Blur`, and `Reverb Send`.
6. Keep `Activity` modest so the macro model does not make the texture too dense.

### Soft granular bed

1. Use Granular mode on one or two voices.
2. Set `Diffuse` and `Pure`.
3. Use moderate Density and longer Size.
4. Raise `Smear`, `Texture`, and `Cloud`.
5. Keep `Pitch Mode` fixed or scale/chord with high Pitch Lock.
6. Lower Output LPF or raise Tone for a darker bed.

### Rhythmic chop

1. Use Granular mode.
2. Switch the voice to `Tempo`.
3. Pick `1/16`, `1/32`, or `1/8T`.
4. Use shorter Size and lower Smear.
5. Try Square shape for sharper slices.
6. Use Clocked Space with Delay B Activity and Repeats.

### Shimmer cloud

1. Use Granular mode.
2. Set Pitch Mode to Octaves, Fifths, Scale, or Chord.
3. Raise Shimmer and Pitch Macro.
4. Use Bloom cloud style with some Bloom amount.
5. Use HQ if aliasing or pitch smear is obvious.
6. Control brightness with Output LPF and Reverb LPF.

### Frozen texture

1. Feed the buffer until the visualizer shows useful waveform activity.
2. Enable Freeze.
3. Raise Feedback carefully.
4. Use Scan Clean voices or low-density Granular voices.
5. Adjust Lookback and Position Spray to choose how much of the frozen memory speaks.

## CPU guidance

The most expensive controls are usually:

- number of enabled voices
- `Density`
- `Size`
- `Bloom`
- `Max Grains`
- `Quality = hq`
- `Visual = full`
- high pitch/rate values that trigger sinc reads and anti-alias stages

To reduce CPU:

1. Use fewer enabled voices.
2. Lower `Max Grains`.
3. Lower Density before lowering Size.
4. Reduce Bloom and Cloud Macro.
5. Switch Quality from HQ to Balanced or Eco.
6. Use Basic visual detail, especially on mobile.
7. Prefer Clean mode for stable loop layers when you do not need a true grain cloud.

To improve fidelity:

1. Use Balanced or HQ for pitch-shifted voices.
2. Keep Write Guard high enough to avoid near-write-head artifacts.
3. Use Lookback instead of extreme Write Follow if you hear live-buffer smearing.
4. Use Reverb LPF and Output LPF to tame bright high-rate grains.
5. Raise Max Grains only when the live grain counter is hitting the cap and the cloud sounds starved.

## Troubleshooting

No granular sound:

- Check `Granular FX` is on.
- Check at least one input source send is up.
- Check at least one voice is enabled.
- Check `Granular Level`.
- If frozen, unfreeze long enough to capture fresh audio.
- If using Clocked Space only, make sure Granular -> Delay B or Delay B -> Granular routing is actually fed.

Clicks or unstable live-buffer sound:

- Raise `Write Guard`.
- Lower `Write Follow`.
- Increase `Lookback`.
- Increase `Loop Xfade` for Clean voices.
- Avoid very high Feedback with very bright FB LPF.

Cloud is too busy or CPU is high:

- Lower Density, Bloom, Cloud Macro, and Max Grains.
- Disable unused voices.
- Use Basic visual detail.
- Use Balanced or Eco quality.

Cloud is too dull:

- Raise Output LPF and Reverb LPF.
- Lower Tone and Smear.
- Reduce Feedback LPF darkening.
- Use Classic or Orbit instead of Tide/Bloom if envelopes feel too softened.

Pitch cloud is out of key:

- Use Scale or Chord pitch mode.
- Raise Pitch Lock.
- Raise Chord Bias if chord tones are available.
- Lower Pitch Spread, Pitch Jitter, and Pitch Macro.

## Implementation notes

- DSP lives in `wasm/granular-fx/kessho_granular.cpp` and is bridged by `src/audio/worklets/granular-fx-wasm.worklet.ts`.
- Product Core snapshots and events map the same granular quality, max-grain, macro, and per-voice advanced controls.
- The active voice modes are Clean and Granular. Legacy ABI functions still exist for compatibility but are ignored by the DSP branch.
- The engine uses a global grain cap of 64 live grains. The UI exposes 8 to 64.
- Quality mode changes both interpolation choice and anti-alias stage count.
- The visualizer only requests live waveform/position telemetry while the Granular UI is active and visible.
