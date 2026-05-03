import { DRUM_VOICES, type DrumParamDef } from '../audio/drumVoiceConfig';
import type { DrumVoiceType } from '../audio/drumSynth';

export type SliderPageId = 'app' | 'global' | 'synth' | 'drums' | 'reverb' | 'granular' | 'earth' | 'delay' | 'dynamics' | 'routing';
export type DualModeSupport = 'full' | 'walk-only' | 'single-only';

export interface SliderHelpSurface {
  page: SliderPageId;
  section: string;
  label: string;
  dualMode: DualModeSupport;
  audit: string[];
}

export interface SliderHelpEntry {
  short: string;
  long: string;
  surfaces: SliderHelpSurface[];
}

export interface SliderAuditSummary {
  severity: 'issue' | 'limitation';
  scope: string;
  note: string;
}

type EntryCopy = Pick<SliderHelpEntry, 'short' | 'long'>;

const WALK_ONLY_NOTE = 'App.tsx normalizes sample-and-hold to walk mode for this parameter.';
const GLOBAL_SINGLE_NOTE = 'This surface intentionally uses the simple shared Slider without dual-range hooks.';

function surface(
  page: SliderPageId,
  section: string,
  label: string,
  dualMode: DualModeSupport = 'full',
  audit: string[] = [],
): SliderHelpSurface {
  return { page, section, label, dualMode, audit };
}

const g = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('global', section, label, dualMode, audit);
const sy = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('synth', section, label, dualMode, audit);
const dr = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('drums', section, label, dualMode, audit);
const rv = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('reverb', section, label, dualMode, audit);
const gr = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('granular', section, label, dualMode, audit);
const ea = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('earth', section, label, dualMode, audit);
const dy = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('delay', section, label, dualMode, audit);
const dn = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('dynamics', section, label, dualMode, audit);
const rt = (section: string, label: string, dualMode: DualModeSupport = 'full', audit: string[] = []) =>
  surface('routing', section, label, dualMode, audit);

function entry(short: string, long: string, surfaces: SliderHelpSurface[]): SliderHelpEntry {
  return { short, long, surfaces };
}

function lowHigh(short: string, low: string, high: string, surfaces: SliderHelpSurface[]): SliderHelpEntry {
  return entry(short, `Low values ${low}. High values ${high}.`, surfaces);
}

function cloneEntry(base: SliderHelpEntry, surfaces: SliderHelpSurface[]): SliderHelpEntry {
  return { short: base.short, long: base.long, surfaces };
}

function replaceAll(text: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((acc, [from, to]) => acc.split(from).join(to), text);
}

function rewriteEntry(
  base: SliderHelpEntry,
  replacements: Array<[string, string]>,
  surfaces: SliderHelpSurface[],
): SliderHelpEntry {
  return {
    short: replaceAll(base.short, replacements),
    long: replaceAll(base.long, replacements),
    surfaces,
  };
}

const mixEntries: Record<string, SliderHelpEntry> = {
  masterVolume: lowHigh(
    'Sets the overall output level.',
    'keep the whole app quiet or silent',
    'raise the full mix without changing the balance between engines',
    [g('Master Mixer / Output', 'Master')],
  ),
  synthLevel: lowHigh(
    'Sets Pad 1 dry level in the main mix.',
    'pull Pad 1 back or mute its dry signal',
    'bring Pad 1 forward before any granular processing or shared returns',
    [g('Master Mixer / Pad', 'Pad 1')],
  ),
  pad2Level: lowHigh(
    'Sets Pad 2 dry level in the main mix.',
    'pull Pad 2 back or mute its dry signal',
    'bring Pad 2 forward before any granular processing or shared returns',
    [g('Master Mixer / Pad', 'Pad 2')],
  ),
  pad1ReverbSend: lowHigh(
    'Sets how much Pad 1 feeds the shared reverb.',
    'keep Pad 1 mostly dry and direct',
    'push more of Pad 1 into the shared reverb tail',
    [
      g('Master Mixer / Pad', 'Reverb 1'),
      rt('Routing Matrix', 'Pad 1 → Reverb'),
    ],
  ),
  pad2ReverbSend: lowHigh(
    'Sets how much Pad 2 feeds the shared reverb.',
    'keep Pad 2 mostly dry and direct',
    'push more of Pad 2 into the shared reverb tail',
    [
      g('Master Mixer / Pad', 'Reverb 2'),
      rt('Routing Matrix', 'Pad 2 → Reverb'),
    ],
  ),
  pad1DelayASend: lowHigh(
    'Sets how much Pad 1 feeds shared Delay A.',
    'keep Pad 1 out of the shared single-line delay',
    'push more of Pad 1 into Delay A while the Delay tab continues to voice that bus',
    [rt('Routing Matrix', 'Pad 1 → Delay A')],
  ),
  pad1DelayBSend: lowHigh(
    'Sets how much Pad 1 feeds shared Delay B.',
    'keep Pad 1 out of the shared multitap bus',
    'route more Pad 1 energy into Delay B so the Clocked Space frontend shapes it',
    [rt('Routing Matrix', 'Pad 1 → Delay B')],
  ),
  pad2DelayASend: lowHigh(
    'Sets how much Pad 2 feeds shared Delay A.',
    'keep Pad 2 out of the shared single-line delay',
    'push more of Pad 2 into Delay A while the Delay tab continues to voice that bus',
    [rt('Routing Matrix', 'Pad 2 → Delay A')],
  ),
  pad2DelayBSend: lowHigh(
    'Sets how much Pad 2 feeds shared Delay B.',
    'keep Pad 2 out of the shared multitap bus',
    'route more Pad 2 energy into Delay B so the Clocked Space frontend shapes it',
    [rt('Routing Matrix', 'Pad 2 → Delay B')],
  ),
  lead1Level: lowHigh(
    'Sets Lead 1 level in the mix.',
    'tuck Lead 1 behind the rest of the texture or mute it',
    'bring Lead 1 forward without changing its preset morph or note logic',
    [
      g('Master Mixer / Lead', 'Lead 1'),
      sy('Lead 1 / Performance', 'Lead 1 Level'),
    ],
  ),
  lead2Level: lowHigh(
    'Sets Lead 2 level in the mix.',
    'tuck Lead 2 behind the rest of the texture or mute it',
    'bring Lead 2 forward without changing its preset morph or note logic',
    [
      g('Master Mixer / Lead', 'Lead 2'),
      sy('Lead 2 / Performance', 'Lead 2 Level'),
    ],
  ),
  lead1ReverbSend: lowHigh(
    'Sets how much Lead 1 feeds the shared reverb.',
    'keep Lead 1 mostly dry and focused',
    'surround Lead 1 with a larger, wetter tail',
    [
      g('Master Mixer / Lead', 'Reverb 1'),
      rt('Routing Matrix', 'Lead 1 → Reverb'),
    ],
  ),
  lead2ReverbSend: lowHigh(
    'Sets how much Lead 2 feeds the shared reverb.',
    'keep Lead 2 mostly dry and focused',
    'surround Lead 2 with a larger, wetter tail',
    [
      g('Master Mixer / Lead', 'Reverb 2'),
      rt('Routing Matrix', 'Lead 2 → Reverb'),
    ],
  ),
  lead1PostLPFKeyTracking: lowHigh(
    'Sets how much Lead 1 post-filter cutoff follows note pitch.',
    'keep the post LPF fixed as notes move',
    'open the post LPF upward for higher notes and lower it for lower notes',
    [sy('Lead 1 / Distance', 'LPF Key Track')],
  ),
  lead2PostLPFKeyTracking: lowHigh(
    'Sets how much Lead 2 post-filter cutoff follows note pitch.',
    'keep the post LPF fixed as notes move',
    'open the post LPF upward for higher notes and lower it for lower notes',
    [sy('Lead 2 / Distance', 'LPF Key Track')],
  ),
  lead1DelayASend: lowHigh(
    'Sets Lead 1 trim into shared Delay A.',
    'keep Lead 1 out of the shared single-line bus',
    'let more Lead 1 feed the shared Simple Delay bus',
    [rt('Routing Matrix', 'Lead 1 → Delay A')],
  ),
  lead1DelayBSend: lowHigh(
    'Sets how much Lead 1 feeds shared Delay B.',
    'keep Lead 1 out of the multitap bus',
    'send more Lead 1 into Delay B for clocked, cascading repeats',
    [rt('Routing Matrix', 'Lead 1 → Delay B')],
  ),
  lead2DelayASend: lowHigh(
    'Sets Lead 2 trim into shared Delay A.',
    'keep Lead 2 out of the shared single-line bus',
    'let more Lead 2 feed the shared Simple Delay bus',
    [rt('Routing Matrix', 'Lead 2 → Delay A')],
  ),
  lead2DelayBSend: lowHigh(
    'Sets how much Lead 2 feeds shared Delay B.',
    'keep Lead 2 out of the multitap bus',
    'send more Lead 2 into Delay B for clocked, cascading repeats',
    [rt('Routing Matrix', 'Lead 2 → Delay B')],
  ),
  delayAToBSend: lowHigh(
    'Sets how much shared Delay A cross-feeds into shared Delay B.',
    'keep the two delay buses separate and cleaner',
    'let Delay A repeats spill into Delay B for denser cascades',
    [
      rt('Routing Matrix', 'Delay A Out → Delay B'),
      dy('Routing', 'Delay A → Delay B'),
    ],
  ),
  delayAGranularSend: lowHigh(
    'Sets how much shared Delay A feeds the granular input.',
    'keep Delay A repeats out of the granular buffer',
    'recycle more Delay A output into the granular texture engine',
    [
      rt('Routing Matrix', 'Delay A Out → Granular'),
      dy('Routing', 'Delay A → Granular'),
    ],
  ),
  delayBGranularSend: lowHigh(
    'Sets how much shared Delay B feeds the granular input.',
    'keep the multitap cloud separate from the granular buffer',
    'turn more Delay B repeats into new granular source material',
    [
      rt('Routing Matrix', 'Delay B Out → Granular'),
      dy('Routing', 'Delay B → Granular'),
    ],
  ),
  drumDelayASend: lowHigh(
    'Sets the whole drum bus trim into shared Delay A.',
    'keep drums out of the shared single-line delay',
    'route more of the kit into the shared Simple Delay bus',
    [rt('Routing Matrix', 'Drums → Delay A')],
  ),
  drumDelayBSend: lowHigh(
    'Sets how much of the drum bus feeds shared Delay B.',
    'keep drums out of the shared multitap path',
    'push more of the kit into Delay B, using the Clocked Space settings as the shared frontend',
    [
      rt('Routing Matrix', 'Drums → Delay B'),
      dy('Routing', 'Drums → Delay B'),
    ],
  ),
  delayAReverbSend: lowHigh(
    'Sets how much shared Delay A feeds the shared reverb.',
    'keep the single-line delay more direct and self-contained',
    'spill more Delay A energy into the common reverb tail',
    [
      rt('Routing Matrix', 'Delay A Out → Reverb'),
      dy('Delay A / Simple Delay', 'Reverb Send'),
    ],
  ),
  drumLevel: lowHigh(
    'Sets the overall drum bus level.',
    'keep the whole kit quiet or fully out of the mix',
    'push the full drum engine forward without changing per-voice balances',
    [
      g('Master Mixer / Drum', 'Level'),
      dr('Master Strip', 'Level'),
    ],
  ),
  drumReverbSend: lowHigh(
    'Sets how much the drum bus feeds the shared reverb.',
    'keep the kit tighter and drier',
    'send more of the kit into the common reverb wash',
    [
      g('Master Mixer / Drum', 'Reverb'),
      rt('Routing Matrix', 'Drums → Reverb'),
      dr('Master Strip', 'Reverb'),
    ],
  ),
  granularLevel: lowHigh(
    'Sets the granular return level.',
    'keep the granular layer subtle or silent',
    'bring the chopped cloud forward in the mix',
    [
      g('Master Mixer / Granular', 'Level'),
      gr('Space', 'Granular Level'),
    ],
  ),
  granularReverbSend: lowHigh(
    'Sets how much granular output feeds the shared reverb.',
    'keep the granular layer relatively dry',
    'stack a longer reverb tail on top of the granular texture',
    [
      g('Master Mixer / Granular', 'Reverb'),
      rt('Routing Matrix', 'Granular → Reverb'),
      gr('Space', 'Reverb Send'),
    ],
  ),
  granularDelayASend: lowHigh(
    'Sets how much granular output feeds shared Delay A.',
    'keep the granular return out of the shared single-line bus',
    'let more granular output seed Delay A before it comes back into the main mix',
    [rt('Routing Matrix', 'Granular → Delay A')],
  ),
  granularDelayBSend: lowHigh(
    'Sets how much granular output feeds shared Delay B.',
    'keep the granular return out of the shared multitap bus',
    'send more granular output into Delay B, using the Clocked Space frontend as the shared voicing',
    [rt('Routing Matrix', 'Granular → Delay B')],
  ),
  oceanSampleLevel: lowHigh(
    'Sets the waves sample level.',
    'keep the surf bed quiet or fully muted',
    'make the recorded waves more prominent in the Earth mix',
    [
      g('Master Mixer / Earth', 'Waves'),
      ea('Waves', 'Waves Level'),
      ea('Earth Mixer', 'Waves'),
    ],
  ),
  waterLevel: lowHigh(
    'Sets the water engine output level and scales its shared FX sends.',
    'keep the synthesized water layers subtle or silent while also pulling their shared space routing down',
    'bring the water engine forward and feed more of that same water balance into the shared FX',
    [
      g('Master Mixer / Earth', 'Water'),
      ea('Earth Mixer', 'Water'),
    ],
  ),
  insectsLevel: lowHigh(
    'Sets the first insect layer level.',
    'keep insect layer 1 quiet or fully muted',
    'let the first insect layer sit clearly on top of the ambience',
    [ea('Earth Mixer', 'Insect 1')],
  ),
  insectsSharedLevel: lowHigh(
    'Sets the shared insects bus level for both insect layers together and scales their shared FX sends.',
    'pull both insect layers and their shared routing down together without changing their internal balance',
    'raise the combined insects presence while leaving Insects 1 and Insects 2 relative levels intact',
    [
      g('Master Mixer / Earth', 'Insects'),
      rt('Routing Matrix', 'Insects Level'),
      ea('Earth Mixer', 'Insects Level'),
    ],
  ),
  insects2Level: lowHigh(
    'Sets the second insect layer level.',
    'keep insect layer 2 quiet or fully muted',
    'let the second insect layer sit clearly on top of the ambience',
    [ea('Earth Mixer', 'Insect 2')],
  ),
  earthLevel: lowHigh(
    'Sets the combined Earth bus level.',
    'pull waves, water, and insects down together',
    'raise the whole Earth layer without changing the internal Earth balances',
    [ea('Earth Mixer', 'Earth Master')],
  ),
  reverbLevel: lowHigh(
    'Sets the shared reverb return level.',
    'leave more of the mix dry and direct',
    'make the common reverb tail a larger part of the overall sound',
    [
      g('Master Mixer / Output', 'Reverb'),
      rv('Core', 'Return'),
    ],
  ),
};

