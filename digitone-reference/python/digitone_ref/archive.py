"""Raw SysEx and canonical JSON archival helpers."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Mapping

from .model import DigitoneSound, decode_sound
from .sysex import SoundMessage, validate_sound_message


def sha256(data: bytes | bytearray | memoryview) -> str:
    return hashlib.sha256(bytes(data)).hexdigest()


def _slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return value[:48] or "sound"


def deterministic_stem(data: bytes, label: str | None = None) -> str:
    """Return a stable, human-readable stem containing a content hash."""

    digest = sha256(data)[:16]
    return f"digitone_{_slug(label)}_{digest}" if label else f"digitone_{digest}"


def _collision_safe_path(path: Path, payload: bytes, *, overwrite: bool = False) -> Path:
    if overwrite or not path.exists():
        return path
    try:
        if path.read_bytes() == payload:
            return path
    except OSError:
        pass
    index = 1
    while True:
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists() or candidate.read_bytes() == payload:
            return candidate
        index += 1


def _atomic_write(path: Path, payload: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    return path


def canonical_json(value: DigitoneSound | Mapping[str, Any] | Any) -> bytes:
    payload = value.to_dict() if isinstance(value, DigitoneSound) else value
    if hasattr(payload, "to_dict"):
        payload = payload.to_dict()
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def save_raw(
    data: bytes | bytearray | memoryview,
    directory: str | os.PathLike[str],
    *,
    stem: str | None = None,
    label: str | None = None,
    validate: bool = True,
    validate_checksum: bool = True,
    overwrite: bool = False,
) -> Path:
    """Atomically save one raw ``.syx`` frame under a hash-derived name."""

    raw = bytes(data)
    if validate:
        # Validate at the trust boundary but retain the caller's exact bytes;
        # normalization belongs to decoding, not raw archival.
        validate_sound_message(raw, validate_checksum=validate_checksum)
    root = Path(directory)
    chosen_stem = _slug(stem) if stem else deterministic_stem(raw, label)
    target = _collision_safe_path(root / f"{chosen_stem}.syx", raw, overwrite=overwrite)
    return _atomic_write(target, raw) if not target.exists() or overwrite else target


def save_json(
    value: DigitoneSound | Mapping[str, Any] | Any,
    destination: str | os.PathLike[str],
    *,
    stem: str | None = None,
    label: str | None = None,
    overwrite: bool = False,
) -> Path:
    """Atomically save canonical, deterministic JSON to a file or directory."""

    payload = canonical_json(value)
    path = Path(destination)
    if path.suffix.casefold() != ".json":
        path = path / f"{_slug(stem) if stem else deterministic_stem(payload, label)}.json"
    path = _collision_safe_path(path, payload, overwrite=overwrite)
    return _atomic_write(path, payload) if not path.exists() or overwrite else path


def load_json(path: str | os.PathLike[str]) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("archived JSON root must be an object")
    return value


def load_raw(path: str | os.PathLike[str]) -> bytes:
    return Path(path).read_bytes()


@dataclass(frozen=True)
class ArchiveRecord:
    raw_path: Path
    json_path: Path
    digest: str
    sound: DigitoneSound

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_path": str(self.raw_path),
            "json_path": str(self.json_path),
            "sha256": self.digest,
            "sound": self.sound.to_dict(),
        }


def archive_sound(
    value: bytes | bytearray | memoryview | SoundMessage,
    directory: str | os.PathLike[str],
    *,
    label: str | None = None,
    metadata: Mapping[str, Any] | None = None,
    validate: bool = True,
    validate_checksum: bool = True,
    overwrite: bool = False,
) -> ArchiveRecord:
    """Save raw and decoded representations with matching deterministic names."""

    raw = value.frame if isinstance(value, SoundMessage) else bytes(value)
    checked = validate_sound_message(raw, validate_checksum=validate_checksum) if validate else None
    sound = decode_sound(
        checked or raw,
        strict=validate,
        validate_checksum=validate_checksum if validate else False,
        validate_declared_length=validate,
    )
    if metadata:
        sound.raw.setdefault("archive_metadata", {}).update(dict(metadata))
    digest = sha256(raw)
    base_stem = deterministic_stem(raw, label or sound.name)
    root = Path(directory)
    json_payload = canonical_json(sound)
    stem = base_stem
    if not overwrite:
        index = 1
        while True:
            raw_candidate = root / f"{stem}.syx"
            json_candidate = root / f"{stem}.json"
            if not raw_candidate.exists() and not json_candidate.exists():
                break
            if (
                raw_candidate.exists() and json_candidate.exists()
                and raw_candidate.read_bytes() == raw
                and json_candidate.read_bytes() == json_payload
            ):
                return ArchiveRecord(raw_candidate, json_candidate, digest, sound)
            stem = f"{base_stem}-{index}"
            index += 1
    raw_path = save_raw(raw, root, stem=stem, validate=False, overwrite=overwrite)
    json_path = save_json(sound, root / f"{stem}.json", overwrite=overwrite)
    return ArchiveRecord(raw_path=raw_path, json_path=json_path, digest=digest, sound=sound)


archive_raw = save_raw
save_decoded_json = save_json
archive = archive_sound


__all__ = [
    "ArchiveRecord",
    "archive",
    "archive_raw",
    "archive_sound",
    "canonical_json",
    "deterministic_stem",
    "load_json",
    "load_raw",
    "save_decoded_json",
    "save_json",
    "save_raw",
    "sha256",
]
