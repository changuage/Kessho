import type { SliderHelpEntry, SliderHelpSurface, SliderPageId } from './sliderHelpCatalog';

function surface(page: SliderPageId, section: string, label: string, audit: string[] = []): SliderHelpSurface {
  return { page, section, label, dualMode: 'single-only', audit };
}

const app = (section: string, label: string, audit: string[] = []) => surface('app', section, label, audit);
const gl = (section: string, label: string, audit: string[] = []) => surface('global', section, label, audit);
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
  appVisualizerView: entry(
    'Opens the reactive visualizer from the advanced editor.',
    'This switches the visible advanced-mode surface to the audio-reactive visualizer. It is navigation only; it does not enable, disable, or reroute any sound engine.',
    [app('Navigation', 'Visualizer')],
  ),
  tabGlobal: entry(
    'Shows the Global page in the advanced editor.',
    'This switches the visible editor to the Global tab so you can work on harmony, presets, recording, and master routing. It does not change any engine state until you edit controls on that page.',
    [app('Tab Bar', 'Global')],
  ),
  harmonyOpenVoicing: entry(
    'Opens Manual Voicing for auditioning and capturing chords.',
    'Manual Voicing is the hands-on harmony surface. Use it to play a chord, audition it through a sound engine, push it into live manual control, or capture it into a Chord Lab slot.',
    [gl('Harmony Engine / Summary', 'Voicing')],
  ),
  harmonyOpenLab: entry(
    'Opens Chord Lab for slots, sequence, and generation.',
    'Chord Lab is where harmony gets organized. It edits reusable chord slots, the 8-step harmony sequence, and generated slot or sequence material. It does not replace the summary; the summary still shows what the engine is actually using.',
    [gl('Harmony Engine / Summary', 'Lab')],
  ),
  harmonySummaryNow: entry(
    'Shows the harmony frame currently driving the engine.',
    'This tile reads from the resolved harmony frame, so it is the product-core truth of the chord and note pool being used right now after manual control, slots, sequence, morph, and baseline generation are resolved.',
    [gl('Harmony Engine / Summary', 'Now')],
  ),
  harmonySummaryNext: entry(
    'Shows the next resolved harmony target.',
    'This previews the next sequence step or generated target the engine will move toward. Clicking it jumps Chord Lab to the relevant sequence step when a next step exists.',
    [gl('Harmony Engine / Summary', 'Next')],
  ),
  harmonySummaryControl: entry(
    'Explains which harmony source is currently in charge.',
    'This tells you whether the live harmony came from manual control, a slot, the sequence, morph interpolation, or the generated baseline. If morph is between A and B, write actions are locked until you return to an endpoint.',
    [gl('Harmony Engine / Summary', 'Control')],
  ),
  harmonyManualClear: entry(
    'Clears the current manual harmony override.',
    'This removes active manual control, audition intent, and slot trigger state so the engine can fall back to the resolved slot, sequence, morph, or generated baseline harmony.',
    [gl('Harmony Engine / Manual Voicing', 'Clear')],
  ),
  harmonyManualModeAudition: entry(
    'Auditions a voicing without taking over the engine.',
    'Audition mode lets you choose roots, degrees, qualities, and extensions, then play the preview through a selected sound engine. It is for listening before committing.',
    [gl('Harmony Engine / Manual Voicing', 'Audition')],
  ),
  harmonyManualModeControl: entry(
    'Makes the manual voicing drive the live harmony engine.',
    'Control mode promotes the selected voicing into manual control, so the resolved harmony frame uses it while manual control is available. It is disabled while morph is between endpoints.',
    [gl('Harmony Engine / Manual Voicing', 'Control')],
  ),
  harmonyManualModeCapture: entry(
    'Captures the current voicing into a slot.',
    'Capture mode turns slot buttons into write targets. Pick the voicing you want, then press a slot to store it for Chord Lab and later triggering.',
    [gl('Harmony Engine / Manual Voicing', 'Capture')],
  ),
  harmonyManualStrengthBias: entry(
    'Biases the engine toward this harmony without fully forcing it.',
    'Bias lets the selected voicing influence the resolved note pool while leaving more room for scale, tension, sequence, and engine context to shape the result.',
    [gl('Harmony Engine / Manual Voicing', 'Bias')],
  ),
  harmonyManualStrengthForce: entry(
    'Forces the selected harmony more strongly into the result.',
    'Force gives the selected manual or slot harmony priority when the note pool is resolved. Use it when the chord should be explicit rather than suggestive.',
    [gl('Harmony Engine / Manual Voicing', 'Force')],
  ),
  harmonyManualAuditionSound: entry(
    'Chooses which sound engine plays Manual Voicing previews.',
    'This only affects the Play button in Manual Voicing. It does not reroute the live arrangement; it just chooses the synth or piano source used to audition the preview notes.',
    [gl('Harmony Engine / Manual Voicing', 'Sound')],
  ),
  harmonyManualAuditionPlay: entry(
    'Plays the current Manual Voicing preview.',
    'This fires the preview note pool through the selected audition sound engine. Leads play a single note, while pad and piano engines can audition several notes from the voicing.',
    [gl('Harmony Engine / Manual Voicing', 'Play')],
  ),
  harmonyManualInputRoot: entry(
    'Switches Manual Voicing to absolute root entry.',
    'Root mode lets the synth-style key tiles pick an explicit pitch class such as C or F#. Use it when the chord should be anchored to a named root.',
    [gl('Harmony Engine / Manual Voicing', 'Root')],
  ),
  harmonyManualInputDegree: entry(
    'Switches Manual Voicing to scale-degree entry.',
    'Degree mode chooses I through VII relative to the current root and scale. Use it when the harmony should follow global key and scale changes musically.',
    [gl('Harmony Engine / Manual Voicing', 'Degree')],
  ),
  harmonyManualRootKey: entry(
    'Sets the manual chord root from the synth-style key grid.',
    'Each tile picks a root pitch class. The labels inside the tile show the keyboard shortcut, note name, and whether that note is the Root, in the current Pool, or Out of the preview pool.',
    [gl('Harmony Engine / Manual Voicing', 'Root Key')],
  ),
  harmonyManualDegreePad: entry(
    'Sets the manual chord by scale degree.',
    'The degree pads choose I through VII in the current scale. This keeps the voicing tied to the global harmonic context instead of a fixed pitch class.',
    [gl('Harmony Engine / Manual Voicing', 'Degree Pad')],
  ),
  harmonyManualQuality: entry(
    'Changes the selected chord quality.',
    'Quality chooses the main chord shape, such as diminished, minor, major, or suspended. The preview and resolved note pool update from that selected harmonic intent.',
    [gl('Harmony Engine / Manual Voicing', 'Chord Type')],
  ),
  harmonyManualExtension: entry(
    'Adds or removes chord extensions from the preview.',
    'Extensions add tones such as 6, m7, M7, or 9 on top of the selected chord type. They are included in the note pool used by preview, slots, and resolved harmony.',
    [gl('Harmony Engine / Manual Voicing', 'Extensions')],
  ),
  harmonyManualVoicingDisclosure: entry(
    'Shows deeper voicing controls.',
    'This opens octave, inversion, spread, bass, and preserve-exact-voicing controls. It only reveals controls; the sound changes when you adjust the controls inside.',
    [gl('Harmony Engine / Manual Voicing', 'Voicing')],
  ),
  harmonyManualOctave: entry(
    'Moves the manual voicing up or down by octave.',
    'Octave shifts where the preview notes are voiced without changing the chord identity. Use it to keep auditioned or captured chords in the register you want.',
    [gl('Harmony Engine / Manual Voicing', 'Octave')],
  ),
  harmonyManualInversion: entry(
    'Rotates which chord tone is placed lowest.',
    'Inversion changes the note order while keeping the same chord identity. It is useful for smoother motion between chords or a different bass contour.',
    [gl('Harmony Engine / Manual Voicing', 'Inversion')],
  ),
  harmonyManualSpread: entry(
    'Controls how widely the chord tones are spaced.',
    'Lower spread keeps the voicing tighter. Higher spread opens the notes across a wider register for a broader pad or piano shape.',
    [gl('Harmony Engine / Manual Voicing', 'Spread')],
  ),
  harmonyManualBass: entry(
    'Adds or removes a bass reinforcement tone.',
    'Bass mode can leave the bass off, reinforce the root, or reinforce the fifth. It changes the voicing support tone without changing the chord label.',
    [gl('Harmony Engine / Manual Voicing', 'Bass')],
  ),
  harmonyManualPreserve: entry(
    'Preserves the captured voicing shape more literally.',
    'When enabled, captured voicing details are kept instead of being freely re-resolved. Use this when the exact spacing matters more than adaptive reharmonization.',
    [gl('Harmony Engine / Manual Voicing', 'Preserve Exact Voicing')],
  ),
  harmonyManualTriggerMode: entry(
    'Turns slot buttons into live trigger controls.',
    'Trigger mode lets the Manual Voicing slot strip call stored Chord Lab slots directly. In control mode, this can make the live harmony follow the triggered slot.',
    [gl('Harmony Engine / Manual Voicing', 'Trigger Mode')],
  ),
  harmonyManualSlotTrigger: entry(
    'Auditions, controls, or captures with this slot.',
    'Slot buttons behave according to the current Manual Voicing mode: audition loads the slot preview, control can trigger it live, and capture writes the current voicing into the slot.',
    [gl('Harmony Engine / Manual Voicing', 'Slot Trigger')],
  ),
  harmonyLabTabSlots: entry(
    'Shows the reusable chord slot bank.',
    'Slots hold chord intents that can be selected, triggered, captured from Manual Voicing, or referenced by sequence steps.',
    [gl('Harmony Engine / Chord Lab', 'Slots')],
  ),
  harmonyLabTabSequence: entry(
    'Shows the 8-step harmony sequence.',
    'The sequence organizes chord motion over time. Steps can use automatic harmony, their own intent, a copy of a slot, or a live follow reference to a slot.',
    [gl('Harmony Engine / Chord Lab', 'Sequence')],
  ),
  harmonyLabTabGenerate: entry(
    'Shows slot and sequence generation controls.',
    'Generate creates new chord slots, a new sequence, or both from the current key, scale, tension, and generation settings while optionally respecting locked items.',
    [gl('Harmony Engine / Chord Lab', 'Generate')],
  ),
  harmonyLabSlot: entry(
    'Selects a chord slot for inspection.',
    'Click a slot to edit it in the inspector. Double-clicking activates it for audition or live triggering, depending on the current Manual Voicing mode.',
    [gl('Harmony Engine / Chord Lab', 'Slot')],
  ),
  harmonyLabSlotName: entry(
    'Renames the selected chord slot.',
    'The name is for organization in Chord Lab. It does not affect the resolved harmony notes.',
    [gl('Harmony Engine / Chord Lab', 'Slot Name')],
  ),
  harmonyLabSlotDegree: entry(
    'Sets the selected slot root by scale degree.',
    'Slot degree stores the chord relative to the current scale so it can adapt when the global key or scale changes.',
    [gl('Harmony Engine / Chord Lab', 'Slot Degree')],
  ),
  harmonyLabSlotQuality: entry(
    'Sets the selected slot chord quality.',
    'This chooses the main chord shape stored in the slot. Sequence steps and manual triggers that reference the slot use this quality.',
    [gl('Harmony Engine / Chord Lab', 'Slot Quality')],
  ),
  harmonyLabSlotStrength: entry(
    'Sets how strongly the selected slot influences harmony.',
    'Bias lets the slot influence the result. Force makes the slot more explicit when it is used by manual triggering or sequence resolution.',
    [gl('Harmony Engine / Chord Lab', 'Slot Strength')],
  ),
  harmonyLabSlotExtension: entry(
    'Adds or removes extensions on the selected slot.',
    'Extensions become part of the slot intent and are included when the slot is previewed, triggered, copied into a sequence step, or resolved by the engine.',
    [gl('Harmony Engine / Chord Lab', 'Slot Extensions')],
  ),
  harmonyLabSlotCapture: entry(
    'Writes the current Manual Voicing preview into this slot.',
    'Capture copies the currently selected manual chord intent into the selected slot, unless the slot is locked or editing is blocked by morph position.',
    [gl('Harmony Engine / Chord Lab', 'Capture')],
  ),
  harmonyLabSlotLock: entry(
    'Locks or unlocks this slot for editing and generation.',
    'Locked slots are protected from direct clearing and from generation when Respect Locks is enabled.',
    [gl('Harmony Engine / Chord Lab', 'Slot Lock')],
  ),
  harmonyLabSlotClear: entry(
    'Resets the selected slot to its default chord intent.',
    'Clear removes the custom slot content and restores the default slot chord for its position, unless the slot is locked.',
    [gl('Harmony Engine / Chord Lab', 'Slot Clear')],
  ),
  harmonyLabSequenceStep: entry(
    'Selects a harmony sequence step for inspection.',
    'Each step can be enabled, muted, locked, assigned a probability, and set to auto harmony, a custom intent, a slot copy, or a slot follow mode.',
    [gl('Harmony Engine / Chord Lab', 'Sequence Step')],
  ),
  harmonyLabSequenceEnable: entry(
    'Enables or bypasses the harmony sequence.',
    'When the sequence is on, resolved harmony can advance through sequence steps. When off, the engine falls back to manual control, slots, morph, or baseline harmony.',
    [gl('Harmony Engine / Chord Lab', 'Sequence ON / OFF')],
  ),
  harmonyLabStepEnable: entry(
    'Enables or mutes the selected sequence step.',
    'A disabled step stays in the sequence layout but is skipped or treated as inactive by the harmony resolver.',
    [gl('Harmony Engine / Chord Lab', 'Step Enable')],
  ),
  harmonyLabStepMode: entry(
    'Chooses how the selected sequence step gets its harmony.',
    'Auto follows generated degree logic, Intent stores a custom chord intent, Copy snapshots a slot, and Follow keeps referencing a slot as it changes.',
    [gl('Harmony Engine / Chord Lab', 'Step Mode')],
  ),
  harmonyLabStepDegree: entry(
    'Sets the selected sequence step degree.',
    'Degree chooses I through VII for auto or intent-based sequence steps, keeping the step tied to the current scale.',
    [gl('Harmony Engine / Chord Lab', 'Step Degree')],
  ),
  harmonyLabStepQuality: entry(
    'Sets the selected sequence step quality.',
    'Quality chooses the chord type for this step when it is using auto or intent-based harmony.',
    [gl('Harmony Engine / Chord Lab', 'Step Quality')],
  ),
  harmonyLabStepSlot: entry(
    'Chooses which slot this step copies or follows.',
    'Slot selection matters when the step mode is Copy or Follow. Copy stores the slot intent at edit time, while Follow keeps reading the slot.',
    [gl('Harmony Engine / Chord Lab', 'Step Slot')],
  ),
  harmonyLabStepProbability: entry(
    'Sets how likely this sequence step is to fire.',
    'Lower probability makes the step less likely to affect the resolved harmony. Higher probability makes the step more dependable.',
    [gl('Harmony Engine / Chord Lab', 'Step Probability')],
  ),
  harmonyLabStepStrength: entry(
    'Sets how strongly this sequence step influences harmony.',
    'Bias lets the step guide the result. Force makes the step chord more explicit when the sequence resolves.',
    [gl('Harmony Engine / Chord Lab', 'Step Strength')],
  ),
  harmonyLabStepLock: entry(
    'Locks or unlocks the selected sequence step.',
    'Locked steps are protected from reset and from generation when Respect Locks is enabled.',
    [gl('Harmony Engine / Chord Lab', 'Step Lock')],
  ),
  harmonyLabStepReset: entry(
    'Resets the selected sequence step to automatic harmony.',
    'Reset clears custom intent and slot assignment for the selected step and returns it to auto quality.',
    [gl('Harmony Engine / Chord Lab', 'Step Reset')],
  ),
  harmonyGenerateTarget: entry(
    'Chooses what generation will rewrite.',
    'Generate can target only slots, only the sequence, or both. This lets you refresh one layer without destroying the other.',
    [gl('Harmony Engine / Generate', 'Target')],
  ),
  harmonyGenerateStyle: entry(
    'Chooses the harmonic style used by generation.',
    'Style nudges the generator toward baseline, ambient, functional, modal, dark, or bright chord movement while still respecting the current key and scale context.',
    [gl('Harmony Engine / Generate', 'Style')],
  ),
  harmonyGenerateComplexity: entry(
    'Sets how extended generated harmony should be.',
    'Lower complexity favors simpler triads and automatic qualities. Higher complexity allows more color tones and richer chord shapes.',
    [gl('Harmony Engine / Generate', 'Complexity')],
  ),
  harmonyGenerateMotion: entry(
    'Sets how active generated chord movement should be.',
    'Lower motion keeps generated harmony steadier. Higher motion makes the generated sequence move more assertively between degrees and colors.',
    [gl('Harmony Engine / Generate', 'Motion')],
  ),
  harmonyGenerateRespectLocks: entry(
    'Protects locked slots and steps during generation.',
    'When Respect Locks is on, generation leaves locked Chord Lab material alone. Turn it off only when you want generation to overwrite everything in the selected target.',
    [gl('Harmony Engine / Generate', 'Respect Locks')],
  ),
  harmonyGenerateBaselineMap: entry(
    'Commits a baseline harmony map into the sequence.',
    'Baseline Map fills the sequence from the deterministic baseline progression for the current key, scale, tension, and seed.',
    [gl('Harmony Engine / Generate', 'Baseline Map')],
  ),
  harmonyGenerateRun: entry(
    'Runs the harmony generator for the selected target.',
    'Generate creates new slots, sequence material, or both using the current generation target, style, complexity, motion, and lock settings.',
    [gl('Harmony Engine / Generate', 'Generate')],
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
    'This arms the synth Euclidean scheduler without changing the stored lane content. When started from this page, it only turns on engines selected by enabled Euclidean lanes so those lanes can sound. Once running, each enabled lane drives its selected lead, pad, or piano source according to its clock division, trigger pattern, and sub-lanes.',
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
