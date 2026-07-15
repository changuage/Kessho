import assert from 'node:assert/strict';
import { createParameterCommand } from './parameterCommands';

{
  const command = createParameterCommand('fx', 'masterVolume', 0.4567);
  assert.deepEqual(command, {
    domain: 'fx',
    key: 'masterVolume',
    sliderValue: 0.46,
    stateValue: 0.46,
  });
}

{
  const command = createParameterCommand('fx', 'delayAFilterType', 'highpass');
  assert.equal(command.stateValue, 'highpass');
}
