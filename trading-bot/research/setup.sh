#!/usr/bin/env sh
# Creates the two research environments (macOS / Linux). Windows: setup.ps1.
set -e
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
"$PY" -m venv .venv-vbt && .venv-vbt/bin/pip install -q --upgrade pip && .venv-vbt/bin/pip install -q -r requirements-vectorbt.txt
"$PY" -m venv .venv-hbt && .venv-hbt/bin/pip install -q --upgrade pip && .venv-hbt/bin/pip install -q -r requirements-hftbacktest.txt
.venv-vbt/bin/python vbt_sweep.py --selftest
.venv-hbt/bin/python hbt_mm.py --selftest
echo "Research tools ready. See research/README.md."
