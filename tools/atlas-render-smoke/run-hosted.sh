#!/usr/bin/env bash
set -euo pipefail
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:?supply a checkout containing the exact baseline}"
chrome="$(command -v google-chrome)"
driver="$(command -v chromedriver)"
"$chrome" --version
"$driver" --version
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
if ! timeout 120s python3 "$bundle/poll-render.py" \
  "$driver" "$chrome" "http://127.0.0.1:$port" "$root"; then
  tail -40 "$root/driver.log" >&2
  tail -40 "$root/server.log" >&2
  exit 1
fi
node "$bundle/assert-render.mjs" "$root/baseline.json" "$root/patched.json"
printf 'Baseline rendered evidence:\n'
cat "$root/baseline.json"
printf 'Patched rendered evidence:\n'
cat "$root/patched.json"
