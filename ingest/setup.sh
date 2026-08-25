#!/usr/bin/env bash
# One-time setup for the ingest pipeline.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ checking ffmpeg"
command -v ffmpeg >/dev/null || { echo "  missing: brew install ffmpeg"; exit 1; }

echo "→ fetching the standalone yt-dlp binary"
# Deliberately NOT the homebrew formula. On macOS Tahoe the brew python@3.14 bottle
# ships a pyexpat linked against a libexpat older than it needs, which breaks every
# yt-dlp extraction with "No module named expat". The standalone build bundles its
# own interpreter and sidesteps the whole problem.
mkdir -p ingest/bin
if [ ! -x ingest/bin/yt-dlp ]; then
  curl -fsSL -o ingest/bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
  chmod +x ingest/bin/yt-dlp
fi
ingest/bin/yt-dlp --version >/dev/null && echo "  yt-dlp $(ingest/bin/yt-dlp --version) ready"

echo "→ checking .env"
[ -f .env ] || { echo "  missing .env — copy .env.example and fill in both keys"; exit 1; }
grep -q OPENAI_API_KEY .env      || { echo "  .env is missing OPENAI_API_KEY"; exit 1; }
grep -q GOOGLE_MAPS_API_KEY .env || { echo "  .env is missing GOOGLE_MAPS_API_KEY"; exit 1; }

echo "→ installing workspace dependencies (engine, ingest, app)"
npm install --silent

echo
echo "Setup complete. Next:"
echo "  npm run ingest    # runs the pipeline (needs both API keys)"
echo "  npm run dev       # serves the phone app in the browser"
