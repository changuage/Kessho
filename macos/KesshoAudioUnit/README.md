# Kessho Audio Unit 0.2

Kessho is a macOS AUv3 instrument for Logic Pro. It renders Product Core once per host block and copies each requested stereo stem directly into the output buffer.

Open `KesshoAudioUnit.xcodeproj`, or regenerate it after editing `project.yml` and build it from the command line:

```sh
xcodegen generate --spec macos/KesshoAudioUnit/project.yml
xcodebuild -project macos/KesshoAudioUnit/KesshoAudioUnit.xcodeproj \
  -scheme KesshoAudioUnitApp -configuration Release build
```

Run the built **Kessho Audio Unit** app once to register the extension. In Logic Pro, insert **Kessho › Kessho** as a multi-output software instrument. The main output carries the full mix. The auxiliary outputs carry the nine individual stems, including a shared FX stem.

The native editor exposes Master Gain, MIDI Target, Host Sync, five source faders, Reverb Mix, and switches for the built-in Pad and Drum patterns. All eleven controls support Logic automation and project recall. Existing projects retain their Master Gain, MIDI Target, and Host Sync settings.

MIDI Target selects Pad 1, Pad 2, Lead 1, Lead 2, or Drums. Turn off both patterns to play only MIDI notes. MIDI CC 20 controls Master Gain, CC 21–25 control the five source faders in that order, and CC 91 controls Reverb Mix. These are fixed mappings. Piano, Earth, and Sample 2 assets are not bundled.

Host Sync follows playback, tempo, the current measure downbeat, and time signatures including 5/8 and 7/8. Turning it off lets the patterns run independently. A Host Sync automation change inside a render block takes effect at the next block boundary. Seek phase is preserved for Euclidean lanes. Anchor Walker, Orbit, harmony, and arrangement timelines restart on a seek.

## Validation

With the built extension registered, run Apple's validation and the out-of-process host smoke test:

```sh
auval -v aumu Ksho Ksho
xcrun clang++ -std=c++17 -fobjc-arc -framework AudioToolbox -framework AVFoundation \
  -framework CoreAudioKit -framework AppKit macos/KesshoAudioUnit/Tests/KesshoAudioUnitSmoke.mm \
  -o /tmp/kessho-au-smoke
/tmp/kessho-au-smoke
```

