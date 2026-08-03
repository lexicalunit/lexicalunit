#!/bin/bash -eu
#
# Local authoring server for the lists. Serves the site like
# `python3 -m http.server` and adds the localhost-only editing API.

port="${1:-8000}"
here="$(cd "$(dirname "$0")" && pwd)"

(sleep 1 && open "http://localhost:$port/lists/?type=games") &

exec python3 "$here/tools/studio.py" --port "$port"
