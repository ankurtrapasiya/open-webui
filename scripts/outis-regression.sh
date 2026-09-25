#!/usr/bin/env bash
# Runs the Outis regression suite (tests/outis) against one image, in a throwaway container
# with its own empty database. Never touches the live instance or its volume.
#
#   scripts/outis-regression.sh ghcr.io/ankurtrapasiya/open-webui:outis-mneme-<sha>
#
# Exit code 0 = every fork feature checked still works. Anything else = do not deploy.
set -euo pipefail

IMAGE="${1:?usage: $0 <image>}"
PORT="${OUTIS_REGRESSION_PORT:-3099}"
NAME="outis-regression-$$"
VOLUME="$NAME-data"
SUITE="$(cd "$(dirname "$0")/../tests/outis" && pwd)"

cleanup() {
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== image: $IMAGE"
docker pull -q "$IMAGE" >/dev/null 2>&1 || docker image inspect "$IMAGE" >/dev/null

# The container talks to the suite's fake model server on the host (tests/outis/support/fake-openai.ts).
FAKE_PORT="${OUTIS_FAKE_PORT:-3098}"
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" -v "$VOLUME:/app/backend/data" \
	--add-host=host.docker.internal:host-gateway \
	-e WEBUI_AUTH=true -e WEBUI_SECRET_KEY=regression-only \
	-e ENABLE_OLLAMA_API=false \
	-e OPENAI_API_BASE_URL="http://host.docker.internal:$FAKE_PORT/v1" -e OPENAI_API_KEY=fake \
	"$IMAGE" >/dev/null

echo "== waiting for the test instance on :$PORT"
for _ in $(seq 1 100); do
	[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health")" = 200 ] && break
	sleep 3
done
if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health")" != 200 ]; then
	echo "== test instance never became healthy; last log lines:"
	docker logs --tail 40 "$NAME"
	exit 2
fi

cd "$SUITE"
[ -d node_modules/@playwright/test ] || npm ci --no-audit --no-fund
npx playwright install chromium >/dev/null

echo "== running the suite"
OUTIS_BASE_URL="http://127.0.0.1:$PORT" OUTIS_CONTAINER="$NAME" OUTIS_IMAGE="$IMAGE" OUTIS_FAKE_PORT="$FAKE_PORT" \
	npx playwright test -c playwright.config.ts
echo "== PASS: every checked fork feature works on $IMAGE"
