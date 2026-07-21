#!/usr/bin/env bash
# Regenerate launcher icons into Expo assets + android mipmaps
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/generate-icons.py"
