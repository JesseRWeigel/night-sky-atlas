#!/usr/bin/env bash
set -euo pipefail
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:?Usage: bash stage.sh /path/to/exact-base-repository}"
base=fafb5788ca714e8870ceb70ba5c4662b5f90d9b0
pre=b3da1b195182b86d5458600115b553e70e10890d
post=f12d81f96303e2a15c5b827492e113b9ffea23e4
patch=0465d2e49c4f31a557bd9297c1d248edc62292eafde2824082d40e70ae0eac4d
if ! git -C "$repo" cat-file -e "$base^{commit}" 2>/dev/null; then
  printf 'Required exact base is not available locally: %s\n' "$base" >&2
  exit 2
fi
printf '%s  %s\n' "$patch" "$bundle/ephemeris-sign.patch" | sha256sum --check --status
work="$(mktemp -d "${TMPDIR:-/tmp}/atlas-render-fixture.XXXXXXXX")"
for name in baseline patched; do
  mkdir "$work/$name"
  git -C "$repo" archive --format=tar "$base" | tar -xf - -C "$work/$name"
  [[ "$(git hash-object "$work/$name/src/astronomy.js")" == "$pre" ]]
done
(cd "$work/patched"; git apply --check "$bundle/ephemeris-sign.patch"; git apply "$bundle/ephemeris-sign.patch")
[[ "$(git hash-object "$work/patched/src/astronomy.js")" == "$post" ]]
for name in baseline patched; do
  python3 - "$work/$name/index.html" <<'PYHTML'
from pathlib import Path
import sys
p = Path(sys.argv[1])
html = p.read_text()
tag = '<script type="module" src="src/app.js"></script>'
if html.count(tag) != 1:
    raise SystemExit("Expected exactly one Atlas app script tag")
p.write_text(html.replace(tag,
    '<pre id="atlas-render-evidence" hidden data-status="loading">The Atlas module has not scheduled a draw.</pre>\n'
    '    <script src="src/atlas-test-diagnostics.js"></script>\n    ' + tag))
PYHTML
  cp "$bundle/diagnostics.js" "$work/$name/src/atlas-test-diagnostics.js"
  printf '\n' >> "$work/$name/src/app.js"
  cat "$bundle/browser-probe.mjs" >> "$work/$name/src/app.js"
  node --check "$work/$name/src/app.js"
done
printf '%s\n' "$work"
