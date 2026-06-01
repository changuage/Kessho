import fs from 'node:fs';

const files = [
  'src/ui/midiLearn/MidiLearnProvider.tsx',
  'src/ui/midiLearn/MidiLearnButton.tsx',
  'src/ui/midiLearn/MidiLearnBar.tsx',
  'src/ui/midiLearn/MidiLearnSliderAdornment.tsx',
  'src/ui/midiLearn/midiLearnStateMachine.ts',
  'src/ui/sliderSystem/SliderPrimitive.tsx',
  'src/ui/DualSlider.tsx',
];
const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const checks = {
  persistentButton: text.includes('MidiLearnButton'),
  stickyBar: text.includes('MidiLearnBar'),
  reducer: text.includes('midiLearnReducer'),
  assignOnDrag: text.includes('onValueGestureStart') && text.includes('notifySliderDrag'),
  sliderAdornment: text.includes('MidiLearnSliderAdornment'),
  boundedActivity: text.includes('ACTIVITY_LIMIT') && text.includes('MONITOR_THROTTLE_MS'),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`midi learn ui check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('midi learn ui check passed');
