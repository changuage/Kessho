# Presets

This folder is retained for migration notes and legacy import support.
Shared testing presets now live in the Supabase V2 preset tables, which are the source of truth.

## How to Use

### Saving a Preset
1. Adjust the sliders to your desired settings
2. Save from the in-app preset controls
3. In shared testing mode, the preset is written to Supabase

### Loading a Preset
Use the in-app preset controls to load from the shared Supabase library.

## Preset Format

Presets are saved as JSON files with the following structure:

```json
{
  "name": "My Preset",
  "timestamp": "2026-01-28T10:00:00.000Z",
  "state": {
    "masterVolume": 0.7,
    "synthLevel": 0.6,
    // ... all other parameters
  }
}
```

## Tips

- Keep ad hoc preset exports outside this folder unless you are preparing a migration.
- Use Supabase for presets that should be visible to testers.
