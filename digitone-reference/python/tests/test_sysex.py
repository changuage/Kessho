from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from digitone_ref.sysex import (  # noqa: E402
    ELEKTRON_HEADER,
    SoundValidationError,
    SysExFramingError,
    build_sound_request,
    iter_sysex_frames,
    parse_sysex_stream,
    validate_sound_message,
)


def make_frame(length: int = 339) -> bytes:
    frame = bytearray(length)
    frame[:7] = bytes((0xF0, *ELEKTRON_HEADER, 0x53))
    frame[7:9] = b"\x01\x01"
    frame[-1] = 0xF7
    declared = length - 10
    frame[-3] = (declared >> 7) & 0x7F
    frame[-2] = declared & 0x7F
    checksum = sum(frame[10:-5]) & 0x3FFF
    frame[-5] = (checksum >> 7) & 0x7F
    frame[-4] = checksum & 0x7F
    return bytes(frame)


class SysexTests(unittest.TestCase):
    def test_concatenated_and_junk_framing(self) -> None:
        left, right = make_frame(), make_frame(361)
        stream = b"\x01\x02" + left + b"\x7f" + right
        self.assertEqual(list(iter_sysex_frames(stream)), [left, right])
        self.assertEqual(parse_sysex_stream(stream), [left, right])


    def test_truncated_and_nested_frames_fail(self) -> None:
        frame = make_frame()
        with self.assertRaises(SysExFramingError):
            list(iter_sysex_frames(frame[:-1]))
        with self.assertRaises(SysExFramingError):
            list(iter_sysex_frames(frame[:20] + frame))


    def test_sound_header_length_and_checksum_validation(self) -> None:
        frame = bytearray(make_frame())
        message = validate_sound_message(frame)
        self.assertEqual(message.declared_length, len(frame) - 10)
        self.assertEqual(message.actual_length, 339)

        bad = bytearray(frame)
        bad[10] ^= 1
        with self.assertRaisesRegex(SoundValidationError, "checksum"):
            validate_sound_message(bad)

        bad = bytearray(frame)
        bad[-2] ^= 1
        with self.assertRaisesRegex(SoundValidationError, "declared"):
            validate_sound_message(bad, validate_checksum=False)

        bad = bytearray(frame)
        bad[6] = 0x52
        with self.assertRaisesRegex(SoundValidationError, "type"):
            validate_sound_message(bad, validate_checksum=False)


    def test_segment_without_leading_f0_is_accepted(self) -> None:
        frame = make_frame()
        checked = validate_sound_message(frame[1:])
        self.assertEqual(checked.frame, frame)
    def test_sound_request_payload(self) -> None:
        payload = build_sound_request(3)
        self.assertEqual(payload, bytes.fromhex("00 20 3c 0d 00 6b 01 01 03 00 00 00 05"))
        self.assertEqual(build_sound_request(3, framed=True), b"\xf0" + payload + b"\xf7")

    def test_checksum_excludes_nonzero_slot_byte(self) -> None:
        frame = bytearray(make_frame())
        frame[9] = 17  # bank slot/index is excluded from the checksum range
        checksum = sum(frame[10:-5]) & 0x3FFF
        frame[-5], frame[-4] = (checksum >> 7) & 0x7F, checksum & 0x7F
        self.assertEqual(validate_sound_message(frame).checksum, checksum)
        bad = bytearray(frame)
        bad[-4] ^= 1
        with self.assertRaisesRegex(SoundValidationError, "checksum"):
            validate_sound_message(bad)
