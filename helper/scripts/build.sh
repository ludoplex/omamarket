#!/bin/sh
# build.sh — build omamarket.com (fat x86_64+aarch64 Cosmopolitan APE) with the JS embedded in /zip/js.
# Stamp: 2026-10-15T16:45-0600, helper/scripts/build.sh
# Toolchain: a vendor dir holding cosmocc (14.1.0) and a quickjs-ng build (libqjs.a, libqjs-libc.a):
#   vendor/cosmocc/bin/cosmocc  and  vendor/quickjs-ng/build/   Usage: TOOLCHAIN=/path/to/vendor sh build.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLCHAIN="${TOOLCHAIN:-$ROOT/vendor}"
QN="$TOOLCHAIN/quickjs-ng"
export PATH="$TOOLCHAIN/cosmocc/bin:$PATH"
OUT="$ROOT/dist"; mkdir -p "$OUT"
# 1. Embed js/ as zip assets reachable at /zip/js/... (zipobj emits an object whose sections become zip entries).
cd "$ROOT"
JS="js/main.mjs js/host.mjs js/lanes.mjs js/mcp.mjs js/agents.mjs js/serve.mjs js/pinned.json"
mkdir -p "$OUT/.aarch64"
# cosmocc fat links want every object twice: <dir>/x.o (x86_64) and <dir>/.aarch64/x.o (aarch64).
zipobj -a x86_64 -o "$OUT/jsassets.o" $JS
zipobj -a aarch64 -o "$OUT/.aarch64/jsassets.o" $JS
# 2. Compile and link.
cosmocc -O2 -I"$QN" -o "$OUT/omamarket.com" src/omamarket.c "$OUT/jsassets.o" "$QN/build/libqjs.a" "$QN/build/libqjs-libc.a"
sha256sum "$OUT/omamarket.com" | tee "$OUT/omamarket.com.sha256"
ls -la "$OUT/omamarket.com"
