"""Command line workflow for Digitone Sound capture and A/B references.

The CLI is intentionally a thin coordinator.  SysEx parsing/transport belongs
to :mod:`sysex`, canonical fields to :mod:`model`, archival primitives to
:mod:`archive`, and rendering/audio validation to :mod:`audio`.  Optional MIDI
and recording dependencies are imported only by the commands that need them.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib
import json
from pathlib import Path
import shutil
import sys
import time
from typing import Any, Iterable, Mapping, Sequence

from . import audio


class CliError(Exception):
    """An expected user-facing workflow error (without a traceback)."""


def _module(name: str) -> Any:
    try:
        return importlib.import_module(f"{__package__}.{name}")
    except ImportError as exc:
        raise CliError(f"workflow module unavailable: {name}") from exc


def _utc_compact() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _load_json(path: str | Path) -> Any:
    source = Path(path)
    try:
        return json.loads(source.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CliError(f"file not found: {source}") from exc
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CliError(f"invalid JSON: {source}") from exc


def _dump_json(path: Path, value: Any) -> None:
    try:
        path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8")
    except (OSError, TypeError, ValueError) as exc:
        raise CliError(f"cannot write JSON: {path}") from exc


def _canonical(value: Any) -> Any:
    """Convert a sibling model object to JSON-safe canonical data."""

    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Mapping):
        return {str(key): _canonical(item) for key, item in value.items()}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).hex()
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return _canonical(to_dict())
    as_dict = getattr(value, "as_dict", None)
    if callable(as_dict):
        return _canonical(as_dict())
    if isinstance(value, (list, tuple)):
        return [_canonical(item) for item in value]
    if hasattr(value, "__dict__"):
        return _canonical(vars(value))
    raise CliError(f"decoder returned unsupported value: {type(value).__name__}")


def _raw_bytes(value: Any) -> bytes | None:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)
    if isinstance(value, Mapping):
        for key in ("raw", "raw_sysex", "sysex", "syx", "payload", "data", "bytes"):
            if key in value:
                found = _raw_bytes(value[key])
                if found is not None:
                    return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found = _raw_bytes(item)
            if found is not None:
                return found
    frame = getattr(value, "frame", None)
    if isinstance(frame, (bytes, bytearray, memoryview)):
        return bytes(frame)
    data = getattr(value, "data", None)
    if isinstance(data, (bytes, bytearray, memoryview)):
        return bytes(data)
    if isinstance(data, (list, tuple)) and all(isinstance(item, int) for item in data):
        return bytes(data)
    for name in ("raw", "raw_sysex", "sysex", "payload"):
        found = _raw_bytes(getattr(value, name, None))
        if found is not None:
            return found
    return None


def _canonical_value(value: Any) -> Any | None:
    if value is None or isinstance(value, (bytes, bytearray, memoryview)):
        return None
    if isinstance(value, Mapping):
        for key in ("canonical", "sound", "decoded", "model", "json"):
            if key in value and not isinstance(value[key], (str, bytes, bytearray)):
                return value[key]
        # A plain mapping from a decoder is already canonical.
        return value
    for name in ("canonical", "sound", "decoded", "model"):
        candidate = getattr(value, name, None)
        if candidate is not None:
            return candidate
    if hasattr(value, "to_dict") or hasattr(value, "as_dict"):
        return value
    return None


def _try_decoder(raw: bytes) -> Any:
    sysex = _module("sysex")
    calls: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []
    for name in (
        "decode_sound",
        "decode_sound_dump",
        "decode_sysex",
        "decode",
        "parse_sound",
        "parse_sysex",
    ):
        function = getattr(sysex, name, None)
        if callable(function):
            calls.append((function, (raw,), {}))
    model = _module("model")
    for name in ("decode_sound", "from_sysex", "from_bytes", "parse_sound"):
        function = getattr(model, name, None)
        if callable(function):
            calls.append((function, (raw,), {}))
    last_error: Exception | None = None
    for function, args, kwargs in calls:
        try:
            value = function(*args, **kwargs)
            candidate = _canonical_value(value)
            if candidate is not None:
                return _canonical(candidate)
        except (ValueError, TypeError, KeyError, IndexError) as exc:
            last_error = exc
    detail = f": {last_error}" if last_error else ""
    raise CliError(f"could not decode Digitone Sound SysEx{detail}")


def _call_capture(
    function: Any,
    *,
    port: str | None = None,
    input_port: str | None = None,
    output_port: str | None = None,
    track: int,
    timeout: float,
) -> Any:
    """Call protocol implementations across their small prototype variants."""

    variants = (
        {
            "input_port": input_port or port,
            "output_port": output_port or port,
            "track": track,
            "timeout": timeout,
        },
        {"input_port": input_port or port, "track": track, "timeout": timeout},
        {"port": port, "track": track, "timeout": timeout},
        {"port_name": port, "track": track, "timeout": timeout},
        {"port_match": input_port or output_port or port, "track": track, "timeout": timeout},
        {"track": track, "timeout": timeout},
        {"track": track},
        {},
    )
    last: Exception | None = None
    for kwargs in variants:
        kwargs = {key: value for key, value in kwargs.items() if value is not None}
        try:
            return function(**kwargs)
        except TypeError as exc:
            last = exc
    raise CliError(f"SysEx capture interface mismatch: {last}")


def _capture_raw(
    port: str | None,
    track: int,
    timeout: float,
    *,
    input_port: str | None = None,
    output_port: str | None = None,
) -> tuple[bytes, Any | None]:
    sysex = _module("sysex")
    for name in (
        "capture_current_sound",
        "request_current_sound",
        "capture_sound",
        "request_and_capture",
    ):
        function = getattr(sysex, name, None)
        if callable(function):
            try:
                result = _call_capture(
                    function,
                    port=port,
                    input_port=input_port,
                    output_port=output_port,
                    track=track,
                    timeout=timeout,
                )
            except (OSError, RuntimeError, TimeoutError, ValueError) as exc:
                raise CliError(str(exc)) from exc
            raw = _raw_bytes(result)
            if raw is None:
                raise CliError("SysEx capture returned no raw message")
            return raw, _canonical_value(result)
    raise CliError("SysEx transport has no capture function")


def _list_midi() -> tuple[list[str], list[str], str | None]:
    try:
        ports = _module("sysex").list_midi_ports()
        return list(ports.get("inputs", ())), list(ports.get("outputs", ())), None
    except (CliError, OSError, RuntimeError, AttributeError, TypeError) as exc:
        if isinstance(exc, CliError) and "sysex" in str(exc):
            return [], [], str(exc)
        # Keep compatibility with a small fake mido module used by scripts or
        # older protocol prototypes that do not expose list_midi_ports yet.
        try:
            mido = importlib.import_module("mido")
            inputs = list(mido.get_input_names())
            outputs = list(mido.get_output_names())
            return inputs, outputs, None
        except ImportError:
            return [], [], "MIDI unavailable (install optional 'mido')"
        except (OSError, RuntimeError, AttributeError) as fallback_exc:
            return [], [], f"MIDI unavailable: {fallback_exc}"


def _write_raw(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as target:
            target.write(raw)
    except FileExistsError as exc:
        raise CliError(f"refusing to overwrite: {path}") from exc
    except OSError as exc:
        raise CliError(f"cannot write SysEx: {path}") from exc


def _persist_sound_pair(raw_path: Path, decoded_path: Path, raw: bytes, canonical: Any) -> None:
    """Persist through the archive layer when present, with a tiny fallback.

    The fallback keeps the CLI useful while protocol/archive modules are being
    developed independently; it still writes exact bytes and deterministic
    JSON and never overwrites a chosen path.
    """

    try:
        archive = _module("archive")
        save_raw = getattr(archive, "save_raw")
        save_json = getattr(archive, "save_json")
        save_raw(raw, raw_path.parent, stem=raw_path.stem, validate=False)
        save_json(canonical, decoded_path, overwrite=False)
    except (CliError, AttributeError, OSError, TypeError, ValueError):
        _write_raw(raw_path, raw)
        _dump_json(decoded_path, canonical)


def _artifact_pair(directory: str | Path, stem: str) -> tuple[Path, Path]:
    directory_path = Path(directory)
    directory_path.mkdir(parents=True, exist_ok=True)
    base = audio.safe_stem(stem)
    number = 1
    while True:
        suffix = "" if number == 1 else f"_{number}"
        raw = directory_path / f"{base}{suffix}.syx"
        decoded = directory_path / f"{base}{suffix}.json"
        if not raw.exists() and not decoded.exists():
            return raw, decoded
        number += 1


def _capture_command(args: argparse.Namespace) -> dict[str, Any]:
    raw, decoded = _artifact_pair(
        args.output_dir,
        args.stem or f"sound_track{args.track}_{_utc_compact()}",
    )
    raw_bytes, canonical = _capture_raw(
        args.port,
        args.track,
        args.timeout,
        input_port=args.input_port,
        output_port=args.output_port,
    )
    if canonical is None:
        canonical = _try_decoder(raw_bytes)
    else:
        canonical = _canonical(canonical)
    _persist_sound_pair(raw, decoded, raw_bytes, canonical)
    result = {
        "raw_sysex": str(raw),
        "canonical_json": str(decoded),
        "raw_sha256": audio.sha256_file(raw),
        "created_at": audio.utc_timestamp(),
        "track": args.track,
    }
    print(json.dumps(result, sort_keys=True))
    return result


def _decode_command(args: argparse.Namespace) -> dict[str, Any]:
    source = Path(args.sysex)
    try:
        raw = source.read_bytes()
    except OSError as exc:
        raise CliError(f"cannot read SysEx: {source}") from exc
    canonical = _try_decoder(raw)
    raw_path, decoded_path = _artifact_pair(
        args.output_dir,
        args.stem or f"{audio.safe_stem(source.stem)}_{_utc_compact()}",
    )
    _persist_sound_pair(raw_path, decoded_path, raw, canonical)
    result = {"raw_sysex": str(raw_path), "canonical_json": str(decoded_path)}
    print(json.dumps(result, sort_keys=True))
    return result


def _devices_command(args: argparse.Namespace) -> dict[str, Any]:
    inputs, outputs, midi_error = _list_midi()
    result: dict[str, Any] = {
        "midi_inputs": inputs,
        "midi_outputs": outputs,
        "audio": [],
        "errors": [],
    }
    if midi_error:
        result["errors"].append(midi_error)
    try:
        result["audio"] = audio.list_audio_devices()
    except RuntimeError as exc:
        result["errors"].append(str(exc))
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True, default=str))
    else:
        for name in inputs:
            print(f"midi in   {name}")
        for name in outputs:
            print(f"midi out  {name}")
        for index, item in enumerate(result["audio"]):
            print(f"audio {index}: {item}")
        for error in result["errors"]:
            print(error, file=sys.stderr)
    return result


def _record_command(args: argparse.Namespace) -> dict[str, Any]:
    output = audio.unique_path(
        args.output_dir,
        args.stem or f"reference_{_utc_compact()}",
        ".wav",
    )
    try:
        recorded = audio.record_reference_wav(
            output,
            duration=args.duration,
            sample_rate=args.sample_rate,
            channels=args.channels,
            device=args.device,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        raise CliError(str(exc)) from exc
    metadata_path = audio.unique_path(recorded.parent, recorded.stem, ".json")
    _dump_json(
        metadata_path,
        {
            "schema": "digitone-reference-audio-v1",
            "created_at": audio.utc_timestamp(),
            "audio": audio.file_provenance(recorded),
            "capture": {
                "kind": "recorded",
                "duration_seconds": args.duration,
                "requested_sample_rate": args.sample_rate,
                "requested_channels": args.channels,
                "device": args.device,
            },
        },
    )
    result = {
        "wav": str(recorded),
        "metadata": str(metadata_path),
        "audio": audio.file_provenance(recorded),
    }
    print(json.dumps(result, sort_keys=True))
    return result


def _record_reference_command(args: argparse.Namespace) -> dict[str, Any]:
    sequence = _sequence(args)
    output = audio.unique_path(
        args.output_dir,
        args.stem or f"reference_midi_{_utc_compact()}",
        ".wav",
    )
    try:
        selected_midi_output = audio.resolve_midi_output(args.midi_output)
        recorded = audio.record_reference_sequence_wav(
            output,
            duration=args.duration,
            sample_rate=args.sample_rate,
            channels=args.channels,
            device=args.device,
            midi_output=selected_midi_output,
            sequence=sequence,
        )
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        raise CliError(str(exc)) from exc
    metadata_path = audio.unique_path(recorded.parent, recorded.stem, ".json")
    _dump_json(
        metadata_path,
        {
            "schema": "digitone-reference-audio-v1",
            "created_at": audio.utc_timestamp(),
            "audio": audio.file_provenance(recorded),
            "capture": {
                "kind": "midi_reference",
                "duration_seconds": args.duration,
                "requested_sample_rate": args.sample_rate,
                "requested_channels": args.channels,
                "device": args.device,
                "midi_output": selected_midi_output,
                "midi_sequence": [dict(event) for event in sequence],
                "midi_sequence_text": audio.midi_sequence_text(sequence),
            },
        },
    )
    result = {
        "wav": str(recorded),
        "metadata": str(metadata_path),
        "audio": audio.file_provenance(recorded),
        "midi_output": selected_midi_output,
        "midi_sequence": [dict(event) for event in sequence],
    }
    print(json.dumps(result, sort_keys=True))
    return result


def _import_wav_command(args: argparse.Namespace) -> dict[str, Any]:
    try:
        imported = audio.import_reference_wav(args.source, args.output_dir, stem=args.stem)
    except (OSError, ValueError) as exc:
        raise CliError(str(exc)) from exc
    metadata_path = audio.unique_path(imported.parent, imported.stem, ".json")
    _dump_json(
        metadata_path,
        {
            "schema": "digitone-reference-audio-v1",
            "created_at": audio.utc_timestamp(),
            "audio": audio.file_provenance(imported),
            "capture": {"kind": "imported", "source": str(Path(args.source))},
        },
    )
    result = {
        "wav": str(imported),
        "metadata": str(metadata_path),
        "audio": audio.file_provenance(imported),
    }
    print(json.dumps(result, sort_keys=True))
    return result


def _sequence(args: argparse.Namespace) -> Sequence[Mapping[str, Any]]:
    if not args.sequence_json:
        return audio.DEFAULT_MIDI_SEQUENCE
    value = _load_json(args.sequence_json)
    if not isinstance(value, list) or not all(isinstance(item, Mapping) for item in value):
        raise CliError("sequence JSON must be a list of event objects")
    required = ("note", "start", "duration")
    if any(any(key not in event for key in required) for event in value):
        raise CliError("sequence events require note, start, and duration")
    return [dict(item) for item in value]


def _render_command(args: argparse.Namespace) -> dict[str, Any]:
    sequence = _sequence(args)
    try:
        output = Path(args.output) if args.output else audio.unique_path(
            args.output_dir,
            f"{audio.safe_stem(args.sound)}_engine_{_utc_compact()}",
            ".wav",
        )
        rendered = audio.render_canonical_json(
            args.sound,
            output,
            renderer=args.renderer,
            sample_rate=args.sample_rate,
            duration=args.duration,
            sequence=sequence,
        )
    except (OSError, ValueError, RuntimeError) as exc:
        raise CliError(str(exc)) from exc
    result = {
        "wav": str(rendered),
        "audio": audio.file_provenance(rendered),
        "canonical_json": str(Path(args.sound)),
        "midi_sequence": [dict(event) for event in sequence],
        "renderer": str(args.renderer),
    }
    print(json.dumps(result, sort_keys=True))
    return result


def _compare_command(args: argparse.Namespace) -> dict[str, Any]:
    sequence = _sequence(args)
    try:
        reference = audio.import_reference_wav(
            args.reference,
            args.output_dir,
            stem=f"{args.stem or audio.safe_stem(args.sound)}_A_reference",
        )
        rendered = audio.render_canonical_json(
            args.sound,
            audio.unique_path(
                args.output_dir,
                f"{args.stem or audio.safe_stem(args.sound)}_B_engine",
                ".wav",
            ),
            renderer=args.renderer,
            sample_rate=args.sample_rate,
            duration=args.duration,
            sequence=sequence,
        )
        metadata = audio.comparison_metadata(
            reference,
            rendered,
            sequence=sequence,
            canonical_json=args.sound,
            raw_sysex=args.raw_sysex,
            renderer=args.renderer,
            sample_rate=args.sample_rate,
            duration=args.duration,
        )
        metadata_path = audio.write_comparison_metadata(
            args.output_dir,
            f"{args.stem or audio.safe_stem(args.sound)}_comparison",
            metadata,
        )
    except (OSError, ValueError, RuntimeError) as exc:
        raise CliError(str(exc)) from exc
    result = {
        "reference_wav": str(reference),
        "engine_wav": str(rendered),
        "comparison_json": str(metadata_path),
    }
    print(json.dumps(result, sort_keys=True))
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="digitone-ref",
        description="Capture, decode, archive, render, and compare Digitone Sounds.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    devices = sub.add_parser(
        "devices",
        aliases=["list-devices", "list-midi", "list-audio"],
        help="list MIDI/audio devices",
    )
    devices.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    devices.set_defaults(handler=_devices_command)

    capture = sub.add_parser(
        "capture",
        aliases=["capture-sound", "capture-current"],
        help="request and archive the current Sound",
    )
    capture.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    capture.add_argument("--stem")
    capture.add_argument("--port", help="MIDI input/output name (when supported)")
    capture.add_argument("--input-port", help="MIDI input name (overrides --port)")
    capture.add_argument("--output-port", help="MIDI output name (overrides --port)")
    capture.add_argument("--track", type=int, default=0)
    capture.add_argument("--timeout", type=float, default=3.0)
    capture.set_defaults(handler=_capture_command)

    decode = sub.add_parser("decode", aliases=["import-syx"], help="decode a .syx Sound archive")
    decode.add_argument("sysex", help="input .syx file")
    decode.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    decode.add_argument("--stem")
    decode.set_defaults(handler=_decode_command)

    record = sub.add_parser("record", help="record a reference WAV (optional sounddevice)")
    record.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    record.add_argument("--stem")
    record.add_argument("--duration", type=float, default=audio.DEFAULT_DURATION)
    record.add_argument("--sample-rate", type=int, default=audio.DEFAULT_SAMPLE_RATE)
    record.add_argument("--channels", type=int, default=audio.DEFAULT_CHANNELS)
    record.add_argument("--device")
    record.set_defaults(handler=_record_command)

    reference_record = sub.add_parser(
        "record-reference",
        aliases=["capture-reference"],
        help="record audio while scheduling the deterministic MIDI sequence",
    )
    reference_record.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    reference_record.add_argument("--stem")
    reference_record.add_argument("--duration", type=float, default=audio.DEFAULT_DURATION)
    reference_record.add_argument("--sample-rate", type=int, default=audio.DEFAULT_SAMPLE_RATE)
    reference_record.add_argument("--channels", type=int, default=audio.DEFAULT_CHANNELS)
    reference_record.add_argument("--device")
    reference_record.add_argument("--midi-output", "--midi-port", dest="midi_output")
    reference_record.add_argument("--sequence-json")
    reference_record.set_defaults(handler=_record_reference_command)

    import_wav = sub.add_parser("import-wav", aliases=["import-audio"], help="validate and archive a WAV")
    import_wav.add_argument("source")
    import_wav.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    import_wav.add_argument("--stem")
    import_wav.set_defaults(handler=_import_wav_command)

    render = sub.add_parser(
        "render",
        aliases=["render-sound"],
        help="render canonical Sound JSON with digitone-render",
    )
    render.add_argument("sound", help="canonical Sound JSON")
    render.add_argument("--renderer", default="digitone-render")
    render.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    render.add_argument("--output")
    render.add_argument("--sample-rate", type=int, default=audio.DEFAULT_SAMPLE_RATE)
    render.add_argument("--duration", type=float, default=audio.DEFAULT_DURATION)
    render.add_argument("--sequence-json")
    render.set_defaults(handler=_render_command)

    compare = sub.add_parser(
        "compare",
        aliases=["ab", "a-b", "ab-test"],
        help="create paired reference/engine WAVs",
    )
    compare.add_argument("sound", help="canonical Sound JSON")
    compare.add_argument("reference", help="reference WAV")
    compare.add_argument("--raw-sysex", help="raw .syx provenance")
    compare.add_argument("--renderer", default="digitone-render")
    compare.add_argument("--output-dir", "--out-dir", dest="output_dir", default="digitone-artifacts")
    compare.add_argument("--stem")
    compare.add_argument("--sample-rate", type=int, default=audio.DEFAULT_SAMPLE_RATE)
    compare.add_argument("--duration", type=float, default=audio.DEFAULT_DURATION)
    compare.add_argument("--sequence-json")
    compare.set_defaults(handler=_compare_command)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.handler(args)
    except CliError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("error: interrupted", file=sys.stderr)
        return 130
    return 0


__all__ = ["CliError", "build_parser", "main"]


if __name__ == "__main__":  # pragma: no cover - convenience entry point
    raise SystemExit(main())
