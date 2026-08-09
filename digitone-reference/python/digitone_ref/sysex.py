"""Digitone USB-MIDI/SysEx framing and capture helpers.

The wire format is deliberately kept separate from :mod:`digitone_ref.model`.
Only the optional live-MIDI helpers import ``mido`` and they do so lazily, so
offline archive/decoder use has no third-party dependency.
"""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable, Iterable, Iterator, Sequence, Union


SYSEX_START = 0xF0
SYSEX_END = 0xF7
ELEKTRON_HEADER = bytes.fromhex("00 20 3C 0D 00")
DIGITONE_SOUND_TYPE = 0x53
DIGITONE_SOUND_HEADER = bytes((SYSEX_START, *ELEKTRON_HEADER, DIGITONE_SOUND_TYPE))

# A factory-bank frame is commonly 338 or 339 bytes when F0 is included;
# current firmware has also emitted a 361-byte variant.  A .syx split segment
# can be one byte shorter when its leading F0 is omitted.  Keep this list
# explicit: it catches accidental truncation while still permitting all known
# Sound transfer variants.
KNOWN_SOUND_FRAME_LENGTHS = frozenset((338, 339, 361))
KNOWN_SOUND_SEGMENT_LENGTHS = frozenset(n - 1 for n in KNOWN_SOUND_FRAME_LENGTHS)
SOUND_DATA_OFFSET = 0x29
PACKED_BODY_OFFSET = 18
TRAILER_LENGTH = 5
MIN_SOUND_FRAME_LENGTH = PACKED_BODY_OFFSET + TRAILER_LENGTH + 8


class SysExError(ValueError):
    """Base class for malformed or unsupported SysEx data."""


class SysExFramingError(SysExError):
    """A stream did not contain complete F0 ... F7 frames."""


class SoundValidationError(SysExError):
    """A framed message is not a Digitone Sound dump."""


class MidiUnavailableError(RuntimeError):
    """The optional mido dependency or a MIDI port is unavailable."""


class MidiTimeoutError(TimeoutError):
    """No matching Sound response arrived before the timeout."""


@dataclass(frozen=True)
class SoundMessage:
    """Validated Sound frame and transport-level metadata.

    ``frame`` always contains F0 and F7, even when the caller supplied a .syx
    segment with the leading F0 omitted.  ``packed_body`` is the wire body;
    ``unpacked_body`` contains the 8-to-7 bit restored bytes used for names and
    future reverse engineering.  Unknown trailing body padding is retained in
    ``body_padding`` rather than discarded silently.
    """

    frame: bytes
    declared_length: int
    actual_length: int
    checksum: int | None
    packed_body: bytes
    unpacked_body: bytes
    body_padding: bytes
    size_known: bool

    @property
    def data(self) -> bytes:
        """Raw packed parameter area (message offset 0x29 through trailer)."""

        return self.frame[SOUND_DATA_OFFSET : -TRAILER_LENGTH]

    @property
    def name_bytes(self) -> bytes:
        """The canonical 15-byte name slot from the unpacked body."""

        return self.unpacked_body[5:20]

    def __bytes__(self) -> bytes:
        return self.frame


def _as_bytes(value: bytes | bytearray | memoryview | Iterable[int] | str) -> bytes:
    if isinstance(value, str):
        # Accept the common ``f0 00 ...`` and hexadecimal-string forms used by
        # MIDI tools.  Whitespace and separators are intentionally harmless.
        compact = "".join(ch for ch in value if ch not in " \t\r\n:_-")
        try:
            return bytes.fromhex(compact)
        except ValueError as exc:
            raise SysExError("SysEx text is not hexadecimal") from exc
    try:
        return bytes(value)
    except (TypeError, ValueError) as exc:
        raise SysExError("SysEx data must be bytes-like or an iterable of octets") from exc


def _normalise_frame(value: bytes | bytearray | memoryview | Iterable[int] | str) -> bytes:
    """Return a full F0...F7 frame, accepting a .syx segment without F0."""

    raw = _as_bytes(value)
    if raw.startswith(bytes((SYSEX_START,))):
        if not raw.endswith(bytes((SYSEX_END,))):
            raise SysExFramingError("SysEx frame starts with F0 but has no terminating F7")
        return raw
    # ``mido.Message.data`` and ``factory.syx.split(b"\\xf0")[1]`` both omit
    # F0.  They still carry the Elektron header and terminal F7.
    if raw.startswith(ELEKTRON_HEADER) and raw.endswith(bytes((SYSEX_END,))):
        return bytes((SYSEX_START,)) + raw
    raise SysExFramingError("expected a complete Digitone SysEx frame")


