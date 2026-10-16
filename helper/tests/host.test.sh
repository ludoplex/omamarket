#!/bin/sh
# host.test.sh — the APE host must never exit 0 on a failed script (T3 APE review finding, 2026-10-14).
# Stamp: 2026-10-15T17:05-0600, helper/tests/host.test.sh
# Usage: sh tests/host.test.sh dist/omamarket.com
set -eu
APE="${1:-dist/omamarket.com}"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0

run_case() { # name script expected_exit
  name=$1; script=$2; expected=$3
  printf '%s\n' "$script" >"$T/case.mjs"
  rc=0
  OMAMARKET_JS="$T/case.mjs" /bin/sh "$APE" >"$T/case.out" 2>"$T/case.err" || rc=$?
  if [ "$rc" = "$expected" ] && [ -s "$T/case.err" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name (exit $rc, expected $expected, stderr $(wc -c <"$T/case.err") bytes)"
    fail=1
  fi
}

run_case "top-level throw exits non-zero with stderr" 'throw new Error("TOPLEVEL-BOOM");' 1
run_case "unhandled rejection exits non-zero with stderr" 'Promise.reject(new Error("REJECTED-BOOM"));' 1
run_case "exception inside the event loop exits non-zero with stderr" 'import * as os from "qjs:os"; os.setTimeout(() => { throw new Error("TIMER-BOOM"); }, 1);' 1

printf '%s\n' 'import * as std from "qjs:std"; print("PRINT-OK"); std.exit(3);' >"$T/exit.mjs"
rc=0
out=$(OMAMARKET_JS="$T/exit.mjs" /bin/sh "$APE" 2>/dev/null) || rc=$?
if [ "$rc" = 3 ] && [ "$out" = "PRINT-OK" ]; then
  echo "ok   print + std.exit code propagate"
else
  echo "FAIL print/exit (rc=$rc out=$out)"
  fail=1
fi
exit $fail
