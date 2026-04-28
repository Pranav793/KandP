#!/usr/bin/env bash
# Uploads the current public/us/photos.json into R2 as _photos.json
# Usage: bash scripts/seed-photos.sh
#   Add --local to seed the local wrangler R2 instead of remote.

set -euo pipefail
cd "$(dirname "$0")/.."

FLAG="${1:-}"
npx wrangler r2 object put kandp-public/_photos.json \
  --file public/us/photos.json \
  --content-type "application/json" \
  $FLAG

echo "Done — _photos.json uploaded to R2${FLAG:+ ($FLAG)}"
