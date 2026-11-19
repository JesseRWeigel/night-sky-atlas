#!/usr/bin/env bash
set -euo pipefail
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:?supply a checkout containing the pinned release}"
chrome="${CHROME_BINARY:-$(command -v google-chrome || command -v chromium || true)}"
driver="${CHROMEDRIVER_BINARY:-${CHROMEWEBDRIVER:-}}"
if [[ -d "$driver" ]]; then driver="$driver/chromedriver"; fi
if [[ -z "$driver" ]]; then driver="$(command -v chromedriver || true)"; fi
[[ -n "$chrome" && -x "$chrome" && -n "$driver" && -x "$driver" ]] || {
  echo "BLOCKED: matching standard Chrome/Chromium and ChromeDriver required" >&2; exit 2;
}
read_version() { "$1" --version | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1; }
chrome_ver="$(read_version "$chrome")"; driver_ver="$(read_version "$driver")"
[[ "${chrome_ver%.*}" == "${driver_ver%.*}" ]] || { echo "BLOCKED: Chrome and driver must match major.minor.build" >&2; exit 2; }
printf 'Chrome %s; driver %s\n' "$chrome_ver" "$driver_ver"
export PYTHONDONTWRITEBYTECODE=1
python3 "$bundle/self-test.py"
for variant in negative fixed; do (
  stage="$(bash "$bundle/stage.sh" "$repo" "$variant")"
  root="$(mktemp -d "${TMPDIR:-/tmp}/atlas-${variant}-browser.XXXXXXXX")"
  server=
  cleanup() {
    if [[ -n "$server" ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
    rm -rf -- "$stage"
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
  if ! timeout 110s python3 "$bundle/smoke.py" "$driver" "$chrome" "http://127.0.0.1:$port" "$stage" "$root" "$variant"; then
    echo "FAIL/INCOMPLETE $variant browser smoke" >&2
    if [[ -f "$root/driver.log" ]]; then tail -30 "$root/driver.log" >&2; fi
    exit 1
  fi
  printf 'Verified browser variant %s (%s):\n' "$variant" "$root"
  cat "$root/evidence.json"
); done
