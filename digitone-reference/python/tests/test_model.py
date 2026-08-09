from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from digitone_ref.archive import archive_sound, load_json, load_raw  # noqa: E402
from digitone_ref.model import DigitoneSound, decode_sound  # noqa: E402
from digitone_ref.sysex import ELEKTRON_HEADER  # noqa: E402


def make_frame() -> bytes:
    length = 339
    frame = bytearray(length)
    frame[:7] = bytes((0xF0, *ELEKTRON_HEADER, 0x53))
    frame[7:9] = b"\x01\x01"
    # 5 metadata bytes + 15-byte canonical name.  Each group is mask + seven
    # data bytes; all values are < 0x80 in this fixture, so masks are zero.
    unpacked = bytearray(273)
    unpacked[:5] = b"\x01\x01\x00\x00\x00"
    unpacked[5:20] = b"TEST SOUND\x00\x00\x00\x00\x00"
    body = bytearray()
    for offset in range(0, len(unpacked), 7):
        group = unpacked[offset : offset + 7]
        body.extend((0, *group))
    frame[18 : 18 + len(body)] = body[: length - 18 - 5]
    # Packed parameter offsets are relative to message byte 0x29.
    frame[0x29 + 0x28] = 7  # algorithm -> canonical algorithm 8
    frame[0x29 + 0x2B] = 3  # C ratio -> 1.0 calibration entry
    frame[0x29 + 0x2D] = 4  # A ratio -> 1.25 calibration entry
    frame[0x29 + 0x2F] = 0
    frame[0x29 + 0x30] = 4
    frame[0x29 + 0x32] = 63
    frame[0x29 + 0x33] = 0
    frame[-1] = 0xF7
    declared = length - 10
    frame[-3], frame[-2] = (declared >> 7) & 0x7F, declared & 0x7F
    checksum = sum(frame[10:-5]) & 0x3FFF
    frame[-5], frame[-4] = (checksum >> 7) & 0x7F, checksum & 0x7F
    return bytes(frame)


class ModelTests(unittest.TestCase):
    def test_canonical_decode_and_json_roundtrip(self) -> None:
        sound = decode_sound(make_frame())
        self.assertEqual(sound.name, "TEST SOUND")
        self.assertEqual(sound.algorithm, 8)
        self.assertEqual(sound.ratios["c"]["ratio"], 1.0)
        self.assertEqual(sound.ratios["a"]["ratio"], 1.25)
        self.assertIsNotNone(sound.ratios["b"]["combined_index"])
        self.assertEqual(sound.harm["range"], [-26.0, 26.0])
        self.assertIn("normalized_crossfade", sound.mix)
        self.assertIn("bipolar_display", sound.mix)
        self.assertIn("phase_reset", sound.envelopes)
        self.assertEqual(len(sound.lfos), 2)
        self.assertEqual(set(sound.routing), {"pitch_bend", "velocity", "modwheel", "breath", "aftertouch"})
        self.assertEqual(DigitoneSound.from_dict(sound.to_dict()).to_dict(), sound.to_dict())


    def test_archive_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            record = archive_sound(make_frame(), tmp_path, label="A/B")
            self.assertEqual(record.raw_path.suffix, ".syx")
            self.assertEqual(record.json_path.suffix, ".json")
            self.assertEqual(load_raw(record.raw_path), make_frame())
            self.assertEqual(load_json(record.json_path)["name"], "TEST SOUND")

            changed = archive_sound(
                make_frame(), tmp_path, label="A/B", metadata={"take": 2}
            )
            self.assertEqual(changed.raw_path.stem, changed.json_path.stem)
            self.assertNotEqual(record.raw_path, changed.raw_path)

    def test_relaxed_decode_records_bypassed_validation(self) -> None:
        frame = bytearray(make_frame())
        frame.extend(b"\0" * 8)
        frame[-9] = 0xF7
        frame = frame[:-9] + frame[-8:]
        # Keep valid framing but deliberately invalidate both trailer fields
        # and use an unknown total size.
        frame[-1] = 0xF7
        frame[-5:-1] = b"\0\0\0\0"
        sound = decode_sound(
            frame, strict=False, validate_checksum=False,
            validate_declared_length=False,
        )
        self.assertEqual(sound.provenance["validation"]["mode"], "relaxed")
        self.assertFalse(sound.raw["size_known"])
        self.assertEqual(sound.confidence["framing"], "relaxed-unverified")
