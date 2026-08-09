"""Small, dependency-light audio/artifact helpers for the Digitone reference tool.

The module deliberately keeps recording optional.  Importing it never imports
``sounddevice`` (or numpy); the dependency is loaded only by the recording and
device-listing functions.  WAV inspection uses :mod:`wave` so an archive can be
validated on machines that do not have an audio stack installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import struct
from typing import Any, Iterable, Mapping, Sequence
import wave


DEFAULT_SAMPLE_RATE = 48_000
DEFAULT_CHANNELS = 2
DEFAULT_DURATION = 2.0

# A short, deterministic sequence is intentionally represented as data rather
# than generated at render time.  It is stored in comparison metadata and can
# be replayed by any renderer or DAW integration.
DEFAULT_MIDI_SEQUENCE: tuple[dict[str, Any], ...] = (
    {"note": 60, "velocity": 100, "start": 0.0, "duration": 0.5},
    {"note": 64, "velocity": 92, "start": 0.5, "duration": 0.5},
    {"note": 67, "velocity": 84, "start": 1.0, "duration": 0.5},
    {"note": 72, "velocity": 100, "start": 1.5, "duration": 0.5},
)


@dataclass(frozen=True)
class WavInfo:
    """Validated PCM WAV properties used by A/B metadata."""

    path: str
    sample_rate: int
    channels: int
    sample_width: int
    frame_count: int

    @property
    def duration(self) -> float:
        return self.frame_count / self.sample_rate if self.sample_rate else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "sample_width": self.sample_width,
            "frame_count": self.frame_count,
            "duration_seconds": self.duration,
        }


def utc_timestamp() -> str:
    """Return a stable, sortable UTC timestamp for artifact metadata."""

    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def safe_stem(value: str | os.PathLike[str] | None, fallback: str = "digitone") -> str:
    """Make a user supplied name safe for a filename without changing paths."""

    text = Path(value).stem if value is not None else fallback
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("._-")
    return text or fallback


def unique_path(
    directory: str | os.PathLike[str],
    stem: str,
    suffix: str,
    *,
    timestamp: str | None = None,
) -> Path:
    """Return a non-existing path, adding a numeric suffix when necessary.

    Callers still create the file themselves; choosing a new candidate instead
    of opening with ``w`` is what keeps normal CLI operations non-destructive.
    """

    directory_path = Path(directory)
    directory_path.mkdir(parents=True, exist_ok=True)
    base = safe_stem(stem)
    if timestamp:
        base = f"{base}_{timestamp}"
    suffix = suffix if suffix.startswith(".") else f".{suffix}"
    candidate = directory_path / f"{base}{suffix}"
    number = 2
    while candidate.exists():
        candidate = directory_path / f"{base}_{number}{suffix}"
        number += 1
    return candidate


def sha256_file(path: str | os.PathLike[str], chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_wav(path: str | os.PathLike[str]) -> WavInfo:
    """Validate a PCM WAV and return its useful structural metadata."""

    wav_path = Path(path)
    try:
        with wave.open(str(wav_path), "rb") as source:
            channels = source.getnchannels()
            sample_rate = source.getframerate()
            sample_width = source.getsampwidth()
            frame_count = source.getnframes()
            compression = source.getcomptype()
    except (OSError, EOFError, wave.Error) as exc:
        raise ValueError(f"invalid WAV: {wav_path}: {exc}") from exc
    if compression != "NONE":
        raise ValueError(f"unsupported compressed WAV: {wav_path}")
    if channels < 1 or sample_rate < 1 or frame_count < 0:
        raise ValueError(f"invalid WAV dimensions: {wav_path}")
    if sample_width not in (1, 2, 3, 4):
        raise ValueError(f"unsupported PCM sample width {sample_width}: {wav_path}")
    return WavInfo(
        path=str(wav_path),
        sample_rate=sample_rate,
        channels=channels,
        sample_width=sample_width,
        frame_count=frame_count,
    )


# Public aliases make the small contract easy to discover from callers and
# preserve compatibility with early prototypes of the reference tool.
read_wav_metadata = inspect_wav
validate_wav = inspect_wav
wav_metadata = inspect_wav


def list_audio_devices() -> list[Any]:
    """List host audio devices, importing sounddevice only when requested."""

    try:
        import sounddevice as sd  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "audio devices unavailable (install optional 'sounddevice')"
        ) from exc
    devices = sd.query_devices()
    return list(devices)


def _write_pcm_wav(
    path: Path,
    pcm: bytes,
    *,
    sample_rate: int,
    channels: int,
    sample_width: int = 2,
) -> None:
    if not pcm:
        raise ValueError("recording returned no audio frames")
    frame_bytes = channels * sample_width
    if len(pcm) % frame_bytes:
        raise ValueError("recording returned a partial PCM frame")
    with wave.open(str(path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(sample_width)
        target.setframerate(sample_rate)
        target.writeframes(pcm)


def _bytes_from_recorded(value: Any) -> bytes:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)
    tobytes = getattr(value, "tobytes", None)
    if callable(tobytes):
        return bytes(tobytes())
    # This fallback is intentionally small and only serves simple fake audio
    # backends in tests; real sounddevice uses RawInputStream or numpy arrays.
    try:
        return bytes(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("recording backend returned unsupported sample data") from exc


def resolve_midi_output(name: str | None = None) -> str:
    """Resolve an explicit MIDI output or an unambiguous Digitone port."""

    try:
        import mido  # type: ignore
    except ImportError as exc:
        raise RuntimeError("MIDI reference capture requires optional 'mido'") from exc
    if not name:
        names = list(mido.get_output_names())
        if len(names) == 1:
            name = names[0]
        else:
            preferred = [item for item in names if "digitone" in str(item).casefold()]
            if len(preferred) == 1:
                name = preferred[0]
            else:
                raise RuntimeError("select one MIDI output with --midi-output")
    return str(name)


def _open_output_port(mido: Any, name: str | None) -> Any:
    """Open a MIDI output without assuming a particular mido backend wrapper."""

    name = resolve_midi_output(name)
    try:
        return mido.open_output(name)
    except (OSError, RuntimeError, ValueError) as exc:
        raise RuntimeError(f"unable to open MIDI output: {name}") from exc


def _midi_message(mido: Any, kind: str, **kwargs: Any) -> Any:
    try:
        return mido.Message(kind, **kwargs)
    except TypeError:
        # Small fakes often expose Message as a simple callable accepting a
        # mapping; real mido takes keyword fields as above.
        return mido.Message(kind, kwargs)


def record_reference_sequence_wav(
    output: str | os.PathLike[str],
    *,
    duration: float = DEFAULT_DURATION,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    channels: int = DEFAULT_CHANNELS,
    device: int | str | None = None,
    midi_output: str | None = None,
    sequence: Sequence[Mapping[str, Any]] = DEFAULT_MIDI_SEQUENCE,
) -> Path:
    """Record audio while scheduling the deterministic MIDI note sequence.

    MIDI and sounddevice remain lazy imports.  Scheduling is driven by captured
    frame count, which is deterministic in tests and follows the host audio
    clock in a real ``RawInputStream``.  Every exit path sends per-note note-off
    messages and a MIDI all-notes-off controller before closing the port.
    """

    if duration <= 0:
        raise ValueError("duration must be greater than zero")
    if sample_rate <= 0 or channels <= 0:
        raise ValueError("sample_rate and channels must be greater than zero")
    try:
        import mido  # type: ignore
    except ImportError as exc:
        raise RuntimeError("MIDI reference capture requires optional 'mido'") from exc
    try:
        import sounddevice as sd  # type: ignore
    except ImportError as exc:
        raise RuntimeError("MIDI reference capture requires optional 'sounddevice'") from exc
    stream_type = getattr(sd, "RawInputStream", None)
    if stream_type is None:
        raise RuntimeError("audio backend has no RawInputStream")

    output_path = Path(output)
    if output_path.exists():
        output_path = unique_path(output_path.parent, output_path.stem, output_path.suffix or ".wav")
    elif not output_path.suffix:
        output_path = output_path.with_suffix(".wav")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frames = max(1, int(round(duration * sample_rate)))
    events = sorted(
        (dict(event) for event in sequence),
        key=lambda event: float(event.get("start", 0.0)),
    )
    # State lives on each event rather than only on the MIDI note number: two
    # overlapping note-ons at the same pitch need two independent note-offs.
    scheduled_events = [
        {
            **event,
            "_started": False,
            "_ended": False,
            "_end": float(event.get("start", 0.0)) + float(event.get("duration", 0.0)),
        }
        for event in events
    ]
    pcm = bytearray()
    midi_port: Any | None = None
    stream: Any | None = None
    cleanup_sent = False
    midi_managed = False
    stream_managed = False
    managed_stack: contextlib.ExitStack | None = None
    try:
        midi_port = _open_output_port(mido, midi_output)
        stream_kwargs: dict[str, Any] = {
            "samplerate": sample_rate,
            "channels": channels,
            "dtype": "int16",
            "blocksize": min(1024, frames),
        }
        if device is not None:
            stream_kwargs["device"] = device
        stream = stream_type(**stream_kwargs)
        with contextlib.ExitStack() as stack:
            if hasattr(midi_port, "__enter__"):
                midi_port = stack.enter_context(midi_port)
                midi_managed = True
            if hasattr(stream, "__enter__"):
                stream = stack.enter_context(stream)
                stream_managed = True
            # Keep context-manager resources open until the MIDI cleanup has
            # run.  ExitStack would otherwise close the output before the
            # outer error handler could send all-notes-off.
            managed_stack = stack.pop_all()
            event_index = 0
            captured = 0
            while captured < frames:
                elapsed = captured / sample_rate
                # Release each started event at most once before starting a
                # note at the same timestamp.
                for event in scheduled_events:
                    if event["_started"] and not event["_ended"] and event["_end"] <= elapsed:
                        note = max(0, min(127, int(event.get("note", 60))))
                        midi_port.send(_midi_message(mido, "note_off", note=note, velocity=0, channel=0))
                        event["_ended"] = True
                while event_index < len(scheduled_events) and float(scheduled_events[event_index].get("start", 0.0)) <= elapsed:
                    event = scheduled_events[event_index]
                    note = max(0, min(127, int(event.get("note", 60))))
                    raw_velocity = float(event.get("velocity", 127.0))
                    velocity = max(0, min(127, int(round(raw_velocity if raw_velocity > 1.0 else raw_velocity * 127.0))))
                    midi_port.send(_midi_message(mido, "note_on", note=note, velocity=velocity, channel=0))
                    event["_started"] = True
                    event_index += 1
                block_frames = min(1024, frames - captured)
                data, _overflowed = stream.read(block_frames)
                chunk = _bytes_from_recorded(data)
                frame_bytes = channels * 2
                if not chunk or len(chunk) % frame_bytes:
                    raise ValueError("recording returned a partial PCM frame")
                pcm.extend(chunk)
                captured += len(chunk) // frame_bytes
                # A backend may return a larger block than requested; never
                # allow a fake/driver to make the archive claim fewer frames.
                if captured >= frames:
                    break
            # The requested capture duration may end before a note's natural
            # release.  Close every still-started event exactly once.
            for event in scheduled_events:
                if event["_started"] and not event["_ended"]:
                    note = max(0, min(127, int(event.get("note", 60))))
                    midi_port.send(_midi_message(mido, "note_off", note=note, velocity=0, channel=0))
                    event["_ended"] = True
            midi_port.send(_midi_message(mido, "control_change", control=123, value=0, channel=0))
            cleanup_sent = True
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        raise RuntimeError(f"MIDI reference capture failed: {exc}") from exc
    finally:
        if midi_port is not None and not cleanup_sent:
            try:
                for event in scheduled_events:
                    if event["_started"] and not event["_ended"]:
                        note = max(0, min(127, int(event.get("note", 60))))
                        midi_port.send(_midi_message(mido, "note_off", note=note, velocity=0, channel=0))
                        event["_ended"] = True
                midi_port.send(_midi_message(mido, "control_change", control=123, value=0, channel=0))
            except Exception:
                pass
        # ExitStack closes normal context-managed objects.  These guarded calls
        # cover bare test doubles and unusual backends that have no context
        # manager, while remaining safe after an earlier close.
        resources = () if stream_managed else (stream,)
        resources += () if midi_managed else (midi_port,)
        for resource in resources:
            close = getattr(resource, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:
                    pass
        if managed_stack is not None:
            try:
                managed_stack.close()
            except Exception:
                pass
    _write_pcm_wav(output_path, bytes(pcm), sample_rate=sample_rate, channels=channels)
    inspect_wav(output_path)
    return output_path


record_midi_reference_wav = record_reference_sequence_wav
capture_reference_wav = record_reference_sequence_wav


def record_reference_wav(
    output: str | os.PathLike[str],
    *,
    duration: float = DEFAULT_DURATION,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    channels: int = DEFAULT_CHANNELS,
    device: int | str | None = None,
) -> Path:
    """Record signed 16-bit PCM through optional ``sounddevice``.

    ``RawInputStream`` avoids importing numpy in this module and keeps the
    callback path allocation-light.  A small ``rec`` fallback supports simple
    test doubles and older sounddevice installations.
    """

    if duration <= 0:
        raise ValueError("duration must be greater than zero")
    if sample_rate <= 0 or channels <= 0:
        raise ValueError("sample_rate and channels must be greater than zero")
    try:
        import sounddevice as sd  # type: ignore
    except ImportError as exc:
        raise RuntimeError("recording unavailable (install optional 'sounddevice')") from exc

    output_path = Path(output)
    if output_path.exists():
        output_path = unique_path(output_path.parent, output_path.stem, output_path.suffix)
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    frames = max(1, int(round(duration * sample_rate)))
    pcm = bytearray()

    stream_type = getattr(sd, "RawInputStream", None)
    if stream_type is not None:
        try:
            stream_kwargs: dict[str, Any] = {
                "samplerate": sample_rate,
                "channels": channels,
                "dtype": "int16",
                "blocksize": min(1024, frames),
            }
            if device is not None:
                stream_kwargs["device"] = device
            with stream_type(**stream_kwargs) as stream:
                remaining = frames
                while remaining:
                    data, _overflowed = stream.read(min(1024, remaining))
                    chunk = _bytes_from_recorded(data)
                    if not chunk:
                        break
                    pcm.extend(chunk)
                    got = len(chunk) // (2 * channels)
                    remaining -= got
                    if got <= 0:
                        break
        except (OSError, RuntimeError) as exc:
            raise RuntimeError(f"audio recording failed: {exc}") from exc
    elif hasattr(sd, "rec"):
        try:
            rec_kwargs: dict[str, Any] = {
                "samplerate": sample_rate,
                "channels": channels,
                "dtype": "int16",
            }
            if device is not None:
                rec_kwargs["device"] = device
            recorded = sd.rec(frames, **rec_kwargs)
            wait = getattr(sd, "wait", None)
            if callable(wait):
                wait()
            pcm.extend(_bytes_from_recorded(recorded))
        except (OSError, RuntimeError, TypeError, ValueError) as exc:
            raise RuntimeError(f"audio recording failed: {exc}") from exc
    else:
        raise RuntimeError("audio backend has no recording API")

    _write_pcm_wav(
        output_path,
        bytes(pcm),
        sample_rate=sample_rate,
        channels=channels,
    )
    inspect_wav(output_path)
    return output_path


record_wav = record_reference_wav
record_reference = record_reference_wav


def import_reference_wav(
    source: str | os.PathLike[str],
    output_dir: str | os.PathLike[str],
    *,
    stem: str | None = None,
) -> Path:
    """Validate and copy an existing WAV into the reference archive."""

    source_path = Path(source)
    inspect_wav(source_path)
    destination = unique_path(output_dir, stem or source_path.stem, ".wav")
    shutil.copyfile(source_path, destination)
    inspect_wav(destination)
    return destination


import_wav = import_reference_wav


def midi_sequence_text(sequence: Sequence[Mapping[str, Any]] = DEFAULT_MIDI_SEQUENCE) -> str:
    """Encode the shared deterministic sequence for ``digitone-render``."""

    parts: list[str] = []
    for event in sequence:
        note = int(event["note"])
        start = float(event["start"])
        duration = float(event["duration"])
        raw_velocity = float(event.get("velocity", 127.0))
        # Canonical metadata stores MIDI velocity (0..127), while the native
        # renderer consumes a normalized float in its optional third token.
        velocity = raw_velocity if 0.0 <= raw_velocity <= 1.0 else raw_velocity / 127.0
        velocity = max(0.0, min(1.0, velocity))
        parts.append(f"{note}@{start:g}:{duration:g}:{velocity:g}")
    return ",".join(parts)


def write_midi_sequence(
    output_dir: str | os.PathLike[str],
    *,
    sequence: Sequence[Mapping[str, Any]] = DEFAULT_MIDI_SEQUENCE,
    stem: str = "digitone_sequence",
) -> Path:
    target = unique_path(output_dir, stem, ".json")
    target.write_text(json.dumps(list(sequence), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def render_canonical_json(
    canonical_json: str | os.PathLike[str],
    output: str | os.PathLike[str],
    *,
    renderer: str | os.PathLike[str] = "digitone-render",
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    duration: float = DEFAULT_DURATION,
    sequence: Sequence[Mapping[str, Any]] = DEFAULT_MIDI_SEQUENCE,
    extra_args: Iterable[str] = (),
) -> Path:
    """Render one canonical Sound JSON through the portable C++ executable."""

    source = Path(canonical_json)
    if not source.is_file():
        raise FileNotFoundError(source)
    # Validate JSON before invoking a native process so CLI errors remain
    # concise and deterministic.
    try:
        json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid canonical JSON: {source}: {exc}") from exc
    if sample_rate <= 0 or duration <= 0:
        raise ValueError("sample_rate and duration must be greater than zero")
    output_path = Path(output)
    if not output_path.suffix:
        output_path = output_path.with_suffix(".wav")
    if output_path.exists():
        output_path = unique_path(output_path.parent, output_path.stem, output_path.suffix)
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(renderer),
        "--input",
        str(source),
        "--output",
        str(output_path),
        "--sample-rate",
        str(int(sample_rate)),
        "--duration",
        f"{float(duration):g}",
        "--sequence",
        midi_sequence_text(sequence),
        *map(str, extra_args),
    ]
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError as exc:
        raise RuntimeError(f"renderer unavailable: {renderer}") from exc
    if completed.returncode:
        detail = (completed.stderr or completed.stdout or "renderer failed").strip().splitlines()
        raise RuntimeError(detail[-1] if detail else "renderer failed")
    if not output_path.is_file():
        raise RuntimeError(f"renderer did not create WAV: {output_path}")
    inspect_wav(output_path)
    return output_path


render = render_canonical_json


def file_provenance(path: str | os.PathLike[str]) -> dict[str, Any]:
    file_path = Path(path)
    info: dict[str, Any] = {
        "path": str(file_path),
        "sha256": sha256_file(file_path),
        "bytes": file_path.stat().st_size,
    }
    if file_path.suffix.lower() == ".wav":
        info.update(inspect_wav(file_path).to_dict())
    return info


def pcm16_metrics(path: str | os.PathLike[str], *, chunk_frames: int = 4096) -> dict[str, Any] | None:
    """Return normalized peak/RMS for a PCM16 WAV without loading it all."""

    info = inspect_wav(path)
    if info.sample_width != 2:
        return None
    if chunk_frames <= 0:
        raise ValueError("chunk_frames must be greater than zero")
    peak = 0
    sum_squares = 0.0
    samples = 0
    with wave.open(str(path), "rb") as source:
        while True:
            payload = source.readframes(chunk_frames)
            if not payload:
                break
            if len(payload) % 2:
                raise ValueError(f"PCM16 data has a partial sample: {path}")
            count = len(payload) // 2
            values = struct.unpack("<" + "h" * count, payload)
            peak = max(peak, max(abs(value) for value in values))
            sum_squares += sum(float(value) * float(value) for value in values)
            samples += count
    scale = 32768.0
    return {
        "peak": peak / scale,
        "rms": math.sqrt(sum_squares / samples) / scale if samples else 0.0,
        "samples": samples,
    }


def pcm16_difference_rms(
    first: str | os.PathLike[str],
    second: str | os.PathLike[str],
    *,
    chunk_frames: int = 4096,
) -> float | None:
    """Return sample-aligned normalized PCM16 difference RMS when possible."""

    left_info = inspect_wav(first)
    right_info = inspect_wav(second)
    if (
        left_info.sample_width != 2
        or right_info.sample_width != 2
        or left_info.sample_rate != right_info.sample_rate
        or left_info.channels != right_info.channels
        or left_info.frame_count != right_info.frame_count
    ):
        return None
    if chunk_frames <= 0:
        raise ValueError("chunk_frames must be greater than zero")
    sum_squares = 0.0
    samples = 0
    with wave.open(str(first), "rb") as left, wave.open(str(second), "rb") as right:
        while True:
            left_payload = left.readframes(chunk_frames)
            right_payload = right.readframes(chunk_frames)
            if not left_payload and not right_payload:
                break
            if len(left_payload) != len(right_payload) or len(left_payload) % 2:
                return None
            count = len(left_payload) // 2
            left_values = struct.unpack("<" + "h" * count, left_payload)
            right_values = struct.unpack("<" + "h" * count, right_payload)
            sum_squares += sum(
                float(a - b) * float(a - b) for a, b in zip(left_values, right_values)
            )
            samples += count
    return math.sqrt(sum_squares / samples) / 32768.0 if samples else 0.0


pcm_metrics = pcm16_metrics
difference_rms = pcm16_difference_rms


def comparison_metadata(
    reference_wav: str | os.PathLike[str],
    rendered_wav: str | os.PathLike[str],
    *,
    sequence: Sequence[Mapping[str, Any]] = DEFAULT_MIDI_SEQUENCE,
    canonical_json: str | os.PathLike[str] | None = None,
    raw_sysex: str | os.PathLike[str] | None = None,
    renderer: str | os.PathLike[str] = "digitone-render",
    sample_rate: int | None = None,
    duration: float | None = None,
) -> dict[str, Any]:
    """Build auditable metadata for one reference/engine pair."""

    reference = inspect_wav(reference_wav)
    rendered = inspect_wav(rendered_wav)
    reference_provenance = file_provenance(reference_wav)
    engine_provenance = file_provenance(rendered_wav)
    reference_pcm = pcm16_metrics(reference_wav)
    engine_pcm = pcm16_metrics(rendered_wav)
    aligned_difference = pcm16_difference_rms(reference_wav, rendered_wav)
    if reference_pcm is not None:
        reference_provenance["peak"] = reference_pcm["peak"]
        reference_provenance["rms"] = reference_pcm["rms"]
    if engine_pcm is not None:
        engine_provenance["peak"] = engine_pcm["peak"]
        engine_provenance["rms"] = engine_pcm["rms"]
    created_at = utc_timestamp()
    metadata: dict[str, Any] = {
        "schema": "digitone-ab-v1",
        "created_at": created_at,
        "timestamp": created_at,
        "midi_sequence": [dict(event) for event in sequence],
        "midi_sequence_text": midi_sequence_text(sequence),
        "reference": reference_provenance,
        "engine": engine_provenance,
        # Explicit A/B keys make the pair obvious to small scripts while the
        # descriptive names remain convenient for humans.
        "a": reference_provenance,
        "b": engine_provenance,
        "renderer": str(renderer),
        "requested_sample_rate": sample_rate,
        "requested_duration_seconds": duration,
        "comparison": {
            "same_sample_rate": reference.sample_rate == rendered.sample_rate,
            "same_channels": reference.channels == rendered.channels,
            "same_frame_count": reference.frame_count == rendered.frame_count,
            "sample_aligned": aligned_difference is not None,
            "difference_rms": aligned_difference,
        },
        "pcm16": {
            "a": reference_pcm,
            "b": engine_pcm,
            "difference_rms": aligned_difference,
        },
        "sample_aligned_difference_rms": aligned_difference,
        "provenance": {},
        "disclaimer": "Engine output is a calibrated Digitone-style reference, not a claim of exact undocumented Digitone emulation.",
    }
    provenance = metadata["provenance"]
    if canonical_json is not None:
        provenance["canonical_sound"] = file_provenance(canonical_json)
        metadata["sound_provenance"] = provenance["canonical_sound"]
    if raw_sysex is not None:
        provenance["raw_sysex"] = file_provenance(raw_sysex)
        metadata["raw_sysex_provenance"] = provenance["raw_sysex"]
    return metadata


build_comparison_metadata = comparison_metadata
compare_wavs = comparison_metadata


def write_comparison_metadata(
    output_dir: str | os.PathLike[str],
    stem: str,
    metadata: Mapping[str, Any],
) -> Path:
    target = unique_path(output_dir, stem, ".json")
    target.write_text(json.dumps(dict(metadata), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target