def _decode_7bit_groups(body: bytes) -> tuple[bytes, bytes]:
    """Restore Elektron's mask + seven data-byte groups.

    A few firmware variants leave 0..7 padding bytes before the checksum.  A
    partial group is therefore returned separately and never interpreted as
    parameter data.
    """

    complete = len(body) // 8 * 8
    out = bytearray()
    for index in range(0, complete, 8):
        mask = body[index]
        group = body[index + 1 : index + 8]
        for j, datum in enumerate(group):
            out.append(datum | (((mask >> (6 - j)) & 1) << 7))
    return bytes(out), body[complete:]


def _checksum14(frame: bytes) -> int | None:
    if len(frame) < TRAILER_LENGTH or frame[-1] != SYSEX_END:
        return None
    return ((frame[-5] & 0x7F) << 7) | (frame[-4] & 0x7F)


def validate_sound_message(
    value: bytes | bytearray | memoryview | Iterable[int] | str,
    *,
    strict_size: bool = True,
    validate_declared_length: bool = True,
    validate_checksum: bool = True,
) -> SoundMessage:
    """Validate and describe one Digitone Sound dump.

    Length is checked against the 14-bit trailer value whenever the trailer is
    present (all known Sound frames carry it).  The 14-bit checksum covers
    bytes 10 through the start of the five-byte trailer when F0 is included
    (equivalently bytes 9 onward in a segment without F0).  Set
    ``validate_checksum=False`` while investigating a future transfer variant,
    and ``strict_size=False`` when its size is not in the known 338/339/361 set.
    """

    frame = _normalise_frame(value)
    if len(frame) < MIN_SOUND_FRAME_LENGTH:
        raise SoundValidationError(f"truncated Sound frame ({len(frame)} bytes)")
    if frame[1:6] != ELEKTRON_HEADER:
        raise SoundValidationError("unexpected Elektron manufacturer/model header")
    if frame[6] != DIGITONE_SOUND_TYPE:
        raise SoundValidationError(f"unsupported Digitone SysEx type 0x{frame[6]:02X}")
    if any(octet > 0x7F for octet in frame[1:-1]):
        raise SoundValidationError("SysEx data bytes must be 7-bit values")

    size_known = len(frame) in KNOWN_SOUND_FRAME_LENGTHS
    if strict_size and not size_known:
        raise SoundValidationError(
            f"unsupported Sound frame length {len(frame)}; expected one of "
            f"{sorted(KNOWN_SOUND_FRAME_LENGTHS)}"
        )

    declared_length = ((frame[-3] & 0x7F) << 7) | (frame[-2] & 0x7F)
    if validate_declared_length:
        # Elektron's length excludes the 10-byte prefix (F0 + manufacturer,
        # model, type/version and the two unspecified bytes).
        expected = len(frame) - 10
        if declared_length != expected:
            raise SoundValidationError(
                f"declared message length {declared_length} does not match {expected}"
            )

    if validate_checksum:
        expected_checksum = sum(frame[10:-TRAILER_LENGTH]) & 0x3FFF
        actual_checksum = ((frame[-5] & 0x7F) << 7) | (frame[-4] & 0x7F)
        if actual_checksum != expected_checksum:
            raise SoundValidationError(
                f"checksum 0x{actual_checksum:04X} does not match "
                f"0x{expected_checksum:04X}"
            )

    body = frame[PACKED_BODY_OFFSET:-TRAILER_LENGTH]
    unpacked, padding = _decode_7bit_groups(body)
    return SoundMessage(
        frame=frame,
        declared_length=declared_length,
        actual_length=len(frame),
        checksum=_checksum14(frame),
        packed_body=body,
        unpacked_body=unpacked,
        body_padding=padding,
        size_known=size_known,
    )