const globalEntries: Record<string, SliderHelpEntry> = {
  tension: lowHigh(
    'Sets the harmonic tension target for the whole piece.',
    'bias scale and chord choices toward more consonant, settled material',
    'unlock darker, less resolved scale families and more unstable harmonic motion',
    [g('Scale & Tension', 'Tension')],
  ),
  phraseLength: lowHigh(
    'Sets how long each harmony phrase lasts.',
    'make the music change harmonic scenes more often',
    'let each phrase breathe longer before the next structural turn',
    [g('Transport & Sync', 'Phrase Seconds')],
  ),
  sequencerMasterBPM: entry(
    'Sets the shared beat-grid tempo used by BPM-driven sequencers.',
    'Lower values slow beat-synced engines like synth Euclid and drum Euclid. Higher values tighten the beat grid and, when BPM is the primary clock, also shorten the derived phrase length.',
    [g('Transport & Sync', 'Shared BPM')],
  ),
  randomness: lowHigh(
    'Sets how far the generators stray from their most stable choices.',
    'keep note, rhythm, and modulation choices more repeatable',
    'allow looser, more varied decisions across the engines',
    [g('Scale & Tension', 'Randomness')],
  ),
  randomWalkSpeed: entry(
    'Sets how fast walk-mode sliders drift inside their range.',
    'Low values make walk-mode parameters glide slowly and feel calmer. High values make them roam faster and change character more often.',
    [
      g('Scale & Tension', 'Walk Speed'),
      ea('Walk Speed', 'Walk Speed'),
    ],
  ),
  randomWalkMode: entry(
    'Chooses whether walk-mode sliders use local drift or shared epoch drift.',
    'Local Brownian uses each browser session\'s own wandering motion. Global Epoch Walk reads a deterministic wall-clock curve, so users on the same clock window hear the same walk positions. This only affects sliders in walk mode; it does not change harmony or Euclidean clocks.',
    [g('Scale & Tension', 'Walk Mode', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  transportPrimaryClock: entry(
    'Chooses which top-level time domain is authoritative.',
    'Phrase Seconds Master treats phrase length as the source of truth and derives BPM from bars-per-phrase plus beats-per-bar. Shared BPM Master does the reverse: the beat grid becomes authoritative and phrase length is derived from it. Decoupled keeps Phrase Seconds and Shared BPM independent so phrase-based clocks read phrase length directly while beat-based clocks read the shared BPM grid. This switch does not pick an engine\'s clock source by itself; it controls whether the seconds and BPM domains stay linked.',
    [g('Transport & Sync', 'Primary Clock', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  transportBarsPerPhrase: entry(
    'Sets how many bars fit inside one phrase when converting between seconds and BPM.',
    'Lower values make each phrase represent fewer bars. Higher values stretch the phrase across more bars, which changes the BPM-to-seconds conversion for any engine using the transport helpers.',
    [g('Transport & Sync', 'Bars / Phrase')],
  ),
  transportBeatsPerBar: entry(
    'Sets the beat count used for each bar in the shared transport math.',
    'Lower values shorten each bar and reduce phrase duration in beat-clock modes. Higher values lengthen bars and therefore lengthen any phrase derived from the beat grid.',
    [g('Transport & Sync', 'Beats / Bar')],
  ),
  harmonyClockSource: entry(
    'Chooses the phrase clock used by the harmony engine and pad chord refresh.',
    'Global Phrase uses wall-clock phrases shared across users. Local Phrase anchors phrases to this session\'s local start point. Global Beat Phrase and Local Beat Phrase derive phrase timing from the BPM grid instead of raw seconds. The pads do not have a separate random phrase clock because their chord changes follow harmony; pad Euclidean lanes still use the synth Euclid beat clock instead.',
    [g('Transport & Sync', 'Harmony / Pad Clock', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  harmonySyncPolicy: entry(
    'Chooses when harmony and pad clock edits take effect.',
    'Next Phrase waits for the next phrase boundary before applying transport edits, which keeps live changes predictable. Immediate keeps the current anchors and lets the next scheduled event use the new values right away. Restart Now re-anchors the relevant local clock and restarts harmony scheduling immediately.',
    [g('Transport & Sync', 'Harmony / Pad Apply', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  leadRandomClockSource: entry(
    'Chooses the phrase clock for the free-running random lead melody.',
    'This only affects the random Lead 1 phrase scheduler. It does not change lead Euclidean lanes, pad chords, or harmony itself. Phrase modes schedule random lead events over phrase windows; beat-phrase modes derive those windows from the BPM transport.',
    [g('Transport & Sync', 'Lead Random Clock', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  leadRandomSyncPolicy: entry(
    'Chooses when the random lead melody adopts timing changes.',
    'Next Phrase defers edits until the next phrase boundary so the current lead phrase can finish cleanly. Immediate clears the pending lead phrase and reschedules right away on the new timing model.',
    [g('Transport & Sync', 'Lead Random Apply', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  synthEuclidClockSource: entry(
    'Chooses the beat clock used by the synth Euclidean sequencer.',
    'Local Beat anchors synth Euclid to this session\'s local beat transport. Global Beat ties it to the shared wall-clock beat grid. This clock applies to both lead-sourced Euclidean lanes and any pad-sourced Euclidean lanes.',
    [g('Transport & Sync', 'Synth Euclid Clock', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  synthEuclidJoinPolicy: entry(
    'Chooses how newly enabled synth Euclidean lanes join the current beat transport.',
    'Grid starts the lane on the next available step division, which can preserve phase offsets between lanes. Next Bar waits for the next full bar and resets the lane to step 1, which is better when you want multiple synth Euclid lanes to come back in together live.',
    [g('Transport & Sync', 'Synth Euclid Join', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  drumEuclidClockSource: entry(
    'Chooses the beat clock used by the drum Euclidean sequencer.',
    'Local Beat anchors the drum engine to this session\'s local beat transport. Global Beat ties it to the shared wall-clock beat grid so multiple users can line up on the same beat phase.',
    [g('Transport & Sync', 'Drum Euclid Clock', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  drumEuclidJoinPolicy: entry(
    'Chooses how newly enabled drum Euclidean lanes join the beat transport.',
    'Grid starts the lane on the next matching step division. Next Bar waits for the next bar boundary and resets the lane so different drum lanes can realign in a more predictable way during live edits.',
    [g('Transport & Sync', 'Drum Euclid Join', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  cofDriftRate: entry(
    'Sets how many phrases pass between Circle-of-Fifths moves.',
    'Low values change keys more often and make the harmony wander sooner. High values hold each key area longer before the next drift step.',
    [g('Root & CoF Drift', 'Rate (phrases)', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  cofDriftRange: entry(
    'Sets how far Circle-of-Fifths drift is allowed to travel from home.',
    'Low values keep modulation close to the home key. High values allow longer excursions before the drift logic turns back.',
    [g('Root & CoF Drift', 'Range (steps)', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  chordProgressionSteps: entry(
    'Sets the length of the chord progression loop.',
    'Low values create a shorter, more repetitive cycle. High values create a longer loop with more room for harmonic variation.',
    [g('Chord Progression', 'Pattern Length')],
  ),
  chordProgressionClockSource: entry(
    'Chooses which phrase clock advances the chord progression steps.',
    'Follow Harmony uses the same clock as harmony and the pad chord engine. Global Phrase and Local Phrase let the progression keep its own phrase transport while still feeding harmony degrees. This affects when progression steps advance, not how fast sub-phrase chord voicings move inside a step.',
    [g('Chord Progression', 'Clock Source', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  chordProgressionPhraseMultiplier: entry(
    'Sets how many phrases each progression step lasts.',
    'Lower values move to the next progression step every phrase. Higher values hold each degree across multiple phrases before advancing.',
    [g('Chord Progression', 'Step Length', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
  chordProgressionStepEnabled: entry(
    'Turns individual progression steps on or off.',
    'On steps advance harmony to their chosen degree. Off steps preserve the current progression degree for that slot, which creates held chords without Euclidean hits or rotation.',
    [g('Chord Progression', 'Step On/Off', 'single-only', [GLOBAL_SINGLE_NOTE])],
  ),
};

Object.assign(globalEntries, {
  padTensionValue: entry(
    'Offsets or locks harmonic tension for pad-sourced synth Euclidean evolution.',
    'In follow mode this slider shifts the global tension up or down for pad-sourced synth lanes; in locked mode it becomes Pad\'s own absolute tension target. Lower effective tension keeps pad-lane evolution calmer and more consonant, while higher effective tension allows more restless harmonic movement. It does not change pad level or filter gain.',
    [g('Per-Engine Tension', 'Pad')],
  ),
  leadTensionValue: entry(
    'Offsets or locks harmonic tension for lead note choice and FM timbre drift.',
    'In follow mode this shifts the global tension for the lead engine; in locked mode it sets a fixed lead-only tension target. Lower effective tension keeps the lead closer to chord tones and calmer FM settings, while higher effective tension loosens chord bias and adds more random movement to FM index, feedback, beat detune, and layer mix.',
    [g('Per-Engine Tension', 'Lead')],
  ),
  synthEuclidTensionValue: entry(
    'Offsets or locks harmonic tension for non-pad synth Euclidean lanes.',
    'In follow mode this is an offset from the global tension; in locked mode it becomes the synth sequencer\'s own target. Lower effective tension keeps Euclidean note choices more chord-bound and conservative, while higher effective tension widens note selection and pushes evolution toward less-resolved material. It is not a loudness control.',
    [g('Per-Engine Tension', 'Synth')],
  ),
  granularTensionValue: entry(
    'Offsets or locks the tension input used by the granular macro model.',
    'This does not act like gain. Lower effective tension makes the granular cloud softer and more bed-like by lengthening attacks and decays, adding blur, and keeping density fuller; higher effective tension pushes more octave lift and pitch spread inside the voice model, especially in expressive behavior mode.',
    [g('Per-Engine Tension', 'Gran')],
  ),
  reverbTensionValue: entry(
    'Offsets or locks the harmony-coupled tension shaping inside the shared reverb.',
    'Lower effective tension lengthens decay and adds diffusion so the reverb sits more like a smooth wash. Higher effective tension adds shimmer and a slightly more vivid top layer. It does not simply make the reverb louder.',
    [g('Per-Engine Tension', 'Reverb')],
  ),
  drumTensionValue: entry(
    'Offsets or locks the tension input used by drum Euclidean evolution.',
    'This currently feeds the drum sequencer\'s evolve logic rather than drum-bus gain. Lower effective tension keeps bar-to-bar mutations gentler; higher effective tension lets trigger, pitch, morph, distance, and other sub-lane changes mutate more aggressively when evolve is active.',
    [g('Per-Engine Tension', 'Drum')],
  ),
});

const padMorphHelp = lowHigh(
  'Morphs between the current pad preset in slot A and slot B.',
  'keep the pad closer to preset A',
  'pull the pad toward preset B, with the midpoint blending both presets',
  [sy('Pad 1 / Morph', 'Morph')],
);

const padHardnessHelp = lowHigh(
  'Adds saturation and resonance emphasis to the current pad.',
  'keep the pad softer, smoother, and cleaner',
  'add more drive, edge, and resonant bite',
  [sy('Pad 1 / Tone', 'Drive')],
);

const padOscMixHelp = entry(
  'Crossfades the two main pad oscillators.',
  'Low values favor Oscillator A. High values favor Oscillator B, while the middle keeps both oscillators present.',
  [sy('Pad 1 / Tone', 'Osc Mix')],
);

const padFoldHelp = entry(
  'Adds wavefolding to the current pad tone.',
  'Low values keep the pad close to its raw oscillator blend. High values add stronger folding, brighter harmonics, and a more overtly shaped timbre.',
  [sy('Pad 1 / Tone', 'Fold')],
);

const padFilterMinHelp = entry(
  'Sets the lower edge of the pad filter sweep.',
  'Low values let the sweep dip into darker territory. High values keep the moving cutoff from closing down as far.',
  [sy('Pad 1 / Filter', 'Min')],
);

const padFilterMaxHelp = entry(
  'Sets the upper edge of the pad filter sweep.',
  'Low values cap the filter at a darker ceiling. High values let the sweep open further and reveal more top end.',
  [sy('Pad 1 / Filter', 'Max')],
);

const padFilterResHelp = lowHigh(
  'Sets how much the main pad filter emphasizes its cutoff.',
  'keep the filter broad and smooth',
  'make the cutoff peak sharper, more vocal, and more obvious',
  [sy('Pad 1 / Filter', 'Resonance')],
);

const padFilterQHelp = lowHigh(
  'Sets the pad filter Q width.',
  'keep the filter response wider and gentler',
  'narrow the filter and make its peak feel tighter and more pronounced',
  [sy('Pad 1 / Filter', 'Q')],
);

const padFilterSlopeHelp = lowHigh(
  'Sets how steeply the pad filter rolls off beyond the cutoff.',
  'use the gentlest 12 dB/oct slope',
  'stack more filter stages for a steeper 48 dB/oct cutoff',
  [sy('Pad 1 / Filter', 'Slope')],
);

const padFilterKeyTrackingHelp = lowHigh(
  'Sets how much the main pad filter cutoff follows played note pitch.',
  'keep the filter cutoff fixed across the keyboard',
  'track pitch one octave of cutoff per octave played',
  [sy('Pad 1 / Filter', 'Key Track')],
);

const padAttackHelp = entry(
  'Sets how quickly the current pad swells in.',
  'Low values let notes speak almost immediately. High values create slower, softer fades into each chord.',
  [sy('Pad 1 / Envelope', 'Attack')],
);

const padDecayHelp = entry(
  'Sets how quickly the current pad falls from attack to sustain.',
  'Low values drop into the sustain stage quickly. High values let the opening bloom hang on longer before settling.',
  [sy('Pad 1 / Envelope', 'Decay')],
);

const padSustainHelp = entry(
  'Sets the held level of the current pad envelope.',
  'Low values leave a larger drop after the attack. High values keep more of the initial level sustained while the note is held.',
  [sy('Pad 1 / Envelope', 'Sustain')],
);

const padReleaseHelp = entry(
  'Sets how long the current pad rings after note-off.',
  'Low values fade the pad quickly between changes. High values let chords trail and overlap for longer.',
  [sy('Pad 1 / Envelope', 'Release')],
);

const lfoRateHelp = entry(
  'Sets how quickly the selected pad LFO moves.',
  'Low values create slow modulation sweeps. High values create faster wobble or shimmer.',
  [sy('Pad 1 / LFO 1', 'Rate')],
);

const lfoDepthHelp = entry(
  'Sets how strongly the selected pad LFO affects its destination.',
  'Low values keep the modulation subtle or inaudible. High values make the chosen destination move more dramatically.',
  [sy('Pad 1 / LFO 1', 'Depth')],
);

const oscLevelHelp = lowHigh(
  'Sets the level of the selected pad oscillator.',
  'pull that oscillator back in the blend',
  'make that oscillator more dominant inside the pad timbre',
  [sy('Pad 1 / Oscillator', 'Lvl')],
);

const oscOctaveHelp = entry(
  'Sets the octave offset of the selected pad oscillator.',
  'Low values place that oscillator lower and heavier. High values move it up for a brighter, smaller-feeling layer.',
  [sy('Pad 1 / Oscillator', 'Oct')],
);

const oscDetuneHelp = entry(
  'Detunes the selected pad oscillator away from the others.',
  'Low values keep the oscillator tightly locked. High values widen beating and chorusing between the layers.',
  [sy('Pad 1 / Oscillator', 'Det')],
);

const padMorphSpeedHelp = entry(
  'Sets how many phrases Pad Auto Morph takes for a full sweep.',
  'Low values make the preset blend move faster. High values stretch the motion across more phrases for a slower A-to-B-to-A evolution.',
  [sy('Pad 1 / Auto Morph', 'Speed')],
);

const subLevelHelp = lowHigh(
  'Sets the level of the pad sub oscillator.',
  'keep the sub layer subtle or off',
  'add more low-end support under the main oscillators',
  [sy('Pad 1 / Sub Oscillator', 'Level')],
);

const subOctaveHelp = entry(
  'Sets how far below the main pad the sub oscillator sits.',
  'Low values keep the sub closer to the main pitch. High values move it further down for a heavier, deeper foundation.',
  [sy('Pad 1 / Sub Oscillator', 'Octave')],
);

const noiseLevelHelp = lowHigh(
  'Sets the amount of noise mixed into the pad.',
  'keep the pad cleaner and more pitched',
  'add more air, grain, and breath around the oscillators',
  [sy('Pad 1 / Noise', 'Level')],
);

const warmthHelp = lowHigh(
  'Boosts the low-end warmth of the pad.',
  'leave the pad leaner and cleaner',
  'thicken the lower mids and bass content',
  [sy('Pad 1 / Character', 'Warmth')],
);

const presenceHelp = lowHigh(
  'Boosts the high-mid presence of the pad.',
  'keep the pad softer and further back',
  'push attack, detail, and upper-mid definition forward',
  [sy('Pad 1 / Character', 'Presence')],
);

const modEnvDepthHelp = entry(
  'Sets how strongly the pad modulation envelope moves its destination.',
  'Low values keep the extra envelope effect subtle or absent. High values make the destination sweep farther each time a note starts.',
  [sy('Pad 1 / Mod Envelope', 'Depth')],
);

const modEnvAttackHelp = entry(
  'Sets how quickly the pad modulation envelope ramps up.',
  'Low values make the modulation happen immediately. High values delay the sweep and create a slower opening gesture.',
  [sy('Pad 1 / Mod Envelope', 'Attack')],
);

const modEnvDecayHelp = entry(
  'Sets how quickly the pad modulation envelope falls toward its sustain point.',
  'Low values make the extra movement collapse quickly. High values let the modulation hang on longer after the attack.',
  [sy('Pad 1 / Mod Envelope', 'Decay')],
);

const modEnvSustainHelp = entry(
  'Sets how much of the pad modulation envelope is held after the attack.',
  'Low values let the envelope fall away almost completely. High values keep more of the modulation active while the note sustains.',
  [sy('Pad 1 / Mod Envelope', 'Sustain')],
);

const modEnvReleaseHelp = entry(
  'Sets how long the pad modulation envelope trails after note-off.',
  'Low values stop the extra movement quickly. High values let the modulation continue to unwind after the note ends.',
  [sy('Pad 1 / Mod Envelope', 'Release')],
);

const filterBHelp = entry(
  'Sets the cutoff of the pad secondary filter.',
  'Low values make the second filter darker or more restrictive. High values open it up and let more harmonics through.',
  [sy('Pad 1 / Filter B', 'Cutoff')],
);

const filterBResHelp = lowHigh(
  'Sets how sharply the pad secondary filter speaks at its cutoff.',
  'keep the extra filter smoother',
  'make the second filter more peaky and more obviously resonant',
  [sy('Pad 1 / Filter B', 'Res')],
);

const filterBQHelp = lowHigh(
  'Sets the Q width of the pad secondary filter.',
  'keep the second filter broad',
  'tighten the band and make its focus more obvious',
  [sy('Pad 1 / Filter B', 'Q')],
);

const leadMorphHelp = lowHigh(
  'Morphs the current lead voice between its two FM presets.',
  'keep the lead closer to preset A',
  'move the lead toward preset B, with the middle blending both timbres',
  [sy('Lead 1 / Morph', 'Morph')],
);

const leadMorphSpeedHelp = entry(
  'Sets how quickly lead Auto Morph or random walk can traverse the preset morph range.',
  'Low values make automatic lead morphing drift slowly. High values move the morph position faster between the two lead presets.',
  [sy('Lead 1 / Morph', 'Speed')],
);

const leadHoldHelp = entry(
  'Sets how long Lead 1 stays at sustain before release.',
  'Low values make notes let go sooner. High values keep each note hanging longer before it fades.',
  [sy('Lead 1 / Performance', 'Hold Time')],
);

const vibratoDepthHelp = entry(
  'Sets how far the lead pitch bends during vibrato.',
  'Low values keep the lead nearly steady in pitch. High values make the vibrato wide and obvious.',
  [sy('Lead / Expression', 'Vibrato Depth')],
);

const vibratoRateHelp = entry(
  'Sets how fast the lead vibrato moves.',
  'Low values create a slow, lazy wobble. High values create a tighter, faster shimmer.',
  [sy('Lead / Expression', 'Vibrato Rate')],
);

const glideHelp = entry(
  'Sets how much the lead slides between pitches.',
  'Low values move quickly to the next note. High values produce slower portamento between notes.',
  [sy('Lead / Expression', 'Glide')],
);

const leadDelayTimeHelp = entry(
  'Sets the shared Delay A repeat spacing.',
  'Low values create tighter echoes. High values space the repeats farther apart.',
  [dy('Delay A / Simple Delay', 'Time')],
);

const leadDelayFeedbackHelp = entry(
  'Sets how much of shared Delay A is fed back into itself.',
  'Low values give only a few repeats. High values let the delay ring longer and build more atmosphere.',
  [dy('Delay A / Simple Delay', 'Feedback')],
);

const leadDelayMixHelp = entry(
  'Sets the wet level of shared Delay A.',
  'Low values keep the repeats tucked behind the dry signal. High values make the echo return much more obvious.',
  [dy('Delay A / Simple Delay', 'Mix')],
);

const chordRateHelp = entry(
  'Sets how often the pad chord generator picks a new harmony.',
  'Low values refresh the harmony more often. High values hold each chord for longer spans.',
  [sy('Harmony', 'Chord Rate')],
);

const voicingSpreadHelp = entry(
  'Sets how widely pad chord tones are spread across octaves.',
  'Low values keep the voicing compact. High values throw notes farther apart for a larger, airier chord stack.',
  [sy('Harmony', 'Voicing Spread')],
);

const waveSpreadHelp = entry(
  'Sets how staggered the pad voices are within a chord.',
  'Low values make the chord arrive together. High values smear the voice entries across time.',
  [sy('Harmony', 'Wave Spread')],
);

const detuneHelp = entry(
  'Sets the global baseline detune between pad oscillators and voices.',
  'Low values keep the pad more locked and pure. High values add more beating, warmth, and chorus-like spread.',
  [sy('Harmony', 'Detune')],
);

const leadDensityHelp = entry(
  'Sets how many Lead 1 notes are generated per phrase.',
  'Low values make the lead sparer and more spacious. High values make it speak more often inside each phrase.',
  [sy('Lead 1 / Melody', 'Note Density')],
);

const leadOctaveHelp = entry(
  'Sets the base register of Lead 1.',
  'Low values move the lead downward into a darker register. High values shift it upward into a brighter one.',
  [sy('Lead 1 / Melody', 'Octave Offset')],
);

const leadOctaveRangeHelp = entry(
  'Sets how wide Lead 1 can roam across octaves.',
  'Low values keep note choices in a tighter register. High values allow bigger jumps across more octaves.',
  [sy('Lead 1 / Melody', 'Octave Range')],
);

const synthEntries: Record<string, SliderHelpEntry> = {
  padMorph: padMorphHelp,
  hardness: padHardnessHelp,
  padOscMix: padOscMixHelp,
  padFoldAmount: padFoldHelp,
  filterCutoffMin: padFilterMinHelp,
  filterCutoffMax: padFilterMaxHelp,
  filterResonance: padFilterResHelp,
  filterQ: padFilterQHelp,
  filterSlope: padFilterSlopeHelp,
  filterKeyTracking: padFilterKeyTrackingHelp,
  synthAttack: padAttackHelp,
  synthDecay: padDecayHelp,
  synthSustain: padSustainHelp,
  synthRelease: padReleaseHelp,
  padLfo1Rate: lfoRateHelp,
  padLfo1Depth: lfoDepthHelp,
  padLfo2Rate: rewriteEntry(lfoRateHelp, [['LFO 1', 'LFO 2']], [sy('Pad 1 / LFO 2', 'Rate')]),
  padLfo2Depth: rewriteEntry(lfoDepthHelp, [['LFO 1', 'LFO 2']], [sy('Pad 1 / LFO 2', 'Depth')]),
  padOscALevel: rewriteEntry(oscLevelHelp, [['selected', 'Oscillator A']], [sy('Pad 1 / Osc A', 'Lvl')]),
  padOscAOctave: rewriteEntry(oscOctaveHelp, [['selected', 'Oscillator A']], [sy('Pad 1 / Osc A', 'Oct')]),
  padOscADetune: rewriteEntry(oscDetuneHelp, [['selected', 'Oscillator A']], [sy('Pad 1 / Osc A', 'Det')]),
  padOscBLevel: rewriteEntry(oscLevelHelp, [['selected', 'Oscillator B']], [sy('Pad 1 / Osc B', 'Lvl')]),
  padOscBOctave: rewriteEntry(oscOctaveHelp, [['selected', 'Oscillator B']], [sy('Pad 1 / Osc B', 'Oct')]),
  padOscBDetune: rewriteEntry(oscDetuneHelp, [['selected', 'Oscillator B']], [sy('Pad 1 / Osc B', 'Det')]),
  padMorphSpeed: padMorphSpeedHelp,
  padSubLevel: subLevelHelp,
  padSubOctave: subOctaveHelp,
  padNoiseLevel: noiseLevelHelp,
  warmth: warmthHelp,
  presence: presenceHelp,
  padModEnvDepth: modEnvDepthHelp,
  padModEnvAttack: modEnvAttackHelp,
  padModEnvDecay: modEnvDecayHelp,
  padModEnvSustain: modEnvSustainHelp,
  padModEnvRelease: modEnvReleaseHelp,
  padFilterBCutoff: filterBHelp,
  padFilterBResonance: filterBResHelp,
  padFilterBQ: filterBQHelp,
  pad2Morph: cloneEntry(padMorphHelp, [sy('Pad 2 / Morph', 'Morph')]),
  pad2Hardness: cloneEntry(padHardnessHelp, [sy('Pad 2 / Tone', 'Drive')]),
  pad2OscMix: cloneEntry(padOscMixHelp, [sy('Pad 2 / Tone', 'Osc Mix')]),
  pad2FoldAmount: cloneEntry(padFoldHelp, [sy('Pad 2 / Tone', 'Fold')]),
  pad2FilterCutoffMin: cloneEntry(padFilterMinHelp, [sy('Pad 2 / Filter', 'Min')]),
  pad2FilterCutoffMax: cloneEntry(padFilterMaxHelp, [sy('Pad 2 / Filter', 'Max')]),
  pad2FilterResonance: cloneEntry(padFilterResHelp, [sy('Pad 2 / Filter', 'Resonance')]),
  pad2FilterQ: cloneEntry(padFilterQHelp, [sy('Pad 2 / Filter', 'Q')]),
  pad2FilterSlope: cloneEntry(padFilterSlopeHelp, [sy('Pad 2 / Filter', 'Slope')]),
  pad2FilterKeyTracking: cloneEntry(padFilterKeyTrackingHelp, [sy('Pad 2 / Filter', 'Key Track')]),
  pad2Attack: cloneEntry(padAttackHelp, [sy('Pad 2 / Envelope', 'Attack')]),
  pad2Decay: cloneEntry(padDecayHelp, [sy('Pad 2 / Envelope', 'Decay')]),
  pad2Sustain: cloneEntry(padSustainHelp, [sy('Pad 2 / Envelope', 'Sustain')]),
  pad2Release: cloneEntry(padReleaseHelp, [sy('Pad 2 / Envelope', 'Release')]),
  pad2Lfo1Rate: cloneEntry(lfoRateHelp, [sy('Pad 2 / LFO 1', 'Rate')]),
  pad2Lfo1Depth: cloneEntry(lfoDepthHelp, [sy('Pad 2 / LFO 1', 'Depth')]),
  pad2Lfo2Rate: cloneEntry(rewriteEntry(lfoRateHelp, [['LFO 1', 'LFO 2']], [sy('Pad 2 / LFO 2', 'Rate')]), [sy('Pad 2 / LFO 2', 'Rate')]),
  pad2Lfo2Depth: cloneEntry(rewriteEntry(lfoDepthHelp, [['LFO 1', 'LFO 2']], [sy('Pad 2 / LFO 2', 'Depth')]), [sy('Pad 2 / LFO 2', 'Depth')]),
  pad2OscALevel: cloneEntry(rewriteEntry(oscLevelHelp, [['selected', 'Oscillator A']], [sy('Pad 2 / Osc A', 'Lvl')]), [sy('Pad 2 / Osc A', 'Lvl')]),
  pad2OscAOctave: cloneEntry(rewriteEntry(oscOctaveHelp, [['selected', 'Oscillator A']], [sy('Pad 2 / Osc A', 'Oct')]), [sy('Pad 2 / Osc A', 'Oct')]),
  pad2OscADetune: cloneEntry(rewriteEntry(oscDetuneHelp, [['selected', 'Oscillator A']], [sy('Pad 2 / Osc A', 'Det')]), [sy('Pad 2 / Osc A', 'Det')]),
  pad2OscBLevel: cloneEntry(rewriteEntry(oscLevelHelp, [['selected', 'Oscillator B']], [sy('Pad 2 / Osc B', 'Lvl')]), [sy('Pad 2 / Osc B', 'Lvl')]),
  pad2OscBOctave: cloneEntry(rewriteEntry(oscOctaveHelp, [['selected', 'Oscillator B']], [sy('Pad 2 / Osc B', 'Oct')]), [sy('Pad 2 / Osc B', 'Oct')]),
  pad2OscBDetune: cloneEntry(rewriteEntry(oscDetuneHelp, [['selected', 'Oscillator B']], [sy('Pad 2 / Osc B', 'Det')]), [sy('Pad 2 / Osc B', 'Det')]),
  pad2MorphSpeed: cloneEntry(padMorphSpeedHelp, [sy('Pad 2 / Auto Morph', 'Speed')]),
  pad2SubLevel: cloneEntry(subLevelHelp, [sy('Pad 2 / Sub Oscillator', 'Level')]),
  pad2SubOctave: cloneEntry(subOctaveHelp, [sy('Pad 2 / Sub Oscillator', 'Octave')]),
  pad2NoiseLevel: cloneEntry(noiseLevelHelp, [sy('Pad 2 / Noise', 'Level')]),
  pad2Warmth: cloneEntry(warmthHelp, [sy('Pad 2 / Character', 'Warmth')]),
  pad2Presence: cloneEntry(presenceHelp, [sy('Pad 2 / Character', 'Presence')]),
  pad2ModEnvDepth: cloneEntry(modEnvDepthHelp, [sy('Pad 2 / Mod Envelope', 'Depth')]),
  pad2ModEnvAttack: cloneEntry(modEnvAttackHelp, [sy('Pad 2 / Mod Envelope', 'Attack')]),
  pad2ModEnvDecay: cloneEntry(modEnvDecayHelp, [sy('Pad 2 / Mod Envelope', 'Decay')]),
  pad2ModEnvSustain: cloneEntry(modEnvSustainHelp, [sy('Pad 2 / Mod Envelope', 'Sustain')]),
  pad2ModEnvRelease: cloneEntry(modEnvReleaseHelp, [sy('Pad 2 / Mod Envelope', 'Release')]),
  pad2FilterBCutoff: cloneEntry(filterBHelp, [sy('Pad 2 / Filter B', 'Cutoff')]),
  pad2FilterBResonance: cloneEntry(filterBResHelp, [sy('Pad 2 / Filter B', 'Res')]),
  pad2FilterBQ: cloneEntry(filterBQHelp, [sy('Pad 2 / Filter B', 'Q')]),
  lead1Morph: leadMorphHelp,
  lead1MorphSpeed: leadMorphSpeedHelp,
  lead1Hold: leadHoldHelp,
  leadVibratoDepth: rewriteEntry(vibratoDepthHelp, [['Lead / Expression', 'Lead']], [
    sy('Lead 1 / Expression', 'Vibrato Depth'),
    sy('Lead 2 / Expression', 'Vibrato Depth'),
  ]),
  leadVibratoRate: rewriteEntry(vibratoRateHelp, [['Lead / Expression', 'Lead']], [
    sy('Lead 1 / Expression', 'Vibrato Rate'),
    sy('Lead 2 / Expression', 'Vibrato Rate'),
  ]),
  leadGlide: rewriteEntry(glideHelp, [['Lead / Expression', 'Lead']], [
    sy('Lead 1 / Expression', 'Glide'),
    sy('Lead 2 / Expression', 'Glide'),
  ]),
  delayATime: rewriteEntry(leadDelayTimeHelp, [['Lead / Delay', 'Lead']], [
    sy('Lead 1 / Delay', 'Delay Time'),
    sy('Lead 2 / Delay', 'Delay Time'),
    dy('Delay A / Simple Delay', 'Time'),
  ]),
  delayAFeedback: rewriteEntry(leadDelayFeedbackHelp, [['Lead / Delay', 'Lead']], [
    sy('Lead 1 / Delay', 'Delay Feedback'),
    sy('Lead 2 / Delay', 'Delay Feedback'),
    dy('Delay A / Simple Delay', 'Feedback'),
  ]),
  delayAMix: rewriteEntry(leadDelayMixHelp, [['Lead / Delay', 'Lead']], [
    sy('Lead 1 / Delay', 'Delay Mix'),
    sy('Lead 2 / Delay', 'Delay Mix'),
    dy('Delay A / Simple Delay', 'Mix'),
  ]),
  delayASend: entry(
    'Legacy master send for the older Lead-owned Delay A path.',
    'This control is being replaced by the per-lead Delay A send trims in Lead 1 and Lead 2 plus the Routing matrix.',
    [dy('Delay A / Simple Delay', 'Legacy Send')],
  ),
  delayASpread: entry(
    'Legacy spread control from the older Lead-owned Delay A path.',
    'Delay A now uses explicit left and right note divisions instead of a spread multiplier.',
    [dy('Delay A / Simple Delay', 'Legacy Spread')],
  ),
  delayAFilter: entry(
    'Darkens or brightens the repeats coming out of shared Delay A.',
    'Low values low-pass the delay more heavily for a softer echo. High values keep more edge and brightness in the repeats.',
    [dy('Delay A / Simple Delay', 'Filter')],
  ),
  lead2Morph: cloneEntry(leadMorphHelp, [sy('Lead 2 / Morph', 'Morph')]),
  lead2MorphSpeed: cloneEntry(leadMorphSpeedHelp, [sy('Lead 2 / Morph', 'Speed')]),
  chordRate: chordRateHelp,
  voicingSpread: voicingSpreadHelp,
  waveSpread: waveSpreadHelp,
  detune: detuneHelp,
  lead1Density: leadDensityHelp,
  lead1Octave: leadOctaveHelp,
  lead1OctaveRange: leadOctaveRangeHelp,
};

const reverbEntries: Record<string, SliderHelpEntry> = {
  reverbDecay: entry('Sets how long the shared reverb tail lasts.', 'Low values make the space dry up quickly. High values create a much longer, more lingering tail.', [rv('Core', 'Decay')]),
  reverbSize: entry('Sets the virtual size of the shared reverb space.', 'Low values feel tighter and smaller. High values feel larger, slower, and more cavernous.', [rv('Core', 'Size')]),
  reverbDiffusion: entry('Sets how smeared and dense the shared reverb is.', 'Low values leave more grain and separation in the reflections. High values smooth the reflections into a softer wash.', [rv('Core', 'Diffusion')]),
  reverbModulation: entry('Sets how much internal movement the shared reverb has.', 'Low values keep the tail steadier. High values add more chorus-like shimmer and drift inside the tank.', [rv('Mod & Character', 'Modulation')]),
  predelay: entry('Sets the gap between the dry sound and the start of the reverb.', 'Low values let the reverb bloom almost immediately. High values leave more front-edge definition before the space opens up.', [rv('Mod & Character', 'Pre-delay')]),
  damping: entry('Sets how quickly the shared reverb loses high frequencies.', 'Low values keep more top end alive in the tail. High values darken the decay faster.', [rv('Mod & Character', 'Damping')]),
  width: entry('Sets the stereo width of the shared reverb.', 'Low values keep the tail narrower and more centered. High values spread the reverb wider across the stereo field.', [rv('Mod & Character', 'Width')]),
  reverbShimmer: entry('Sets how much pitch-shifted shimmer is fed into the reverb path.', 'Low values keep the tail natural. High values add more synthetic, octave-like bloom.', [rv('Shimmer', 'Shimmer')]),
  reverbShimmerPitch: entry('Sets the pitch interval used by the shimmer path.', 'Low values move the shimmer down or keep it close to the source. High values push it farther upward into brighter, more angelic territory.', [rv('Shimmer', 'Shimmer Pitch')]),
  reverbShimmerFeedback: entry('Sets how strongly the shimmer path feeds back into itself.', 'Low values give a lighter shimmer accent. High values let the pitch-shifted trail compound into a thicker halo.', [rv('Shimmer', 'Shimmer Feedback')]),
  reverbChorusRate: entry('Sets how quickly the reverb chorus modulation moves.', 'Low values create slow motion inside the tail. High values create a faster internal swirl.', [rv('Chorus & Mod Character', 'Chorus Rate')]),
  reverbChorusDepth: entry('Sets how deep the chorus modulation is inside the reverb.', 'Low values keep the tail steadier. High values make the reverb bend and smear more obviously.', [rv('Chorus & Mod Character', 'Chorus Depth')]),
  reverbDampLow: entry('Sets low-band damping in the reverb tank.', 'Low values keep more low-frequency energy ringing inside the space. High values shorten and control the low end more aggressively.', [rv('Multi-band Damping', 'Damp Low')]),
  reverbDampHigh: entry('Sets high-band damping in the reverb tank.', 'Low values let the top end stay alive longer. High values make the reverb lose brightness faster.', [rv('Multi-band Damping', 'Damp High')]),
  reverbCrossoverFreq: entry('Sets where the reverb damping split happens between low and high bands.', 'Low values move more of the spectrum into the high-band damping zone. High values push the split upward and leave more mids in the low-band behavior.', [rv('Multi-band Damping', 'Crossover')]),
  reverbInputTone: entry('Tilts the tone feeding the reverb input.', 'Low values darken what enters the reverb. High values brighten the incoming signal before it blooms.', [rv('Input Tone', 'Tone')]),
  reverbSlowModRate: entry('Sets how quickly the slow character modulation drifts.', 'Low values make the reverb evolve almost imperceptibly. High values make its long-term motion more active.', [rv('Slow Modulation', 'Mod Rate')]),
  reverbSlowModDepth: entry('Sets how far the slow character modulation can move the reverb.', 'Low values keep the reverb character stable. High values let the space breathe and drift more noticeably.', [rv('Slow Modulation', 'Mod Depth')]),
  reverbWarp: entry('Sets how much pitch warp is introduced inside the reverb feedback path.', 'Low values keep the tail more natural. High values create a more bent, unstable, almost tape-like space.', [rv('Special', 'Warp')]),
  reverbCrossFeed: entry('Sets how much the left and right reverb channels feed each other.', 'Low values keep the stereo sides more independent. High values make the tank feel more cross-coupled and engulfing.', [rv('Special', 'Cross-Feed')]),
  reverbEarlyReflections: entry('Sets the level of the early reflection cluster.', 'Low values emphasize the long tail more than the room cues. High values add more front-end room shape before the tail takes over.', [rv('Spatial & Character', 'Early Reflections')]),
  reverbErLpFreq: entry('Sets the low-pass cutoff on the early reflections path.', 'Low values make the early reflections darker and softer. High values let more edge and brightness through the early room cues.', [rv('Spatial & Character', 'ER LP Freq')]),
  reverbAirAbsorption: entry('Sets how much high-frequency air loss happens in the reverb tail.', 'Low values keep the tail clearer. High values make distance and atmospheric rolloff more obvious.', [rv('Spatial & Character', 'Air Absorption')]),
  reverbTransientSmooth: entry('Softens transients before they enter the reverb tank.', 'Low values let attacks hit the reverb more directly. High values round off the front edge before it blooms into the space.', [rv('Spatial & Character', 'Transient Smooth')]),
  reverbPreCompThreshold: entry('Sets where the pre-reverb compressor starts reacting.', 'Low values make it clamp down earlier and level more of the incoming signal. High values let more raw attack pass into the tank before compression begins.', [rv('Input Dynamics', 'Threshold')]),
  reverbPreCompKnee: entry('Sets how gradually the pre-reverb compressor transitions into gain reduction.', 'Low values make the compressor engage more abruptly. High values make the leveling feel smoother and less obvious.', [rv('Input Dynamics', 'Knee')]),
  reverbPreCompRatio: entry('Sets how strongly the pre-reverb compressor evens out peaks.', 'Low values keep more of the original attack contour. High values flatten peaks more and make the bloom feel denser and more sustained.', [rv('Input Dynamics', 'Ratio')]),
  reverbPreCompAttackMs: entry('Sets how quickly the pre-reverb compressor catches the front edge.', 'Low values grab transients faster and soften the hit going into the tank. High values let more initial bite through before the reverb bloom is leveled.', [rv('Input Dynamics', 'Attack')]),
  reverbPreCompReleaseMs: entry('Sets how long the pre-reverb compressor stays engaged after a peak.', 'Low values recover faster and keep the reverb input more lively. High values hold the gain reduction longer, which can make the tail feel smoother and more glued together.', [rv('Input Dynamics', 'Release')]),
  reverbPreCompMakeup: entry('Sets the gain added back after the pre-reverb compressor.', 'Low values keep the reverb feed more restrained. High values push more level into the tank so the wet bloom comes forward and feels fuller.', [rv('Input Dynamics', 'Makeup')]),
  reverbReverse: entry('Blends reverse-style ambience into the shared reverb.', 'Low values keep the reverb behaving normally. High values emphasize reverse swells and suction-like blooms.', [rv('Special', 'Reverse Mix')]),
  reverbReverseLength: entry('Sets how long the reverse reverb buffer is.', 'Low values create tighter reverse swells. High values create slower, longer reverse ramps.', [rv('Special', 'Reverse Length')]),
  spectralFreezeSpeed: entry('Sets how fast slushy spectral freeze refreshes itself.', 'Low values make the frozen texture smear and mutate slowly. High values refresh the held spectrum more actively.', [rv('Spectral Freeze', 'Speed')]),
  spectralFreezeMix: entry('Sets the wet/dry balance of the spectral freeze module.', 'Low values keep more live signal present. High values let the frozen layer dominate.', [rv('Spectral Freeze', 'Mix')]),
  spectralFreezeDecay: entry('Sets how long the spectral freeze can hold before melting.', 'Low values let the frozen material dissolve quickly. High values hold it almost indefinitely.', [rv('Spectral Freeze', 'Sustain')]),
  spectralFreezePhaseJitter: entry('Adds phase randomization inside the frozen spectrum.', 'Low values keep the freeze more static and glassy. High values make the held texture more slushy and unstable.', [rv('Spectral Freeze', 'Phase Jitter')]),
  spectralFreezeReverbCrossfade: entry('Sets how much pre-reverb spectral freeze isolates itself from the live reverb path.', 'Low values keep more live reverb bleed mixed in. High values isolate the frozen layer more completely.', [rv('Spectral Freeze', 'Reverb Crossfade')]),
};

const granularEntries: Record<string, SliderHelpEntry> = {
  granularDiffusion: entry(
    'Sets the smear macro that glues the granular bus into a softer cloud.',
    'Low values keep the engine more pointillistic and dry-edged. High values raise bus diffusion and timing randomness, lengthen grain envelopes, add blur, trim some spray, and darken the granular LPFs so the whole return behaves more like one moving bed than four separate voices.',
    [gr('Modes & Macros', 'Smear')],
  ),
  granularMacroActivity: entry(
    'Sets the density-and-overlap macro across the four granular voices.',
    'Low values leave each voice closer to its own Density, Size, Blur, and Decay settings. High values push those voices toward fuller targets: more grains at once, larger grain windows, longer tails, and more overlap, so the cloud feels thicker rather than merely louder.',
    [gr('Modes & Macros', 'Activity')],
  ),
  granularMacroTexture: entry(
    'Pushes the granular voices toward blurrier, splashier readout behavior.',
    'Low values keep the voices tighter and more literal. High values increase blur, spray, grain size, grain-octave shimmer, and decay, so the source is read less like slices and more like a smeared texture.',
    [gr('Modes & Macros', 'Texture')],
  ),
  granularMacroComplexity: entry(
    'Raises the internal motion model for the granular voices.',
    'Low values keep position and stereo motion restrained. High values drive more position-LFO depth, faster position movement, and quicker pan motion, so the cloud roams and swirls more actively inside the buffer.',
    [gr('Modes & Macros', 'Motion')],
  ),
  granularMacroDarkness: entry(
    'Applies the tone macro that darkens the granular output and reverb feeds.',
    'Low values leave the granular return close to the user LPF settings. High values progressively lower both the granular output LPF and reverb-send LPF, pulling the cloud into a darker, more veiled band of the spectrum.',
    [gr('Modes & Macros', 'Tone')],
  ),
  granularMacroChaos: entry(
    'Raises the instability model inside the granular voices.',
    'Low values keep reverse movement, spray, and octave-jump behavior modest. High values speed up reverse-direction LFOs, widen spray, and add more octave-shift tendency, so the cloud feels less predictable and less anchored to the source.',
    [gr('Modes & Macros', 'Chaos')],
  ),
  granularChordBias: entry('Biases granular pitch choices toward current chord tones.', 'Low values allow freer pitch motion. High values keep grain transposition more strongly tied to the active harmony.', [gr('Modes & Macros / Harmony', 'Chord Bias')]),
  granularFeedback: entry('Sets how much the granular output feeds back into its own buffer path.', 'Low values keep repeats and accumulation under control. High values let the granular texture build and self-layer more aggressively.', [gr('Space', 'Feedback')]),
  granularFeedbackLPF: entry('Darkens the granular feedback loop.', 'Low values filter the feedback heavily for a darker loop. High values keep more brightness circulating inside the feedback path.', [gr('Space', 'FB LPF')]),
  granularReverbLPF: entry('Sets the low-pass filter feeding the granular reverb send.', 'Low values make the granular reverb trail darker and softer. High values let more bite and air into the reverb path.', [gr('Space', 'Reverb LPF')]),
  granularOutputLPF: entry('Sets the low-pass filter on the granular output path.', 'Low values tame the top end and soften the whole granular return. High values keep the output brighter and more detailed.', [gr('Space', 'Output LPF')]),
  granularDelayActivity: entry(
    'Controls the gain pattern across the eight granular clocked-space delay taps.',
    'Low values mainly favor the earliest taps and keep the multitap lattice sparse. High values bring more late taps up as well, so the repeats become denser, more syncopated, and more spatially filled out, with a different weighting curve in diffuse mode.',
    [
      gr('Clocked Space', 'Activity'),
      dy('Delay B', 'Activity'),
    ],
  ),
  granularDelayTime: entry(
    'Sets the master note grid for shared Delay B.',
    'Shorter note values keep the multitap lattice tighter and more animated. Longer note values spread the taps farther apart for broader rhythmic space.',
    [
      gr('Clocked Space', 'Time'),
      dy('Delay B', 'Time'),
    ],
  ),
  granularDelayRepeats: entry(
    'Sets how long the granular clocked-space delay repeats.',
    'Low values give fewer repeats. High values let the delay line recycle longer.',
    [
      gr('Clocked Space', 'Repeats'),
      dy('Delay B', 'Repeats'),
    ],
  ),
  granularDelayFilter: entry(
    'Darkens or brightens the granular clocked-space repeats.',
    'Low values make the delay darker and softer. High values keep more edge in the repeats.',
    [
      gr('Clocked Space', 'Filter'),
      dy('Delay B', 'Filter'),
    ],
  ),
  granularDelayVibrato: entry(
    'Adds delay-time modulation to the granular clocked-space taps.',
    'Low values keep the repeats stable. High values make them wobble and shimmer more obviously.',
    [
      gr('Clocked Space', 'Vibrato'),
      dy('Delay B', 'Vibrato'),
    ],
  ),
  granularDelayMix: entry(
    'Sets the output level of the shared Delay B return.',
    'Low values keep Clocked Space tucked behind the dry sources. High values bring the whole multitap return forward in the mix without changing its send relationships.',
    [
      rt('Routing Matrix', 'Delay B Out → Level'),
      gr('Clocked Space', 'Level'),
      dy('Delay B', 'Level'),
    ],
  ),
  granularDelayReverbSend: entry(
    'Sets how much the granular clocked-space output feeds the shared reverb.',
    'Low values keep the multitap path more self-contained. High values let the delay spill further into the common reverb tail.',
    [
      rt('Routing Matrix', 'Delay B Out → Reverb'),
      gr('Clocked Space', 'Reverb Send'),
      dy('Delay B', 'Reverb Send'),
    ],
  ),
  granularPad1Send: entry('Sets how much Pad 1 is routed into the granular engine.', 'Low values keep Pad 1 mostly out of the granular buffer. High values feed more of Pad 1 into the chopper.', [gr('Input Sources', 'Pad 1'), rt('Routing Matrix', 'Pads → Granular')]),
  granularPad2Send: entry('Sets how much Pad 2 is routed into the granular engine.', 'Low values keep Pad 2 mostly out of the granular buffer. High values feed more of Pad 2 into the chopper.', [gr('Input Sources', 'Pad 2'), rt('Routing Matrix', 'Pads → Granular')]),
  granularLead1Send: entry('Sets how much Lead 1 is routed into the granular engine.', 'Low values keep Lead 1 mostly dry. High values let Lead 1 seed the granular buffer more heavily.', [gr('Input Sources', 'Lead 1'), rt('Routing Matrix', 'Lead 1 → Granular')]),
  granularLead2Send: entry('Sets how much Lead 2 is routed into the granular engine.', 'Low values keep Lead 2 mostly dry. High values let Lead 2 seed the granular buffer more heavily.', [gr('Input Sources', 'Lead 2'), rt('Routing Matrix', 'Lead 2 → Granular')]),
  granularDrumSend: entry('Sets how much the drum engine is routed into the granular buffer.', 'Low values keep drums largely out of the granular path. High values let percussive material drive more granular texture.', [gr('Input Sources', 'Drums'), rt('Routing Matrix', 'Drums → Granular')]),
  granularWavesSend: entry('Sets how much the waves layer is routed into the granular buffer.', 'Low values keep the surf bed out of the granular engine. High values let the recorded waves seed the granular texture.', [
    gr('Input Sources', 'Waves'),
    rt('Routing Matrix', 'Waves → Granular'),
    ea('Earth Mixer', 'Waves → Granular'),
  ]),
  granularNatureSend: entry('Sets how much the shared Nature bus is routed into the granular buffer.', 'Low values keep birds and frogs mostly direct. High values let the combined Nature textures feed the granular engine more strongly.', [
    gr('Input Sources', 'Nature'),
    rt('Routing Matrix', 'Nature → Granular'),
    ea('Active Earth Matrix', 'Nature Granular'),
  ]),
  granularWaterSend: entry('Sets how much the water engine is routed into the granular buffer.', 'Low values keep the synthesized water mostly clean. High values let more water energy feed the granular cloud.', [
    gr('Input Sources', 'Water'),
    rt('Routing Matrix', 'Water → Granular'),
    ea('Earth Mixer', 'Water → Granular'),
  ]),
  granularInsectsSend: entry('Sets how much the insect layers are routed into the granular buffer.', 'Low values keep the insects mostly direct. High values let more chirps and clicks feed the granular engine.', [
    gr('Input Sources', 'Insects'),
    rt('Routing Matrix', 'Insects → Granular'),
    ea('Earth Mixer', 'Insects → Granular'),
  ]),
  granularLegacyJitter: entry('Adds timing jitter to the legacy granulator.', 'Low values keep legacy grains tightly aligned. High values scatter their timing more loosely.', [gr('Voices / Legacy Granulator', 'Jitter')]),
  granularLegacyProbability: entry('Sets how often the legacy granulator emits a grain.', 'Low values skip more grain opportunities. High values trigger grains more consistently.', [gr('Voices / Legacy Granulator', 'Probability')]),
  granularLegacyMaxGrains: entry('Sets the voice cap for the legacy granulator.', 'Low values keep the legacy mode leaner. High values allow a thicker stack of simultaneous grains.', [gr('Voices / Legacy Granulator', 'Max Grains')]),
  granularLegacyPitchSpread: entry('Sets how far the legacy granulator can spread pitch.', 'Low values keep legacy grains closer to the source pitch. High values widen the transposition range.', [gr('Voices / Legacy Granulator', 'Pitch Spread')]),
  granularLegacyFeedback: entry('Sets the legacy granulator feedback amount.', 'Low values keep old-buffer recirculation subtle. High values let legacy grains accumulate more heavily.', [gr('Voices / Legacy Granulator', 'Legacy FB')]),
};

const earthEntries: Record<string, SliderHelpEntry> = {
  oceanFilterCutoff: entry(
    'Sets the waves filter cutoff.',
    'Low values darken the recorded surf and hide more top end. High values open the filter and keep more hiss, foam, and brightness.',
    [ea('Waves', 'Filter Cutoff')],
  ),
  oceanFilterResonance: entry(
    'Sets how strongly the waves filter emphasizes its cutoff point.',
    'Low values keep the waves filter smooth. High values make the cutoff peak more obvious and more resonant.',
    [ea('Waves', 'Filter Resonance')],
  ),
  oceanReverbSend: entry(
    'Sets how much the waves layer feeds the shared reverb.',
    'Low values keep the recorded surf more direct. High values push more of it into the common reverb tail.',
    [
      rt('Routing Matrix', 'Waves → Reverb'),
      ea('Earth Mixer', 'Waves Reverb'),
    ],
  ),
  oceanDelayASend: entry(
    'Sets how much the waves layer feeds shared Delay A.',
    'Low values keep the waves out of the single-line delay bus. High values let more surf energy feed Delay A.',
    [rt('Routing Matrix', 'Waves → Delay A')],
  ),
  oceanDelayBSend: entry(
    'Sets how much the waves layer feeds shared Delay B.',
    'Low values keep the waves out of the multitap bus. High values let more surf energy feed Delay B.',
    [rt('Routing Matrix', 'Waves → Delay B')],
  ),
  natureLevel: entry(
    'Sets the shared master for the Nature sample group and scales the group FX routing.',
    'Low values pull Birds Alps, Birds Fujian, and Frogs down together while also reducing their shared FX feed. High values let the Nature stack sit forward in the Earth mix with proportionally stronger routing.',
    [
      rt('Routing Matrix', 'Nature Level'),
      ea('Active Earth Matrix', 'Nature Master'),
    ],
  ),
  natureReverbSend: entry(
    'Sets how much the shared Nature bus feeds the common reverb.',
    'Low values keep birds and frogs more direct. High values let the Nature layers dissolve further into the shared ambience.',
    [
      rt('Routing Matrix', 'Nature → Reverb'),
      ea('Active Earth Matrix', 'Nature Reverb'),
    ],
  ),
  natureDelayASend: entry(
    'Sets how much the shared Nature bus feeds Delay A.',
    'Low values keep birds and frogs out of the single-line delay bus. High values let more Nature texture seed Delay A.',
    [
      rt('Routing Matrix', 'Nature → Delay A'),
      ea('Active Earth Matrix', 'Nature Delay A'),
    ],
  ),
  natureDelayBSend: entry(
    'Sets how much the shared Nature bus feeds Delay B.',
    'Low values keep birds and frogs out of the multitap delay bus. High values let more Nature texture seed Delay B.',
    [
      rt('Routing Matrix', 'Nature → Delay B'),
      ea('Active Earth Matrix', 'Nature Delay B'),
    ],
  ),
  waterMorph: entry(
    'Morphs the water engine between preset A and preset B.',
    'Low values keep the water engine close to preset A. High values move it toward preset B, while the middle blends both.',
    [ea('Water Engine', 'Morph')],
  ),
  waterIntensity: entry(
    'Sets the overall energy of the water engine.',
    'Low values make the water calmer and lighter. High values make it more active, assertive, and texturally dense.',
    [ea('Water Engine', 'Intensity')],
  ),
  waterDistance: entry(
    'Sets the apparent distance of the water scene.',
    'Low values feel closer and more immediate. High values push the water back and make it feel more distant.',
    [ea('Water Engine', 'Distance')],
  ),
  waterDropSize: entry(
    'Sets the apparent scale of the water droplets.',
    'Low values favor smaller, finer droplets. High values favor larger, heavier water impacts.',
    [ea('Water Engine', 'Drop Size')],
  ),
  waterHardness: entry(
    'Sets how hard or soft the water impacts feel.',
    'Low values sound softer and rounder. High values sound harder and more click-like.',
    [ea('Water Engine', 'Hardness')],
  ),
  waterGlassThickness: entry(
    'Sets the thickness of the resonant material behind the water impacts.',
    'Low values feel thinner and lighter. High values feel thicker and more weighty.',
    [ea('Water Engine', 'Glass')],
  ),
  waterBaseFreq: entry(
    'Legacy shared base frequency for older water presets.',
    'Current water controls split this into separate Hard Drops and Water Drops base frequency sliders.',
    [ea('Water Engine', 'Base Freq')],
  ),
  waterHardDropBaseFreq: entry(
    'Sets the base frequency drive for the Hard Drops engine.',
    'Low values make hard drops darker and less active. High values push them brighter and more lively.',
    [ea('Water Engine', 'Hard Drops Engine / Base Freq')],
  ),
  waterWaterDropBaseFreq: entry(
    'Sets the base pitch and brightness for the Water Drops engine.',
    'Low values make soft drops deeper and rounder. High values make them smaller, higher, and more sparkly.',
    [ea('Water Engine', 'Water Drops Engine / Base Freq')],
  ),
  waterReverbSend: entry(
    'Sets how much the water engine feeds the shared reverb.',
    'Low values keep the water more intimate and dry. High values push more of it into the common ambience.',
    [
      rt('Routing Matrix', 'Water → Reverb'),
      ea('Water Engine', 'Reverb Send'),
      ea('Earth Mixer', 'Water Reverb'),
    ],
  ),
  waterDelayASend: entry(
    'Sets how much the water engine feeds shared Delay A.',
    'Low values keep the water engine out of the single-line delay bus. High values let more water texture feed Delay A.',
    [rt('Routing Matrix', 'Water → Delay A')],
  ),
  waterDelayBSend: entry(
    'Sets how much the water engine feeds shared Delay B.',
    'Low values keep the water engine out of the multitap bus. High values let more water texture feed Delay B.',
    [rt('Routing Matrix', 'Water → Delay B')],
  ),
  waterLayerHardDrops: lowHigh('Sets the hard-drop layer level inside the water engine.', 'leave the hard-drop layer faint or absent', 'make the hard, clicky drop layer much more present', [ea('Water Layers', 'Hard Drops')]),
  waterLayerWaterDrops: lowHigh('Sets the water-drop layer level inside the water engine.', 'keep the rounded droplet layer low', 'make the rounded droplet layer more dominant', [ea('Water Layers', 'Water Drops')]),
  waterLayerTurbulence: lowHigh('Sets the turbulence layer level inside the water engine.', 'keep the churning underlayer subtle', 'add more moving, noisy turbulence beneath the drops', [ea('Water Layers', 'Turbulence')]),
  waterLayerBubbling: lowHigh('Sets the bubbling layer level inside the water engine.', 'keep the bubble layer light', 'add more bubbling motion and fizz', [ea('Water Layers', 'Bubbling')]),
  waterLayerSurf: lowHigh('Sets the surf layer level inside the water engine.', 'keep wave swells out of the water texture', 'let longer surf gestures become a bigger part of the scene', [ea('Water Layers', 'Surf')]),
  waterLayerChannels: lowHigh('Sets the channels layer level inside the water engine.', 'keep the stream-to-wind layer quiet', 'bring the channels layer clearly into the blend', [ea('Water Layers', 'Channels')]),
  waterHardDropRate: entry('Sets how often the hard-drop layer fires.', 'Low values make hard drops rarer. High values make them happen more frequently.', [ea('Water Engine / Discrete Layers', 'Hard Drop Rate')]),
  waterHardDropLPF: entry('Sets how bright the hard-drop layer is.', 'Low values darken and soften hard drops. High values keep them bright and sharp.', [ea('Water Engine / Discrete Layers', 'Hard Drop LPF')]),
  waterWaterDropRate: entry('Sets how often the rounded water-drop layer fires.', 'Low values space the drops out. High values make them more frequent.', [ea('Water Engine / Discrete Layers', 'Water Drop Rate')]),
  waterWaterDropLPF: entry('Sets how bright the rounded water-drop layer is.', 'Low values make the drop layer darker and duller. High values let more sparkle through.', [ea('Water Engine / Discrete Layers', 'Water Drop LPF')]),
  waterBubblingRate: entry('Sets how active the bubbling layer is.', 'Low values make bubbling sparse. High values make bubbling much busier.', [ea('Water Engine / Discrete Layers', 'Bubbling Rate')]),
  waterBubblingLPF: entry('Sets how bright the bubbling layer is.', 'Low values keep bubbles darker and softer. High values make them brighter and fizzier.', [ea('Water Engine / Discrete Layers', 'Bubbling LPF')]),
  waterDensityHardSend: entry('Sets how much hard drops feed the density loop.', 'Low values keep hard drops mostly out of the feedback loop. High values let them drive more of the recirculating texture.', [ea('Water Engine / Density Loop', 'Hard Send')]),
  waterDensityWaterSend: entry('Sets how much rounded water drops feed the density loop.', 'Low values keep the drop layer out of the density return. High values let it seed more of the loop.', [ea('Water Engine / Density Loop', 'Drop Send')]),
  waterDensityBubbleSend: entry('Sets how much bubbling feeds the density loop.', 'Low values keep bubbles out of the loop. High values let bubbles contribute much more to the density wash.', [ea('Water Engine / Density Loop', 'Bubble Send')]),
  waterDensityFeedback: entry('Sets how much the density loop feeds back into itself.', 'Low values keep the loop short and controlled. High values make it accumulate and ring longer.', [ea('Water Engine / Density Loop', 'Feedback')]),
  waterDensityTone: entry('Sets the tone of the density loop return.', 'Low values make the density loop darker. High values keep it brighter and more articulate.', [ea('Water Engine / Density Loop', 'Tone')]),
  waterDensityRing: entry('Sets how much ring-mod character is added to the density loop.', 'Low values keep the density return more natural. High values add a more metallic, synthetic halo.', [ea('Water Engine / Density Loop', 'Ring Amount')]),
  waterDensityWet: entry('Sets the output level of the density loop return.', 'Low values keep the density layer subtle. High values let the loop become a major part of the water scene.', [ea('Water Engine / Density Loop', 'Density Wet')]),
  waterSurfDuration: entry('Sets how long each surf event lasts.', 'Low values create shorter, punchier waves. High values create longer swells.', [ea('Water Engine / Surf', 'Wave Duration')]),
  waterSurfInterval: entry('Sets how far apart the surf events are.', 'Low values produce waves more often. High values leave longer gaps between swells.', [ea('Water Engine / Surf', 'Wave Interval')]),
  waterSurfFoam: entry('Sets how much foam and spray energy the surf layer has.', 'Low values keep the wave smoother. High values add more froth and spray.', [ea('Water Engine / Surf', 'Foam')]),
  waterSurfFoamBright: entry('Sets how much bright sparkle the foam carries.', 'Low values keep the surf darker. High values add more airy, sparkling top end.', [ea('Water Engine / Surf', 'Foam Bright')]),
  waterSurfProximity: entry('Sets how close the surf layer feels.', 'Low values feel farther from shore. High values feel much closer and more immediate.', [ea('Water Engine / Surf', 'Proximity')]),
  waterSurfDepth: entry('Sets how much low-end depth the surf layer carries.', 'Low values keep the wave lighter and thinner. High values add more rumble and mass.', [ea('Water Engine / Surf', 'Depth')]),
  waterSurfBody: entry('Sets the body frequency of the surf layer.', 'Low values push the wave body deeper. High values move the body band upward.', [ea('Water Engine / Surf', 'Body Freq')]),
  waterSurfSpray: entry('Sets the spray frequency focus of the surf layer.', 'Low values make the spray darker. High values make the spray brighter and hissier.', [ea('Water Engine / Surf', 'Spray Freq')]),
  waterChannelsMorph: entry('Morphs the channels layer between stream-like and wind-like behavior.', 'Low values stay closer to stream behavior. High values shift the layer toward wind.', [ea('Water Engine / Channels', 'Morph', 'walk-only', [WALK_ONLY_NOTE])]),
  waterChannelsSpeed: entry('Sets how quickly the channels layer moves.', 'Low values create slow, gentle movement. High values create faster internal motion.', [ea('Water Engine / Channels', 'Speed', 'walk-only', [WALK_ONLY_NOTE])]),
};

const insectsDensityHelp = entry('Sets how dense the insect calls are.', 'Low values keep the layer sparse. High values make the insects busier and more populated.', [ea('Insects — Layer 1', 'Density', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsTemperatureHelp = entry('Shifts the insect layer toward cooler or hotter behavior.', 'Low values feel cooler and calmer. High values feel hotter, brighter, and more active.', [ea('Insects — Layer 1', 'Temperature', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsDistanceHelp = entry('Sets how far away the insect layer feels.', 'Low values feel close and detailed. High values push the insects farther back.', [ea('Insects — Layer 1', 'Distance', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsProximityHelp = entry('Sets how near the insects feel inside the stereo field.', 'Low values keep the layer less intimate. High values make it feel more up-close and present.', [ea('Insects — Layer 1', 'Proximity', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsAntiphonyHelp = entry('Sets how much the insect layer answers itself across space.', 'Low values keep the layer more unified. High values make it feel more call-and-response-like.', [ea('Insects — Layer 1', 'Antiphony', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsClickRateHelp = entry('Sets how clicky or pulse-dense the insect layer is.', 'Low values keep the chirp rhythm looser. High values add faster clicking detail.', [ea('Insects — Layer 1', 'Click Rate', 'walk-only', [WALK_ONLY_NOTE])]);
const insectsMotionHelp = entry('Sets how much movement the insect layer has.', 'Low values keep the insects relatively fixed. High values make them wander more actively.', [ea('Insects — Layer 1', 'Motion', 'walk-only', [WALK_ONLY_NOTE])]);

Object.assign(earthEntries, {
  insectsDensity: insectsDensityHelp,
  insectsTemperature: insectsTemperatureHelp,
  insectsDistance: insectsDistanceHelp,
  insectsProximity: insectsProximityHelp,
  insectsAntiphony: insectsAntiphonyHelp,
  insectsClickRate: insectsClickRateHelp,
  insectsMotion: insectsMotionHelp,
  insectsSharedLevel: entry(
    'Sets the shared insects bus level for both insect layers together.',
    'Low values pull both insect layers down together without changing their internal balance. High values raise the combined insects presence while keeping the Insects 1 and Insects 2 balance intact.',
    [
      ea('Earth Mixer', 'Insects Level'),
      rt('Routing Matrix', 'Insects Level'),
    ],
  ),
  insects2Density: cloneEntry(insectsDensityHelp, [ea('Insects — Layer 2', 'Density', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2Temperature: cloneEntry(insectsTemperatureHelp, [ea('Insects — Layer 2', 'Temperature', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2Distance: cloneEntry(insectsDistanceHelp, [ea('Insects — Layer 2', 'Distance', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2Proximity: cloneEntry(insectsProximityHelp, [ea('Insects — Layer 2', 'Proximity', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2Antiphony: cloneEntry(insectsAntiphonyHelp, [ea('Insects — Layer 2', 'Antiphony', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2ClickRate: cloneEntry(insectsClickRateHelp, [ea('Insects — Layer 2', 'Click Rate', 'walk-only', [WALK_ONLY_NOTE])]),
  insects2Motion: cloneEntry(insectsMotionHelp, [ea('Insects — Layer 2', 'Motion', 'walk-only', [WALK_ONLY_NOTE])]),
  insectsReverbSend: entry('Sets how much the insect layers feed the shared reverb.', 'Low values keep the insects tighter and more direct. High values let them dissolve further into the shared ambience.', [rt('Routing Matrix', 'Insects → Reverb'), ea('Earth Mixer', 'Insect Reverb')]),
  insDelayASend: entry('Sets how much the combined insects bus feeds shared Delay A.', 'Low values keep insects out of the single-line delay bus. High values let more chirps and textures feed Delay A.', [rt('Routing Matrix', 'Insects → Delay A')]),
  insDelayBSend: entry('Sets how much the combined insects bus feeds shared Delay B.', 'Low values keep insects out of the multitap bus. High values let more chirps and textures feed Delay B.', [rt('Routing Matrix', 'Insects → Delay B')]),
});

const dynamicsEntries: Record<string, SliderHelpEntry> = {
  tabDynamics: entry('Opens the Dynamics page.', 'Dynamics gathers sidechain ducking, character movement, degrade controls, and final bus compression in one page.', [dn('Navigation', 'Dynamics Tab', 'single-only', [GLOBAL_SINGLE_NOTE])]),
  sidechainEnabled: entry('Enables trigger-derived ducking.', 'Sidechain listens to the selected drum voices and ducks the selected dry, delay, granular, and reverb target branches.', [dn('Sidechain', 'Sidechain', 'single-only', [GLOBAL_SINGLE_NOTE])]),
  sidechainKeyAWeight: lowHigh('Weights the first drum key.', 'make Key A a gentle helper trigger', 'make Key A dominate the duck envelope', [dn('Sidechain', 'Key A Weight')]),
  sidechainKeyBWeight: lowHigh('Weights the second drum key.', 'keep Key B subtle', 'let Key B trigger a full duck alongside Key A', [dn('Sidechain', 'Key B Weight')]),
  sidechainAmount: lowHigh('Sets global duck depth.', 'keep target routing mostly dry', 'send more of each target through the ducked branch', [dn('Sidechain', 'Amount')]),
  sidechainMix: lowHigh('Blends sidechain targeting.', 'leave more of each target unaffected', 'use the full per-target duck amount', [dn('Sidechain', 'Mix')]),
  sidechainThreshold: lowHigh('Sets trigger sensitivity.', 'require stronger key hits', 'let more key hits produce ducking', [dn('Sidechain', 'Threshold')]),
  sidechainRatio: lowHigh('Sets duck intensity curve.', 'make a shallow level move', 'make key hits push targets down harder', [dn('Sidechain', 'Ratio')]),
  sidechainKnee: lowHigh('Softens the duck onset.', 'make the duck more immediate', 'make the duck onset rounder', [dn('Sidechain', 'Knee')]),
  sidechainCurve: lowHigh('Shapes trigger response.', 'make velocity response gentler', 'make stronger hits pull farther ahead', [dn('Sidechain', 'Curve')]),
  sidechainAttackMs: lowHigh('Sets duck attack time.', 'grab targets quickly', 'let the transient edge through', [dn('Sidechain', 'Attack')]),
  sidechainHoldMs: lowHigh('Holds the duck before release.', 'bounce back immediately', 'stay tucked for more of the beat', [dn('Sidechain', 'Hold')]),
  sidechainReleaseMs: lowHigh('Sets duck recovery time.', 'pump back quickly', 'recover in a slower swell', [dn('Sidechain', 'Release')]),
  sidechainMakeup: lowHigh('Offsets ducked branch level.', 'keep the duck deeper', 'recover more level inside the ducked branch', [dn('Sidechain', 'Makeup')]),
  sidechainDetectorHp: lowHigh('Reserved detector high-pass.', 'leave the trigger shape broad', 'prepare a brighter detector response for future audio-follow mode', [dn('Sidechain', 'Detector HPF')]),
  sidechainDetectorLp: lowHigh('Reserved detector low-pass.', 'prepare a darker detector response for future audio-follow mode', 'leave the trigger shape broad', [dn('Sidechain', 'Detector LPF')]),
  sidechainPad1Target: lowHigh('Sets Pad 1 duck amount.', 'leave Pad 1 dry', 'duck Pad 1 strongly from the selected keys', [dn('Sidechain', 'Pad 1 Target')]),
  sidechainPad2Target: lowHigh('Sets Pad 2 duck amount.', 'leave Pad 2 dry', 'duck Pad 2 strongly from the selected keys', [dn('Sidechain', 'Pad 2 Target')]),
  sidechainLead1Target: lowHigh('Sets Lead 1 duck amount.', 'leave Lead 1 dry', 'duck Lead 1 strongly from the selected keys', [dn('Sidechain', 'Lead 1 Target')]),
  sidechainLead2Target: lowHigh('Sets Lead 2 duck amount.', 'leave Lead 2 dry', 'duck Lead 2 strongly from the selected keys', [dn('Sidechain', 'Lead 2 Target')]),
  sidechainPianoTarget: lowHigh('Sets piano duck amount.', 'leave piano dry', 'duck piano strongly from the selected keys', [dn('Sidechain', 'Piano Target')]),
  sidechainGranularTarget: lowHigh('Sets granular-return duck amount.', 'leave granular return dry', 'duck granular return strongly from the selected keys', [dn('Sidechain', 'Granular Target')]),
  sidechainDelayATarget: lowHigh('Sets Delay A duck amount.', 'leave Delay A return dry', 'duck Delay A strongly from the selected keys', [dn('Sidechain', 'Delay A Target')]),
  sidechainDelayBTarget: lowHigh('Sets Delay B duck amount.', 'leave Delay B return dry', 'duck Delay B strongly from the selected keys', [dn('Sidechain', 'Delay B Target')]),
  sidechainReverbTarget: lowHigh('Sets reverb-return duck amount.', 'leave the reverb return open', 'duck the reverb return strongly from the selected keys', [dn('Sidechain', 'Reverb Target')]),
  endCompEnabled: entry('Enables final bus compression.', 'End Chain inserts a native compressor before the existing safety limiter, with dry/wet mix and makeup gain.', [dn('End Chain', 'End Chain', 'single-only', [GLOBAL_SINGLE_NOTE])]),
  endCompThreshold: lowHigh('Sets end-chain threshold.', 'compress only louder peaks', 'pull more of the full mix into compression', [dn('End Chain', 'Threshold')]),
  endCompKnee: lowHigh('Sets end-chain knee.', 'make compression more exact', 'make compression enter more gradually', [dn('End Chain', 'Knee')]),
  endCompRatio: lowHigh('Sets end-chain ratio.', 'use gentle glue', 'use stronger leveling', [dn('End Chain', 'Ratio')]),
  endCompAttackMs: lowHigh('Sets end-chain attack.', 'catch peaks quickly', 'preserve more transient edge', [dn('End Chain', 'Attack')]),
  endCompReleaseMs: lowHigh('Sets end-chain release.', 'recover quickly', 'recover more slowly and smoothly', [dn('End Chain', 'Release')]),
  endCompMakeup: lowHigh('Sets end-chain makeup.', 'keep compressed output lower', 'raise the compressed branch', [dn('End Chain', 'Makeup')]),
  endCompMix: lowHigh('Blends end-chain compression.', 'favor dry bus tone', 'favor compressed bus tone', [dn('End Chain', 'Mix')]),
  endCompDetectorHp: lowHigh('High-passes the end-chain detector.', 'let bass trigger more compression', 'keep subs from pulling the bus down', [dn('End Chain', 'Detector HP')]),
  endCompDetectorTilt: lowHigh('Tilts the end-chain detector toward filtered signal.', 'track the full mix more evenly', 'favor mid/high motion over sub weight', [dn('End Chain', 'SC Tilt')]),
  endCompAutoMakeup: lowHigh('Adds automatic compressor makeup.', 'use mostly manual makeup', 'loudness-match more strongly after gain reduction', [dn('End Chain', 'Auto Makeup')]),
  endCompProgramRelease: lowHigh('Makes release respond to gain reduction depth.', 'use steadier release timing', 'recover fast from small dips and slower from deeper gain reduction', [dn('End Chain', 'Program Rel')]),
  characterEnabled: entry('Enables character movement.', 'Character can be bypassed from the section header without losing the selected movement mode or control values.', [dn('Character', 'FX', 'single-only', [GLOBAL_SINGLE_NOTE])]),
  characterMix: lowHigh('Blends character processing.', 'keep the clean bus forward', 'lean into the character path', [dn('Character', 'Mix')]),
  characterAge: lowHigh('Ages the character path.', 'keep movement and loss subtle', 'add older, less stable behavior', [dn('Character', 'Age')]),
  characterDepth: lowHigh('Sets character modulation depth.', 'make movement shallow', 'make warble and filtering move farther', [dn('Character', 'Depth')]),
  characterRate: lowHigh('Sets character modulation rate.', 'move slowly', 'move faster', [dn('Character', 'Rate')]),
  characterDamp: lowHigh('Damps the character path.', 'keep brighter motion', 'round off more high-frequency motion', [dn('Character', 'Damp')]),
  characterEnvFollow: lowHigh('Sets envelope-reactive movement.', 'keep the character filter steadier', 'let transients open the watery lowpass path', [dn('Character', 'Env Follow')]),
  characterStereo: lowHigh('Sets stereo movement spread.', 'keep the character path centered', 'add dual-delay width and side-to-side drift', [dn('Character', 'Stereo')]),
  characterResonance: lowHigh('Sets character filter resonance.', 'keep filtering smooth', 'add more resonant color', [dn('Character', 'Resonance')]),
  degradeEnabled: entry('Enables media degradation.', 'Degrade can be bypassed from the section header without losing wear, tone, saturation, or tape settings.', [dn('Degrade', 'FX', 'single-only', [GLOBAL_SINGLE_NOTE])]),
  degradeMix: lowHigh('Blends the Degrade wet path.', 'keep the damaged path tucked away', 'bring the tape/lo-fi path forward', [dn('Degrade', 'Mix')]),
  degradeAge: lowHigh('Sets media wear.', 'keep the transport newer and cleaner', 'make pitch, bandwidth, noise, and corrosion feel older', [dn('Degrade', 'Wear')]),
  degradeGeneration: lowHigh('Adds copied-media loss.', 'keep the copy cleaner and closer to first generation', 'darken and smear the signal like repeated copies', [dn('Degrade', 'Generation')]),
  degradeAlias: lowHigh('Adds sample-rate and bit-depth damage.', 'keep the degraded path smoother', 'add stepped, aliased digital grit', [dn('Degrade', 'Alias')]),
  degradeWow: lowHigh('Sets slow pitch drift.', 'keep pitch steadier', 'add wider slow warble', [dn('Degrade', 'Wow')]),
  degradeFlutter: lowHigh('Sets fast pitch flutter.', 'keep pitch steadier', 'add faster tape-like flutter', [dn('Degrade', 'Flutter')]),
  degradeDrift: lowHigh('Sets long movement drift.', 'keep material centered', 'add slower wandering instability', [dn('Degrade', 'Drift')]),
  degradeWobbleSpeed: lowHigh('Sets tape wobble speed.', 'make wow wander more slowly', 'make tape bends move faster', [dn('Degrade', 'Wobble Speed')]),
  degradeNoise: lowHigh('Sets media noise.', 'keep the floor cleaner', 'add more hiss and grain', [dn('Degrade', 'Noise')]),
  degradeHp: lowHigh('Sets Degrade high-pass.', 'keep more low body', 'thin the low end more', [dn('Degrade', 'HP')]),
  degradeLp: lowHigh('Sets Degrade low-pass.', 'darken the path', 'keep more top end', [dn('Degrade', 'LP')]),
  degradeTone: lowHigh('Tilts Degrade tone.', 'favor a darker worn edge', 'favor brighter presence', [dn('Degrade', 'Tone')]),
  degradeSaturation: lowHigh('Sets Degrade-path clipping.', 'keep the damaged path cleaner', 'add more internal soft clipping', [dn('Degrade', 'Clip')]),
  degradeCorrosion: lowHigh('Sets degraded edge.', 'keep distortion smoother', 'add more broken alias-like edge', [dn('Degrade', 'Corrosion')]),
  dynamicsSaturationDrive: lowHigh('Sets Dynamics master saturation drive.', 'leave the bus cleaner', 'push harder into the selected saturation color', [dn('Saturation', 'Drive')]),
  dynamicsSaturationTone: lowHigh('Sets Dynamics saturation tone.', 'tilt the saturated bus darker', 'tilt the saturated bus brighter', [dn('Saturation', 'Tone')]),
  dynamicsSaturationBias: lowHigh('Sets Dynamics saturation bias.', 'keep clipping more symmetrical', 'lean into asymmetrical even-harmonic color', [dn('Saturation', 'Bias')]),
  masterSatDrive: lowHigh('Sets Delay-page master saturation drive.', 'keep the master saturation clean', 'push harder into the selected saturation shape', [dn('Delay', 'Drive')]),
  masterSatTone: lowHigh('Sets Delay-page master saturation tone.', 'tilt the saturated path darker', 'tilt the saturated path brighter', [dn('Delay', 'Sat Tone')]),
};

const granularVoiceBase = {
  Slice: entry('Chooses which slice of the shared buffer this voice reads from.', 'Low values keep the voice anchored to earlier slices. High values move it to later slices and therefore different source material.', []),
  Speed: entry('Sets this granular voice playback speed.', 'Low values slow the voice down and stretch it. High values make it move faster through the buffer.', []),
  Pitch: entry('Sets this granular voice transposition.', 'Low values pitch the voice downward. High values pitch it upward.', []),
  Density: entry('Sets how many grains this voice emits.', 'Low values keep the voice airy and sparse. High values make it much busier and denser.', []),
  GrainSize: entry('Sets the duration of each grain for this voice.', 'Low values make the grains tighter and more pointillistic. High values make them longer and smoother.', []),
  Spray: entry('Sets how far back this voice can look around its chosen slice.', 'Low values keep the voice focused near its anchor point. High values let it reach farther through nearby buffer positions.', []),
  GrainOct: entry('Sets the chance of octave-like shimmer in this voice.', 'Low values keep the voice more grounded. High values add more sparkly octave coloration.', []),
  Attack: entry('Sets how quickly each grain fades in for this voice.', 'Low values make grain attacks sharper. High values soften the front edge of each grain.', []),
  Decay: entry('Sets how long each grain fades out for this voice.', 'Low values make grains end quickly. High values make them trail longer and overlap more.', []),
  Blur: entry('Sets how blurred and smeared this voice becomes.', 'Low values keep the voice crisp. High values smear it into a softer cloud.', []),
  Gain: entry('Sets this granular voice output level.', 'Low values keep the voice quieter in the granular stack. High values make it more dominant.', []),
  PosLFORate: entry('Sets how quickly this voice moves through position modulation.', 'Low values create slow position sweeps. High values make position motion faster.', []),
  PosLFODepth: entry('Sets how far this voice moves under position modulation.', 'Low values keep the read head close to its anchor. High values make it travel farther.', []),
  Pan: entry('Sets this voice pan position.', 'Low values push the voice left. High values push it right.', []),
  PanLFORate: entry('Sets how quickly this voice pans under modulation.', 'Low values create slow stereo drift. High values create quicker pan motion.', []),
  StereoSpread: entry('Sets how wide this voice feels in stereo.', 'Low values keep the voice tighter and more centered. High values spread it wider.', []),
  ReverseLFORate: entry('Sets how often this voice flips playback direction under modulation.', 'Low values make direction changes rare. High values make them happen more often.', []),
  RecordLFORate: entry('Sets how quickly write-follow modulation moves for this voice.', 'Low values keep write-follow movement slow. High values make it pulse faster.', []),
  WriteFollow: entry('Sets how much this voice chases the live write head.', 'Low values keep the voice closer to its chosen slice. High values make it follow fresher material more strongly.', []),
};

function granularVoiceSurface(voice: number, section: string, label: string): SliderHelpSurface {
  return gr(`Voices / Voice ${voice} / ${section}`, label);
}

const granularVoiceEntries: Record<string, SliderHelpEntry> = {};
for (const voice of [1, 2, 3, 4]) {
  granularVoiceEntries[`granularV${voice}Slice`] = cloneEntry(granularVoiceBase.Slice, [granularVoiceSurface(voice, 'Slice & Playback', 'Slice')]);
  granularVoiceEntries[`granularV${voice}Speed`] = cloneEntry(granularVoiceBase.Speed, [granularVoiceSurface(voice, 'Slice & Playback', 'Speed')]);
  granularVoiceEntries[`granularV${voice}Pitch`] = cloneEntry(granularVoiceBase.Pitch, [granularVoiceSurface(voice, 'Slice & Playback', 'Pitch')]);
  granularVoiceEntries[`granularV${voice}Density`] = cloneEntry(granularVoiceBase.Density, [granularVoiceSurface(voice, 'Grain', 'Density')]);
  granularVoiceEntries[`granularV${voice}GrainSize`] = cloneEntry(granularVoiceBase.GrainSize, [granularVoiceSurface(voice, 'Grain', 'Size')]);
  granularVoiceEntries[`granularV${voice}Spray`] = cloneEntry(granularVoiceBase.Spray, [granularVoiceSurface(voice, 'Grain', 'Look Back')]);
  granularVoiceEntries[`granularV${voice}GrainOct`] = cloneEntry(granularVoiceBase.GrainOct, [granularVoiceSurface(voice, 'Grain', 'Shimmer')]);
  granularVoiceEntries[`granularV${voice}Attack`] = cloneEntry(granularVoiceBase.Attack, [granularVoiceSurface(voice, 'Edge & Texture', 'Fade In')]);
  granularVoiceEntries[`granularV${voice}Decay`] = cloneEntry(granularVoiceBase.Decay, [granularVoiceSurface(voice, 'Edge & Texture', 'Fade Out')]);
  granularVoiceEntries[`granularV${voice}Blur`] = cloneEntry(granularVoiceBase.Blur, [granularVoiceSurface(voice, 'Edge & Texture', 'Blur')]);
  granularVoiceEntries[`granularV${voice}Gain`] = cloneEntry(granularVoiceBase.Gain, [granularVoiceSurface(voice, 'Edge & Texture', 'Gain')]);
  granularVoiceEntries[`granularV${voice}PosLFORate`] = cloneEntry(granularVoiceBase.PosLFORate, [granularVoiceSurface(voice, 'Motion', 'Pos Rate')]);
  granularVoiceEntries[`granularV${voice}PosLFODepth`] = cloneEntry(granularVoiceBase.PosLFODepth, [granularVoiceSurface(voice, 'Motion', 'Pos Depth')]);
  granularVoiceEntries[`granularV${voice}Pan`] = cloneEntry(granularVoiceBase.Pan, [granularVoiceSurface(voice, 'Motion', 'Pan')]);
  granularVoiceEntries[`granularV${voice}PanLFORate`] = cloneEntry(granularVoiceBase.PanLFORate, [granularVoiceSurface(voice, 'Motion', 'Pan LFO')]);
  granularVoiceEntries[`granularV${voice}StereoSpread`] = cloneEntry(granularVoiceBase.StereoSpread, [granularVoiceSurface(voice, 'Motion', 'Spread')]);
  granularVoiceEntries[`granularV${voice}ReverseLFORate`] = cloneEntry(granularVoiceBase.ReverseLFORate, [granularVoiceSurface(voice, 'Motion', 'Rev LFO')]);
  granularVoiceEntries[`granularV${voice}RecordLFORate`] = cloneEntry(granularVoiceBase.RecordLFORate, [granularVoiceSurface(voice, 'Motion', 'Rec LFO')]);
  granularVoiceEntries[`granularV${voice}WriteFollow`] = cloneEntry(granularVoiceBase.WriteFollow, [granularVoiceSurface(voice, 'Motion', 'Write Fol')]);
}

function drumVoiceSection(voice: DrumVoiceType, section: string): string {
  return `Voice Cards / ${DRUM_VOICES[voice].label} / ${section}`;
}

const DRUM_RANGE_OVERRIDES: Record<string, EntryCopy> = {
  drumSubTone: {
    short: 'Adds an octave-up harmonic layer to the Sub voice.',
    long: 'Low values keep the sub close to a pure fundamental. High values bring in a second sine oscillator one octave up, so the note speaks with more upper harmonic definition instead of only weight.',
  },
  drumSubShape: {
    short: 'Changes the Sub oscillator waveform from sine toward brighter shapes.',
    long: 'Lower settings keep the Sub on a sine wave, the middle moves into triangle territory, and higher settings switch it into a brighter saw-like core before the drive stage.',
  },
  drumSubDrive: {
    short: 'Adds waveshaper saturation to the Sub core oscillator.',
    long: 'Low values leave the Sub clean and rounded. High values push the main oscillator through a waveshaper, adding compression, harmonics, and more audible edge.',
  },
  drumSubSub: {
    short: 'Mixes in an octave-down sine below the main Sub voice.',
    long: 'Low values keep the voice on its main fundamental. High values add a dedicated sub-octave oscillator, making the hit feel heavier and deeper underneath the main note.',
  },
  drumKickClick: {
    short: 'Adds the kick\'s short high-frequency attack transient.',
    long: 'Low values keep the kick rounder and more purely low-end. High values raise the triangle-click layer at the front of the hit, so the kick speaks with more beater snap and attack definition.',
  },
  drumKickBody: {
    short: 'Adds the kick\'s mid-body layer above the sine core.',
    long: 'Low values keep the kick closer to a simple sine thump. High values bring up the extra triangle-and-lowpass body layer, giving the hit more boom and midrange chest instead of only sub weight.',
  },
  drumKickPunch: {
    short: 'Strengthens the kick\'s initial pitch-sweep and transient impact.',
    long: 'Low values keep the downward sweep gentler. High values start the hit higher above its landing pitch and also sharpen the click frequency, so the front edge feels more aggressive and physical.',
  },
  drumKickTail: {
    short: 'Adds the kick\'s filtered noise tail behind the main hit.',
    long: 'Low values keep the kick dry and tight. High values raise the low-passed noise tail, adding extra sustain and a small room-like bloom after the sine/body transient.',
  },
  drumKickTone: {
    short: 'Adds harmonic distortion to the kick\'s sine core.',
    long: 'Low values keep the kick closer to a pure sine sweep. High values drive the core through a waveshaper so the body reads with more harmonics, bite, and speaker-grab.',
  },
  drumClickPitch: {
    short: 'Sets the pitched oscillator used by the click\'s tonal color.',
    long: 'This matters in Tonal mode and in the middle of the continuous Exciter Color path. Low values give a lower pip or blip, while high values push that tonal component into a much sharper, brighter register.',
  },
  drumClickFilter: {
    short: 'Sets the main filter frequency used by the click voice.',
    long: 'The exact filter type depends on the mode: impulse and granular use a high-pass, noise uses a band-pass, and tonal uses a low-pass. Lower values keep the click darker or narrower; higher values let more top-end through and make the attack read sharper.',
  },
  drumClickTone: {
    short: 'Controls how burst-like the click excitation is instead of a pin-sharp tick.',
    long: 'In the impulse/noise click paths, low values keep the transient extremely short and digital-tick-like. High values lengthen the burst window, so the click behaves more like a tiny filtered noise hit than a single pinprick.',
  },
  drumClickResonance: {
    short: 'Sets the Q of the click filters in the impulse and noise colors.',
    long: 'Low values keep the click filter broad and flatter. High values raise the filter peak, emphasizing a narrower metallic ring. Tonal and granular click paths do not use this control the same way.',
  },
  drumClickExciterColor: {
    short: 'Turns the click into a continuous exciter crossfade instead of a fixed mode.',
    long: 'At zero or below, the selected click Mode runs normally. Raising this above zero replaces the discrete mode switch with a continuous blend: first from sharp impulse toward tonal click, then onward toward filtered noise. Granular mode still ignores this control.',
  },
  drumClickGrainCount: {
    short: 'Sets how many micro-hits the click fires in Granular mode.',
    long: 'This only affects Granular click mode. Low values keep the trigger close to a single hit, while high values split it into more tiny grains so the click becomes a clustered spray rather than one attack.',
  },
  drumClickGrainSpread: {
    short: 'Sets how far the click grains can spread apart in time.',
    long: 'This only affects Granular click mode. Low values keep the micro-hits nearly simultaneous. High values scatter their start times across a wider window, turning one click into a looser burst.',
  },
  drumClickStereoWidth: {
    short: 'Sets how far the granular click grains can random-pan in stereo.',
    long: 'This only affects Granular click mode. Low values keep the grains near center. High values push each micro-hit farther left or right, so the burst opens outward instead of staying mono-ish.',
  },
  drumBeepHiTone: {
    short: 'Sets the FM depth that gives the Metal voice its clang.',
    long: 'Low values keep the Metal voice closer to a clean partial stack. High values drive deeper FM into the carrier, creating stronger sidebands, more metallic bite, and a less purely sine-based ping.',
  },
  drumBeepHiInharmonic: {
    short: 'Pushes the Metal partials away from a clean harmonic series.',
    long: 'Low values keep the partials closer to harmonic multiples. High values bend them toward bell-like, inharmonic spacing, so the voice feels more metallic and less tuned like a normal oscillator stack.',
  },
  drumBeepHiPartials: {
    short: 'Sets how many partial oscillators the Metal voice stacks.',
    long: 'Low values keep the voice close to a single ringing component. High values add more partial oscillators above it, thickening the metal tone before FM and brightness filtering shape the result.',
  },
  drumBeepHiBrightness: {
    short: 'Sets the low-pass ceiling after the Metal partial bank.',
    long: 'Low values trim more of the upper partial energy after the oscillators. High values keep more top-end alive, so the metal voice comes through brighter and more cutting.',
  },
  drumBeepHiModRatio: {
    short: 'Sets the coarse FM modulator-to-carrier ratio for the Metal voice.',
    long: 'Low ratios keep the FM sidebands closer to the base pitch family. High ratios spread them farther apart, which makes the attack and ring feel more clangorous and less simply tonal.',
  },
  drumBeepHiModRatioFine: {
    short: 'Fine-tunes the Metal FM ratio around the coarse setting.',
    long: 'Low values pull the FM ratio slightly below the coarse value. High values push it above. That small offset changes how aligned or detuned the sidebands feel without jumping to a whole new ratio step.',
  },
  drumBeepHiModPhase: {
    short: 'Rotates the Metal modulator\'s start phase.',
    long: 'Low values start the FM modulator near its default sine phase. High values rotate that starting phase toward inversion, changing the first few cycles and therefore the bite and shape of the attack transient.',
  },
  drumBeepHiFeedback: {
    short: 'Feeds the FM modulator back into itself for extra harmonic edge.',
    long: 'Around zero there is little or no self-feedback. Negative values push the Metal voice toward a squarer, hollower FM edge, while positive values add brighter, saw-like bite and more aggressive harmonic growth.',
  },
  drumBeepHiModEnvDecay: {
    short: 'Turns the Metal FM depth into a front-loaded envelope instead of a fixed amount.',
    long: 'Low values leave the FM depth close to its steady-state amount. High values create a larger overshoot at the start and then let it settle toward Mod Env End, so the strike opens with a stronger clang before calming down.',
  },
  drumBeepHiModEnvEnd: {
    short: 'Sets where the Metal FM envelope settles after the initial burst.',
    long: 'Low values let the FM intensity fall back toward a cleaner tail. High values leave more modulation depth sustaining after the attack, so the metal ring stays more colored instead of cleaning up.',
  },
  drumBeepHiNoiseInMod: {
    short: 'Injects short noise into the Metal FM path.',
    long: 'Low values keep the FM modulation clean. High values add a burst of noise directly into the carrier modulation, making the attack noisier, splashier, and less purely pitched.',
  },
  drumBeepHiNoiseDecay: {
    short: 'Sets how long the Metal noise injection stays in the FM path.',
    long: 'Low values make the noise burst collapse almost immediately. High values let that noisy FM splash hang into more of the note before it decays away.',
  },
  drumBeepHiShimmer: {
    short: 'Adds gain modulation to the Metal voice for shimmer-like flutter.',
    long: 'Low values keep the Metal voice steady. High values deepen the output-level LFO, so the ring takes on a more obvious tremolo or shimmer flutter instead of a static sustain.',
  },
  drumBeepHiShimmerRate: {
    short: 'Sets the speed of the Metal shimmer LFO.',
    long: 'Low values make the shimmer move slowly. High values turn that output modulation into a faster flutter, so the metallic sustain flickers more rapidly.',
  },
  drumBeepLoTone: {
    short: 'Shifts the Pluck oscillator from sine toward a brighter square-like core.',
    long: 'Low values keep the oscillator path smooth and sine-like. High values push it into a squarer, brighter source, with a low-pass stage softening the edge rather than leaving it fully raw.',
  },
  drumBeepLoBody: {
    short: 'Adds resonant body emphasis to the Pluck voice.',
    long: 'Low values keep the voice leaner and less resonant. High values strengthen the body resonance in the oscillator/pluck path and also weight the modal bank toward a fuller, warmer center.',
  },
  drumBeepLoModal: {
    short: 'Crossfades the Pluck voice from oscillator/pluck into the modal resonator bank.',
    long: 'Low values keep the voice on its regular oscillator or Karplus path. High values move more energy into the struck-resonator bank, so the sound behaves more like bars, plates, or tuned resonant modes than a simple blip.',
  },
  drumBeepLoModalGain: {
    short: 'Trims only the modal-resonator side of the Pluck voice.',
    long: 'Low values keep the modal bank tucked behind the oscillator/pluck engine. High values raise only the resonator-bank contribution, which is most noticeable when Modal Mix is above zero.',
  },
  drumBeepLoModalQ: {
    short: 'Sets how sharply the Pluck modal resonators ring.',
    long: 'Low values make the modal bank shorter and more damped. High values raise the resonator Q so the modes ring longer and feel more bell-like or bar-like.',
  },
  drumBeepLoModalInharmonic: {
    short: 'Pushes the Pluck modal ratios away from harmonic spacing.',
    long: 'Low values keep the resonator bank closer to harmonic intervals. High values bend the ratios toward more bell-like spacing, so the modal side sounds less keyboard-like and more metallic or abstract.',
  },
  drumBeepLoModalSpread: {
    short: 'Warps how far apart the Pluck modal partials are spaced.',
    long: 'Negative values compress the modal ratios closer together, while positive values expand them farther apart. Around the middle, the resonator bank follows its unwarped spacing.',
  },
  drumBeepLoModalCut: {
    short: 'Tilts which part of the Pluck modal spectrum is attenuated.',
    long: 'Negative values cut the upper modes and leave the lower resonances more intact. Positive values do the opposite by cutting lows, which makes the higher modes speak more strongly.',
  },
  drumBeepLoOscGain: {
    short: 'Trims only the oscillator or Karplus side of the Pluck voice.',
    long: 'Low values pull back the non-modal engine. High values raise the oscillator/pluck path without changing the modal bank, so it is most useful when Modal Mix still leaves some of that side active.',
  },
  drumBeepLoPluck: {
    short: 'Switches the Pluck voice from oscillator behavior toward a Karplus-Strong pluck model.',
    long: 'Low values keep the voice on its regular oscillator path. Once this rises past roughly one-third, the voice switches to a short-noise-burst and resonant-filter path that behaves more like a plucked string or struck wire.',
  },
  drumBeepLoPluckDamp: {
    short: 'Darkens the Karplus-Strong pluck loop in the Pluck voice.',
    long: 'This matters most when the pluck model is active. Low values keep more high-frequency content alive in the pluck. High values lower the damping filter, so the string-like ring becomes more muted and closed.',
  },
  drumNoiseFilterFreq: {
    short: 'Sets the main filter cutoff or center frequency for the Noise voice.',
    long: 'Low values keep the noise burst darker or narrower, and the same frequency is also reused by the ratchet pre-hits. High values open the noise up, making the hit brighter and more cutting.',
  },
  drumNoiseFilterQ: {
    short: 'Sets how peaked the Noise filter is.',
    long: 'Low values keep the noise filtering broad and flatter. High values raise the resonance, so the filtered noise takes on a narrower, more whistling or ringing focus.',
  },
  drumNoiseFilterEnv: {
    short: 'Sets the Noise filter sweep direction and amount at the start of the hit.',
    long: 'Negative values start the filter below its base frequency and sweep upward into place. Positive values start above the base frequency and sweep downward. Around zero, the noise stays close to the static filter setting.',
  },
  drumNoiseFilterEnvDecay: {
    short: 'Sets how long the Noise filter envelope takes to settle back to its base frequency.',
    long: 'Low values make the filter sweep snap back quickly. High values let the brightness movement linger, so the top end keeps evolving for more of the hit.',
  },
  drumNoiseColorLFO: {
    short: 'Adds LFO motion to the Noise filter frequency.',
    long: 'Low values leave the filter essentially static. High values make the Noise filter wobble faster, so the color of the burst moves instead of holding one fixed tone.',
  },
  drumNoiseDensity: {
    short: 'Switches the Noise voice between sparse particles, gated chatter, and continuous noise.',
    long: 'At low values the voice leaves the continuous burst path and becomes discrete Hann-windowed particles. Mid values square-gate the noise into chattery bursts. High values keep it as one dense continuous hit, so this control changes the synthesis mode as much as the amount.',
  },
  drumNoiseFormant: {
    short: 'Adds a vowel-like formant filter bank on top of the Noise voice.',
    long: 'Low values keep the noise plain. High values mix in three band-pass formants, giving the burst a more mouthy or vocal color rather than broadband hiss alone.',
  },
  drumNoiseBreath: {
    short: 'Adds fast amplitude flutter to the Noise voice.',
    long: 'Low values keep the Noise voice steady. High values add an 8 to 12 Hz gain wobble, which makes the burst feel airier and more breath-like instead of static.',
  },
  drumNoiseParticleSize: {
    short: 'Sets the size of each noise grain when the Noise voice is in sparse particle mode.',
    long: 'This matters most at low Density, where the engine schedules individual grains. Low values make those particles tiny and dusty. High values lengthen each grain, so the sparse texture becomes chunkier and more splattered.',
  },
  drumNoiseParticleRandom: {
    short: 'Randomizes timing, duration, and playback rate of sparse Noise particles.',
    long: 'This matters most in sparse particle mode. Low values keep the grains more even. High values add stronger duration jitter, time scatter, and playback-rate drift, so the particle cloud feels much less regular.',
  },
  drumNoiseParticleRandomRate: {
    short: 'Sets how often the Noise particle randomization refreshes to a new value.',
    long: 'This matters most in sparse particle mode. Low values let one random drift state persist across more grains. High values refresh the random pitch and timing tendencies more often, so the texture keeps changing from grain to grain.',
  },
  drumNoiseRatchetCount: {
    short: 'Adds pre-hit ratchets before the main Noise burst.',
    long: 'Low values leave the Noise voice as one main hit. High values schedule more short pre-bursts that crescendo into the final attack, which is what gives clap-like or ratcheted textures.',
  },
  drumNoiseRatchetTime: {
    short: 'Sets the spacing of the Noise ratchet bursts.',
    long: 'Low values keep the pre-hits very tight and flam-like. High values spread them farther apart and also lengthen each mini-burst, making the ratchet read more like a wider clap train.',
  },
  drumMembraneExcPos: {
    short: 'Sets where the membrane is struck, changing which resonant modes are excited.',
    long: 'Middle values hit near the center of the modeled head. Moving toward either extreme shifts the strike off-center, which changes the overtone balance because different modes are excited more or less strongly.',
  },
  drumMembraneExcBright: {
    short: 'Sets the brightness of the membrane exciter itself.',
    long: 'Low values make the initial strike softer and darker. High values brighten the impulse, noise, stick, brush, or mallet excitation before it hits the resonator bank, so the attack carries more snap and top-end.',
  },
  drumMembraneExcDur: {
    short: 'Sets how long the membrane exciter lasts before the resonators take over.',
    long: 'Low values keep the strike very short and percussive. High values lengthen the excitation burst, which makes the onset feel more rubbed, brushed, or thumped instead of a single tap.',
  },
  drumMembraneSize: {
    short: 'Sets the base size and fundamental region of the membrane model.',
    long: 'Low values make the modeled head feel larger and lower. High values move the whole resonator bank upward, so the membrane reads tighter, smaller, and more highly tuned.',
  },
  drumMembraneStiffness: {
    short: 'Raises or lowers the membrane-mode tuning multiplier.',
    long: 'Low values keep the modeled head looser, which lowers the mode frequencies. High values tighten the head, pushing the resonant modes upward and making the membrane feel tenser and more taut.',
  },
  drumMembraneDamping: {
    short: 'Sets how quickly the membrane resonators lose energy.',
    long: 'Low values let the membrane modes ring longer. High values reduce their effective Q, so the hit dries out and stops sooner instead of blooming into a long resonant body.',
  },
  drumMembraneNonlin: {
    short: 'Adds extra inharmonic bending to the membrane mode ratios.',
    long: 'Low values keep the membrane modes closer to their base physical pattern. High values push the ratios farther away, making the head sound more bent, stressed, and less like a cleanly tuned drum membrane.',
  },
  drumMembraneScaleBlend: {
    short: 'Pulls the membrane overtones toward the nearest scale-consonant ratios.',
    long: 'Low values leave the membrane on its raw physical mode ratios. High values pull each overtone toward the nearest interval in the current scale, so the ring becomes more harmonically aligned with the piece instead of staying purely physical-model based.',
  },
  drumMembraneWireMix: {
    short: 'Mixes in the membrane\'s wire-buzz layer.',
    long: 'Low values keep the membrane as a bare head/body sound. High values add more of the filtered noise-wire layer, so it starts to behave more like a snare or rattling resonator.',
  },
  drumMembraneWireDensity: {
    short: 'Sets how dense and rattly the membrane wire buzz becomes.',
    long: 'Low values keep the wire layer smoother and lighter. High values raise the wire filter Q and, once dense enough, add fast square-wave amplitude modulation, so the buzz becomes a more obvious rattle instead of a soft hiss.',
  },
  drumMembraneWireTone: {
    short: 'Brightens or darkens the membrane wire spectrum.',
    long: 'Low values keep the wire buzz lower and darker. High values raise the high-pass and band-pass frequencies in the wire path, shifting the rattle into a brighter, raspier range.',
  },
  drumMembraneWireDecay: {
    short: 'Sets how long the membrane wire buzz lasts.',
    long: 'Low values make the wire layer die away quickly. High values let the wire buzz hang longer after the strike, so the membrane keeps its snare-like rattle deeper into the tail.',
  },
  drumMembraneBody: {
    short: 'Sets how much resonant body the membrane carries.',
    long: 'Low values keep the exciter and wire components more exposed. High values raise the fundamental/body oscillator and the membrane mode levels, so the hit speaks more like a tuned drum shell and less like only a noisy strike.',
  },
  drumMembraneRing: {
    short: 'Sets how strongly the membrane modes ring.',
    long: 'Low values keep the resonator bank short and thuddy. High values raise the mode Q, which makes the membrane sing longer and emphasize its tuned resonances.',
  },
  drumMembraneOvertones: {
    short: 'Sets how many membrane modes are active in the resonator bank.',
    long: 'Low values keep the model close to its fundamental and a few partials. High values enable more resonant modes, making the membrane richer, more complex, and more overtone-heavy.',
  },
};

function describeDrumRange(voice: DrumVoiceType, def: DrumParamDef): Pick<SliderHelpEntry, 'short' | 'long'> {
  const voiceLabel = DRUM_VOICES[voice].label.toLowerCase();
  const label = def.label;
  const lowerLabel = label.toLowerCase();
  const key = def.key;

  if (DRUM_RANGE_OVERRIDES[key]) {
    return DRUM_RANGE_OVERRIDES[key];
  }

  if (key.endsWith('Variation')) {
    return {
      short: `Sets correlated per-hit micro-variation for the ${voiceLabel}.`,
      long: `Low values keep the ${voiceLabel} repeatable from hit to hit. High values add one shared random offset that moves level, decay, pitch, brightness, attack, and excitation length together, so each strike feels naturally different instead of changing in unrelated ways.`,
    };
  }
  if (key.endsWith('Distance') || lowerLabel === 'position') {
    return {
      short: `Moves the ${voiceLabel} strike model from center-hit toward edge-hit behavior.`,
      long: `Low values behave more like a center strike: more body, longer decay, darker tone, and a rounder attack. High values behave more like an edge strike: less body, shorter decay, brighter tone, and a sharper transient. The midpoint stays close to neutral.`,
    };
  }
  if (key.endsWith('Attack')) {
    return {
      short: `Sets how quickly the ${voiceLabel} fades in.`,
      long: `Low values make the ${voiceLabel} speak immediately. High values soften the front edge with a slower fade-in.`,
    };
  }
  if (key.endsWith('Decay') && !key.includes('PitchDecay')) {
    return {
      short: `Sets how long the ${voiceLabel} keeps ringing after the hit.`,
      long: `Low values make the ${voiceLabel} stop quickly. High values let it ring or trail for longer.`,
    };
  }
  if (key.endsWith('PitchEnv')) {
    return {
      short: `Sets the pitch-envelope amount for the ${voiceLabel}.`,
      long: `Low values keep the ${voiceLabel} near its base pitch. High values exaggerate the pitch sweep at the start of the hit.`,
    };
  }
  if (key.endsWith('PitchDecay')) {
    return {
      short: `Sets how quickly the ${voiceLabel} pitch envelope settles.`,
      long: `Low values make the pitch sweep snap back quickly. High values let the pitch movement linger longer.`,
    };
  }
  if (key.endsWith('Level')) {
    return {
      short: `Sets the ${voiceLabel} output level.`,
      long: `Low values keep the ${voiceLabel} quieter. High values make it more dominant in the kit.`,
    };
  }
  if (key.includes('Freq') || lowerLabel.includes('frequency') || lowerLabel.includes('pitch')) {
    return {
      short: `Sets the core frequency focus of the ${voiceLabel}.`,
      long: `Low values pull the ${voiceLabel} downward into a deeper or darker range. High values push it upward into a brighter or tighter range.`,
    };
  }
  if (lowerLabel.includes('filter')) {
    return {
      short: `Shapes the filter behavior for the ${voiceLabel}.`,
      long: `Low values keep the ${voiceLabel} darker or more closed. High values open the filter or emphasize brighter content.`,
    };
  }
  if (lowerLabel.includes('resonance') || lowerLabel === 'q') {
    return {
      short: `Sets how peaky the ${voiceLabel} filtering or resonator response is.`,
      long: `Low values keep the ${voiceLabel} smoother. High values make the resonant peak or ring more obvious.`,
    };
  }
  if (
    lowerLabel.includes('mix') ||
    lowerLabel.includes('amount') ||
    lowerLabel.includes('depth') ||
    lowerLabel.includes('drive') ||
    lowerLabel.includes('tone') ||
    lowerLabel.includes('body') ||
    lowerLabel.includes('punch') ||
    lowerLabel.includes('tail') ||
    lowerLabel.includes('brightness') ||
    lowerLabel.includes('density') ||
    lowerLabel.includes('spread') ||
    lowerLabel.includes('width') ||
    lowerLabel.includes('shimmer') ||
    lowerLabel.includes('feedback') ||
    lowerLabel.includes('breath') ||
    lowerLabel.includes('formant') ||
    lowerLabel.includes('nonlinearity') ||
    lowerLabel.includes('overtones') ||
    lowerLabel.includes('inharmonic') ||
    lowerLabel.includes('particals') ||
    lowerLabel.includes('particals') ||
    lowerLabel.includes('pluck') ||
    lowerLabel.includes('damp') ||
    lowerLabel.includes('random') ||
    lowerLabel.includes('rate') ||
    lowerLabel.includes('bright')
  ) {
    return {
      short: `Adjusts ${voiceLabel} ${lowerLabel}.`,
      long: `Low values keep ${lowerLabel} subtle in the ${voiceLabel} sound. High values make ${lowerLabel} more pronounced or more active.`,
    };
  }

  return {
    short: `Adjusts ${voiceLabel} ${lowerLabel}.`,
    long: `Low values keep ${lowerLabel} restrained in the ${voiceLabel} sound. High values make it more obvious, exaggerated, or dominant.`,
  };
}

function buildDrumEntries(): Record<string, SliderHelpEntry> {
  const entries: Record<string, SliderHelpEntry> = {
    drumDelayNoteL: entry(
      'Sets the left-side note division for the shared Simple Delay.',
      'Shorter values make the left repeat lane answer more quickly. Longer or dotted values stretch the left side into a slower rhythmic pocket.',
      [
        sy('Lead 1 / Delay A', 'Left'),
        sy('Lead 2 / Delay A', 'Left'),
        dy('Delay A / Simple Delay', 'Left'),
      ],
    ),
    drumDelayNoteR: entry(
      'Sets the right-side note division for the shared Simple Delay.',
      'Shorter values make the right repeat lane answer more quickly. Longer or dotted values stretch the right side into a slower rhythmic counterpattern.',
      [
        sy('Lead 1 / Delay A', 'Right'),
        sy('Lead 2 / Delay A', 'Right'),
        dy('Delay A / Simple Delay', 'Right'),
      ],
    ),
    drumDelayFeedback: entry(
      'Sets feedback for the shared Simple Delay.',
      'Low values keep the repeats short. High values let the shared delay ring longer.',
      [
        sy('Lead 1 / Delay A', 'Delay Feedback'),
        sy('Lead 2 / Delay A', 'Delay Feedback'),
        dy('Delay A / Simple Delay', 'Feedback'),
      ],
    ),
    drumDelayMix: entry(
      'Sets the wet level of the shared Simple Delay.',
      'Low values keep the shared delay tucked behind the dry sound. High values make the delay return much more obvious.',
      [
        sy('Lead 1 / Delay A', 'Delay Mix'),
        sy('Lead 2 / Delay A', 'Delay Mix'),
        dy('Delay A / Simple Delay', 'Mix'),
      ],
    ),
    drumDelayFilter: entry(
      'Darkens or brightens shared Simple Delay repeats.',
      'Low values make the repeats darker and softer. High values keep more brightness in the shared delay line.',
      [
        sy('Lead 1 / Delay A', 'Delay Filter'),
        sy('Lead 2 / Delay A', 'Delay Filter'),
        dy('Delay A / Simple Delay', 'Filter'),
      ],
    ),
  };

  const morphVoices: Array<[DrumVoiceType, string]> = [
    ['sub', 'drumSubMorph'],
    ['kick', 'drumKickMorph'],
    ['click', 'drumClickMorph'],
    ['beepHi', 'drumBeepHiMorph'],
    ['beepLo', 'drumBeepLoMorph'],
    ['noise', 'drumNoiseMorph'],
    ['membrane', 'drumMembraneMorph'],
  ];
  for (const [voice, key] of morphVoices) {
    const label = DRUM_VOICES[voice].label;
    entries[key] = entry(
      `Morphs the ${label} voice between preset A and preset B.`,
      `Low values keep the ${label.toLowerCase()} voice near preset A. High values move it toward preset B, and shared dual modes can randomize that position per hit or over time.`,
      [dr(drumVoiceSection(voice, 'Morph'), 'Morph')],
    );
  }

  const delaySendVoices: Array<[DrumVoiceType, string]> = [
    ['sub', 'drumSubDelaySend'],
    ['kick', 'drumKickDelaySend'],
    ['click', 'drumClickDelaySend'],
    ['beepHi', 'drumBeepHiDelaySend'],
    ['beepLo', 'drumBeepLoDelaySend'],
    ['noise', 'drumNoiseDelaySend'],
    ['membrane', 'drumMembraneDelaySend'],
  ];
  for (const [voice, key] of delaySendVoices) {
    const label = DRUM_VOICES[voice].label;
    entries[key] = entry(
      `Sets how much the ${label.toLowerCase()} voice feeds shared Delay A.`,
      `Low values keep the ${label.toLowerCase()} voice dry. High values send more of that voice into the shared drum/lead delay bus.`,
      [dr(drumVoiceSection(voice, 'Send'), 'Delay Send')],
    );
  }

  for (const voice of Object.keys(DRUM_VOICES) as DrumVoiceType[]) {
    const config = DRUM_VOICES[voice];
    const sectionNames = Object.keys(config.sections) as Array<keyof typeof config.sections>;
    for (const sectionName of sectionNames) {
      const defs = config.sections[sectionName];
      if (!defs) continue;
      for (const def of defs) {
        if (def.type !== 'range') continue;
        const copy = describeDrumRange(voice, def);
        entries[def.key] = entry(
          copy.short,
          copy.long,
          [dr(drumVoiceSection(voice, sectionName), def.label)],
        );
      }
    }
  }

  return entries;
}

export const SLIDER_HELP_CATALOG: Record<string, SliderHelpEntry> = {
  ...mixEntries,
  ...globalEntries,
  ...synthEntries,
  ...reverbEntries,
  ...granularEntries,
  ...granularVoiceEntries,
  ...earthEntries,
  ...dynamicsEntries,
  ...buildDrumEntries(),
};

export const SLIDER_AUDIT_SUMMARY: SliderAuditSummary[] = [
  {
    severity: 'limitation',
    scope: 'Pad wavefold fallback path',
    note: 'Pad fold amount and mode are wired through the pad WASM worklet, but the legacy JS fallback voices still do not apply wavefolding.',
  },
  {
    severity: 'limitation',
    scope: 'Earth walk-only parameters',
    note: 'Water channels and both insect layers coerce sample-and-hold back to walk mode via `WALK_ONLY_DUAL_KEYS` in `App.tsx`.',
  },
  {
    severity: 'limitation',
    scope: 'Single-only global/earth utility sliders',
    note: '`cofDriftRate` and `cofDriftRange` stay in the shared slider family but remain single-only on their current surfaces.',
  },
];
