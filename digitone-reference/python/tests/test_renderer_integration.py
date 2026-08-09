from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class RendererIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        compiler = os.environ.get("CXX") or shutil.which("c++")
        if not compiler:
            raise unittest.SkipTest("C++ compiler unavailable")
        cls._temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls._temp.name)
        cls.renderer = cls.root / "digitone-render"
        project = Path(__file__).resolve().parents[2]
        completed = subprocess.run(
            [
                compiler,
                "-std=c++17",
                "-Wall",
                "-Wextra",
                "-Wpedantic",
                "-Werror",
                f"-I{project / 'include'}",
                str(project / "src/Calibration.cpp"),
                str(project / "src/Engine.cpp"),
                str(project / "app/render.cpp"),
                "-o",
                str(cls.renderer),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode:
            raise AssertionError(completed.stderr)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temp.cleanup()

    def _sound(self) -> dict[str, object]:
        return {
            "algorithm": "Algorithm 6",
            "ratios": {
                "c": {"ratio": 1.0},
                "a": {"ratio": 0.75},
                "b1": {"ratio": 0.5},
                "b2": {"ratio": 0.25},
            },
            "harm": {"value": 1.69, "normalized": 0.065},
            "feedback": {"normalized": 0.551},
            "mix": {"normalized": 1.0},
            "envelopes": {
                "a": {"attack": {"normalized": 0.1}, "decay": {"normalized": 0.2}, "end": {"normalized": 0.7}, "level": {"normalized": 0.8}},
                "b": {"attack": {"normalized": 0.15}, "decay": {"normalized": 0.25}, "end": {"normalized": 0.6}, "level": {"normalized": 0.4}},
            },
            "amp": {
                "amp_attack": {"raw": 20},
                "amp_decay": {"raw": 30},
                "amp_sustain": {"raw": 90},
                "amp_release": {"raw": 40},
                "vol": {"raw": 64},
                "drive": {"raw": 32},
            },
            "filter": {"filt1_freq": {"raw": 80}, "filt1_reso": {"raw": 40}, "filt_env": {"value": -20}},
        }

    def _dump(self, value: object) -> dict[str, object]:
        source = self.root / "sound.json"
        source.write_text(json.dumps(value), encoding="utf-8")
        completed = subprocess.run(
            [str(self.renderer), "--input", str(source), "--dump-parameters"],
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(completed.stdout)

    def _render(self, value: object, stem: str) -> bytes:
        source = self.root / f"{stem}.json"
        output = self.root / f"{stem}.wav"
        source.write_text(json.dumps(value), encoding="utf-8")
        subprocess.run(
            [str(self.renderer), "--input", str(source), "--output", str(output),
             "--duration", "0.05", "--sequence", "60@0:0.03"],
            text=True,
            capture_output=True,
            check=True,
        )
        return output.read_bytes()

    def test_canonical_fields_map_by_scope(self) -> None:
        actual = self._dump(self._sound())
        self.assertEqual(actual["algorithm"], 6)
        self.assertEqual(actual["ratios"], [1, 0.75, 0.5, 0.25])
        self.assertAlmostEqual(float(actual["harm"]), 0.065)
        self.assertAlmostEqual(float(actual["feedback"]), 0.551)
        self.assertEqual(actual["mix"], 1)
        self.assertAlmostEqual(float(actual["b_level"]), 0.4)
        self.assertAlmostEqual(float(actual["levels"][1]), 0.8)
        self.assertNotEqual(actual["filter_cutoff_hz"], 12000)
        self.assertAlmostEqual(float(actual["drive"]), 32 / 127, places=5)

    def test_unrelated_ratio_text_cannot_override_operator_ratio(self) -> None:
        sound = self._sound()
        sound["notes"] = {"ratio": 99, "text": "ratio_c 123"}
        first = self._dump(sound)
        sound["ratios"]["c"]["ratio"] = 16  # type: ignore[index]
        second = self._dump(sound)
        self.assertEqual(first["ratios"][0], 1)
        self.assertEqual(second["ratios"][0], 16)
        sound["mix"]["normalized"] = 0  # type: ignore[index]
        sound["ratios"]["c"]["ratio"] = 1  # type: ignore[index]
        ratio_one = self._render(sound, "ratio-one")
        sound["ratios"]["c"]["ratio"] = 16  # type: ignore[index]
        self.assertNotEqual(ratio_one, self._render(sound, "ratio-sixteen"))

    def test_invalid_or_missing_input_fails(self) -> None:
        bad = self.root / "bad.json"
        bad.write_text("{not json", encoding="utf-8")
        duplicate = self.root / "duplicate.json"
        duplicate.write_text('{"algorithm":1,"algorithm":8}', encoding="utf-8")
        for source in (bad, duplicate, self.root / "missing.json"):
            completed = subprocess.run(
                [str(self.renderer), "--input", str(source), "--dump-parameters"],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2)
            self.assertTrue(completed.stderr)
        nonfinite = subprocess.run(
            [str(self.renderer), "--duration", "nan"], text=True,
            capture_output=True, check=False,
        )
        self.assertEqual(nonfinite.returncode, 2)


if __name__ == "__main__":
    unittest.main()
