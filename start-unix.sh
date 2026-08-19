#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22.13 or newer from https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Reinstall Node.js with npm enabled."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing DraftMD dependencies..."
  npm install
fi

echo "Starting DraftMD at http://localhost:3000"
node scripts/open-browser.mjs &
npm run dev
