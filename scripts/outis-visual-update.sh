#!/usr/bin/env bash
# Regenerate the golden screenshots (tests/outis/visual-baselines) from an image.
#
#   scripts/outis-visual-update.sh ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<sha>
#
# Run it only after you have LOOKED at the change: first run the suite without updating
# (OUTIS_VISUAL=1 scripts/outis-regression.sh <image> -g VIS-3), open the diff images Playwright writes under
# tests/outis/test-results, and decide the new picture is the intended one. Then commit the changed PNGs with a
# message that says what changed and why. Never update to make a red run green without reading it.
set -euo pipefail
IMAGE="${1:?usage: $0 <image>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUTIS_VISUAL=1 "$HERE/outis-regression.sh" "$IMAGE" -g "VIS-3" --update-snapshots
git -C "$HERE/.." status --short tests/outis/visual-baselines
