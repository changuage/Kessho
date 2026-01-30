# Presets

This folder contains saved presets for the Generative Music application.

## How to Use

### Saving a Preset
1. Adjust the sliders to your desired settings
2. Click the **💾 Save Preset** button
3. Enter a name for your preset
4. The preset will be downloaded as a JSON file

### Loading a Preset
1. Click the **📂 Load Preset** button
2. Select a preset JSON file from your computer
3. All slider positions will be restored to the saved state

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

- You can manually save presets to this folder for organization
- Share preset files with others to share your sound configurations
- The preset files are human-readable JSON, so you can edit them manually if needed
