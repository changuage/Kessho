# Digitone reference workflow and portable engine

This directory is a standalone reverse-engineering workbench.  It archives
Digitone Sound SysEx messages, keeps a decoded canonical representation, and
renders a deterministic Digitone-style reference with the dependency-light C++
engine.  The output is intended for controlled A/B measurements and later
integration into Kessho; it is not a replacement for the Digitone firmware.

## Five-layer data flow

```text
USB MIDI/SysEx
      │
      ▼
1. transport/capture (python/digitone_ref/sysex.py)
      │  complete F0 ... F7 bytes
      ▼
2. raw archive (archive.py) ────────────────┐
      │                                      │ raw .syx + hash
      ▼                                      │
3. canonical Sound model (model.py)         │
      │ canonical JSON                       │
      ├──────────────► 4. audio references (audio.py)
      │                   recorded/imported WAV + metadata
      ▼                                      │
5. portable C++ engine (include/src) ◄──────┘
                         │ deterministic PCM WAV
                         ▼
                 paired A/B WAV + comparison JSON
```

The Python layer imports only the standard library by default.  `mido` is
optional for MIDI ports and SysEx transport; `sounddevice` is optional for
recording and audio-device enumeration.  A machine without either dependency
can still decode archived `.syx`, validate/import WAVs, and run the renderer.

## Quick start

Build the portable renderer and run its dependency-free tests:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

The Python workflow can run directly from the checkout as shown below, or be
installed with `python3 -m pip install .`.  Hardware capture support is kept
optional: `python3 -m pip install '.[hardware]'` installs MIDI and recording
adapters without adding dependencies to offline decode/render workflows.

Run from this directory with the Python package on `PYTHONPATH`:

```sh
PYTHONPATH=python python3 -m digitone_ref devices --json
PYTHONPATH=python python3 -m digitone_ref capture \
  --input-port "Digitone in" --output-port "Digitone out"
PYTHONPATH=python python3 -m digitone_ref decode recordings/sound.syx
PYTHONPATH=python python3 -m digitone_ref record --duration 2 --output-dir artifacts
PYTHONPATH=python python3 -m digitone_ref record-reference --midi-output "Digitone out" \
  --midi-channel 1 --duration 2 --output-dir artifacts
PYTHONPATH=python python3 -m digitone_ref import-wav take.wav --output-dir artifacts
PYTHONPATH=python python3 -m digitone_ref render artifacts/sound.json --renderer ./build/digitone-render
PYTHONPATH=python python3 -m digitone_ref compare artifacts/sound.json take.wav \
  --raw-sysex artifacts/sound.syx --renderer ./build/digitone-render
```

Every generated artifact receives a safe non-overwriting name; live captures
include a UTC timestamp and raw Sound archives include a content hash.
`compare` creates `*_A_reference.wav`,
`*_B_engine.wav`, and `*_comparison.json`.  The metadata records SHA-256
hashes, sample rate, channel count, frame count, the shared deterministic MIDI
sequence, canonical/raw provenance, renderer path, and UTC creation time.

The renderer accepts canonical JSON through `--input` and explicit render
flags (`--output`, `--sample-rate`, `--duration`, `--sequence`).  Its PCM WAV
is deterministic for a fixed input and sequence; host audio capture is not
expected to be bit-identical across takes.

`record-reference` is the synchronized capture path: it opens the selected
MIDI output, schedules the shared note-on/off sequence while recording line
input, sends note cleanup/all-notes-off, and writes the selected port and
sequence into its metadata.  It requires both optional `mido` and
`sounddevice`; `record` remains available for unsynchronized microphone/line
takes. MIDI events are placed at audio-frame boundaries and the sidecar records
their actual positions and backend latency. A/B metadata includes normalized
PCM16 peak/RMS, direct sample-aligned difference RMS, and onset-aligned RMS with
the measured fixed offset.

For research captures from a future firmware frame whose size/checksum has not
yet been validated, `capture --relaxed` and `decode --relaxed` preserve the raw
bytes while clearly recording relaxed validation. Strict mode remains the
default.

## Fidelity boundary

The engine models four-operator FM, eight algorithm topologies, ratio/HARM,
grouped B1/B2 behavior, feedback, carrier X/Y mix, envelopes, filter/amp
scaffolding, and modulation/controller routing.  It intentionally does **not**
claim exact Digitone emulation where transfer functions, quantisation, or
undocumented mappings have not been measured.  Calibration curves and lookup
tables are isolated in the C++ core so hardware captures can refine them
without changing the public API.  See [hardware-validation.md](docs/hardware-validation.md).

## Kessho boundary

Keep this workbench and the existing Kessho Lead/FM implementation separate.
Kessho should integrate through a small adapter that maps the canonical model
to the stable C++ engine API and supplies its own realtime buffer/voice clock.
No existing Lead behavior is changed by this directory.  See
[kessho-integration.md](docs/kessho-integration.md) and
[architecture.md](docs/architecture.md) for the contract and CPU notes.

SysEx field mapping attribution is recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
