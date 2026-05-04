import type { SliderHelpEntry, SliderHelpSurface, SliderPageId } from './sliderHelpCatalog';

function surface(page: SliderPageId, section: string, label: string, audit: string[] = []): SliderHelpSurface {
  return { page, section, label, dualMode: 'single-only', audit };
}

const app = (section: string, label: string, audit: string[] = []) => surface('app', section, label, audit);
const sy = (section: string, label: string, audit: string[] = []) => surface('synth', section, label, audit);
const dr = (section: string, label: string, audit: string[] = []) => surface('drums', section, label, audit);
const gr = (section: string, label: string, audit: string[] = []) => surface('granular', section, label, audit);
const ea = (section: string, label: string, audit: string[] = []) => surface('earth', section, label, audit);
const dy = (section: string, label: string, audit: string[] = []) => surface('delay', section, label, audit);

function entry(short: string, long: string, surfaces: SliderHelpSurface[]): SliderHelpEntry {
  return { short, long, surfaces };
}

function cloneEntry(base: SliderHelpEntry, surfaces: SliderHelpSurface[]): SliderHelpEntry {
  return { short: base.short, long: base.long, surfaces };
}

const seqClockEntry = entry(
  'Sets the active lane’s clock division.',
  'This changes how often the lane advances relative to the shared sequencer BPM. Smaller note values make the lane step faster; larger divisions make it move more slowly.',
  [],
);

const seqWriteOffsetAutoEntry = entry(
  'Restricts lane mutations to an automatically moving write position.',
  'Auto does not mean “mutate everything.” In the evolve core, write-offset masking keeps only one write position per pass and rotates that position by bar number, so changes travel around the pattern instead of rewriting every step at once.',
  [],
);

const seqWriteOffsetManualEntry = entry(
  'Restricts lane mutations to one fixed write position.',
  'Manual turns write-offset masking into a fixed step target. The slider beside it picks which step is allowed to keep evolved changes while the rest of the pattern snaps back to its pre-mutation values.',
  [],
);

const seqMutationBiasedEntry = entry(
  'Uses drift-first mutations that stay closer to the current pattern.',
  'Biased mode prefers nudges and home-biased movement rather than hard resampling. It is the safer mutation mode when you want the lane to evolve without jumping too abruptly away from its existing contour.',
  [],
);

const seqMutationStrictEntry = entry(
  'Lets the evolve engine randomize values more aggressively.',
  'Strict mode allows value-drift mutations to occasionally fully randomize a step instead of merely nudging it. That makes evolve more abrupt and less home-biased than Biased mode.',
  [],
);

const seqTriggerPresetEntry = entry(
  'Loads a stored Euclidean steps-and-hits pattern for the active lane.',
  'This dropdown pulls from `DRUM_EUCLID_PRESET_DATA` and sets the lane’s base step count, hit count, and preset rotation. If you manually edit Steps, Hits, or Rotation afterward, the shared sequencer hook automatically switches the lane to `custom`.',
  [],
);

