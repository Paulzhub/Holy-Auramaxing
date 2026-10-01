#!/usr/bin/env bash
# Rebuilds src/fonts/fraunces-soft-600.woff2: a static Fraunces instance
# (weight 600, SOFT 100) subset to Latin. The variable font is 62 KB; this
# 17 KB file is what lets the display headings paint quickly (see docs/decisions.md D-009).
# Requires: pip install fonttools brotli
set -euo pipefail
src="node_modules/@fontsource-variable/fraunces/files/fraunces-latin-soft-normal.woff2"
tmp="$(mktemp -d)"
python3 -m fontTools.varLib.instancer "$src" wght=600 SOFT=100 -o "$tmp/fraunces-600.ttf" -q
pyftsubset "$tmp/fraunces-600.ttf" \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2032-2033,U+20AC,U+2122" \
  --layout-features='kern,liga,clig,calt,lnum,tnum,pnum' \
  --flavor=woff2 --output-file=src/fonts/fraunces-soft-600.woff2
rm -rf "$tmp"
echo "Wrote src/fonts/fraunces-soft-600.woff2"
