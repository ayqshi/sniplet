#!/bin/bash
# sniplit — one-click build for Linux. Run: ./build.sh
# Builds everything into "dist": sniplit.html (single-file app), site/, .apk, iPhone profile, ads.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed to build sniplit. Opening the download page…"
  echo "Install the LTS version, then double-click BUILD.command again."
  xdg-open "https://nodejs.org/en/download" 2>/dev/null; read -n 1 -s -r -p "Press any key to close"; exit 1
fi
URLARG=()
if [ ! -f sniplit.config.json ]; then
  read -r -p "Where will you host sniplit? e.g. https://yourname.github.io/sniplit/  (Enter to skip): " SNIPURL
  [ -n "$SNIPURL" ] && URLARG=(--url "$SNIPURL")
fi
node tools/compile.mjs update "${URLARG[@]}"
echo; echo "Your files are in: $(pwd)/dist"; xdg-open dist 2>/dev/null
read -r -p "Open sniplit now? [Y/n] " A
[[ "$A" =~ ^[Nn] ]] || node tools/compile.mjs serve
