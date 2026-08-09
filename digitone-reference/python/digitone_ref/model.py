"""Canonical, explicitly-calibratable Digitone Sound model.

This decoder intentionally reports the bytes we know and labels transfer
functions we do not know.  It is a reference/archive model, not a claim of
cycle-accurate Digitone emulation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import Any, Mapping, Sequence

from .sysex import SoundMessage, SoundValidationError, validate_sound_message


DATA_OFFSET = 0x29
SCHEMA_VERSION = "digitone.sound.v1"

# These are isolated calibration tables.  Hardware measurements can replace a
# table without changing the canonical JSON shape or C++ integration boundary.
C_RATIO_CALIBRATION = (0.25, 0.50, 0.75, 1.00, 2.00, 3.00, 4.00, 5.00, 6.00, 7.00, 8.00, 9.00, 10.00, 11.00, 12.00, 13.00, 14.00, 15.00, 16.00)
A_RATIO_CALIBRATION = (
    0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50,
    2.75, 3.00, 3.25, 3.50, 3.75, 4.00, 4.25, 4.50, 4.75, 5.00,
    5.50, 6.00, 6.50, 7.00, 7.50, 8.00, 8.50, 9.00, 9.50, 10.00,
    11.00, 12.00, 13.00, 14.00, 15.00, 16.00,
)
B_RATIO_CALIBRATION = C_RATIO_CALIBRATION
RATIO_CALIBRATION_TABLES = {
    "c": C_RATIO_CALIBRATION,
    "a": A_RATIO_CALIBRATION,
    "b1": B_RATIO_CALIBRATION,
    "b2": B_RATIO_CALIBRATION,
}

# Offsets are relative to the packed parameter area beginning at message byte
# 0x29.  Keep this table local instead of importing the unmaintained
# libdigitone package; raw bytes remain useful even when a transfer function is
# unknown.
PARAMETER_OFFSETS: dict[str, int] = {
    "algorithm": 0x28,
    "c": 0x2B,
    "a": 0x2D,
    "fdbk": 0x36,
    "mix": 0x38,
    "a_attack": 0x3F, "a_decay": 0x42, "a_end": 0x44, "a_level": 0x46,
    "b_attack": 0x48, "b_decay": 0x4B, "b_end": 0x4D, "b_level": 0x4F,
    "a_delay": 0x52, "a_trig": 0x54, "a_reset": 0x56,
    "phase_reset": 0x3B, "b_delay": 0x58, "b_trig": 0x5B, "b_reset": 0x5D,
    "filt_attack": 0x7D, "filt_dec": 0x7F, "filt_sustain": 0x82,
    "filt_release": 0x84, "filt1_type": 0x74, "filt2_base": 0x86,
    "filt2_width": 0x88, "amp_attack": 0x8B, "amp_decay": 0x8D,
    "amp_sustain": 0x8F, "pan": 0x96, "amp_reset": 0xA2,
    "lfo1_dest": 0x12, "lfo1_wave": 0x16, "lfo2_dest": 0x14,
    "lfo2_wave": 0x18, "lfo1_mult": 0x08, "lfo1_fade": 0x0D,
    "lfo1_phase": 0x1B, "lfo1_mode": 0x1F, "lfo2_mult": 0x0B,
    "lfo2_fade": 0x0F, "lfo2_phase": 0x1D, "lfo2_mode": 0x22,
    "arp_toggle": 0xEC, "arp_speed": 0xED, "arp_range": 0xEE,
    "arp_note_length": 0xEF, "arp_length": 0xF0,
    "key_scale_a": 0x107, "key_scale_b1": 0x108, "key_scale_b2": 0x10A,
    "filt_track": 0x10B, "vel_vol": 0xBB, "pitch_bend": 0x10D,
    "octave": 0x10E,
}

ROUTING_DESTINATION_OFFSETS: dict[str, tuple[int, ...]] = {
    "pitch_bend": (0xC7, 0xCA, 0xCC, 0xCE),
    "velocity": (0xBE, 0xC0, 0xC3, 0xC5),
    "modwheel": (0xD0, 0xD3, 0xD5, 0xD7),
    "breath": (0xDA, 0xDC, 0xDE, 0xE0),
    "aftertouch": (0xE3, 0xE5, 0xE7, 0xEA),
}
ROUTING_AMOUNT_SPECS: dict[str, tuple[tuple[int, int, int], ...]] = {
    "pitch_bend": ((5, 0xC1, 0xC6), (7, 0xC1, 0xC8), (2, 0xC9, 0xCB), (4, 0xC9, 0xCD)),
    "velocity": ((4, 0xB9, 0xBD), (6, 0xB9, 0xBF), (1, 0xC1, 0xC2), (3, 0xC1, 0xC4)),
    "modwheel": ((6, 0xC9, 0xCF), (1, 0xD1, 0xD2), (3, 0xD1, 0xD4), (5, 0xD1, 0xD6)),
    "breath": ((7, 0xD1, 0xD8), (2, 0xD9, 0xDB), (4, 0xD9, 0xDD), (6, 0xD9, 0xDF)),
    "aftertouch": ((1, 0xE1, 0xE2), (3, 0xE1, 0xE4), (5, 0xE1, 0xE6), (7, 0xE1, 0xE8)),
}

TRIPLE_PARAMETER_SPECS: dict[str, tuple[int, int, int, int]] = {
    "harm": (2, 0x31, 0x32, 0x33),
    "dtun": (4, 0x31, 0x34, 0x35),
    "lfo1_spd": (4, 0x01, 0x04, 0x05), "lfo2_spd": (6, 0x01, 0x06, 0x07),
    "lfo1_depth": (4, 0x21, 0x24, 0x25), "lfo2_depth": (6, 0x21, 0x26, 0x27),
    "filt1_freq": (6, 0x71, 0x76, 0x77), "filt1_reso": (1, 0x78, 0x79, 0x7A),
    "filt_env": (3, 0x79, 0x7B, 0x7C), "amp_release": (2, 0x91, 0x92, 0x93),
    "drive": (4, 0x91, 0x94, 0x95), "vol": (1, 0x99, 0x98, 0x9A),
    "chorus": (7, 0x99, 0x9F, 0xA0), "delay": (5, 0x99, 0x9D, 0x9E),
    "reverb": (3, 0x99, 0x9B, 0x9C),
}

# Compatibility view for reverse-engineering notebooks: values are still
# relative to ``frame[0x29:]`` and are never treated as absolute message
# offsets.  The richer typed tables above are the implementation source.
PARAM_LOOK: dict[str, tuple[int, ...]] = {
    **{name: (offset,) for name, offset in PARAMETER_OFFSETS.items()},
    **{name: tuple(spec[1:]) for name, spec in TRIPLE_PARAMETER_SPECS.items()},
}


def _read(data: bytes, offset: int) -> int | None:
    return data[offset] if 0 <= offset < len(data) else None


def _raw_field(raw: int | None, *, confidence: str = "raw") -> dict[str, Any]:
    return {"raw": raw, "confidence": confidence}


def _flag(byte: int | None, bit_index: int) -> int | None:
    if byte is None:
        return None
    # libdigitone's PARAM_LOOK indexes a rendered MSB-first bit string.
    return (byte >> (7 - bit_index)) & 1


def _triple(data: bytes, spec: tuple[int, int, int, int]) -> dict[str, Any]:
    bit, flag_offset, msb_offset, lsb_offset = spec
    flag_byte, msb, lsb = (_read(data, flag_offset), _read(data, msb_offset), _read(data, lsb_offset))
    flag = _flag(flag_byte, bit)
    return {
        "raw": {"flag": flag_byte, "msb": msb, "lsb": lsb, "flag_bit": bit},
        "value": None,
        "confidence": "raw-only",
    }


def _heuristic_triple(data: bytes, name: str, spec: tuple[int, int, int, int]) -> dict[str, Any]:
    result = _triple(data, spec)
    raw = result["raw"]
    flag, msb, lsb = _flag(raw["flag"], raw["flag_bit"]), raw["msb"], raw["lsb"]
    if msb is None or lsb is None or flag is None:
        result["confidence"] = "unknown"
        return result
    if name == "harm":
        # This is the documented reverse-engineering curve, retained as a
        # calibration point rather than an exact transfer-function claim.
        result["value"] = round((msb - 63) + ((50 * lsb / 127) + (50 if flag else 0)) / 100, 2)
        result["confidence"] = "heuristic-calibration"
    elif name.startswith("lfo") and name.endswith(("spd", "depth")):
        result["value"] = round(((2 * msb) - (127 if flag else 128)) + (100 * lsb / 127) / 100, 2)
        result["confidence"] = "heuristic-calibration"
    else:
        result["value"] = round(msb + ((50 * lsb / 127) + (50 if flag else 0)) / 100, 2)
        result["confidence"] = "heuristic-calibration"
    return result


def _ratio(raw: int | None, role: str) -> dict[str, Any]:
    table = RATIO_CALIBRATION_TABLES[role]
    item: dict[str, Any] = {
        "raw": raw,
        "table": f"{role}_ratio_calibration",
        "ratio": table[raw] if raw is not None and 0 <= raw < len(table) else None,
        "confidence": "calibration-table" if raw is not None and 0 <= raw < len(table) else "unknown",
    }
    if item["ratio"] is None:
        item["uncertain"] = "ratio transfer outside isolated calibration table"
    return item


def _envelope(data: bytes, prefix: str) -> dict[str, Any]:
    fields = ("attack", "decay", "end", "level", "delay", "trig", "reset")
    result: dict[str, Any] = {}
    for field_name in fields:
        raw = _read(data, PARAMETER_OFFSETS[f"{prefix}_{field_name}"])
        result[field_name] = {"raw": raw, "normalized": raw / 127 if raw is not None else None, "confidence": "raw-only"}
    return result


def _signed_amount(data: bytes, spec: tuple[int, int, int]) -> dict[str, Any]:
    """Decode a controller amount's sign bit and value byte.

    PARAM_LOOK's three-entry amount records are not the four-entry fractional
    records used by HARM/LFO parameters.
    """

    sign_bit, flag_offset, value_offset = spec
    flag_byte, value = _read(data, flag_offset), _read(data, value_offset)
    sign = _flag(flag_byte, sign_bit)
    signed = (value - 128) if value is not None and sign else value
    return {
        "raw": {"flag": flag_byte, "value": value, "sign_bit": sign_bit},
        "value": signed,
        "confidence": "heuristic-signed-byte",
    }


def _lfo(data: bytes, index: int) -> dict[str, Any]:
    name = f"lfo{index}"
    return {
        "index": index,
        "destination": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_dest"])),
        "waveform": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_wave"])),
        "speed": _heuristic_triple(data, f"{name}_spd", TRIPLE_PARAMETER_SPECS[f"{name}_spd"]),
        "depth": _heuristic_triple(data, f"{name}_depth", TRIPLE_PARAMETER_SPECS[f"{name}_depth"]),
        "mult": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_mult"])),
        "fade": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_fade"])),
        "phase": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_phase"])),
        "mode": _raw_field(_read(data, PARAMETER_OFFSETS[f"{name}_mode"])),
    }


def _routing(data: bytes) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for source, destinations in ROUTING_DESTINATION_OFFSETS.items():
        amounts = ROUTING_AMOUNT_SPECS[source]
        result[source] = {
            "destinations": [_raw_field(_read(data, offset)) for offset in destinations],
            "amounts": [_signed_amount(data, spec) for spec in amounts],
            "confidence": "raw-destination/heuristic-signed-amount",
        }
    return result


@dataclass
class DigitoneSound:
    """JSON-safe canonical Sound representation."""

    name: str = ""
    algorithm: int = 1
    ratios: dict[str, Any] = field(default_factory=dict)
    harm: dict[str, Any] = field(default_factory=dict)
    feedback: dict[str, Any] = field(default_factory=dict)
    mix: dict[str, Any] = field(default_factory=dict)
    envelopes: dict[str, Any] = field(default_factory=dict)
    amp: dict[str, Any] = field(default_factory=dict)
    filter: dict[str, Any] = field(default_factory=dict)
    lfos: list[dict[str, Any]] = field(default_factory=list)
    routing: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    confidence: dict[str, str] = field(default_factory=dict)
    uncertain: list[str] = field(default_factory=list)
    schema_version: str = SCHEMA_VERSION

    @property
    def raw_values(self) -> Mapping[str, Any]:
        return self.raw.get("parameters", {})

    @property
    def raw_parameters(self) -> Mapping[str, Any]:
        return self.raw.get("parameters", {})

    @property
    def a_envelope(self) -> Mapping[str, Any]:
        return self.envelopes.get("a", {})

    @property
    def b_envelope(self) -> Mapping[str, Any]:
        return self.envelopes.get("b", {})

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "name": self.name,
            "algorithm": self.algorithm,
            "ratios": self.ratios,
            "harm": self.harm,
            "feedback": self.feedback,
            "mix": self.mix,
            "envelopes": self.envelopes,
            "amp": self.amp,
            "filter": self.filter,
            "lfos": self.lfos,
            "routing": self.routing,
            "tags": self.tags,
            "raw": self.raw,
            "confidence": self.confidence,
            "uncertain": self.uncertain,
        }

    as_dict = to_dict

    def to_json(self, *, indent: int | None = None) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":") if indent is None else None, indent=indent)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "DigitoneSound":
        if not isinstance(value, Mapping):
            raise TypeError("DigitoneSound.from_dict expects a mapping")
        kwargs = {field_name: value[field_name] for field_name in (
            "name", "algorithm", "ratios", "harm", "feedback", "mix", "envelopes", "amp",
            "filter", "lfos", "routing", "tags", "raw", "confidence", "uncertain", "schema_version",
        ) if field_name in value}
        return cls(**kwargs)

    @classmethod
    def from_json(cls, value: str | bytes | bytearray) -> "DigitoneSound":
        return cls.from_dict(json.loads(value))

    @classmethod
    def from_sysex(cls, value: bytes | bytearray | memoryview | Sequence[int] | str | SoundMessage, *, strict: bool = True, validate_checksum: bool = True) -> "DigitoneSound":
        return decode_sound(value, strict=strict, validate_checksum=validate_checksum)

    from_bytes = from_sysex


CanonicalDigitoneSound = DigitoneSound
Sound = DigitoneSound


def _decode_tags(unpacked: bytes) -> list[str]:
    # The tag bitfield has not been independently calibrated.  Preserve the
    # bytes in raw and leave semantic tag names empty until hardware fixtures
    # establish the mapping.
    return [] if len(unpacked) < 24 else []


def decode_sound(
    value: bytes | bytearray | memoryview | Sequence[int] | str | SoundMessage,
    *,
    strict: bool = True,
    validate_checksum: bool = True,
) -> DigitoneSound:
    """Decode a validated frame into the canonical model."""

    message = value if isinstance(value, SoundMessage) else validate_sound_message(
        value, strict_size=strict, validate_checksum=validate_checksum
    )
    frame, data = message.frame, message.data
    unpacked_name = message.name_bytes
    try:
        sound_name = unpacked_name.split(b"\x00", 1)[0].decode("utf-8", "replace").strip()
    except Exception:
        sound_name = ""
    if not sound_name:
        # Legacy/synthetic fixtures may not carry a complete packed body.
        sound_name = frame[0x18:0x29].split(b"\x00", 1)[0].decode("utf-8", "replace").strip()

    raw_parameters: dict[str, Any] = {name: _read(data, offset) for name, offset in PARAMETER_OFFSETS.items()}
    for parameter_name, spec in TRIPLE_PARAMETER_SPECS.items():
        raw_parameters[parameter_name] = _triple(data, spec)["raw"]
    b_flag, b_msb, b_lsb = _read(data, 0x29), _read(data, 0x2F), _read(data, 0x30)
    b_flag_value = _flag(b_flag, 7)
    b_sub = int((64 / 127) * ((b_lsb or 0) + (127 if b_flag_value else 0))) if b_lsb is not None else None
    b_index = (b_msb or 0) * 128 + b_sub if b_msb is not None and b_sub is not None else None
    raw_parameters["b"] = {"flag": b_flag, "msb": b_msb, "lsb": b_lsb, "flag_value": b_flag_value, "combined_index": b_index}

    harm = _heuristic_triple(data, "harm", TRIPLE_PARAMETER_SPECS["harm"])
    harm["range"] = [-26.0, 26.0]
    harm["normalized"] = harm["value"] / 26.0 if harm.get("value") is not None else None
    harm["semantics"] = "negative affects C; positive affects A and B1"
    harm["negative_targets"] = ["c"]
    harm["positive_targets"] = ["a", "b1"]
    harm["uncertain"] = "transfer curve requires hardware calibration"
    feedback_raw = _read(data, PARAMETER_OFFSETS["fdbk"])
    mix_raw = _read(data, PARAMETER_OFFSETS["mix"])
    b1_index = b_index // len(B_RATIO_CALIBRATION) if b_index is not None else None
    b2_index = b_index % len(B_RATIO_CALIBRATION) if b_index is not None else None

    amp_fields = {name: _raw_field(_read(data, offset)) for name, offset in PARAMETER_OFFSETS.items() if name.startswith("amp_") or name in {"pan", "drive", "vol", "chorus", "delay", "reverb"}}
    for parameter_name, spec in TRIPLE_PARAMETER_SPECS.items():
        if parameter_name in {"amp_release", "drive", "vol", "chorus", "delay", "reverb"}:
            amp_fields[parameter_name] = _heuristic_triple(data, parameter_name, spec)
    filter_fields = {name: _raw_field(_read(data, offset)) for name, offset in PARAMETER_OFFSETS.items() if name.startswith("filt")}
    for parameter_name, spec in TRIPLE_PARAMETER_SPECS.items():
        if parameter_name.startswith("filt"):
            filter_fields[parameter_name] = _heuristic_triple(data, parameter_name, spec)

    uncertain = [
        "ratio transfer functions are isolated calibration tables, not exact Digitone emulation",
        "HARM transfer curve and grouped B ratio packing require hardware calibration",
        "filter/amp/LFO/controller values preserve raw bytes where transfer curves are undocumented",
    ]
    confidence = {
        "framing": "validated",
        "name": "7-bit-unpacked",
        "algorithm": "raw-index",
        "ratios": "calibration-table-index",
        "harm": "heuristic-calibration",
        "feedback": "raw-only",
        "mix": "raw-only",
        "envelopes": "raw-only",
        "amp": "raw-only-or-heuristic",
        "filter": "raw-only-or-heuristic",
        "lfos": "raw-only-or-heuristic",
        "routing": "raw-destination/heuristic-amount",
    }
    return DigitoneSound(
        name=sound_name,
        algorithm=max(1, min(8, ((_read(data, PARAMETER_OFFSETS["algorithm"]) or 0) & 0x07) + 1)),
        ratios={
            "c": _ratio(_read(data, PARAMETER_OFFSETS["c"]), "c"),
            "a": _ratio(_read(data, PARAMETER_OFFSETS["a"]), "a"),
            "b1": _ratio(b1_index, "b1"),
            "b2": _ratio(b2_index, "b2"),
            "b": {"raw": raw_parameters["b"], "combined_index": b_index, "confidence": "packed-clock-hand-heuristic"},
        },
        harm=harm,
        feedback={"raw": feedback_raw, "normalized": feedback_raw / 127 if feedback_raw is not None else None, "confidence": "raw-only"},
        mix={
            "raw": mix_raw,
            "x": None,
            "y": None,
            "normalized": mix_raw / 127 if mix_raw is not None else None,
            "normalized_crossfade": mix_raw / 127 if mix_raw is not None else None,
            "bipolar_display": mix_raw - 64 if mix_raw is not None else None,
            "semantics": "X/Y carrier mix; transfer unknown",
            "confidence": "heuristic/raw-calibration",
        },
        envelopes={
            "a": _envelope(data, "a"),
            "b": _envelope(data, "b"),
            "phase_reset": _raw_field(_read(data, PARAMETER_OFFSETS["phase_reset"])),
        },
        amp=amp_fields,
        filter=filter_fields,
        lfos=[_lfo(data, 1), _lfo(data, 2)],
        routing=_routing(data),
        tags=_decode_tags(message.unpacked_body),
        raw={
            "frame_hex": frame.hex(),
            "header_hex": frame[:18].hex(),
            "packed_body_hex": message.packed_body.hex(),
            "unpacked_body_hex": message.unpacked_body.hex(),
            "body_padding_hex": message.body_padding.hex(),
            "parameters": raw_parameters,
            "checksum14": message.checksum,
            "declared_length": message.declared_length,
            "actual_length": message.actual_length,
        },
        confidence=confidence,
        uncertain=uncertain,
    )


def decode(value: bytes | bytearray | memoryview | Sequence[int] | str | SoundMessage, *, strict: bool = True, validate_checksum: bool = True) -> DigitoneSound:
    return decode_sound(value, strict=strict, validate_checksum=validate_checksum)


def parse_sound(value: bytes | bytearray | memoryview | Sequence[int] | str | SoundMessage, *, strict: bool = True, validate_checksum: bool = True) -> DigitoneSound:
    return decode_sound(value, strict=strict, validate_checksum=validate_checksum)


from_sysex = decode_sound


__all__ = [
    "A_RATIO_CALIBRATION",
    "B_RATIO_CALIBRATION",
    "C_RATIO_CALIBRATION",
    "CanonicalDigitoneSound",
    "DATA_OFFSET",
    "DigitoneSound",
    "PARAMETER_OFFSETS",
    "PARAM_LOOK",
    "RATIO_CALIBRATION_TABLES",
    "Sound",
    "decode",
    "decode_sound",
    "from_sysex",
    "parse_sound",
]
