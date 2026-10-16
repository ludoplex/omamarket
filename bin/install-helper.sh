#!/usr/bin/env bash
# install-helper.sh — download the omamarket.com helper from a tag-pinned release and verify it.
# Stamp: 2026-10-15T16:45-0600, bin/install-helper.sh
# Marketplace baseline (SECURITY.md, read 2026-10-14): this script only downloads, verifies the
# sha256 from helper.lock, sets the mode and moves the file into place. It does not run the file.
# Nothing is written inside the plugin folder (the shell reloads on writes).
set -euo pipefail
export LC_ALL=C

PLUGIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
LOCK="$PLUGIN_DIR/helper.lock"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET_DIR="$DATA_HOME/omamarket"
TARGET="$TARGET_DIR/omamarket.com"

fail() { printf 'install-helper: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
[[ -f $LOCK ]] || fail "missing $LOCK"

URL=$(sed -n 's/^url=//p' "$LOCK" | head -1)
SHA=$(sed -n 's/^sha256=//p' "$LOCK" | head -1)
[[ $URL =~ ^https://github\.com/ludoplex/omamarket/releases/download/v[0-9][0-9A-Za-z.-]*/omamarket\.com$ ]] \
  || fail "helper.lock has no release URL yet (unreleased build); refusing to install"
[[ $SHA =~ ^[0-9a-f]{64}$ ]] || fail "helper.lock sha256 is not a 64-hex digest"

mkdir -p -- "$TARGET_DIR"
tmp=$(mktemp -- "$TARGET_DIR/.omamarket.XXXXXX")
cleanup() { rm -f -- "$tmp"; }
trap cleanup EXIT
curl -fsSL --retry 2 -m 120 -o "$tmp" -- "$URL"
printf '%s  %s\n' "$SHA" "$tmp" | sha256sum -c --quiet - || fail "sha256 mismatch for $URL"
chmod 0755 -- "$tmp"
mv -f -- "$tmp" "$TARGET"
trap - EXIT
# This script never executes what it downloaded. The panel starts the helper later as its own
# Process (/bin/sh <path>/omamarket.com ...); an APE file is a shell script by specification.
printf '{"ok":true,"path":"%s"}\n' "$TARGET"
