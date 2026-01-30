# Snowflake UI Guide

## Overview

The Snowflake UI is a visual, interactive interface where each of the 6 prongs controls a key parameter of the generative music engine.

## Features

### Unique Random Generation
Every time you load the app, the snowflake has a unique shape with:
- Varying inner/outer radius for each prong
- Different branch angles and lengths
- Organic, natural appearance

### Interactive Prongs
Each prong can be dragged to adjust its parameter:
- **Drag outward** - Increase the value
- **Drag inward** - Decrease the value
- The prong glows when hovering or dragging
- Side branches animate with the main prong length

### Visual Feedback
- Each prong has a unique color
- The value is displayed as a percentage at the end of each prong
- The center icon changes from ❄ (stopped) to ♪ (playing)
- Active prongs glow more brightly

## The Six Prongs

### 1. Master (Purple - #a855f7)
Controls the overall output volume of the entire application.

### 2. Synth (Blue - #3b82f6)
Controls the dry synth pad level in the mix.

### 3. Granular (Cyan - #06b6d4)
Controls the granular processing output level.

### 4. Lead (Green - #10b981)
Controls the lead synth (Rhodes/Bell) level in the mix.

### 5. Reverb (Orange - #f59e0b)
Controls the overall reverb wet/dry mix.

### 6. Send (Red - #ef4444)
Controls how much of the synth signal is sent to the reverb.

## Controls

### Start/Stop Button
Located at the bottom center of the screen:
- **▶ Start** - Begin audio playback
- **■ Stop** - Stop audio playback

### Advanced Settings Button
Located below the snowflake:
- Click **⚙️ Advanced Settings** to access all 70+ parameters
- From advanced mode, click **❄️ Simple Mode** to return

## Tips

- **Hover over a prong handle** to see it highlight
- **Drag smoothly** for gradual changes
- **Start with moderate values** (around 50%) for balanced sound
- The snowflake shape is **stable per session** - refresh to generate a new shape
- **Mobile friendly** - works with touch gestures

## Technical Details

- Built with React and SVG
- Smooth pointer events (mouse and touch)
- Real-time parameter updates
- Preserves all advanced settings when switching modes
