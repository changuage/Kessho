"""Allow ``python -m digitone_ref`` to run the reference workflow CLI."""

from .cli import main


if __name__ == "__main__":  # pragma: no cover - exercised by the interpreter
    raise SystemExit(main())
