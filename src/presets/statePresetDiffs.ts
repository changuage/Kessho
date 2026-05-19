type PresetData = Record<string, unknown>;

type DiffMuteRule = {
  isActive: (data: PresetData) => boolean;
  keys: readonly string[];
};

function bool(data: PresetData, key: string): boolean {
  return data[key] === true;
}

const SOURCE_ACTIVE_DIFF_RULES: readonly DiffMuteRule[] = [
  {
    isActive: (data) => data.padEnabled !== false,
    keys: ['synthLevel', 'pad1ReverbSend', 'pad1DelayASend', 'pad1DelayBSend', 'granularPad1Send'],
  },
  {
    isActive: (data) => bool(data, 'pad2Enabled'),
    keys: ['pad2Level', 'pad2ReverbSend', 'pad2DelayASend', 'pad2DelayBSend', 'granularPad2Send'],
  },
  {
    isActive: (data) => bool(data, 'leadEnabled'),
    keys: ['leadLevel', 'lead1Level', 'lead1ReverbSend', 'lead1DelayASend', 'lead1DelayBSend', 'granularLead1Send'],
  },
  {
    isActive: (data) => bool(data, 'lead2Enabled'),
    keys: ['lead2Level', 'lead2ReverbSend', 'lead2DelayASend', 'lead2DelayBSend', 'granularLead2Send'],
  },
  {
    isActive: (data) => bool(data, 'pianoEnabled'),
    keys: ['pianoLevel', 'pianoReverbSend', 'pianoDelayASend', 'pianoDelayBSend', 'granularPianoSend'],
  },
  {
    isActive: (data) => bool(data, 'drumEnabled') || bool(data, 'drumEuclidMasterEnabled'),
    keys: ['drumLevel', 'drumReverbSend', 'drumDelayASend', 'drumDelayBSend', 'granularDrumSend'],
  },
  {
    isActive: (data) => bool(data, 'oceanSampleEnabled'),
    keys: ['oceanSampleLevel', 'oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend'],
  },
  {
    isActive: (data) => bool(data, 'waterEnabled'),
    keys: ['waterLevel', 'waterReverbSend', 'waterDelayASend', 'waterDelayBSend', 'granularWaterSend'],
  },
  {
    isActive: (data) => bool(data, 'birdsEnabled') || bool(data, 'birds2Enabled') || bool(data, 'frogsEnabled'),
    keys: ['natureLevel', 'natureReverbSend', 'natureDelayASend', 'natureDelayBSend', 'granularNatureSend'],
  },
  {
    isActive: (data) => bool(data, 'birdsEnabled'),
    keys: ['birdsLevel', 'birdsReverbSend', 'birdsDelayASend', 'birdsDelayBSend'],
  },
  {
    isActive: (data) => bool(data, 'birds2Enabled'),
    keys: ['birds2Level', 'birds2ReverbSend', 'birds2DelayASend', 'birds2DelayBSend'],
  },
  {
    isActive: (data) => bool(data, 'frogsEnabled'),
    keys: ['frogsLevel'],
  },
  {
    isActive: (data) => bool(data, 'insectsEnabled') || bool(data, 'insects2Enabled'),
    keys: ['insectsSharedLevel', 'insectsReverbSend', 'insDelayASend', 'insDelayBSend', 'granularInsectsSend'],
  },
  {
    isActive: (data) => bool(data, 'insectsEnabled'),
    keys: ['insectsLevel'],
  },
  {
    isActive: (data) => bool(data, 'insects2Enabled'),
    keys: ['insects2Level'],
  },
];

const FX_ACTIVE_DIFF_RULES: readonly DiffMuteRule[] = [
  {
    isActive: (data) => bool(data, 'delayAEnabled'),
    keys: [
      'delayAMix',
      'delayAReverbSend',
      'delayAToBSend',
      'delayAGranularSend',
      'pad1DelayASend',
      'pad2DelayASend',
      'lead1DelayASend',
      'lead2DelayASend',
      'pianoDelayASend',
      'drumDelayASend',
      'oceanDelayASend',
      'waterDelayASend',
      'natureDelayASend',
      'insDelayASend',
      'granularDelayASend',
    ],
  },
  {
    isActive: (data) => bool(data, 'granularDelayEnabled'),
    keys: [
      'granularDelayMix',
      'granularDelayReverbSend',
      'delayAToBSend',
      'delayBToASend',
      'delayBGranularSend',
      'pad1DelayBSend',
      'pad2DelayBSend',
      'lead1DelayBSend',
      'lead2DelayBSend',
      'pianoDelayBSend',
      'drumDelayBSend',
      'oceanDelayBSend',
      'waterDelayBSend',
      'natureDelayBSend',
      'insDelayBSend',
      'granularDelayBSend',
    ],
  },
  {
    isActive: (data) => bool(data, 'granularEnabled'),
    keys: [
      'granularLevel',
      'granularReverbSend',
      'granularDelayASend',
      'granularDelayBSend',
      'delayAGranularSend',
      'delayBGranularSend',
      'granularPad1Send',
      'granularPad2Send',
      'granularLead1Send',
      'granularLead2Send',
      'granularPianoSend',
      'granularDrumSend',
      'granularWavesSend',
      'granularWaterSend',
      'granularNatureSend',
      'granularInsectsSend',
    ],
  },
  {
    isActive: (data) => bool(data, 'reverbEnabled'),
    keys: [
      'reverbLevel',
      'pad1ReverbSend',
      'pad2ReverbSend',
      'leadReverbSend',
      'lead1ReverbSend',
      'lead2ReverbSend',
      'pianoReverbSend',
      'drumReverbSend',
      'oceanReverbSend',
      'waterReverbSend',
      'natureReverbSend',
      'insectsReverbSend',
      'granularReverbSend',
      'delayAReverbSend',
      'granularDelayReverbSend',
    ],
  },
];

const STATE_PRESET_DIFF_MUTE_RULES = [
  ...SOURCE_ACTIVE_DIFF_RULES,
  ...FX_ACTIVE_DIFF_RULES,
] as const;

const STATE_PRESET_DIFF_RULES_BY_KEY = new Map<string, DiffMuteRule[]>();
for (const rule of STATE_PRESET_DIFF_MUTE_RULES) {
  for (const key of rule.keys) {
    const rules = STATE_PRESET_DIFF_RULES_BY_KEY.get(key);
    if (rules) {
      rules.push(rule);
    } else {
      STATE_PRESET_DIFF_RULES_BY_KEY.set(key, [rule]);
    }
  }
}

export function isStatePresetDiffKeyActive(data: PresetData, key: string): boolean {
  const rules = STATE_PRESET_DIFF_RULES_BY_KEY.get(key);
  if (!rules) return true;
  for (const rule of rules) {
    if (!rule.isActive(data)) return false;
  }
  return true;
}

export function normalizeStatePresetDiffData(data: PresetData): PresetData {
  const normalized: PresetData = { ...data };

  for (const rule of STATE_PRESET_DIFF_MUTE_RULES) {
    if (rule.isActive(data)) continue;

    for (const key of rule.keys) {
      if (typeof normalized[key] === 'number') {
        normalized[key] = 0;
      }
    }
  }

  return normalized;
}
