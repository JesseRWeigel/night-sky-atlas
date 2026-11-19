#!/usr/bin/env bash
set -euo pipefail
bundle="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="${1:?supply a checkout containing the pinned release}"
base=4b1ad14329f9cc2a8ee4fb205523a63a5dd431f1
variant="${2:?fixed or negative}"
[[ "$variant" == fixed || "$variant" == negative ]]
printf '%s  %s\n' cd8dadb6e3f6f45ece1b3ff2b3c95ac34739491a03680d650475c3931af4bbf2 "$bundle/portable-preview.patch" abdc5b61218d3af427d28575ac1749d6662be36a022f7ef2e94a7cf16c1ca093 "$bundle/observer-invalidation.patch" | sha256sum --check --status
work="$(mktemp -d "${TMPDIR:-/tmp}/atlas-composed-stage.XXXXXXXX")"
trap 'rm -rf -- "$work"' ERR
[[ "$(git -C "$repo" rev-parse --verify "$base^{commit}")" == "$base" ]]
git -C "$repo" archive --format=tar --prefix=atlas/ "$base" > "$work/source.tar"
[[ "$(git get-tar-commit-id < "$work/source.tar")" == 4b1ad14329f9cc2a8ee4fb205523a63a5dd431f1 ]]
tar -xf "$work/source.tar" --strip-components=1 -C "$work"
rm -f -- "$work/source.tar"
(cd "$work"; git apply --check "$bundle/portable-preview.patch"; git apply "$bundle/portable-preview.patch"
if [[ "$variant" == fixed ]]; then
  git apply --check "$bundle/observer-invalidation.patch"; git apply "$bundle/observer-invalidation.patch"
fi)
for file in index.html src/app.js src/portable-plan.js src/portable-plan-ui.js src/astronomy.js; do
  case "$file:$variant" in
    index.html:*) expected=0d2cc9303c28503ffb648235da59f1db31b4056b;;
    src/app.js:fixed) expected=6f2647db2aa40a72e4f5f8eac00afbcdd52bddb4;;
    src/app.js:negative) expected=18391a08986f6f2e63d43bf86694006e59fecbd7;;
    src/portable-plan.js:*) expected=c807cb191facea656b4854996810f3a63c8b8643;;
    src/portable-plan-ui.js:fixed) expected=9dfc25c403009a8cf77e8286c6d686e04efc9476;;
    src/portable-plan-ui.js:negative) expected=a05f04409cece0719e4175a3c0fff36b8e9e4e9e;;
    src/astronomy.js:*) expected=f12d81f96303e2a15c5b827492e113b9ffea23e4;;
  esac
  [[ "$(git hash-object "$work/$file")" == "$expected" ]]
done
node "$bundle/fixture.mjs" "$work"
printf '<title>Synthetic navigation sentinel</title>\n' > "$work/nav.html"
printf '%s\n' "$work"
