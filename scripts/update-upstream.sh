#!/usr/bin/env bash
# Re-sync the upstream markdown list and regenerate the catalogue.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading bobeff/open-source-games ..."
curl -fsSL https://codeload.github.com/bobeff/open-source-games/tar.gz/refs/heads/main -o "$TMP/repo.tar.gz"
tar -xzf "$TMP/repo.tar.gz" -C "$TMP" --strip-components=1 \
  open-source-games-main/README.md open-source-games-main/LICENSE

mkdir -p data/upstream
cp "$TMP/README.md" "$TMP/LICENSE" data/upstream/
python3 scripts/parse_list.py
