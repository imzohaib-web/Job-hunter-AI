from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure app package is importable
CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
sys.path.insert(0, str(AI_SERVICE_DIR))

# Ensure settings load without error
os.environ.setdefault("AI_SERVICE_KEY", "export-openapi-dummy-key")

from app.main import create_app  # noqa: E402


def export_openapi(output_paths: list[Path]) -> None:
    app = create_app()
    openapi_schema = app.openapi()

    # Clean formatting
    schema_json = json.dumps(openapi_schema, indent=2)

    for path in output_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(schema_json, encoding="utf-8")
        print(f"[+] Exported OpenAPI schema to: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export FastAPI OpenAPI JSON schema.")
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Optional custom output path for openapi.json",
    )
    args = parser.parse_args()

    repo_root = AI_SERVICE_DIR.parent.parent
    default_paths = [
        AI_SERVICE_DIR / "openapi.json",
        repo_root / "packages" / "shared" / "openapi.json",
    ]

    if args.output:
        targets = [Path(args.output).resolve()]
    else:
        targets = default_paths

    export_openapi(targets)


if __name__ == "__main__":
    main()
