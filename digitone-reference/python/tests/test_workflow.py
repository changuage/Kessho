from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import stat
import struct
import sys
import tempfile
import types
import unittest
import wave

from digitone_ref import audio
from digitone_ref.cli import main


def write_wav(path: Path, *, rate: int = 48_000, channels: int = 2, frames: int = 32) -> None:
    payload = b"".join(struct.pack("<h", (index % 8) * 256) for index in range(frames * channels))
    with wave.open(str(path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(payload)


def fake_renderer(path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env python3\n"
        "import argparse, wave\n"
        "p=argparse.ArgumentParser()\n"
        "p.add_argument('--input'); p.add_argument('--output', required=True)\n"
        "p.add_argument('--sample-rate', type=int, default=48000)\n"
        "p.add_argument('--duration', type=float, default=2.0)\n"
        "p.add_argument('--sequence')\n"
        "a=p.parse_args()\n"
        "frames=max(1, int(a.sample_rate*a.duration))\n"
        "with wave.open(a.output, 'wb') as w:\n"
        " w.setnchannels(2); w.setsampwidth(2); w.setframerate(a.sample_rate); w.writeframes(b'\\0\\0'*2*frames)\n",
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


class WorkflowTests(unittest.TestCase):
    def test_wav_validation_and_import_are_stdlib_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "take.wav"
            write_wav(source, frames=4)
            info = audio.inspect_wav(source)
            self.assertEqual((info.sample_rate, info.channels, info.frame_count), (48_000, 2, 4))
            imported = audio.import_reference_wav(source, root / "archive")
            self.assertNotEqual(source, imported)
            self.assertEqual(audio.sha256_file(source), audio.sha256_file(imported))

    def test_renderer_and_compare_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sound = root / "sound.json"
            sound.write_text(json.dumps({"algorithm": 0, "operators": []}), encoding="utf-8")
            reference = root / "reference.wav"
            write_wav(reference, frames=96)
            renderer = root / "fake-renderer"
            fake_renderer(renderer)
            output = root / "artifacts"

            result = audio.render_canonical_json(
                sound,
                output / "engine.wav",
                renderer=renderer,
                duration=0.01,
            )
            self.assertEqual(audio.inspect_wav(result).channels, 2)
            metadata = audio.comparison_metadata(
                reference,
                result,
                canonical_json=sound,
                renderer=renderer,
            )
            self.assertEqual(metadata["schema"], "digitone-ab-v1")
            self.assertEqual(len(metadata["midi_sequence"]), 4)
            self.assertTrue(metadata["provenance"]["canonical_sound"]["sha256"])
            self.assertIn("peak", metadata["pcm16"]["a"])
            self.assertIsNone(metadata["comparison"]["difference_rms"])

            sidecar = root / "reference.json"
            sidecar.write_text(json.dumps({"capture": {"midi_output": "Digitone"}}), encoding="utf-8")
            with_sidecar = audio.comparison_metadata(
                reference, result, reference_metadata=sidecar
            )
            self.assertEqual(with_sidecar["reference_capture"]["midi_output"], "Digitone")

    def test_sequence_text_normalizes_midi_velocity(self) -> None:
        text = audio.midi_sequence_text(
            [{"note": 60, "start": 0, "duration": 0.5, "velocity": 100}]
        )
        self.assertEqual(text, "60@0:0.5:0.787402")
        self.assertEqual(
            audio.midi_sequence_text(
                [{"note": 60, "start": 0, "duration": 0.5, "velocity": 1}]
            ),
            "60@0:0.5:0.00787402",
        )

    def test_pcm16_metrics_and_aligned_difference(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first = root / "first.wav"
            second = root / "second.wav"
            write_wav(first, frames=8)
            write_wav(second, frames=8)
            self.assertEqual(audio.pcm16_difference_rms(first, second), 0.0)
            self.assertGreater(audio.pcm16_metrics(first)["peak"], 0.0)  # type: ignore[index]
            with wave.open(str(second), "wb") as target:
                target.setnchannels(2)
                target.setsampwidth(2)
                target.setframerate(48_000)
                target.writeframes(b"\0\0" * 16)
            self.assertGreater(audio.pcm16_difference_rms(first, second), 0.0)

    def test_onset_alignment_removes_fixed_capture_latency(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first = root / "first.wav"
            second = root / "second.wav"
            signal = [0, 0, 5000, -5000, 2500, -2500]
            for path, delay in ((first, 0), (second, 3)):
                with wave.open(str(path), "wb") as target:
                    target.setnchannels(1)
                    target.setsampwidth(2)
                    target.setframerate(48_000)
                    target.writeframes(b"".join(struct.pack("<h", value) for value in ([0] * delay + signal)))
            difference, alignment = audio.pcm16_onset_aligned_difference_rms(first, second)
            self.assertEqual(difference, 0.0)
            self.assertEqual(alignment["offset_frames"], 3)

    def test_truncated_wav_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "truncated.wav"
            write_wav(path, frames=16)
            path.write_bytes(path.read_bytes()[:-2])
            with self.assertRaisesRegex(ValueError, "truncated PCM"):
                audio.inspect_wav(path)

    def test_midi_reference_capture_uses_fake_backends_and_cleans_up(self) -> None:
        sent: list[object] = []
        closed: list[str] = []

        class FakeMessage:
            def __init__(self, kind: str, **fields: object) -> None:
                self.type = kind
                self.fields = fields

        class FakePort:
            def send(self, message: object) -> None:
                sent.append(message)

            def close(self) -> None:
                closed.append("midi")

        class FakeStream:
            def __init__(self, **kwargs: object) -> None:
                self.channels = int(kwargs["channels"])

            def __enter__(self) -> "FakeStream":
                return self

            def __exit__(self, *_args: object) -> None:
                closed.append("audio")

            def read(self, frames: int) -> tuple[bytes, bool]:
                frames = min(frames, 10)
                return b"\0\0" * self.channels * frames, False

        fake_mido = types.ModuleType("mido")
        fake_mido.Message = FakeMessage  # type: ignore[attr-defined]
        fake_mido.get_output_names = lambda: ["Fake Out"]  # type: ignore[attr-defined]
        fake_mido.open_output = lambda _name: FakePort()  # type: ignore[attr-defined]
        fake_sounddevice = types.ModuleType("sounddevice")
        fake_sounddevice.RawInputStream = FakeStream  # type: ignore[attr-defined]
        old_mido = sys.modules.get("mido")
        old_sounddevice = sys.modules.get("sounddevice")
        sys.modules["mido"] = fake_mido
        sys.modules["sounddevice"] = fake_sounddevice
        try:
            with tempfile.TemporaryDirectory() as temp:
                result = audio.record_reference_sequence_wav(
                    Path(temp) / "reference.wav",
                    duration=0.01,
                    sample_rate=1000,
                    channels=2,
                    midi_output="Fake Out",
                    sequence=[{"note": 60, "start": 0.0, "duration": 0.01, "velocity": 1}],
                )
                self.assertEqual(audio.inspect_wav(result).frame_count, 10)
            kinds = [getattr(item, "type", None) for item in sent]
            self.assertIn("note_on", kinds)
            self.assertIn("note_off", kinds)
            self.assertIn("control_change", kinds)
            note_on = next(item for item in sent if getattr(item, "type", None) == "note_on")
            self.assertEqual(getattr(note_on, "fields", {}).get("velocity"), 1)
            self.assertIn("midi", closed)
            self.assertIn("audio", closed)
            sent.clear()
            closed.clear()
            with tempfile.TemporaryDirectory() as temp:
                actual_events: list[dict[str, object]] = []
                audio.record_reference_sequence_wav(
                    Path(temp) / "overlap.wav",
                    duration=0.06,
                    sample_rate=1000,
                    channels=2,
                    midi_output="Fake Out",
                    midi_channel=4,
                    event_log=actual_events,
                    sequence=[
                        {"note": 60, "start": 0.0, "duration": 0.03, "velocity": 100},
                        {"note": 60, "start": 0.01, "duration": 0.04, "velocity": 100},
                    ],
                )
            overlap_kinds = [getattr(item, "type", None) for item in sent]
            self.assertEqual(overlap_kinds.count("note_on"), 2)
            self.assertEqual(overlap_kinds.count("note_off"), 2)
            self.assertEqual(overlap_kinds.count("control_change"), 1)
            self.assertEqual(
                [(item["type"], item["actual_frame"]) for item in actual_events],
                [("note_on", 0), ("note_on", 10), ("note_off", 30), ("note_off", 50)],
            )
            self.assertTrue(all(getattr(item, "fields", {}).get("channel") == 4 for item in sent))
            with tempfile.TemporaryDirectory() as temp:
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    self.assertEqual(
                        main(
                            [
                                "record-reference",
                                "--midi-output",
                                "Fake Out",
                                "--duration",
                                "0.01",
                                "--sample-rate",
                                "1000",
                                "--output-dir",
                                temp,
                            ]
                        ),
                        0,
                    )
                result = json.loads(stdout.getvalue())
                capture_meta = json.loads(Path(result["metadata"]).read_text(encoding="utf-8"))["capture"]
                self.assertEqual(capture_meta["midi_output"], "Fake Out")
                self.assertEqual(len(capture_meta["midi_sequence"]), 4)
        finally:
            if old_mido is None:
                sys.modules.pop("mido", None)
            else:
                sys.modules["mido"] = old_mido
            if old_sounddevice is None:
                sys.modules.pop("sounddevice", None)
            else:
                sys.modules["sounddevice"] = old_sounddevice

    def test_cli_compare_never_overwrites_and_emits_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sound = root / "sound.json"
            sound.write_text(json.dumps({"algorithm": 1}), encoding="utf-8")
            reference = root / "reference.wav"
            write_wav(reference, frames=16)
            renderer = root / "fake-renderer"
            fake_renderer(renderer)
            output = root / "artifacts"

            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(
                    main(
                        [
                            "compare",
                            str(sound),
                            str(reference),
                            "--renderer",
                            str(renderer),
                            "--duration",
                            "0.01",
                            "--output-dir",
                            str(output),
                            "--stem",
                            "take",
                        ]
                    ),
                    0,
                )
            result = json.loads(stdout.getvalue())
            self.assertTrue(Path(result["reference_wav"]).is_file())
            self.assertTrue(Path(result["engine_wav"]).is_file())
            comparison = Path(result["comparison_json"])
            self.assertTrue(comparison.is_file())
            self.assertIn(
                "canonical_sound",
                json.loads(comparison.read_text(encoding="utf-8"))["provenance"],
            )
            # A second invocation receives suffixed artifact names.
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(
                    main(
                        [
                            "compare",
                            str(sound),
                            str(reference),
                            "--renderer",
                            str(renderer),
                            "--duration",
                            "0.01",
                            "--output-dir",
                            str(output),
                            "--stem",
                            "take",
                        ]
                    ),
                    0,
                )
            self.assertGreaterEqual(len(list(output.glob("take_A_reference*.wav"))), 2)

    def test_cli_render_reports_missing_sound_concisely(self) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = main(["render", "/does/not/exist.json"])
        self.assertEqual(result, 2)
        self.assertIn("error:", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
