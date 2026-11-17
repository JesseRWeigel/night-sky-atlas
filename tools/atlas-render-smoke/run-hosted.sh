#!/usr/bin/env bash
set -euo pipefail
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:?supply a checkout containing the exact baseline}"
chrome="$(command -v google-chrome)"
"$chrome" --version
node --version
python3 "$bundle/extract.py" --self-test
node "$bundle/self-test.mjs"
stage="$(bash "$bundle/stage.sh" "$repo")"
root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/atlas-hosted-render.XXXXXXXX")"
server=
cleanup() {
  if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
}
trap cleanup EXIT
python3 "$bundle/serve.py" "$stage" "$root/port" > "$root/server.log" 2>&1 &
server=$!
for _ in {1..50}; do
  [[ -s "$root/port" ]] && break
  kill -0 "$server"
  sleep 0.1
done
port="$(cat "$root/port")"
[[ "$port" =~ ^[0-9]+$ ]]
for variant in baseline patched; do
  # Keep the normal Chrome sandbox. Profiles and the HTTP server are local to this job.
  if ! timeout 35s "$chrome" --headless --no-first-run --disable-background-networking \
    --user-data-dir="$root/${variant}-profile" --window-size=1366,900 \
    --force-device-scale-factor=1 --virtual-time-budget=5000 --dump-dom \
    "http://127.0.0.1:$port/$variant/" > "$root/$variant.html" 2> "$root/$variant.chrome.log"; then
    tail -40 "$root/$variant.chrome.log" >&2
    exit 1
  fi
  if ! python3 "$bundle/extract.py" "$root/$variant.html" "$root/$variant.json"; then
    tail -40 "$root/$variant.chrome.log" >&2
    tail -40 "$root/server.log" >&2
    exit 1
  fi
done
node "$bundle/assert-render.mjs" "$root/baseline.json" "$root/patched.json"
printf 'Baseline rendered evidence:\n'
cat "$root/baseline.json"
printf 'Patched rendered evidence:\n'
cat "$root/patched.json"
