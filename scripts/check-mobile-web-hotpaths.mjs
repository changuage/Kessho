#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const checks = [];
function assert(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

const leadEditor = read('src/ui/synth/Lead4opFMEditorOverlay.tsx');
const sliderHelp = read('src/ui/SliderHelpOverlay.tsx');
const synthPage = read('src/ui/synth/SynthPage.tsx');
const ratingStars = read('src/presets/PresetRatingStars.tsx');
const presetDropdown = read('src/presets/PresetDropdown.tsx');
const presetFamilyTree = read('src/presets/PresetFamilyTree.tsx');
const drumPresetManager = read('src/ui/drums/DrumPresetManager.tsx');
const synthPresetManager = read('src/ui/synth/SynthPresetManager.tsx');
const earthPage = read('src/ui/earth/EarthPage.tsx');
const synthCss = read('src/ui/synth/synth.css');

assert(
  leadEditor.includes('closeAuditionContext') &&
    leadEditor.includes("document.addEventListener('visibilitychange'") &&
    leadEditor.includes('if (!open || !sequencePlaying)') &&
    leadEditor.includes('openRef.current') &&
    leadEditor.includes('mutedSequenceStepsRef.current'),
  'Lead FM audition must stop/close audio and interval work when hidden or closed'
);

assert(
  !leadEditor.includes('[mutedSequenceSteps, playAuditionNote') &&
    !leadEditor.includes('[draft, nameDraft, original, sequencePlaying'),
  'Lead FM audition interval must not restart on every rating/edit state update'
);

assert(
  sliderHelp.includes("window.matchMedia('(max-width: 420px)'") &&
    sliderHelp.includes("window.matchMedia('(max-width: 600px)'") &&
    sliderHelp.includes("pointerEvents: 'auto'") &&
    sliderHelp.includes("touchAction: 'pan-y'") &&
    !sliderHelp.includes("addEventListener('resize'"),
  'Slider help mobile layout must use breakpoint listeners and allow touch scrolling'
);

assert(
  synthPage.includes('const leadPresetOptions = useMemo<LeadPresetOption[]>') &&
    synthPage.includes('const leadPresetOptionById = useMemo') &&
    synthPage.includes('const findLeadPresetOption = useCallback'),
  'Synth lead preset lookup structures must stay memoized'
);

assert(
  ratingStars.includes('React.memo(function PresetRatingStars') &&
    ratingStars.includes("hitSize = '1.5rem'") &&
    ratingStars.includes("minWidth: '24px'") &&
    ratingStars.includes('aria-pressed={currentValue === rating}') &&
    ratingStars.includes("touchAction: 'manipulation'") &&
    ratingStars.includes('RATING_VALUES.map'),
  'Preset rating stars must stay memoized with touch-friendly tap handling'
);

assert(
  synthPage.includes('renderLeadPresetLoader') &&
    synthCss.includes('min-height: 28px') &&
    synthCss.includes('flex: 0 0 38px'),
  'Synth lead editor controls must keep mobile-friendly touch target floors'
);

assert(
  [
    presetDropdown,
    presetFamilyTree,
    drumPresetManager,
    synthPresetManager,
    earthPage,
    synthPage,
  ].every(source => source.includes('catch (ratingError)')),
  'Preset rating writes must catch failures before updating local rating state'
);

const failed = checks.filter(check => !check.ok);
if (failed.length > 0) {
  for (const failure of failed) {
    console.error(`Mobile web hotpath check failed: ${failure.message}`);
  }
  process.exit(1);
}

console.log('Mobile web hotpath checks passed');