def iter_sysex_frames(
    stream: bytes | bytearray | memoryview | Iterable[int] | str,
    *,
    strict: bool = True,
) -> Iterator[bytes]:
    """Yield complete F0...F7 frames from a possibly concatenated stream.

    Non-SysEx MIDI bytes between frames are ignored.  An F0 encountered before
    the prior F7 is considered truncation, rather than silently merging two
    dumps.  ``strict=False`` skips malformed fragments and is useful for a
    best-effort bank scanner.
    """

    data = _as_bytes(stream)
    start: int | None = None
    for index, octet in enumerate(data):
        if octet == SYSEX_START:
            if start is not None:
                if strict:
                    raise SysExFramingError("nested F0 before terminating F7")
                start = index
            else:
                start = index
        elif octet == SYSEX_END and start is not None:
            yield data[start : index + 1]
            start = None
    if start is not None and strict:
        raise SysExFramingError("truncated SysEx stream (missing F7)")


def parse_sysex_stream(
    stream: bytes | bytearray | memoryview | Iterable[int] | str,
    *,
    sound_only: bool = False,
    strict: bool = True,
) -> list[bytes | SoundMessage]:
    """Parse concatenated SysEx data into frames or validated Sound messages."""

    frames = list(iter_sysex_frames(stream, strict=strict))
    if not sound_only:
        return frames
    return [validate_sound_message(frame, strict_size=strict) for frame in frames]


# Short aliases used by scripts and older experiments.
parse = parse_sysex_stream
iter_frames = iter_sysex_frames
parse_stream = parse_sysex_stream
validate = validate_sound_message


def build_sound_request(track: int = 0, *, framed: bool = False) -> bytes:
    """Build the current-Sound request payload for one Digitone track."""

    if not isinstance(track, int) or isinstance(track, bool) or not 0 <= track <= 0x7F:
        raise ValueError("track must be an integer from 0 through 127")
    payload = ELEKTRON_HEADER + bytes.fromhex("6B 01 01") + bytes((track,)) + bytes.fromhex("00 00 00 05")
    return bytes((SYSEX_START,)) + payload + bytes((SYSEX_END,)) if framed else payload


def build_request(track: int = 0, *, framed: bool = False) -> bytes:
    return build_sound_request(track, framed=framed)


def _load_mido() -> Any:
    try:
        import mido  # type: ignore[import-not-found]
    except ImportError as exc:
        raise MidiUnavailableError(
            "live USB MIDI requires optional dependency 'mido' (and a backend)"
        ) from exc
    return mido


def list_midi_ports() -> dict[str, tuple[str, ...]]:
    """Return available input/output names without importing mido at module load."""

    mido = _load_mido()
    try:
        inputs = tuple(mido.get_input_names())
        outputs = tuple(mido.get_output_names())
    except Exception as exc:  # pragma: no cover - backend-specific
        raise MidiUnavailableError(f"unable to enumerate MIDI ports: {exc}") from exc
    return {"inputs": inputs, "outputs": outputs}


PortMatcher = Union[str, Callable[[str], bool], Sequence[str], None]


def _choose_port(names: Sequence[str], matcher: PortMatcher, direction: str) -> str:
    if not names:
        raise MidiUnavailableError(f"no MIDI {direction} ports are available")
    if matcher is None:
        if len(names) == 1:
            return names[0]
        # Prefer the Digitone by convention, but do not guess another device.
        preferred = [name for name in names if "digitone" in name.casefold()]
        if len(preferred) == 1:
            return preferred[0]
        raise MidiUnavailableError(
            f"multiple MIDI {direction} ports found; pass a port matcher/name"
        )
    if isinstance(matcher, str):
        folded = matcher.casefold()
        exact = [name for name in names if name.casefold() == folded]
        candidates = exact or [name for name in names if folded in name.casefold()]
    elif callable(matcher):
        candidates = [name for name in names if matcher(name)]
    else:
        wanted = {str(item).casefold() for item in matcher}
        candidates = [name for name in names if name.casefold() in wanted]
    if len(candidates) != 1:
        raise MidiUnavailableError(
            f"MIDI {direction} matcher selected {len(candidates)} ports: {candidates!r}"
        )
    return candidates[0]