export const BUTTON_HELP_CATALOG: Record<string, SliderHelpEntry> = {
  appPlayToggle: entry(
    'Starts or stops the main transport from the snowflake screen.',
    'When playback is stopped, this calls the app start path and spins up the running engine state. When playback is already active, the same button stops it again rather than merely muting the output.',
    [app('Transport', 'Play / Stop')],
  ),
  appAdvancedView: entry(
    'Opens the advanced editor pages from the snowflake screen.',
    'This switches the UI out of the macro snowflake view and into the page-based editor. It does not change the sound on its own; it only changes which controls are visible.',
    [app('Navigation', 'Advanced')],
  ),
  appJourneyView: entry(
    'Opens Journey mode from the snowflake screen.',
    'Use this to move into the graph-based Journey editor and playback view. It is a navigation control, not a sound parameter by itself.',
    [app('Navigation', 'Journey')],
  ),
  tabGlobal: entry(
    'Shows the Global page in the advanced editor.',
    'This switches the visible editor to the Global tab so you can work on harmony, presets, recording, and master routing. It does not change any engine state until you edit controls on that page.',
    [app('Tab Bar', 'Global')],
  ),
  tabSynth: entry(
    'Shows the Synth page in the advanced editor.',
    'This switches the visible editor to the Synth tab for pads, leads, and synth sequencer controls. It is navigation only; the sound does not change just from selecting the tab.',
    [app('Tab Bar', 'Synth')],
  ),
  tabDrums: entry(
    'Shows the Drums page in the advanced editor.',
    'This switches the visible editor to the Drums tab so you can work on drum voices, macros, and sequencers. It does not enable or disable the drum engine by itself.',
    [app('Tab Bar', 'Drums')],
  ),
  tabEarth: entry(
    'Shows the Earth page in the advanced editor.',
    'This switches the visible editor to the Earth tab for waves, water, and insect controls. It is only a page change, not an audio-state toggle.',
    [app('Tab Bar', 'Earth')],
  ),
  activeEarthMatrix: entry(
    'Shows only the Earth sources that are active right now.',
    'Choose sources in the selector rows. Shared routing appears per active family, while the active-source matrix keeps only the engines you have in play.',
    [ea('Active Earth Matrix', 'Active Earth Matrix')],
  ),
  tabGranular: entry(
    'Shows the Granular page in the advanced editor.',
    'This switches the visible editor to the Granular tab so you can work on the buffer, macros, space modes, and per-voice grain behavior. The sound only changes after you edit the controls there.',
    [app('Tab Bar', 'Granular')],
  ),
  tabDelay: entry(
    'Shows the Delay page in the advanced editor.',
    'This switches the visible editor to the shared Delay tab so you can shape Delay A, Delay B, and the current cross-routing between them without hunting across multiple engine pages.',
    [app('Tab Bar', 'Delay')],
  ),
  tabRouting: entry(
    'Shows the FX Routing Matrix page in the advanced editor.',
    'This switches the visible editor to the dedicated Routing tab so you can edit cross-engine sends in one clean matrix without digging through the Global or Delay pages.',
    [app('Tab Bar', 'Routing')],
  ),
  tabReverb: entry(
    'Shows the Reverb page in the advanced editor.',
    'This switches the visible editor to the Reverb tab for the shared space engine and spectral freeze controls. Selecting the tab itself is just navigation.',
    [app('Tab Bar', 'Reverb')],
  ),
  granularSpaceModeDiffuse: entry(
    'Switches the granular space section into its diffuse ambient multitap branch.',
    'Diffuse uses the non-grid tap factors and diffuse gain curve in the space engine, and the macro model also leans toward more bus diffusion and timing randomness. The result is a softer, more cloud-like space instead of a pulse-locked echo pattern.',
    [
      gr('Modes & Macros / Space', 'Diffuse'),
      dy('Delay B', 'Diffuse'),
    ],
  ),
  granularSpaceModeClocked: entry(
    'Switches the granular space section into its clocked rhythmic multitap branch.',
    'Clocked uses note-based tap subdivisions and the standard tap-activity weighting, so the space section follows the selected delay note grid more explicitly. It stays more rhythmic and patterned than Diffuse mode.',
    [
      gr('Modes & Macros / Space', 'Clocked'),
      dy('Delay B', 'Clocked'),
    ],
  ),
  delayBGranularLinkToggle: entry(
    'Decides whether granular preset changes also carry the shared Delay B voicing along with them.',
    'When linked, choosing a granular preset updates the shared Delay B multitap settings and the suggested Delay B to Granular return amount. When unlinked, granular preset changes leave the current Delay B sound and routing alone so the bus can stay independent.',
    [dy('Delay B / Linkage', 'Link Granular Preset')],
  ),
  granularPresetBehaviorPure: entry(
    'Keeps the granular macro model closer to the stored per-voice settings.',
    'Pure uses the gentler macro path in the granular model: less spread, less chaos scaling, a smaller tension influence, and smaller macro pushes away from each voice\'s underlying controls. It is better when you want the manual voice settings to stay more literal.',
    [gr('Modes & Macros / Behavior', 'Pure')],
  ),
  granularPresetBehaviorExpressive: entry(
    'Lets the granular macro model push voices further away from their stored settings.',
    'Expressive uses the larger macro-scaling path, so Activity, Texture, Motion, Darkness, Chaos, and tension can bend blur, spray, grain size, density, octave behavior, and pitch spread more aggressively. It is the more performative, less literal behavior mode.',
    [gr('Modes & Macros / Behavior', 'Expressive')],
  ),
  granularVoiceFreeTempo: entry(
    'Leaves this granular voice on its continuous grain engine instead of tempo gating it.',
    'Free disables the voice\'s tempo-gated scheduler path. Grain timing is then driven by the continuous granular engine itself through density, grain size, speed, and internal modulation rather than by BPM-locked trigger steps.',
    [gr('Voices / Grain / Timing', 'Free')],
  ),
  granularVoiceTempoSync: entry(
    'Hands this granular voice to the tempo-sync scheduler.',
    'Tempo enables the engine\'s per-voice tempo-gated path. The audio engine schedules grain pulses on the granular BPM grid using the selected Clock division, while the voice still keeps its own granular pitch, slice, and texture settings.',
    [gr('Voices / Grain / Timing', 'Tempo')],
  ),
  drumVoiceTrigger: entry(
    'Fires a one-shot preview of this drum voice.',
    'This calls the drum trigger path directly so you can audition the current preset, morph position, and parameter state without waiting for the sequencer to hit that voice.',
    [dr('Voice Cards', 'Play')],
  ),
  drumVoiceAdvanced: entry(
    'Opens or closes the advanced editor for this drum voice.',
    'This does not change the sound by itself. It simply reveals or hides the deeper per-voice parameter panel behind the macro row and morph controls.',
    [dr('Voice Cards', 'Edit')],
  ),
  drumEngineEnable: entry(
    'Enables or bypasses the drum engine.',
    'When turned off, the drum engine stops contributing audio and drum triggers will not sound until it is turned back on. Turning it on re-enables the kit without changing the current drum parameter state.',
    [dr('Master Strip', 'Drum ON / OFF')],
  ),
  synthPadPrimaryTier: entry(
    'Opens or closes the pad card\'s primary control tier.',
    'This reveals the next layer of pad controls above the always-visible preset and morph area. It is a UI tier switch only, not a sound parameter.',
    [sy('Pad Cards', 'Primary Tier')],
  ),
  synthPadAdvancedTier: entry(
    'Opens or closes the pad card\'s deepest edit tier.',
    'This reveals the advanced pad controls beyond the primary layer. It is purely an editor-depth toggle; the sound changes only after you move the controls inside that tier.',
    [sy('Pad Cards', 'Advanced Tier')],
  ),
  synthLeadEdit: entry(
    'Opens or closes the advanced editor for this lead voice.',
    'This button only changes the visible UI depth for the lead card. It does not alter the lead sound until you adjust the advanced controls it reveals.',
    [sy('Lead Cards', 'Edit')],
  ),
  drumSeqPlayToggle: entry(
    'Starts or stops the drum Euclidean transport.',
    'Turning this on starts the drum sequencer clock, and if the drum engine itself is off the page first enables it so the pattern can actually sound. Turning it off stops the drum sequencer transport rather than clearing the lane state.',
    [dr('Sequencer / Transport', 'Play / Stop')],
  ),
  drumSeqViewSimple: entry(
    'Switches the drum sequencer to the standalone stochastic trigger view.',
    'Simple mode is not a compressed Euclidean editor. It opens the separate `SeqSimple` engine where each enabled drum voice runs its own independent Poisson timer, using per-voice density plus a shared speed control.',
    [dr('Sequencer / Transport', 'Simple')],
  ),
  drumSeqViewDetail: entry(
    'Shows the one-lane-at-a-time drum Euclidean editor.',
    'Detail mode exposes a single active lane with its source pool, clock, swing, Link, Evolve, and sub-lane editors. Use this when you want full per-lane editing instead of the stochastic Simple view or the compact Overview grid.',
    [dr('Sequencer / Transport', 'Detail')],
  ),
  drumSeqViewOverview: entry(
    'Shows all four drum Euclidean lanes in a compact overview.',
    'Overview keeps every drum lane visible at once so you can compare steps, hits, rotation, preset, clock, mute, and solo without opening each lane individually.',
    [dr('Sequencer / Transport', 'Overview')],
  ),
  drumSeqSourceToggle: entry(
    'Adds or removes this drum voice from the active lane’s source pool.',
    'These buttons do not just mute the voice globally. On each active trigger, the drum lane calls `seqPickVoice` and randomly chooses one of its enabled source voices, so this control decides which drum voices that lane is allowed to fire per hit.',
    [
      dr('Sequencer / Detail / Source Pool', 'Sub'),
      dr('Sequencer / Detail / Source Pool', 'Kick'),
      dr('Sequencer / Detail / Source Pool', 'Click'),
      dr('Sequencer / Detail / Source Pool', 'Metal'),
      dr('Sequencer / Detail / Source Pool', 'Pluck'),
      dr('Sequencer / Detail / Source Pool', 'Noise'),
      dr('Sequencer / Detail / Source Pool', 'Membrane'),
    ],
  ),
  drumSeqClockSelect: entry(
    seqClockEntry.short,
    seqClockEntry.long,
    [dr('Sequencer / Detail / Lane Controls', 'Clock')],
  ),
  drumSeqLink: entry(
    'Locks the drum lane’s sub-lane lengths to the current trigger-hit count.',
    'When Link is on, the UI recomputes the resolved trigger pattern, counts the active hits after trigger overrides, and forces the pitch, expression, morph, and distance sub-lanes to use that same step count. When Link is off, those sub-lanes can keep independent lengths.',
    [dr('Sequencer / Detail / Lane Controls', 'Link')],
  ),
  drumSeqEvolve: entry(
    'Enables bar-based mutation for the active drum lane.',
    'When Evolve is on, the engine keeps a home copy of the lane and applies controlled mutations every selected number of bars. The mutation amount and enabled methods then decide whether rotation, swing, probabilities, ghosts, ratchets, hits, pitch, and sub-lane values drift away from home.',
    [dr('Sequencer / Detail / Lane Controls', 'Evolve')],
  ),
  drumSeqEvolveAdvanced: entry(
    'Opens the deeper mutation controls for the active drum lane.',
    'This reveals write-offset behavior, mutation mode, and the per-method enable list. It does not mutate anything by itself; it only exposes how Evolve is allowed to write changes back into the pattern.',
    [dr('Sequencer / Detail / Evolve', 'Advanced')],
  ),
  drumSeqWriteOffsetAuto: entry(
    seqWriteOffsetAutoEntry.short,
    seqWriteOffsetAutoEntry.long,
    [dr('Sequencer / Detail / Evolve', 'Auto')],
  ),
  drumSeqWriteOffsetManual: entry(
    seqWriteOffsetManualEntry.short,
    seqWriteOffsetManualEntry.long,
    [dr('Sequencer / Detail / Evolve', 'Manual')],
  ),
  drumSeqMutationBiased: entry(
    seqMutationBiasedEntry.short,
    seqMutationBiasedEntry.long,
    [dr('Sequencer / Detail / Evolve', 'Biased')],
  ),
  drumSeqMutationStrict: entry(
    seqMutationStrictEntry.short,
    seqMutationStrictEntry.long,
    [dr('Sequencer / Detail / Evolve', 'Strict')],
  ),
  drumSeqTriggerPreset: entry(
    seqTriggerPresetEntry.short,
    seqTriggerPresetEntry.long,
    [dr('Sequencer / Detail / Trigger', 'Preset')],
  ),
  synthSeqPlayToggle: entry(
    'Starts or stops the synth Euclidean transport.',
    'This arms the synth Euclidean scheduler without changing the stored lane content. When started from this page, it also turns the lead and pad engines on if needed so Euclidean lanes can actually sound. Once running, each enabled lane drives its selected lead or pad source according to its clock division, trigger pattern, and sub-lanes.',
    [sy('Sequencer / Transport', 'Play / Stop')],
  ),
  synthSeqViewSimple: entry(
    'Switches the Synth page to the non-Euclidean performance view.',
    'Simple mode shows the chord-sequencer controls for the pad engine and the random-timing controls for Lead 1. It is a separate performance view, not the full four-lane Euclidean editor.',
    [sy('Sequencer / Transport', 'Simple')],
  ),
  synthSeqViewDetail: entry(
    'Shows the one-lane-at-a-time synth Euclidean editor.',
    'Detail mode exposes a single active synth lane with source selection, lane timing controls, Evolve options, and trigger plus sub-lane editors.',
    [sy('Sequencer / Transport', 'Detail')],
  ),
  synthSeqViewOverview: entry(
    'Shows all four synth Euclidean lanes at once.',
    'Overview keeps the four synth lanes in one compact matrix so you can compare source assignment, preset, clock, mute, solo, and trigger density without opening each lane individually.',
    [sy('Sequencer / Transport', 'Overview')],
  ),
  synthSeqSourceSelect: entry(
    'Chooses which lead or pad voice the active synth lane will trigger.',
    'Each synth lane only targets one source at a time. When that source is one of the six pad voices, the engine marks that voice as Euclidean-owned so the chord engine does not overwrite it while the lane is active.',
    [sy('Synth Sequencer', 'Source')],
  ),
  synthSeqClockSelect: cloneEntry(
    seqClockEntry,
    [sy('Synth Sequencer', 'Clock')],
  ),
  synthSeqLink: cloneEntry(
    entry(
      'Locks the synth lane’s sub-lane lengths to the current trigger-hit count.',
      'When Link is on, the shared sequencer hook resolves the trigger pattern, counts the active hits after trigger overrides, and forces the pitch, expression, morph, distance, probability, and ratchet sub-lanes to use that hit count. When Link is off, those sub-lanes keep independent lengths.',
      [sy('Synth Sequencer', 'Link')],
    ),
    [sy('Synth Sequencer', 'Link')],
  ),
  synthSeqEvolve: entry(
    'Enables bar-based mutation for the active synth lane.',
    'When Evolve is on, the synth evolve engine keeps a home copy of the lane and mutates it every selected number of bars. Depending on intensity and enabled methods, swing, probabilities, ratchets, pitch, expression, morph, distance, and trigger overrides can drift away from home.',
    [sy('Synth Sequencer', 'Evolve')],
  ),
  synthSeqEvolveAdvanced: entry(
    'Opens the deeper synth-lane mutation controls.',
    'This reveals write-offset behavior, mutation mode, synth-only sub-lane participation checkboxes, and the per-method enable list. It is an editing panel for Evolve, not a separate sound engine.',
    [sy('Synth Sequencer / Evolve', 'Advanced')],
  ),
  synthSeqWriteOffsetAuto: cloneEntry(
    seqWriteOffsetAutoEntry,
    [sy('Synth Sequencer / Evolve', 'Auto')],
  ),
  synthSeqWriteOffsetManual: cloneEntry(
    seqWriteOffsetManualEntry,
    [sy('Synth Sequencer / Evolve', 'Manual')],
  ),
  synthSeqMutationBiased: cloneEntry(
    seqMutationBiasedEntry,
    [sy('Synth Sequencer / Evolve', 'Biased')],
  ),
  synthSeqMutationStrict: cloneEntry(
    seqMutationStrictEntry,
    [sy('Synth Sequencer / Evolve', 'Strict')],
  ),
  synthSeqTriggerPreset: cloneEntry(
    seqTriggerPresetEntry,
    [sy('Synth Sequencer', 'Preset')],
  ),
  synthVoiceMaskToggle: entry(
    'Includes or excludes this physical synth voice from the Pad 1 chord engine.',
    'The chord generator only assigns notes to voices present in `synthVoiceMask`, and the code prevents the mask from becoming completely empty by keeping at least one voice enabled. Voices assigned to Pad 2 are automatically removed from Pad 1’s mask path.',
    [sy('Pad Voice Allocation', 'Voice Mask')],
  ),
  synthPad2VoiceAssign: entry(
    'Assigns this physical synth voice to Pad 2.',
    'Pad 2 voice assignment is a real ownership split, not just a mix balance. Assigned voices run Pad 2’s presets and controls, and the pad engine excludes those voices from Pad 1’s voice mask so both pads do not fight over the same voice.',
    [sy('Pad Voice Allocation', 'Voice Assignment')],
  ),
  synthLfoPresetSelect: entry(
    'Loads a named low-frequency-oscillator recipe into destination, wave, rate, and depth at once.',
    'An LFO is a slow modulation source that moves another parameter over time. Choosing an LFO preset is a bulk edit, not just a label change: the preset rows in `lfoPresets.ts` immediately overwrite the current destination, waveform, rate, and depth for that LFO.',
    [sy('Pad LFO', 'Preset')],
  ),
  synthLfoDestSelect: entry(
    'Chooses which pad parameter the low-frequency oscillator moves.',
    'The LFO is a continuous modulation source, so this menu decides what it animates over time. The pad engine applies LFO destinations to Filter A cutoff, Filter B cutoff, amplitude, pitch, Osc B level, and Fold.',
    [sy('Pad LFO', 'Dest')],
  ),
  synthLfoWaveSelect: entry(
    'Chooses the motion shape used by the low-frequency oscillator.',
    'This is the contour the LFO follows while it modulates the chosen destination. Sine, triangle, saw, and square are periodic shapes. Sample & Hold chooses a new random value once per cycle, Random Smooth slews toward a new random target each cycle, and Random Walk updates a bounded drifting position roughly every 100 ms.',
    [sy('Pad LFO', 'Wave')],
  ),
  synthModEnvEnable: entry(
    'Turns on a second ADSR envelope used for modulation instead of loudness.',
    'This is separate from the main volume envelope. When enabled, the modulation envelope can move the selected destination at note start and release, using its own Attack, Decay, Sustain, Release, and Depth settings.',
    [sy('Pad Mod Envelope', 'ON / OFF')],
  ),
  synthModEnvTarget: entry(
    'Chooses which parameter the modulation envelope pushes during each note.',
    'Unlike the continuously cycling LFO, the modulation envelope is a one-shot ADSR contour that runs when a note starts and releases when the note ends. In the pad engine, that contour can target Filter Cutoff, Pitch, Osc B Level, or Fold.',
    [sy('Pad Mod Envelope', 'Target')],
  ),
  synthFilterRoutingMode: entry(
    'Chooses how Filter A and Filter B are arranged in the pad voice path.',
    'Series runs the voice through Filter A and then Filter B. A Only leaves Filter B effectively open even if it is enabled, while B Only opens Filter A and lets Filter B do the actual filtering.',
    [sy('Pad Filter Routing', 'Mode')],
  ),
  granularVoiceModeClean: entry(
    'Switches this granular voice to the clean playback mode.',
    'Clean mode sends `voiceMode = clean` to the granular worklet and uses the slice, motion, reverse, pitch, and rate controls rather than the full grain-cloud timing model. In the macro layer, the non-clean Activity pushes are skipped for clean voices, so they stay more direct and less cloud-like.',
    [gr('Voices / Voice Mode', 'Clean')],
  ),
  granularVoiceModeGranular: entry(
    'Switches this voice to the main granular cloud engine.',
    'Granular mode sends `voiceMode = granular` to the worklet, enables the grain-density/size/spray controls, and is the only mode that can use the voice-level Free/Tempo grain scheduler. It is the most fully featured mode for cloud-like playback.',
    [gr('Voices / Voice Mode', 'Granular')],
  ),
  granularVoiceModeLegacy: entry(
    'Switches this voice to the legacy granular engine branch.',
    'Legacy mode sends `voiceMode = legacy` to the worklet and brings the shared legacy parameter block back into play, including jitter, probability, pitch mode, pitch spread, max grains, and legacy feedback. In the macro model it also uses slightly smaller activity targets than the newer granular mode.',
    [gr('Voices / Voice Mode', 'Legacy')],
  ),
  granularVoiceMotionScan: entry(
    'Makes a clean granular voice scan around its home slice instead of reading through the buffer linearly.',
    'When Scan is selected, the UI sets the clean voice’s playback speed to zero and uses `scanRate` plus the position modulation controls to move the read point. That keeps the voice anchored to its slice while modulation explores around it.',
    [gr('Voices / Slice & Playback', 'Scan')],
  ),
  granularVoiceMotionLinear: entry(
    'Makes a clean granular voice move through the buffer at a fixed playback ratio.',
    'Linear mode restores nonzero playback speed, so the voice advances through the shared buffer instead of hovering around one slice. The Rate Ratio control then acts as the actual playback-speed multiplier for that voice.',
    [gr('Voices / Slice & Playback', 'Linear')],
  ),
  granularVoiceCleanRateRatio: entry(
    'Sets the clean voice’s playback or scan rate multiplier.',
    'In clean-linear mode this becomes the voice speed sent to the worklet. In clean-scan mode the same control updates `scanRate` so the position modulation moves faster or slower while the base playback speed remains parked.',
    [gr('Voices / Slice & Playback', 'Rate Ratio')],
  ),
  granularVoiceTempoClock: entry(
    'Sets the BPM division for tempo-gated grain pulses on this voice.',
    'This dropdown only matters when the voice is in Granular mode and Tempo sync is on. The engine then hands the voice to the tempo-gated scheduler and uses this division to space the grain triggers on the granular BPM grid.',
    [gr('Voices / Grain / Timing', 'Clock')],
  ),
  granularLegacyPitchMode: entry(
    'Chooses how the legacy granular engine spreads pitch when its legacy pitch spread is active.',
    'Random lets legacy grains wander freely inside the configured spread. Harmonic constrains that spread toward harmonic relationships instead of fully random offsets.',
    [gr('Voices / Legacy Granulator', 'Pitch Mode')],
  ),
};