def resolve_midi_ports(
    *, input_port: str | None = None, output_port: str | None = None,
    port_match: PortMatcher = None,
) -> tuple[str, str]:
    """Resolve the exact input/output names used for one capture."""

    if input_port and output_port:
        return input_port, output_port
    names = list_midi_ports()
    return (
        input_port or _choose_port(names["inputs"], port_match, "input"),
        output_port or _choose_port(names["outputs"], port_match, "output"),
    )


def _message_data(message: Any) -> bytes | None:
    if getattr(message, "type", None) != "sysex":
        return None
    # mido's Message.bytes() includes F0/F7, while .data intentionally does
    # not.  Prefer bytes() when available to avoid guessing framing.
    try:
        raw = bytes(message.bytes())
    except Exception:
        raw = bytes(getattr(message, "data", ()))
    if raw.startswith(bytes((SYSEX_START,))):
        return raw
    data = bytes(getattr(message, "data", raw))
    return bytes((SYSEX_START,)) + data + bytes((SYSEX_END,))


def capture_current_sound(
    track: int = 0,
    *,
    port: str | None = None,
    port_name: str | None = None,
    input_port: str | None = None,
    output_port: str | None = None,
    port_match: PortMatcher = None,
    timeout: float = 2.0,
    validate: bool = True,
) -> bytes:
    """Request and capture the current Sound over USB MIDI.

    Ports are opened only for the duration of one request.  The function uses
    non-blocking ``iter_pending``/``poll`` calls so timeout behaviour is
    deterministic across mido backends.
    """

    if timeout <= 0:
        raise ValueError("timeout must be positive")
    mido = _load_mido()
    inport: Any | None = None
    outport: Any | None = None
    try:
        port_match = port_match or port or port_name
        in_name, out_name = resolve_midi_ports(
            input_port=input_port, output_port=output_port, port_match=port_match
        )
        inport = mido.open_input(in_name)
        outport = mido.open_output(out_name)
    except MidiUnavailableError:
        raise
    except Exception as exc:  # pragma: no cover - backend-specific
        for opened in (inport, outport):
            try:
                if opened is not None:
                    opened.close()
            except Exception:
                pass
        raise MidiUnavailableError(f"unable to open Digitone MIDI ports: {exc}") from exc

    try:
        try:
            request = mido.Message("sysex", data=list(build_sound_request(track)))
            outport.send(request)
        except Exception as exc:  # pragma: no cover - backend-specific
            raise MidiUnavailableError(f"unable to send Digitone Sound request: {exc}") from exc

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                pending = getattr(inport, "iter_pending", None)
                messages = list(pending()) if callable(pending) else []
                if not messages:
                    poll = getattr(inport, "poll", None)
                    if callable(poll):
                        message = poll()
                        if message is not None:
                            messages = [message]
            except Exception as exc:  # pragma: no cover - backend-specific
                raise MidiUnavailableError(f"unable to receive Digitone MIDI data: {exc}") from exc
            for message in messages:
                raw = _message_data(message)
                if raw is None:
                    continue
                try:
                    checked = validate_sound_message(
                        raw,
                        strict_size=validate,
                        validate_declared_length=validate,
                        validate_checksum=validate,
                    )
                except SysExError:
                    continue
                return checked.frame
            time.sleep(min(0.005, max(0.0, deadline - time.monotonic())))
        raise MidiTimeoutError(f"timed out after {timeout:.3f}s waiting for a Digitone Sound")
    finally:
        for port in (inport, outport):
            try:
                port.close()
            except Exception:
                pass


request_current_sound = capture_current_sound
capture_sound = capture_current_sound


__all__ = [
    "DIGITONE_SOUND_HEADER",
    "DIGITONE_SOUND_TYPE",
    "ELEKTRON_HEADER",
    "KNOWN_SOUND_FRAME_LENGTHS",
    "MIN_SOUND_FRAME_LENGTH",
    "MidiTimeoutError",
    "MidiUnavailableError",
    "SoundMessage",
    "SoundValidationError",
    "SysExError",
    "SysExFramingError",
    "build_request",
    "build_sound_request",
    "capture_current_sound",
    "capture_sound",
    "iter_frames",
    "iter_sysex_frames",
    "list_midi_ports",
    "parse",
    "parse_stream",
    "parse_sysex_stream",
    "request_current_sound",
    "resolve_midi_ports",
    "validate",
    "validate_sound_message",
]
